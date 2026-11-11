// 音訊檔案輸出：WAV 混音、標準 MIDI、XM 模組、分軌（每個聲部一個 WAV，打包成 ZIP）。
import { zipSync } from 'fflate';
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

/**
 * 分軌（1.4.0）：每個聲部單獨渲染（含它送進殘響的那一份），全部乘上和混音相同的母帶增益，所以分軌直接加總≈混音
 * （只差母帶最後的軟限幅）。連同 MIDI 與說明一起打包成 ZIP，方便放進剪輯或編曲軟體再加工。
 */
async function makeStems(plan: AudioPlan, onProgress?: (p: number) => void): Promise<{ blob: Blob; name: string }> {
  const song = plan.song;
  const scheme = plan.scheme;
  const seed = audioEngine.seed();
  const opts = { sr: SAMPLE_RATE, seed, raw: true };
  const steps = song.tracks.length + 2;
  const mastered = await audioEngine.ensurePcm();
  onProgress?.(1 / steps);
  const raw = await renderAsync(song, scheme, opts);
  onProgress?.(2 / steps);
  // 母帶增益：成品混音（有做響度標準化）÷ 原始混音
  const g = mastered && mastered.plan.musicKey === plan.musicKey ? rmsOf(mastered.pcm) / Math.max(1e-9, rmsOf(raw)) : Math.min(0.12 / Math.max(1e-9, rmsOf(raw)), 8);
  const files: Record<string, Uint8Array> = {};
  const lines: string[] = [];
  for (let i = 0; i < song.tracks.length; i++) {
    const t = song.tracks[i];
    const role: TrackRole = t.drum ? 'perc' : t.role;
    const pcm = await renderAsync({ ...song, tracks: [t] }, scheme, opts);
    for (let j = 0; j < pcm.l.length; j++) {
      pcm.l[j] *= g;
      pcm.r[j] *= g;
    }
    const fname = `${String(i + 1).padStart(2, '0')}-${ROLE_FILE[role]}.wav`;
    files[fname] = encodeWav(pcm.l, pcm.r, SAMPLE_RATE);
    lines.push(`${fname}　${ROLE_ZH[role]}（${t.id}）`);
    onProgress?.((i + 3) / steps);
  }
  files['song.mid'] = writeMidi(song);
  const sec = song.sections?.map((s) => `${s.name} 第 ${s.bar + 1}–${s.bar + s.bars} 小節`).join('、');
  const readme = [
    'Style Fusion 分軌導出',
    '',
    `歌曲：${song.title}`,
    `長度：${song.seconds.toFixed(2)} 秒、${song.bars} 小節、${Math.round(song.bpm * 100) / 100} BPM、${song.meter}/4 拍`,
    `聲音方案：${scheme}`,
    sec ? `段落：${sec}` : '',
    '',
    '檔案（44.1 kHz、16 位元立體聲，全部從 0 秒開始、等長，直接對齊疊在一起就是混音）：',
    ...lines,
    'song.mid　同一首歌的標準 MIDI（每個聲部一軌）',
    '',
    '每一軌都含有它送進殘響的那一份，已乘上和混音相同的母帶增益；加總後約等於 App 裡的混音（只差最後的軟限幅）。',
  ]
    .filter((x, i, a) => x !== '' || a[i - 1] !== '')
    .join('\r\n');
  files['讀我.txt'] = new TextEncoder().encode(readme);
  const zipped = zipSync(files, { level: 0 });
  return { blob: new Blob([zipped as BlobPart], { type: 'application/zip' }), name: `style-fusion-${plan.genre}-stems.zip` };
}

export async function makeAudioFile(kind: AudioFileKind, plan: AudioPlan, seconds: number, onProgress?: (p: number) => void): Promise<{ blob: Blob; name: string }> {
  const base = `style-fusion-${plan.genre}`;
  if (kind === 'stems') return makeStems(plan, onProgress);
  if (kind === 'mid') return { blob: new Blob([writeMidi(plan.song) as BlobPart], { type: 'audio/midi' }), name: `${base}.mid` };
  if (kind === 'xm') await ensureSamplesFor(plan.song);
  if (kind === 'xm') return { blob: new Blob([writeXm(buildXm(plan.song)) as BlobPart], { type: 'application/octet-stream' }), name: `${base}.xm` };
  if (kind === 'bgm-wav') {
    const got = await audioEngine.ensurePcm();
    if (!got) throw new Error('音樂尚未準備好，請稍候再試');
    return { blob: new Blob([encodeWav(got.pcm.l, got.pcm.r, SAMPLE_RATE) as BlobPart], { type: 'audio/wav' }), name: `${base}-${plan.scheme}-loop.wav` };
  }
  const mix = await audioEngine.exportMix(seconds);
  if (!mix) throw new Error('音訊尚未準備好，請稍候再試');
  return { blob: new Blob([encodeWav(mix.l, mix.r, SAMPLE_RATE) as BlobPart], { type: 'audio/wav' }), name: `${base}-mix.wav` };
}
