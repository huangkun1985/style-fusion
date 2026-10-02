// 開發用：在 Node 裡作曲並渲染，輸出 WAV 供分析。
// 用法：npx tsx scripts/audio-render.ts <genre> <scheme> [seconds] [seed] [outDir]
import { mkdirSync, writeFileSync } from 'node:fs';
import { chipEnabled, renderScheme } from '../src/audio/render';
import { composeSong } from '../src/audio/compose';
import { encodeWav } from '../src/audio/wav';
import type { GenreId, SchemeId } from '../src/audio/types';
import { useFfmpegDecoder } from './node-decoder';

useFfmpegDecoder();

const [genre = 'chipAdventure', scheme = 'nes', secs = '3.82', seed = '11', outDir = 'out'] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const song = composeSong({ genre: genre as GenreId, seed: +seed, animSeconds: +secs, sync: true, tempo: 1, key: -1 });
console.log(song.title, '| bars', song.bars, '| loops', song.animLoops, '| sec', song.seconds.toFixed(3), '| tracks', song.tracks.map((t) => `${t.id}:${t.notes.length}`).join(' '));
console.log('chords', song.chords.map((c) => c.label).join(' '));
const t0 = performance.now();
const pcm = await renderScheme(song, scheme as SchemeId, { sr: 44100, seed: +seed });
console.log('render ms', Math.round(performance.now() - t0), chipEnabled);
writeFileSync(`${outDir}/${genre}-${scheme}.wav`, encodeWav(pcm.l, pcm.r, 44100));
