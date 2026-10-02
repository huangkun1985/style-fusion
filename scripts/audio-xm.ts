// 開發用：作曲 → 輸出 .xm 檔與用自製播放器渲染的 WAV，之後可用 ffmpeg(libopenmpt) 驗證檔案是否合法。
// 用法：npx tsx scripts/audio-xm.ts <genre> <outDir> [animSeconds]
import { mkdirSync, writeFileSync } from 'node:fs';
import { composeSong } from '../src/audio/compose';
import type { GenreId } from '../src/audio/types';
import { encodeWav } from '../src/audio/wav';
import { ensureSamplesFor } from '../src/audio/sampled';
import { buildXm, renderXm, writeXm } from '../src/audio/xm';
import { useFfmpegDecoder } from './node-decoder';

useFfmpegDecoder();

const [genre = 'chipAdventure', outDir = 'out', secs = '4.2'] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const song = composeSong({ genre: genre as GenreId, seed: 11, animSeconds: +secs, sync: true, tempo: 1, key: -1 });
await ensureSamplesFor(song);
const mod = buildXm(song);
const bytes = writeXm(mod);
writeFileSync(`${outDir}/${genre}.xm`, bytes);
const pcm = await renderXm(song, { sr: 44100, seed: 11 });
writeFileSync(`${outDir}/${genre}-xm.wav`, encodeWav(pcm.l, pcm.r, 44100));
console.log(`${genre}: ${bytes.length} bytes, channels ${mod.channels} [${mod.chanNames.join(', ')}], instruments ${mod.instruments.length}, rows ${mod.rows}, bpm ${song.bpm.toFixed(2)}, loop ${song.seconds.toFixed(3)}s`);
