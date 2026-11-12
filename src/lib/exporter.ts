// 導出：因為所有動畫都是時間的純函數，可以離線逐幀精確渲染（不受電腦效能影響）。
import { GIFEncoder, applyPalette, quantize } from 'gifenc';
import { zipSync } from 'fflate';
import { ArrayBufferTarget, Muxer } from 'mp4-muxer';
import type { Stereo } from '../audio/dsp';
import { SAMPLE_RATE } from '../audio/types';
import { Renderer, loopSeconds } from '../engine/renderer';
import { drawFilmFrame, filmReady, type FilmModel } from '../store/film';
import { SUBJECTS } from '../engine/subjects';
import type { Look, Move, SubjectId, Tune } from '../engine/types';

export type ExportFormat = 'gif' | 'mp4' | 'webm' | 'png' | 'zip' | 'sprite';

export interface ExportJob {
  format: ExportFormat;
  subject: SubjectId;
  look: Look;
  move: Move;
  tune: Tune;
  w: number;
  h: number;
  fps: number;
  loops: number;
  /** 指定總長（秒）：例如「跟整首歌一樣長」。有設定就不看 loops */
  seconds?: number;
  time?: number;
  transparent?: boolean;
  /** 要封裝進 MP4／WebM 的音訊（從時間 0 起，取樣率 SAMPLE_RATE，長度需涵蓋整段影片） */
  audio?: Stereo | null;
  /** 2.0 β：導出整支片子（所有場景接起來，含淡轉場）；有設定就不看 subject／look／move／loops */
  film?: FilmModel;
  /** 檔名（不含副檔名）；不給就是 style-fusion-主體 */
  name?: string;
}

export interface ExportResult {
  blob: Blob;
  name: string;
  /** 補充說明，例如音訊無法編碼而輸出了無聲影片 */
  note?: string;
}

export const canMp4 = typeof window !== 'undefined' && 'VideoEncoder' in window && 'VideoFrame' in window;

/** 導出的總秒數：指定了 seconds 就用它，否則是動畫循環 × 次數 */
function totalSeconds(job: Pick<ExportJob, 'subject' | 'move' | 'tune' | 'loops' | 'seconds' | 'film'>) {
  if (job.film) return { L: job.film.total, total: job.film.total };
  const L = loopSeconds(SUBJECTS[job.subject], job.move, job.tune);
  return { L, total: job.seconds && job.seconds > 0 ? job.seconds : L * job.loops };
}

function frameCount(job: ExportJob) {
  const { L, total } = totalSeconds(job);
  return { L, total, n: Math.max(1, Math.round(total * job.fps)) };
}

/** GIF／PNG 序列的上限：格數 × 寬 × 高（約 1080p 的 240 格；以每像素 4 位元組算約 2 GB 的原始畫面，實際存的是壓縮後的） */
export const EXPORT_PIXEL_LIMIT = 500_000_000;

const tick = () => new Promise((r) => setTimeout(r, 0));

// ---------- MP4 音訊 ----------
interface AudioChoice {
  id: 'aac' | 'opus';
  codec: string;
  sampleRate: number;
}

/** 依序嘗試 AAC、Opus；兩者都不行就回傳 null（輸出無聲影片） */
async function pickAudioCodec(): Promise<AudioChoice | null> {
  if (typeof AudioEncoder === 'undefined' || typeof AudioData === 'undefined') return null;
  const tries: AudioChoice[] = [
    { id: 'aac', codec: 'mp4a.40.2', sampleRate: SAMPLE_RATE },
    { id: 'opus', codec: 'opus', sampleRate: 48000 },
  ];
  for (const t of tries) {
    try {
      const s = await AudioEncoder.isConfigSupported({ codec: t.codec, sampleRate: t.sampleRate, numberOfChannels: 2, bitrate: 160_000 });
      if (s.supported) return t;
    } catch {
      /* 試下一個 */
    }
  }
  return null;
}

/** 線性插值重新取樣（只在 Opus 退路使用：44.1k → 48k） */
function resample(src: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return src;
  const n = Math.round((src.length * to) / from);
  const out = new Float32Array(n);
  const k = from / to;
  for (let i = 0; i < n; i++) {
    const x = i * k;
    const i0 = Math.floor(x);
    const f = x - i0;
    out[i] = src[i0] * (1 - f) + (src[Math.min(src.length - 1, i0 + 1)] ?? 0) * f;
  }
  return out;
}

