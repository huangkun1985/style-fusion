// 精修混音（1.4.0）的量測：原版 vs 精修，每個聲部的響度在不同歌之間差多少（標準差越小＝平衡越一致），
// 以及整首的峰值、RMS、有沒有 NaN。用法：npx tsx scripts/polish-check.ts
import { composeSong } from '../src/audio/compose';
import { activeLoudness } from '../src/audio/dsp';
import { renderGm } from '../src/audio/gm';
import type { GenreId, TrackRole } from '../src/audio/types';
import { useFfmpegDecoder } from './node-decoder';

useFfmpegDecoder();
const genres: GenreId[] = ['pop', 'kpop', 'rnb', 'ballad', 'house', 'rock', 'jazz', 'lofi', 'cinematic', 'acoustic', 'bossa', 'funk', 'citypop', 'solopiano', 'quartet'];
const lv: Record<string, Record<TrackRole, number[]>> = { classic: {} as Record<TrackRole, number[]>, polish: {} as Record<TrackRole, number[]> };
const full: Record<string, { peak: number; rms: number; nan: number }[]> = { classic: [], polish: [] };
for (const g of genres) {
  for (const seed of [5, 19]) {
    for (const mode of ['classic', 'polish'] as const) {
      const song = composeSong({ genre: g, seed, animSeconds: 3.2, sync: true, tempo: 1, key: -1, polish: mode === 'polish' });
      // 每一軌單獨（含它送進殘響的部分），量有聲部分的響度
      for (const t of song.tracks) {
        const pcm = await renderGm({ ...song, tracks: [t] }, { sr: 44100, seed, raw: true });
        const mono = new Float32Array(pcm.l.length);
        for (let i = 0; i < mono.length; i++) mono[i] = (pcm.l[i] + pcm.r[i]) / 2;
        const r: TrackRole = t.drum ? 'perc' : t.role;
        (lv[mode][r] ??= []).push(activeLoudness(mono, 44100));
      }
      const pcm = await renderGm(song, { sr: 44100, seed });
      let peak = 0;
      let sum = 0;
      let nan = 0;
      for (let i = 0; i < pcm.l.length; i++) {
        const a = pcm.l[i];
        const b = pcm.r[i];
        if (!Number.isFinite(a) || !Number.isFinite(b)) nan++;
        peak = Math.max(peak, Math.abs(a), Math.abs(b));
        sum += a * a + b * b;
      }
      full[mode].push({ peak, rms: Math.sqrt(sum / (2 * pcm.l.length)), nan });
    }
  }
  process.stdout.write('.');
}
console.log();
const sd = (a: number[]) => {
  const m = a.reduce((x, y) => x + y, 0) / a.length;
  return Math.sqrt(a.reduce((x, y) => x + (y - m) * (y - m), 0) / a.length);
};
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
console.log('聲部      原版 平均／標準差      精修 平均／標準差（dB）');
for (const r of ['lead', 'counter', 'arp', 'chord', 'pad', 'bass', 'perc'] as TrackRole[]) {
  const a = lv.classic[r] ?? [];
  const b = lv.polish[r] ?? [];
  if (!a.length) continue;
  console.log(`${r.padEnd(8)}  ${mean(a).toFixed(1).padStart(6)} ／ ${sd(a).toFixed(2)}        ${mean(b).toFixed(1).padStart(6)} ／ ${sd(b).toFixed(2)}   (n=${a.length})`);
}
for (const m of ['classic', 'polish']) {
  const f = full[m];
  console.log(`${m.padEnd(8)} 峰值最大 ${Math.max(...f.map((x) => x.peak)).toFixed(3)}  RMS ${Math.min(...f.map((x) => x.rms)).toFixed(3)}–${Math.max(...f.map((x) => x.rms)).toFixed(3)}  NaN ${f.reduce((a, x) => a + x.nan, 0)}`);
}
