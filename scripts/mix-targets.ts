// 產生 src/audio/mixTargets.ts：精修混音（1.4.0）各聲部「有聲部分」的目標響度。
// 做法：所有一般曲風（不含晶片類）用多個種子作曲，以「精修」的效果鏈渲染但不做響度對齊（__mixProbe），
// 量每一軌過完效果鏈後的響度，每個聲部取中位數當目標——也就是保留 1.2 版調好的聲部平衡，
// 只把「這首歌某一軌特別大聲／特別小聲」（例如琶音很密、旋律很稀）拉回同一個水準。
// 用法：npx tsx scripts/mix-targets.ts（取樣包、音色模型、ROLE_MIX 或效果鏈改了就重跑）
import { writeFileSync } from 'node:fs';
import { composeSong } from '../src/audio/compose';
import { GENRES } from '../src/audio/genres';
import { renderGm } from '../src/audio/gm';
import type { GenreId, TrackRole } from '../src/audio/types';
import { useFfmpegDecoder } from './node-decoder';

useFfmpegDecoder();
const probe: { role: TrackRole; L: number; genre: string }[] = [];
(globalThis as { __mixProbe?: typeof probe }).__mixProbe = probe;
const CHIP = new Set(['chipAdventure', 'chipDark', 'synthwave', 'cyber', 'techno', 'vapor']);
const genres = (Object.keys(GENRES) as GenreId[]).filter((g) => !CHIP.has(g));
let n = 0;
for (const g of genres) {
  for (const seed of [3, 11, 27]) {
    const song = composeSong({ genre: g, seed, animSeconds: 3.2, sync: true, tempo: 1, key: -1, polish: true });
    await renderGm(song, { sr: 44100, seed, raw: true });
    n++;
  }
  process.stdout.write('.');
}
console.log(`\n${n} 首、${probe.length} 軌`);
const roles: TrackRole[] = ['lead', 'counter', 'arp', 'chord', 'pad', 'bass', 'perc'];
const med = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[Math.floor(s.length / 2)] : -24;
};
const out: Record<string, number> = {};
for (const r of roles) {
  const ls = probe.filter((p) => p.role === r && p.L > -100).map((p) => p.L);
  const m = med(ls);
  const lo = med(ls.filter((x) => x < m));
  const hi = med(ls.filter((x) => x > m));
  out[r] = Math.round(m * 10) / 10;
  console.log(`${r.padEnd(8)} n=${String(ls.length).padStart(3)}  中位 ${m.toFixed(1)} dB  四分位 ${lo.toFixed(1)} … ${hi.toFixed(1)}`);
}
// 設計上的兩條規則（不是量出來的）：主旋律永遠最突出——鼓至少比主旋律低 1.5 dB（1.2 版曾有鼓蓋過旋律的回報）；
// 鋪底與琶音至少比和弦低 3 dB（它們是背景層）
out.perc = Math.min(out.perc, Math.round((out.lead - 1.5) * 10) / 10);
out.pad = Math.min(out.pad, Math.round((out.chord - 3) * 10) / 10);
out.arp = Math.min(out.arp, Math.round((out.chord - 3) * 10) / 10);
console.log('套用規則後', out);
const body = `// 自動產生（scripts/mix-targets.ts）：精修混音時各聲部「有聲部分」的目標響度（dB）。
// 取樣包、音色模型、ROLE_MIX 或效果鏈改了就重跑：npx tsx scripts/mix-targets.ts
import type { TrackRole } from './types';

export const MIX_TARGET: Record<TrackRole, number> = { ${Object.entries(out).map(([k, v]) => `${k}: ${v}`).join(', ')} };
`;
writeFileSync(new URL('../src/audio/mixTargets.ts', import.meta.url), body);
console.log('寫入 src/audio/mixTargets.ts');
