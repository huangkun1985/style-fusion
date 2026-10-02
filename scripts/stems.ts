// 開發用：把一首歌的每一軌單獨渲染（不做母帶標準化），輸出 WAV，方便檢查混音平衡。
// 用法：npx tsx scripts/stems.ts <genre> <outDir> [animSeconds] [seed]
import { mkdirSync, writeFileSync } from 'node:fs';
import { composeSong } from '../src/audio/compose';
import { renderGm } from '../src/audio/gm';
import type { GenreId } from '../src/audio/types';
import { encodeWav } from '../src/audio/wav';
import { useFfmpegDecoder } from './node-decoder';

useFfmpegDecoder();
const [genre = 'pop', outDir = 'out', secs = '3.2', seed = '11'] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const song = composeSong({ genre: genre as GenreId, seed: +seed, animSeconds: +secs, sync: true, tempo: 1, key: -1 });
console.log(song.title, song.tracks.map((t) => t.id).join(' '));
for (const t of song.tracks) {
  const pcm = await renderGm({ ...song, tracks: [t] }, { sr: 44100, seed: +seed, raw: true });
  writeFileSync(`${outDir}/${genre}-stem-${t.id}.wav`, encodeWav(pcm.l, pcm.r, 44100));
}
