// 開發用：列出一首歌轉成 XM 之後，每個樂器占多少位元組。
import { composeSong } from '../src/audio/compose';
import { ensureSamplesFor } from '../src/audio/sampled';
import type { GenreId } from '../src/audio/types';
import { buildXm } from '../src/audio/xm';
import { useFfmpegDecoder } from './node-decoder';

useFfmpegDecoder();
const [genre = 'pop', piece] = process.argv.slice(2);
const song = composeSong({ genre: genre as GenreId, seed: 11, animSeconds: 3.2, sync: true, tempo: 1, key: -1, piece });
await ensureSamplesFor(song);
const mod = buildXm(song);
let tot = 0;
for (const inst of mod.instruments) {
  const bytes = inst.samples.reduce((s, x) => s + x.data.length * (x.bits / 8), 0);
  tot += bytes;
  console.log(`${inst.name.padEnd(24)} ${String(inst.samples.length).padStart(2)} 取樣 ${(bytes / 1024).toFixed(0).padStart(6)} KB`);
}
console.log(`合計 ${(tot / 1024 / 1024).toFixed(2)} MB`);
