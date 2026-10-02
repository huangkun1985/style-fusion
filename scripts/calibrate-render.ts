// 開發用：為每個取樣音色號渲染一段標準測試音（同樣的音符、力度），之後用 calibrate.py 量 A 加權響度，
// 算出每個音色要乘多少倍才能達到相同的聽感音量，結果寫成 src/audio/calibration.ts。
// 用法：npx tsx scripts/calibrate-render.ts <outDir>
import { mkdirSync, writeFileSync } from 'node:fs';
import { renderGm } from '../src/audio/gm';
import { neededInstruments, voiceOf } from '../src/audio/sampled';
import { PACK_INSTRUMENTS } from '../src/audio/pack/meta';
import type { Song, Track } from '../src/audio/types';
import { encodeWav } from '../src/audio/wav';
import { useFfmpegDecoder } from './node-decoder';

(globalThis as { __noCal?: boolean }).__noCal = true;
useFfmpegDecoder();
const outDir = process.argv[2] ?? 'out';
mkdirSync(outDir, { recursive: true });

const programs: number[] = [];
for (let p = 0; p < 128; p++) programs.push(p);

for (const p of programs) {
  const v = voiceOf(p);
  // 取該樂器音域的中央作為測試音高
  const inst = v ? PACK_INSTRUMENTS[v.ids[0]] : null;
  const roots = inst ? inst.zones.map((z) => z.root) : [52, 76];
  const mid = Math.round(Math.min(84, Math.max(40, (Math.min(...roots) + Math.max(...roots)) / 2)));
  const notes = [0, 2, 4, 2, 0, 4].map((o, i) => ({ t: i * 4, dur: 3, pitch: mid + o, vel: 0.8 }));
  const tr: Track = { id: 'x', role: 'lead', program: p, notes, pan: 0, gain: 1 };
  const song: Song = {
    title: 't', genre: 'pop', bpm: 100, meter: 4, stepsPerBar: 16, bars: 2, steps: 32, swing: 0, key: 0, mode: 'major', tracks: [tr], chords: [], seconds: 24 * 0.15, animSeconds: 3.6, animLoops: 1, beatLocked: true,
  };
  void neededInstruments;
  const pcm = await renderGm(song, { sr: 44100, seed: 1, raw: true });
  writeFileSync(`${outDir}/cal-${String(p).padStart(3, '0')}.wav`, encodeWav(pcm.l, pcm.r, 44100));
}
console.log(`rendered ${programs.length} programs`);