async function encodeAudioTrack(muxer: Muxer<ArrayBufferTarget>, choice: AudioChoice, pcm: Stereo, seconds: number, signal?: AbortSignal) {
  let failure: Error | null = null;
  const enc = new AudioEncoder({ output: (chunk, meta) => muxer.addAudioChunk(chunk, meta), error: (e) => (failure = e as Error) });
  enc.configure({ codec: choice.codec, sampleRate: choice.sampleRate, numberOfChannels: 2, bitrate: 160_000 });
  const l = resample(pcm.l, SAMPLE_RATE, choice.sampleRate);
  const r = resample(pcm.r, SAMPLE_RATE, choice.sampleRate);
  const total = Math.min(l.length, Math.round(seconds * choice.sampleRate));
  const STEP = 4096;
  for (let i = 0; i < total; i += STEP) {
    if (signal?.aborted) throw new Error('已取消');
    if (failure) throw failure;
    const nf = Math.min(STEP, total - i);
    const planar = new Float32Array(nf * 2);
    planar.set(l.subarray(i, i + nf), 0);
    planar.set(r.subarray(i, i + nf), nf);
    const data = new AudioData({ format: 'f32-planar', sampleRate: choice.sampleRate, numberOfFrames: nf, numberOfChannels: 2, timestamp: Math.round((i / choice.sampleRate) * 1e6), data: planar });
    enc.encode(data);
    data.close();
    if (enc.encodeQueueSize > 12) await new Promise((res) => setTimeout(res, 4));
  }
  await enc.flush();
  enc.close();
  if (failure) throw failure;
}


