// 主體：數據圖表。長條錯峰生長、折線描繪、圓環掃描、數字滾動、退場收合。
import type { Cue } from '../../audio/types';
import { clamp, lerp } from '../util';
import type { Subject } from './types';

const HS = [52, 86, 66, 118, 94, 136];
const SEG = [0.4, 0.25, 0.2, 0.15];

function layout(Wu: number) {
  const portrait = Wu < 520;
  const CW = portrait ? 340 : 440;
  const CH = portrait ? 440 : 280;
  const base = portrait ? -10 : CH / 2 - 36;
  const bx0 = portrait ? -CW / 2 + 52 : -CW / 2 + 52;
  return { portrait, CW, CH, base, bx0, dx: portrait ? 47 : 40, dcx: portrait ? 0 : CW / 2 - 88, dcy: portrait ? 120 : 16 };
}

export const chart: Subject = {
  id: 'chart',
  name: '數據圖表',
  en: 'Data Chart',
  desc: '資料視覺化動效：長條錯峰生長、折線描繪、圓環掃描、數字滾動，再整齊收合。',
  loop: 4.2,
  key: 0.3,
  hero: 0.75,
  events: (env) => {
    const L = layout(env.Wu);
    return [
      { u: 0.34, x: L.bx0 + 5 * L.dx, y: L.base, k: 0.5 },
      { u: 0.62, x: L.dcx, y: L.dcy, k: 0.6 },
    ];
  },
  cues(M) {
    const out: Cue[] = [{ u: 0.02, kind: 'whoosh', k: 0.4 }];
    for (let i = 0; i < 6; i++) out.push({ u: 0.2 + M.stag(i) * 1.2, kind: 'blip', k: 0.35 + i * 0.07 });
    out.push({ u: 0.3, kind: 'rise', k: 0.3 }, { u: 0.62, kind: 'ping', k: 0.6 }, { u: 0.86, kind: 'whoosh', k: 0.4 });
    return out;
  },
  track(M, env) {
    const L = layout(env.Wu);
    const i = 5;
    const g = M.tw(0.1 + M.stag(i) * 1.2, 0.32 + M.stag(i) * 1.2, 'o');
    const out = M.tw(0.86, 0.96, 'i');
    return [L.bx0 + i * L.dx, L.base - HS[i] * g * (1 - out)];
  },
  draw(S, M, env) {
    const L = layout(env.Wu);
    const baseA = S.alpha;
    const cin = M.tw(0.0, 0.14, 'o');
    const cout = M.tw(0.92, 1.0, 'i');
    S.alpha = baseA * clamp(cin * 1.3) * (1 - cout);
    S.push();
    S.translate(0, (1 - cin) * 40 + cout * 30);
    S.jitter(1, 0.5);
    S.rect(0, 0, L.CW, L.CH, 22, 'card');
    const cnt = M.tw(0.1, 0.46, 'o');
    S.text('月活躍用戶', -L.CW / 2 + 26, -L.CH / 2 + 30, 14, 'ink', { align: 'left', flat: true, shadow: false, alpha: 0.65, font: 'sans' });
    S.text(`+${Math.round(128 * clamp(cnt))}%`, -L.CW / 2 + 26, -L.CH / 2 + 62, 30, 'ink', { align: 'left' });
    // 基線
    S.line([L.bx0 - 22, L.base, L.bx0 + 5 * L.dx + 22, L.base], 'ink', { w: 1.6, alpha: 0.3 });
    const out = M.tw(0.84, 0.95, 'i');
    const tops: number[] = [];
    HS.forEach((h, i) => {
      const g = M.tw(0.1 + M.stag(i) * 1.2, 0.32 + M.stag(i) * 1.2, 'o') * (1 - out);
      const hh = Math.max(0.5, h * g);
      const x = L.bx0 + i * L.dx;
      tops.push(L.base - hh);
      if (g > 0.003) S.rect(x, L.base - hh / 2, 24, hh, 6, i === 5 ? 'a' : i % 2 ? 's' : 'p');
    });
    // 折線
    const lp = M.tw(0.3, 0.52, 'io') * (1 - out);
    if (lp > 0.01) {
      const pts: number[] = [];
      const n = HS.length - 1;
      const reach = lp * n;
      for (let i = 0; i <= n; i++) {
        if (i <= reach) pts.push(L.bx0 + i * L.dx, L.base - HS[i] - 22);
        else {
          const f = reach - (i - 1);
          if (f > 0) pts.push(lerp(L.bx0 + (i - 1) * L.dx, L.bx0 + i * L.dx, f), lerp(L.base - HS[i - 1] - 22, L.base - HS[i] - 22, f));
          break;
        }
      }
      if (pts.length >= 4) S.line(pts, 'ink', { w: 2.6 });
      for (let i = 0; i <= Math.min(n, Math.floor(reach)); i++) S.circle(L.bx0 + i * L.dx, L.base - HS[i] - 22, 4.5, 'light', { stroke: 'ink', outline: true, lw: 0.9, hl: false });
    }
    // 圓環
    const sweep = M.tw(0.3, 0.62, 'io') * (1 - out);
    let acc = -Math.PI / 2;
    const roles = ['p', 's', 'q', 'a'];
    S.arc(L.dcx, L.dcy, 50, 0, Math.PI * 2, 'ink', { w: 15, alpha: 0.08, drawOn: false });
    SEG.forEach((s, i) => {
      const span = s * Math.PI * 2;
      const vis = clamp(sweep * Math.PI * 2 - (acc + Math.PI / 2), 0, span);
      if (vis > 0.01) S.arc(L.dcx, L.dcy, 50, acc + 0.03, acc + vis - 0.03, roles[i], { w: 15, cap: 'butt' });
      acc += span;
    });
    S.text(`${Math.round(72 * clamp(sweep))}%`, L.dcx, L.dcy + 1, 20, 'ink', { flat: true, shadow: false });
    S.pop();
    S.alpha = baseA;
  },
};
