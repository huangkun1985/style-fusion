// 開發用：驗證自製 XM 播放器與 libopenmpt 一致。輸出 .xm 與「不含殘響」的乾聲 WAV，再用 ffmpeg 解碼 .xm 比對包絡。
// 用法：npx tsx scripts/xm-verify.ts <outDir> [曲風...]   （之後跑 python scripts/compare.py）
import { mkdirSync, writeFileSync } from 'node:fs';
import { composeSong } from '../src/audio/compose';
import { GENRES } from '../src/audio/genres';
import { ensureSamplesFor } from '../src/audio/sampled';
import type { GenreId } from '../src/audio/types';
import { encodeWav } from '../src/audio/wav';
import { buildXm, renderModule, writeXm } from '../src/audio/xm';
import { useFfmpegDecoder } from './node-decoder';

useFfmpegDecoder();
const [outDir = 'out', ...only] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
for (const g of (only.length ? only : Object.keys(GENRES)) as GenreId[]) {
  const song = composeSong({ genre: g, seed: 11, animSeconds: 3.2, sync: true, tempo: 1, key: -1 });
  await ensureSamplesFor(song);
  const mod = buildXm(song);
  writeFileSync(`${outDir}/${g}.xm`, writeXm(mod));
  const pcm = await renderModule(mod, 44100, song.bpm, 0.5);
  writeFileSync(`${outDir}/${g}-dry.wav`, encodeWav(pcm.l, pcm.r, 44100));
}
