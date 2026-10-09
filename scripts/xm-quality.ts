// 開發用：量化 XM 與 MIDI 方案「聽起來差多少」。同一段參考旋律（跨 2–3 個八度、長短音交替、力度變化）
// 分別用 MIDI 取樣與 XM 渲染成 WAV（不做母帶標準化），再用 python scripts/xm-quality.py 比較頻譜。
// 用法：npx tsx scripts/xm-quality.ts <輸出資料夾>
import { mkdirSync, writeFileSync } from 'node:fs';
import { composeSong } from '../src/audio/compose';
import { renderGm } from '../src/audio/gm';
import { ensureSamplesFor } from '../src/audio/sampled';
import type { Song, Track } from '../src/audio/types';
import { encodeWav } from '../src/audio/wav';
import { buildXm, renderModule } from '../src/audio/xm';
import { useFfmpegDecoder } from './node-decoder';

useFfmpegDecoder();
const out = process.argv[2] ?? 'out';
mkdirSync(out, { recursive: true });
const SR = 44100;
// [名稱, GM 音色號, 音域低, 音域高]
const CASES: [string, number, number, number][] = [
  ['piano', 0, 40, 88],
  ['epiano', 4, 40, 84],
  ['nylon', 24, 45, 79],
  ['eguitar', 26, 45, 81],
  ['bass', 33, 28, 55],
  ['harp', 46, 40, 90],
  ['organ', 19, 36, 84],
  ['violin', 40, 55, 93],
  ['cello', 42, 36, 76],
  ['contrabass', 43, 28, 60],
  ['trumpet', 56, 54, 84],
  ['trombone', 57, 40, 70],
  ['tuba', 58, 28, 52],
  ['horn', 60, 41, 77],
  ['sax', 65, 49, 80],
  ['flute', 73, 60, 96],
  ['clarinet', 71, 50, 88],
  ['marimba', 12, 48, 84],
  ['vibes', 11, 53, 89],
  ['glock', 9, 72, 100],
];
const base = composeSong({ genre: 'pop', seed: 11, animSeconds: 3.2, sync: true, tempo: 1, key: -1 });
const ref = (lo: number, hi: number) => {
  // 以全音階在音域內上下走（含一些跳進），長短音交替，力度起伏
  const major = [0, 2, 4, 5, 7, 9, 11];
  const pool: number[] = [];
  for (let p = lo; p <= hi; p++) if (major.includes(p % 12)) pool.push(p);
  const notes = [];
  let t = 0;
  let idx = Math.floor(pool.length / 2);
  for (let i = 0; i < 40; i++) {
    const dur = i % 3 === 2 ? 7.5 : 3.5;
    notes.push({ t, dur, pitch: pool[idx], vel: 0.55 + 0.35 * Math.abs(Math.sin(i * 0.7)) });
    t += dur + 0.5;
    const jump = i % 7 === 6 ? (i % 2 ? 5 : -5) : [1, 1, -1, 2, -1, -2][i % 6];
    idx = Math.max(0, Math.min(pool.length - 1, idx + jump));
  }
  return { notes, steps: Math.ceil(t) };
};
for (const [name, program, lo, hi] of CASES) {
  const { notes, steps } = ref(lo, hi);
  const tr: Track = { id: 'ref', role: 'lead', program, notes, pan: 0, gain: 0.95 };
  const song: Song = { ...base, tracks: [tr], steps, bars: Math.ceil(steps / 16), stepsPerBar: 16, seconds: (steps * 60) / base.bpm / 4 };
  await ensureSamplesFor(song);
  const g = await renderGm(song, { sr: SR, seed: 11, raw: true });
  const x = await renderModule(buildXm(song), SR, song.bpm, 1.0);
  writeFileSync(`${out}/${name}-midi.wav`, encodeWav(g.l, g.r, SR));
  writeFileSync(`${out}/${name}-xm.wav`, encodeWav(x.l, x.r, SR));
}
console.log(CASES.map((c) => c[0]).join(' '));
