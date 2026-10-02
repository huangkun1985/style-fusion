// 導出：因為所有動畫都是時間的純函數，可以離線逐幀精確渲染（不受電腦效能影響）。
import { GIFEncoder, applyPalette, quantize } from 'gifenc';
import { zipSync } from 'fflate';
import { ArrayBufferTarget, Muxer } from 'mp4-muxer';
import type { Stereo } from '../audio/dsp';
import { SAMPLE_RATE } from '../audio/types';
import { Renderer, loopSeconds } from '../engine/renderer';
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
  time?: number;
  transparent?: boolean;
  /** 要封裝進 MP4 的音訊（從時間 0 起，取樣率 SAMPLE_RATE，長度需涵蓋整段影片） */
  audio?: Stereo | null;
}

export interface ExportResult {
  blob: Blob;
  name: string;
  /** 補充說明，例如音訊無法編碼而輸出了無聲影片 */
  note?: string;
}

export const canMp4 = typeof window !== 'undefined' && 'VideoEncoder' in window && 'VideoFrame' in window;

function frameCount(job: ExportJob) {
  const sub = SUBJECTS[job.subject];
  const L = loopSeconds(sub, job.move, job.tune);
  return { L, n: Math.max(1, Math.round(L * job.loops * job.fps)) };
}

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
  await r.ready(job.subject);
  const cv = document.createElement('canvas');
  cv.width = job.w;
  cv.height = job.h;
  const ctx = cv.getContext('2d', { willReadFrequently: job.format === 'gif' })!;
  const draw = (t: number) => r.render(ctx, job.w, job.h, { subject: job.subject, look: job.look, move: job.move, tune: job.tune, time: t, transparent: job.transparent });
  const base = `style-fusion-${job.subject}`;
  try {
    if (job.format === 'png') {
      draw(job.time ?? 0);
      onProgress(1);
      const blob = await new Promise<Blob>((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('PNG 編碼失敗'))), 'image/png'));
      return { blob, name: `${base}.png` };
    }
    const { L, n } = frameCount(job);
    if (job.format === 'gif') {
      const gif = GIFEncoder();
      const delay = 1000 / job.fps;
      for (let i = 0; i < n; i++) {
        if (signal?.aborted) throw new Error('已取消');
        draw((i / job.fps) % (L * job.loops));
        const data = ctx.getImageData(0, 0, job.w, job.h).data;
        const palette = quantize(data, 256);
        const index = applyPalette(data, palette);
        gif.writeFrame(index, job.w, job.h, { palette, delay });
        onProgress((i + 1) / n);
        if (i % 2 === 0) await tick();
      }
      gif.finish();
      return { blob: new Blob([gif.bytes() as BlobPart], { type: 'image/gif' }), name: `${base}.gif` };
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
    }
    if (job.format === 'webm') {
      const stream = cv.captureStream(0);
      const track = stream.getVideoTracks()[0] as MediaStreamTrack & { requestFrame?: () => void };
      const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m)) ?? 'video/webm';
      const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8e6 });
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      const done = new Promise<void>((res) => (rec.onstop = () => res()));
      rec.start();
      // 以真實時間節奏推送幀（MediaRecorder 需要即時）
      const t0 = performance.now();
      for (let i = 0; i < n; i++) {
        if (signal?.aborted) {
          rec.stop();
          throw new Error('已取消');
        }
        draw(i / job.fps);
        track.requestFrame?.();
        onProgress((i + 1) / n);
        const target = t0 + ((i + 1) * 1000) / job.fps;
        await new Promise((r2) => setTimeout(r2, Math.max(0, target - performance.now())));
      }
      rec.stop();
      await done;
      return { blob: new Blob(chunks, { type: 'video/webm' }), name: `${base}.webm` };
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

export function estimateFrames(job: Pick<ExportJob, 'subject' | 'move' | 'tune' | 'fps' | 'loops'>) {
  const sub = SUBJECTS[job.subject];
  return Math.max(1, Math.round(loopSeconds(sub, job.move, job.tune) * job.loops * job.fps));
}
