// 開發用：同一首歌，每一軌分別用 MIDI 與 XM 渲染（不做母帶標準化），比較原始響度與頻譜重心，找 XM 的混音／音色差異。
// 用法：npx tsx scripts/xm-stems.ts [曲風=pop] [名曲]
import { composeSong } from '../src/audio/compose';
import { renderGm } from '../src/audio/gm';
import { ensureSamplesFor } from '../src/audio/sampled';
import type { GenreId } from '../src/audio/types';
import { buildXm, renderModule } from '../src/audio/xm';
import { useFfmpegDecoder } from './node-decoder';

useFfmpegDecoder();
const [genre = 'pop', piece] = process.argv.slice(2);
const SR = 44100;
const song = composeSong({ genre: genre as GenreId, seed: 11, animSeconds: 3.2, sync: true, tempo: 1, key: -1, piece });
await ensureSamplesFor(song);
console.log(song.title);

/** 只看有聲音的部分的 RMS（dB），以及用過零率估的頻譜重心（粗略） */
function stat(l: Float32Array, r: Float32Array) {
  let sum = 0;
  let n = 0;
  let hi = 0;
  let tot = 0;
  for (let i = 1; i < l.length; i++) {
    const m = (l[i] + r[i]) * 0.5;
    if (Math.abs(m) > 1e-4) {
      sum += m * m;
      n++;
    }
    const d = (l[i] - l[i - 1] + r[i] - r[i - 1]) * 0.5;
    hi += d * d;
    tot += m * m;
  }
  const rms = n ? Math.sqrt(sum / n) : 0;
  return { db: 20 * Math.log10(rms + 1e-9), bright: Math.sqrt(hi / (tot + 1e-12)) };
}

console.log('軌道      角色   MIDI(dB)  XM(dB)  差    亮度MIDI 亮度XM');
for (const t of song.tracks) {
  const one = { ...song, tracks: [t] };
  const g = await renderGm(one, { sr: SR, seed: 11, raw: true });
  const mod = buildXm(one);
  const x = await renderModule(mod, SR, song.bpm, 1.0);
  const a = stat(g.l, g.r);
  const b = stat(x.l, x.r);
  console.log(`${t.id.padEnd(9)} ${t.role.padEnd(7)} ${a.db.toFixed(1).padStart(7)} ${b.db.toFixed(1).padStart(7)} ${(b.db - a.db).toFixed(1).padStart(6)}   ${a.bright.toFixed(3)}   ${b.bright.toFixed(3)}`);
}
