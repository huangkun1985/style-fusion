// 開發用：XM 方案裡「沒有取樣的音色」（合成器、合成低音、鋪底…）用程式生成的小取樣，音量和 MIDI 方案不同。
// 這支腳本對每個這類音色號，用 MIDI 與 XM 各渲染同一段參考樂句，算出 XM 取樣該縮放多少，
// 才會和取樣樂器落在同一個相對音量（目標：XM 比 MIDI 小 OFFSET dB，與取樣樂器一致）。
// 有取樣的音色也一併量測，得到殘差修正（XM_PACK_SCALE）；沒有取樣的音色得到 XM_SYN_SCALE。
// 用法：npx tsx scripts/xm-calibrate-synth.ts  → 寫入 src/audio/xmCalibration.ts（自動產生，不要手改）
import { writeFileSync } from 'node:fs';
import { composeSong } from '../src/audio/compose';
import { GENRES } from '../src/audio/genres';
import { renderGm } from '../src/audio/gm';
import { voiceOf } from '../src/audio/sampled';
import type { Song, Track } from '../src/audio/types';
import { buildXm, renderModule } from '../src/audio/xm';
import { useFfmpegDecoder } from './node-decoder';

useFfmpegDecoder();
// 量測時關掉現有的校準表，才會得到絕對的縮放倍率
(globalThis as { __noXmCal?: boolean }).__noXmCal = true;
const SR = 44100;
/** 取樣樂器在 XM 比 MIDI 小的量（xm-stems 量到的中位數，所有取樣聲部一致） */
const OFFSET = 18.3;

const base = composeSong({ genre: 'pop', seed: 11, animSeconds: 3.2, sync: true, tempo: 1, key: -1 });

function stat(l: Float32Array, r: Float32Array): number {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < l.length; i++) {
    const m = (l[i] + r[i]) * 0.5;
    if (Math.abs(m) > 1e-4) {
      sum += m * m;
      n++;
    }
  }
  return 20 * Math.log10(Math.sqrt(n ? sum / n : 0) + 1e-9);
}

const programs = new Set<number>();
for (const g of Object.values(GENRES)) for (const p of Object.values(g.prog)) if (p !== undefined) programs.add(p);

const table: Record<number, number> = {};
const packTable: Record<number, number> = {};
for (const p of [...programs].sort((a, b) => a - b)) {
  const sampledVoice = !!voiceOf(p);
  const low = [32, 33, 34, 35, 38, 39, 43, 58].includes(p);
  const basePitches = low ? [36, 40, 43, 40, 36, 43, 45, 43] : [60, 64, 67, 72, 67, 64, 62, 65];
  // 短音、極短音與長音，低中高三個音區各量一次再平均：合成音色的長音在 MIDI 會衰減、高音會變小，XM 的取樣卻不會
  let diff = 0;
  let midDb = 0;
  let xmDb = 0;
  const combos: [number, number, number, number][] = [];
  for (const shift of low ? [0, 12] : [-6, 0, 12]) for (const [step, len, count] of [[4, 3.5, 16], [12, 11.5, 5], [4, 1.3, 16]]) combos.push([step, len, count, shift]);
  for (const [step, len, count, shift] of combos) {
    const notes = Array.from({ length: count }, (_, i) => ({ t: i * step, dur: len, pitch: basePitches[i % basePitches.length] + shift, vel: 0.8 }));
    const tr: Track = { id: 'ref', role: 'lead', program: p, notes, pan: 0, gain: 0.95 };
    const song: Song = { ...base, tracks: [tr], steps: 64, bars: 4, stepsPerBar: 16, seconds: (64 * 60) / base.bpm / 4 };
    const g = await renderGm(song, { sr: SR, seed: 11, raw: true });
    const x = await renderModule(buildXm(song), SR, song.bpm, 0.5);
    const mid = stat(g.l, g.r);
    const xm = stat(x.l, x.r);
    diff += (mid - OFFSET - xm) / combos.length;
    midDb += mid / combos.length;
    xmDb += xm / combos.length;
  }
  const s = Math.pow(10, diff / 20);
  if (sampledVoice) packTable[p] = Math.round(Math.min(Math.max(s, 0.3), 2.5) * 1000) / 1000;
  else table[p] = Math.round(Math.min(s, 1) * 1000) / 1000;
  console.log(`program ${String(p).padStart(3)}  MIDI ${midDb.toFixed(1)} dB  XM ${xmDb.toFixed(1)} dB  → ${sampledVoice ? '取樣殘差' : '合成縮放'} ${s.toFixed(3)}${!sampledVoice && s > 1 ? '（超過 1，已限制）' : ''}`);
}
const fmt = (t: Record<number, number>) =>
  Object.entries(t)
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ');
writeFileSync(
  new URL('../src/audio/xmCalibration.ts', import.meta.url),
  `// 自動產生（scripts/xm-calibrate-synth.ts）：讓 XM 方案各音色的音量和 MIDI 方案對齊。取樣包或合成取樣有變時重新執行腳本。
` +
    `/** 沒有取樣的音色號（合成器、合成低音、鋪底…）：程式生成取樣的縮放倍率 */
export const XM_SYN_SCALE: Record<number, number> = { ${fmt(table)} };
` +
    `/** 有取樣的音色號：相對於一般換算的殘差修正 */
export const XM_PACK_SCALE: Record<number, number> = { ${fmt(packTable)} };
`,
);
console.log('已寫入 src/audio/xmCalibration.ts');
