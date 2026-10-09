// 開發用：把所有曲風用指定的聲音方案各渲染一次，檢查數值是否正常（NaN、削波、音量、渲染時間）。
// 用法：npx tsx scripts/audio-sweep.ts [方案=midi] [動畫秒數=3.2] [曲風...]
import { PIECES } from '../src/audio/classics';
import { composeSong } from '../src/audio/compose';
import { GENRE_LIST } from '../src/audio/genres';
import { renderScheme } from '../src/audio/render';
import type { GenreId, SchemeId } from '../src/audio/types';
import { useFfmpegDecoder } from './node-decoder';

useFfmpegDecoder();
const [scheme = 'midi', secs = '3.2', ...only] = process.argv.slice(2);
let bad = 0;
for (const g of GENRE_LIST) {
  if (only.length && !only.includes(g.id)) continue;
  const song = composeSong({ genre: g.id as GenreId, seed: 11, animSeconds: +secs, sync: true, tempo: 1, key: -1 });
  const t0 = performance.now();
  const pcm = await renderScheme(song, scheme as SchemeId, { sr: 44100, seed: 11 });
  const ms = Math.round(performance.now() - t0);
  let peak = 0;
  let sum = 0;
  let nan = 0;
  for (let i = 0; i < pcm.l.length; i++) {
    const a = pcm.l[i];
    const b = pcm.r[i];
    if (!isFinite(a) || !isFinite(b)) nan++;
    peak = Math.max(peak, Math.abs(a), Math.abs(b));
    sum += a * a + b * b;
  }
  const rms = Math.sqrt(sum / (2 * pcm.l.length));
  const flag = nan > 0 || peak > 1.001 || rms < 0.05 || rms > 0.2 ? '  <== 異常' : '';
  if (flag) bad++;
  console.log(`${g.id.padEnd(13)} ${scheme} ${song.seconds.toFixed(1).padStart(5)}s ${Math.round(song.bpm).toString().padStart(3)}bpm  peak ${peak.toFixed(2)} rms ${rms.toFixed(3)} ${ms}ms${flag}`);
}
// 名曲：每首用它建議的編曲渲染一次（指定曲風時略過）
if (!only.length) {
  for (const p of PIECES) {
    const song = composeSong({ genre: p.genre, seed: 11, animSeconds: +secs, sync: true, tempo: 1, key: -1, piece: p.id });
    const t0 = performance.now();
    const pcm = await renderScheme(song, scheme as SchemeId, { sr: 44100, seed: 11 });
    const ms = Math.round(performance.now() - t0);
    let peak = 0;
    let sum = 0;
    let nan = 0;
    for (let i = 0; i < pcm.l.length; i++) {
      const a = pcm.l[i];
      const b = pcm.r[i];
      if (!isFinite(a) || !isFinite(b)) nan++;
      peak = Math.max(peak, Math.abs(a), Math.abs(b));
      sum += a * a + b * b;
    }
    const rms = Math.sqrt(sum / (2 * pcm.l.length));
    const flag = nan > 0 || peak > 1.001 || rms < 0.05 || rms > 0.2 ? '  <== 異常' : '';
    if (flag) bad++;
    console.log(`名曲 ${p.id.padEnd(13)} ${scheme} ${song.seconds.toFixed(1).padStart(5)}s ${Math.round(song.bpm).toString().padStart(3)}bpm  peak ${peak.toFixed(2)} rms ${rms.toFixed(3)} ${ms}ms${flag}`);
  }
}
console.log(bad ? `異常 ${bad} 個` : '全部正常');