export async function runExport(job: ExportJob, onProgress: (p: number) => void, signal?: AbortSignal): Promise<ExportResult> {
  const r = new Renderer(true);
  // 3D 主體：先等 Three.js 與 3D 舞台就緒，避免第一幀（或單張 PNG）畫成「載入 3D 場景…」
  if (job.film) await filmReady(r, job.film);
  else await r.ready(job.subject);
  const cv = document.createElement('canvas');
  cv.width = job.w;
  cv.height = job.h;
  const ctx = cv.getContext('2d', { willReadFrequently: job.format === 'gif' })!;
  const tmp = document.createElement('canvas');
  const film = job.film;
  const draw = film
    ? (t: number) => drawFilmFrame(r, ctx, job.w, job.h, film, t, tmp, { transparent: job.transparent })
    : (t: number) => r.render(ctx, job.w, job.h, { subject: job.subject, look: job.look, move: job.move, tune: job.tune, time: t, transparent: job.transparent });
  const base = job.name ?? `style-fusion-${job.subject}`;
  try {
    if (job.format === 'png') {
      draw(job.time ?? 0);
      onProgress(1);
      const blob = await new Promise<Blob>((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('PNG 編碼失敗'))), 'image/png'));
      return { blob, name: `${base}.png` };
    }
    const { total, n } = frameCount(job);
    // 審查 R-03：GIF 與 PNG 序列要把所有格子放在記憶體裡；「格數 × 像素」太大時（例如 1080p 整首 180 秒），分頁會被瀏覽器關掉。
    // 開始之前就擋下來，建議改用 MP4（逐格編碼，不累積）
    if ((job.format === 'gif' || job.format === 'zip') && n * job.w * job.h > EXPORT_PIXEL_LIMIT) {
      const what = job.format === 'gif' ? 'GIF' : 'PNG 序列';
      throw new Error(`${what} 這次要 ${n} 格 × ${job.w}×${job.h}，太大了，瀏覽器可能撐不住。請改用 MP4，或縮短長度、降低尺寸（上限約 ${Math.floor(EXPORT_PIXEL_LIMIT / (job.w * job.h))} 格）`);
    }
    if (job.format === 'gif') {
      const gif = GIFEncoder();
      // 審查 R-11：GIF 的延遲單位是 1/100 秒，gifenc 會把每格四捨五入（24 fps → 每格 4 單位＝25 fps，快 4%）。
      // 改成累進：第 i 格的延遲＝round((i+1)×100/fps) − round(i×100/fps)，每格差一點但總長度精準，和音樂、MP4 對得上
      // 瀏覽器會把小於 2/100 秒的延遲當成 10/100 秒播（很慢），所以 GIF 最多 50 fps：超過就按時間抽格，總長度不變
      const gfps = Math.min(job.fps, 50);
      const gn = gfps === job.fps ? n : frameCount({ ...job, fps: gfps }).n;
      const cs = (i: number) => Math.round((i * 100) / gfps);
      for (let i = 0; i < gn; i++) {
        const delay = (cs(i + 1) - cs(i)) * 10;
        if (signal?.aborted) throw new Error('已取消');
        draw((i / gfps) % total);
        const data = ctx.getImageData(0, 0, job.w, job.h).data;
        const palette = quantize(data, 256);
        const index = applyPalette(data, palette);
        gif.writeFrame(index, job.w, job.h, { palette, delay });
        onProgress((i + 1) / gn);
        if (i % 2 === 0) await tick();
      }
      gif.finish();
      const note = gfps < job.fps ? `GIF 最多 50 fps（瀏覽器播不出更快的 GIF），這次用 50 fps 輸出，長度不變。要 ${job.fps} fps 請用 MP4。` : undefined;
      return { blob: new Blob([gif.bytes() as BlobPart], { type: 'image/gif' }), name: `${base}.gif`, note };
    }
    if (job.format === 'mp4') {
      if (!canMp4) throw new Error('這個瀏覽器不支援 WebCodecs，請改用 WebM 或 GIF');
      const w = job.w - (job.w % 2);
      const h = job.h - (job.h % 2);
      const audioChoice = job.audio ? await pickAudioCodec() : null;
      const muxer = new Muxer({
        target: new ArrayBufferTarget(),
        video: { codec: 'avc', width: w, height: h, frameRate: job.fps },
        audio: audioChoice ? { codec: audioChoice.id, numberOfChannels: 2, sampleRate: audioChoice.sampleRate } : undefined,
        fastStart: 'in-memory',
      });
      let encErr: Error | null = null;
      const enc = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => (encErr = e as Error) });
      // 審查 R-13：成功、失敗、取消都要關掉編碼器（不然佔著硬體編碼資源）
      const closeEnc = () => {
        try {
          if (enc.state !== 'closed') enc.close();
        } catch {
          /* 已關 */
        }
      };
      try {
      const codecs = ['avc1.640033', 'avc1.4d0033', 'avc1.42003e', 'avc1.640028', 'avc1.42001f'];
      let chosen = '';
      for (const c of codecs) {
        const s = await VideoEncoder.isConfigSupported({ codec: c, width: w, height: h, bitrate: 8e6, framerate: job.fps });
        if (s.supported) {
          chosen = c;
          break;
        }
      }
      if (!chosen) throw new Error('這個解析度無法以 H.264 編碼，請降低尺寸');
      enc.configure({ codec: chosen, width: w, height: h, bitrate: Math.round(w * h * job.fps * 0.12), framerate: job.fps });
      const vc = document.createElement('canvas');
      vc.width = w;
      vc.height = h;
      const vctx = vc.getContext('2d')!;
      for (let i = 0; i < n; i++) {
        if (signal?.aborted) throw new Error('已取消');
        if (encErr) throw encErr;
        draw(i / job.fps);
        vctx.drawImage(cv, 0, 0, w, h);
        const frame = new VideoFrame(vc, { timestamp: Math.round((i * 1e6) / job.fps), duration: Math.round(1e6 / job.fps) });
        enc.encode(frame, { keyFrame: i % (job.fps * 2) === 0 });
        frame.close();
        onProgress((i + 1) / n);
        if (enc.encodeQueueSize > 8) await new Promise((r2) => setTimeout(r2, 8));
        else if (i % 3 === 0) await tick();
      }
      await enc.flush();
      if (job.audio && audioChoice) await encodeAudioTrack(muxer, audioChoice, job.audio, n / job.fps, signal);
      muxer.finalize();
      const note = job.audio && !audioChoice ? '這個瀏覽器無法編碼音訊，影片沒有聲音。可到「聲音」分頁導出 WAV，再用剪輯軟體合成。' : undefined;
      return { blob: new Blob([muxer.target.buffer], { type: 'video/mp4' }), name: `${base}.mp4`, note };
      } finally {
        closeEnc();
      }
    }
    if (job.format === 'webm') {
      const stream = cv.captureStream(0);
      const track = stream.getVideoTracks()[0] as MediaStreamTrack & { requestFrame?: () => void };
      // 音軌：把混好的音訊即時播進一條媒體串流（不會從喇叭出聲），和畫面一起錄
      const sound = job.audio ? await webmAudio(job.audio) : null;
      if (sound) stream.addTrack(sound.track);
      const types = sound ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'] : ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
      const mime = types.find((m) => MediaRecorder.isTypeSupported(m)) ?? 'video/webm';
      const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8e6, audioBitsPerSecond: 160_000 });
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      const done = new Promise<void>((res) => (rec.onstop = () => res()));
      rec.start();
      sound?.start();
      // 以真實時間節奏推送幀（MediaRecorder 需要即時）
      const t0 = performance.now();
      // 審查 R-12：WebM 是照真實時間錄的；畫一格比 1/fps 秒還久、或分頁被切到背景，畫面就會落後聲音。量出來就告訴使用者
      let lagFrames = 0;
      try {
        for (let i = 0; i < n; i++) {
          if (signal?.aborted) throw new Error('已取消');
          draw(i / job.fps);
          track.requestFrame?.();
          onProgress((i + 1) / n);
          const target = t0 + ((i + 1) * 1000) / job.fps;
          lagFrames = Math.max(lagFrames, ((performance.now() - target) * job.fps) / 1000);
          await new Promise((r2) => setTimeout(r2, Math.max(0, target - performance.now())));
        }
        rec.stop();
        await done;
      } finally {
        // 審查 R-13：成功、取消、畫格出錯都要停錄影器、關音訊、停掉畫面串流
        if (rec.state !== 'inactive') rec.stop();
        sound?.close();
        for (const t of stream.getTracks()) t.stop();
      }
      const notes = [
        job.audio && !sound ? '這個瀏覽器沒有讓網頁錄製音訊，影片沒有聲音。可改用 MP4，或到「聲音」分頁導出 WAV 再合成。' : '',
        lagFrames > 2 ? `錄製時畫面最多落後 ${Math.round(lagFrames)} 格（畫面太重或分頁被切到背景），影片裡畫面可能和聲音對不上。建議改用 MP4（逐格輸出，不會錯開），或導出時停在這個分頁。` : '',
      ].filter(Boolean);
      const note = notes.length ? notes.join(' ') : undefined;
      return { blob: new Blob(chunks, { type: 'video/webm' }), name: `${base}.webm`, note };
    }
    if (job.format === 'zip') {
      const files: Record<string, Uint8Array> = {};
      for (let i = 0; i < n; i++) {
        if (signal?.aborted) throw new Error('已取消');
        draw(i / job.fps);
        const b = await new Promise<Blob>((res, rej) => cv.toBlob((x) => (x ? res(x) : rej(new Error('PNG 編碼失敗'))), 'image/png'));
        files[`${base}_${String(i).padStart(4, '0')}.png`] = new Uint8Array(await b.arrayBuffer());
        onProgress((i + 1) / n);
      }
      const zipped = zipSync(files, { level: 0 });
      return { blob: new Blob([zipped as BlobPart], { type: 'application/zip' }), name: `${base}_png-sequence.zip` };
    }
    // 精靈圖：一張大圖排滿所有幀
    const cols = Math.ceil(Math.sqrt(n));
    const rows = Math.ceil(n / cols);
    const sheet = document.createElement('canvas');
    sheet.width = cols * job.w;
    sheet.height = rows * job.h;
    if (sheet.width > 16384 || sheet.height > 16384) throw new Error('精靈圖太大，請降低尺寸或幀率');
    const sctx = sheet.getContext('2d')!;
    for (let i = 0; i < n; i++) {
      if (signal?.aborted) throw new Error('已取消');
      draw(i / job.fps);
      sctx.drawImage(cv, (i % cols) * job.w, Math.floor(i / cols) * job.h);
      onProgress((i + 1) / n);
      if (i % 4 === 0) await tick();
    }
    const blob = await new Promise<Blob>((res, rej) => sheet.toBlob((b) => (b ? res(b) : rej(new Error('PNG 編碼失敗'))), 'image/png'));
    return { blob, name: `${base}_sprite_${cols}x${rows}_${n}f.png` };
  } finally {
    r.dispose();
  }
}

