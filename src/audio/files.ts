// 音訊檔案輸出：WAV 混音、標準 MIDI、XM 模組。
import { audioEngine } from './engine';
import { writeMidi } from './midi';
import type { AudioPlan } from './plan';
import { ensureSamplesFor } from './sampled';
import { encodeWav } from './wav';
import { buildXm, writeXm } from './xm';
import { SAMPLE_RATE } from './types';

export type AudioFileKind = 'wav' | 'mid' | 'xm' | 'bgm-wav';

export async function makeAudioFile(kind: AudioFileKind, plan: AudioPlan, seconds: number): Promise<{ blob: Blob; name: string }> {
  const base = `style-fusion-${plan.genre}`;
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
