// 開發用：把所有曲風 × 指定方案各渲染一次，檢查 NaN、峰值、RMS、時長，並輸出 WAV。
// 用法：npx tsx scripts/audio-matrix.ts <outDir> [scheme,scheme...] [animSeconds]
import { mkdirSync, writeFileSync } from 'node:fs';
import { composeSong } from '../src/audio/compose';
import { GENRES } from '../src/audio/genres';
import { renderScheme } from '../src/audio/render';
import type { GenreId, SchemeId } from '../src/audio/types';
import { encodeWav } from '../src/audio/wav';

const [outDir = 'out', schemesArg = 'nes,gb,sid,fm,midi', secs = '4.2'] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const schemes = schemesArg.split(',') as SchemeId[];
let bad = 0;
const rows: string[] = [];
for (const genre of Object.keys(GENRES) as GenreId[]) {
  for (const sc of schemes) {
    const song = composeSong({ genre, seed: 11, animSeconds: +secs, sync: true, tempo: 1, key: -1 });
    const t0 = performance.now();
    let pcm;
    try {
      pcm = await renderScheme(song, sc, { sr: 44100, seed: 11 });
    } catch (e) {
      rows.push(`${genre.padEnd(14)} ${sc.padEnd(5)} ERROR ${(e as Error).message}`);
      bad++;
      continue;
    }
    const ms = Math.round(performance.now() - t0);
    let peak = 0;
    let sum = 0;
    let nan = false;
    for (let i = 0; i < pcm.l.length; i++) {
      const a = pcm.l[i];
      const b = pcm.r[i];
      if (Number.isNaN(a) || Number.isNaN(b)) nan = true;
      peak = Math.max(peak, Math.abs(a), Math.abs(b));
      sum += a * a + b * b;
    }
    const rms = Math.sqrt(sum / (2 * pcm.l.length));
    const dur = pcm.l.length / 44100;
    const ok = !nan && peak <= 1 && rms > 0.03 && Math.abs(dur - song.seconds) < 0.01;
    if (!ok) bad++;
    rows.push(`${ok ? 'ok ' : 'BAD'} ${genre.padEnd(14)} ${sc.padEnd(5)} bpm=${song.bpm.toFixed(1).padStart(5)} bars=${String(song.bars).padStart(2)} k=${song.animLoops} dur=${dur.toFixed(2)} peak=${peak.toFixed(2)} rms=${rms.toFixed(3)} ${String(ms).padStart(5)}ms`);
    writeFileSync(`${outDir}/${genre}-${sc}.wav`, encodeWav(pcm.l, pcm.r, 44100));
  }
}
console.log(rows.join('\n'));
console.log(bad ? `FAILED: ${bad}` : 'ALL OK');
process.exit(bad ? 1 : 0);