export function estimateFrames(job: Pick<ExportJob, 'subject' | 'move' | 'tune' | 'fps' | 'loops' | 'seconds' | 'film'>) {
  return Math.max(1, Math.round(totalSeconds(job).total * job.fps));
}

/** WebM 的音軌：一個暫時的 AudioContext 把音訊播進 MediaStream。瀏覽器不讓出聲（例如沒有音訊裝置）就回傳 null，影片照樣導出 */
async function webmAudio(pcm: Stereo): Promise<{ track: MediaStreamTrack; start: () => void; close: () => void } | null> {
  try {
    const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
    if (ctx.state !== 'running') {
      const ok = await Promise.race([ctx.resume().then(() => true), new Promise<boolean>((r) => setTimeout(() => r(false), 1500))]);
      if (!ok || (ctx.state as AudioContextState) !== 'running') {
        void ctx.close();
        return null;
      }
    }
    const buf = ctx.createBuffer(2, pcm.l.length, SAMPLE_RATE);
    buf.copyToChannel(pcm.l as Float32Array<ArrayBuffer>, 0);
    buf.copyToChannel(pcm.r as Float32Array<ArrayBuffer>, 1);
    const dest = ctx.createMediaStreamDestination();
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(dest);
    const track = dest.stream.getAudioTracks()[0];
    if (!track) {
      void ctx.close();
      return null;
    }
    let closed = false;
    return {
      track,
      start: () => src.start(),
      close: () => {
        if (closed) return;
        closed = true;
        try {
          src.stop();
        } catch {
          /* 已停止 */
        }
        void ctx.close().catch(() => undefined);
      },
    };
  } catch {
    return null;
  }
}
