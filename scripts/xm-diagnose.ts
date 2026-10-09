// 開發用：診斷 XM 方案——歌裡的音符有多少在轉成追蹤器音軌時被丟掉或截短。
// 用法：npx tsx scripts/xm-diagnose.ts [曲風=pop] [名曲]
import { composeSong } from '../src/audio/compose';
import { GENRES } from '../src/audio/genres';
import { ensureSamplesFor } from '../src/audio/sampled';
import type { GenreId } from '../src/audio/types';
import { buildXm } from '../src/audio/xm';
import { useFfmpegDecoder } from './node-decoder';

useFfmpegDecoder();
const [only, piece] = process.argv.slice(2);
const genres = (only ? [only] : Object.keys(GENRES)) as GenreId[];
let totalSrc = 0;
let totalOut = 0;
for (const g of genres) {
  const song = composeSong({ genre: g, seed: 11, animSeconds: 3.2, sync: true, tempo: 1, key: -1, piece });
  await ensureSamplesFor(song);
  const mod = buildXm(song);
  // 每個非鼓軌的來源音符數 vs 追蹤器裡實際的 note-on 數（依聲道名稱歸屬）
  const rows: string[] = [];
  for (const tr of song.tracks) {
    if (tr.drum) continue;
    const src = tr.notes.length;
    let out = 0;
    mod.chanNames.forEach((nm, c) => {
      if (nm === tr.id || nm.startsWith(`${tr.id} `)) for (let r = 0; r < mod.rows; r++) if (mod.cells[r][c].note >= 1 && mod.cells[r][c].note <= 96) out++;
    });
    totalSrc += src;
    totalOut += out;
    if (out < src) rows.push(`${tr.id}:${out}/${src}`);
  }
  console.log(`${g.padEnd(14)} ch=${String(mod.channels).padStart(2)} inst=${String(mod.instruments.length).padStart(2)} ${rows.length ? '丟音 ' + rows.join(' ') : 'ok'}`);
}
console.log(`音符保留 ${totalOut}/${totalSrc} (${((100 * totalOut) / totalSrc).toFixed(1)}%)`);
