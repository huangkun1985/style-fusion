// 開發用：檢查每個持續音樂器的循環接縫有沒有「啪」一聲。把長音渲染 7 秒，找循環處最大的突然跳變。
// 用法：npx tsx scripts/loop-check.ts
import { useFfmpegDecoder } from './node-decoder';
import { ensureSamplesFor, sampledModel, voiceOf } from '../src/audio/sampled';
import { mtof } from '../src/audio/theory';
import { Noise } from '../src/audio/dsp';
import type { Song } from '../src/audio/types';
useFfmpegDecoder();
// 迴圈接縫檢查：長音渲染 7 秒，找循環處有沒有突然的跳變（點擊聲）
const sr = 44100;
const progs: number[] = [];
for (let p = 0; p < 128; p++) if (voiceOf(p)) progs.push(p);
const seen = new Set<string>();
for (const p of progs) {
  const v = voiceOf(p)!;
  const key = v.ids.join(',') + v.att + v.rel;
  if (seen.has(key)) continue;
  seen.add(key);
  await ensureSamplesFor({ tracks: [{ id: 'x', role: 'lead', program: p, notes: [], pan: 0, gain: 1 }] } as unknown as Song);
  const m = sampledModel(p)!;
  for (const midi of [48, 60, 72]) {
    const n = sr * 7;
    const s = new Float32Array(n);
    m.render({ s, n, sr, f: mtof(midi), vel: 0.8, dur: 7, nz: new Noise(1) });
    // 找最大的相鄰差，與 99.9 百分位比較
    const diffs: number[] = [];
    let mx = 0;
    let at = 0;
    for (let i = 1; i < n; i++) {
      const d = Math.abs(s[i] - s[i - 1]);
      diffs.push(d);
      if (i > sr * 0.3 && d > mx) {
        mx = d;
        at = i;
      }
    }
    const sorted = [...diffs.slice(sr * 0.3)].sort((a, b) => a - b);
    const p999 = sorted[Math.floor(sorted.length * 0.999)];
    const ratio = mx / (p999 + 1e-9);
    if (ratio > 3) console.log(`p${p} (${v.ids.join('+')}) midi ${midi}: 最大跳變 ${mx.toFixed(3)} 在 ${(at / sr).toFixed(2)}s，是 99.9% 的 ${ratio.toFixed(1)} 倍`);
  }
}
console.log('done', seen.size);
