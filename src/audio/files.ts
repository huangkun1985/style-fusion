// 音訊檔案輸出：WAV 混音、標準 MIDI、XM 模組、分軌（每個聲部一個 WAV，打包成 ZIP）。
import { Zip, ZipPassThrough } from 'fflate';
import type { Stereo } from './dsp';
import { audioEngine } from './engine';
import { writeMidi } from './midi';
import type { AudioPlan } from './plan';
import { renderAsync } from './renderClient';
import { ensureSamplesFor } from './sampled';
import { encodeWav } from './wav';
import { buildXm, writeXm } from './xm';
import { SAMPLE_RATE, type TrackRole } from './types';

export type AudioFileKind = 'wav' | 'mid' | 'xm' | 'bgm-wav' | 'stems';

const ROLE_FILE: Record<TrackRole, string> = { lead: 'melody', counter: 'counter-melody', arp: 'arpeggio', bass: 'bass', pad: 'pad', chord: 'chords', perc: 'drums' };
const ROLE_ZH: Record<TrackRole, string> = { lead: '主旋律', counter: '副旋律', arp: '琶音', bass: '低音', pad: '鋪底', chord: '和弦', perc: '鼓' };

const rmsOf = (s: Stereo) => {
  let sum = 0;
  for (let i = 0; i < s.l.length; i++) sum += s.l[i] * s.l[i] + s.r[i] * s.r[i];
  return Math.sqrt(sum / (2 * Math.max(1, s.l.length)));
};

/** 審查 R-15：分軌「加總≈混音」只在 MIDI（取樣）方案成立：8-bit 類與 XM 的聲道分配、合成音色的噪音種子都和「同時有哪些聲部」有關，
 *  單獨渲染一軌的結果會和混音裡的那一軌不同。所以分軌只開放 MIDI 方案 */
export const stemsSupported = (scheme: string) => scheme === 'midi';

/** 把一批檔案用 fflate 的串流 Zip 打包（不壓縮）：每個檔案一加進去就交出位元組，原始資料可以馬上釋放（審查 R-03） */
export class ZipStream {
  private parts: Uint8Array[] = [];
  private zip: Zip;
  private done: Promise<void>;
  constructor() {
    let resolve!: () => void;
    let reject!: (e: Error) => void;
    this.done = new Promise<void>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    this.zip = new Zip((err, chunk, final) => {
      if (err) return reject(err);
      this.parts.push(chunk);
      if (final) resolve();
    });
  }
  add(name: string, data: Uint8Array) {
    const f = new ZipPassThrough(name);
    this.zip.add(f);
    f.push(data, true);
  }
  async blob(type = 'application/zip'): Promise<Blob> {
    this.zip.end();
    await this.done;
    const b = new Blob(this.parts as BlobPart[], { type });
    this.parts = [];
    return b;
  }
}

/**
 * 分軌（1.4.0）：每個聲部單獨渲染（含它送進殘響的那一份），全部乘上和混音相同的母帶增益，所以分軌直接加總≈混音
 * （只差母帶最後的軟限幅）。連同 MIDI 與說明一起打包成 ZIP，方便放進剪輯或編曲軟體再加工。
 * 審查 R-03：一軌做完就編碼、放進串流 ZIP、釋放，記憶體高峰只有一軌；審查 R-16：有收尾的配樂不折回尾音，每軌補到一樣長。
 */
export async function makeStems(plan: AudioPlan, onProgress?: (p: number) => void, into?: { zip: ZipStream; dir: string }): Promise<{ blob: Blob; name: string } | null> {
  const song = plan.song;
  const scheme = plan.scheme;
  if (!stemsSupported(scheme)) throw new Error('分軌只支援「MIDI（真實樂器）」聲音方案：8-bit、Game Boy、C64、FM、XM 單獨渲染一軌的聲音會和混音裡不同。請先把聲音方案換成 MIDI');
  const seed = audioEngine.seed();
  const scored = !!song.sections;
  const opts = { sr: SAMPLE_RATE, seed, raw: true, noFold: scored };
  const steps = song.tracks.length + 2;
  const mastered = await audioEngine.ensurePcm();
  onProgress?.(1 / steps);
  const raw = await renderAsync(song, scheme, { ...opts, noFold: false });
  onProgress?.(2 / steps);
  // 母帶增益：成品混音（有做響度標準化）÷ 原始混音
  const g = mastered && mastered.plan.musicKey === plan.musicKey ? rmsOf(mastered.pcm) / Math.max(1e-9, rmsOf(raw)) : Math.min(0.12 / Math.max(1e-9, rmsOf(raw)), 8);
  const zip = into?.zip ?? new ZipStream();
  const dir = into?.dir ?? '';
  const lines: string[] = [];
  // 不折回時每軌的尾音長度不同：先定一個共同長度（曲長＋最長的尾音上限 2.8 秒）
  const len = scored ? Math.round((song.seconds + 2.8) * SAMPLE_RATE) : Math.round(song.seconds * SAMPLE_RATE);
  for (let i = 0; i < song.tracks.length; i++) {
    const t = song.tracks[i];
    const role: TrackRole = t.drum ? 'perc' : t.role;
    const pcm = await renderAsync({ ...song, tracks: [t] }, scheme, opts);
    const l = new Float32Array(len);
    const r = new Float32Array(len);
    const m = Math.min(len, pcm.l.length);
    for (let j = 0; j < m; j++) {
      l[j] = pcm.l[j] * g;
      r[j] = pcm.r[j] * g;
    }
    const fname = `${String(i + 1).padStart(2, '0')}-${ROLE_FILE[role]}.wav`;
    zip.add(dir + fname, encodeWav(l, r, SAMPLE_RATE));
    lines.push(`${fname}　${ROLE_ZH[role]}（${t.id}）`);
    onProgress?.((i + 3) / steps);
  }
  zip.add(dir + 'song.mid', writeMidi(song));
  const sec = song.sections?.map((s) => `${s.name} 第 ${s.bar + 1}–${s.bar + s.bars} 小節`).join('、');
  const readme = [
    'Style Fusion 分軌導出',
    '',
    `歌曲：${song.title}`,
    `長度：${song.seconds.toFixed(2)} 秒、${song.bars} 小節、${Math.round(song.bpm * 100) / 100} BPM、${song.meter}/4 拍`,
    `聲音方案：${scheme}`,
    sec ? `段落：${sec}` : '',
    '',
    `檔案（44.1 kHz、16 位元立體聲，全部從 0 秒開始、等長${scored ? '；配樂有收尾，結尾多留 2.8 秒讓殘響自然收掉' : ''}，直接對齊疊在一起就是混音）：`,
    ...lines,
    'song.mid　同一首歌的標準 MIDI（每個聲部一軌）',
    '',
    '每一軌都含有它送進殘響的那一份，已乘上和混音相同的母帶增益；加總後約等於 App 裡的混音（只差最後的軟限幅）。',
  ]
    .filter((x, i, a) => x !== '' || a[i - 1] !== '')
    .join('\r\n');
  zip.add(dir + '讀我.txt', new TextEncoder().encode(readme));
  if (into) return null;
  return { blob: await zip.blob(), name: `style-fusion-${plan.genre}-stems.zip` };
}

export async function makeAudioFile(kind: AudioFileKind, plan: AudioPlan, seconds: number, onProgress?: (p: number) => void): Promise<{ blob: Blob; name: string }> {
  const base = `style-fusion-${plan.genre}`;
  if (kind === 'stems') return (await makeStems(plan, onProgress))!;
  if (kind === 'mid') return { blob: new Blob([writeMidi(plan.song) as BlobPart], { type: 'audio/midi' }), name: `${base}.mid` };
  if (kind === 'xm') await ensureSamplesFor(plan.song);
  if (kind === 'xm') return { blob: new Blob([writeXm(buildXm(plan.song)) as BlobPart], { type: 'application/octet-stream' }), name: `${base}.xm` };
  if (kind === 'bgm-wav') {
    // 審查 R-16：有收尾的配樂不是循環，導出時不把尾音折回開頭，結尾留著自然的殘響
    if (plan.song.sections) {
      const pcm = await renderAsync(plan.song, plan.scheme, { sr: SAMPLE_RATE, seed: audioEngine.seed(), noFold: true });
      return { blob: new Blob([encodeWav(pcm.l, pcm.r, SAMPLE_RATE) as BlobPart], { type: 'audio/wav' }), name: `${base}-${plan.scheme}-score.wav` };
    }
    const got = await audioEngine.ensurePcm();
    if (!got) throw new Error('音樂尚未準備好，請稍候再試');
    return { blob: new Blob([encodeWav(got.pcm.l, got.pcm.r, SAMPLE_RATE) as BlobPart], { type: 'audio/wav' }), name: `${base}-${plan.scheme}-loop.wav` };
  }
  const mix = await audioEngine.exportMix(seconds);
  if (!mix) throw new Error('音訊尚未準備好，請稍候再試');
  return { blob: new Blob([encodeWav(mix.l, mix.r, SAMPLE_RATE) as BlobPart], { type: 'audio/wav' }), name: `${base}-mix.wav` };
}
