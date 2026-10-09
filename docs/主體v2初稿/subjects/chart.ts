// 主體 v2：數據圖表。一張克制的儀表板卡片（資料墨水比高、沒有多餘裝飾）：
// 標題、跑動的大數字與成長徽章；淡淡的刻度線；長條錯峰生長，最高那根用強調色並彈出數值標註；
// 折線帶面積底色依序描繪，圓環以帶縫的弧段掃過並附圖例；最後整齊收合。時間結構與 v1 相同。
import type { Cue } from '../../../audio/types';
import { clamp, lerp } from '../../util';
import type { Subject } from '../types';

const HS = [52, 86, 66, 118, 94, 136];
const VALS = [38, 62, 48, 86, 69, 100];
const SEG = [0.4, 0.25, 0.2, 0.15];
const LEG = ['直接', '搜尋', '推薦', '其他'];

function layout(Wu: number) {
  const portrait = Wu < 520;
  const CW = portrait ? 340 : 456;
  const CH = portrait ? 440 : 292;
  const base = portrait ? -4 : CH / 2 - 40;
  const bx0 = -CW / 2 + 56;
  return { portrait, CW, CH, base, bx0, dx: portrait ? 47 : 40, dcx: portrait ? 0 : CW / 2 - 92, dcy: portrait ? 124 : 20 };
}

export const chart2: Subject = {
  id: 'chart',
  name: '數據圖表',
  en: 'Data Chart',
  desc: '克制的資料視覺化動效：大數字滾動、長條錯峰生長並標出最高值、折線與面積描繪、圓環弧段掃過與圖例，再整齊收合。',
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
    const det = S.look.detail;
    const cin = M.tw(0.0, 0.14, 'o');
    const cout = M.tw(0.92, 1.0, 'i');
    S.alpha = baseA * clamp(cin * 1.3) * (1 - cout);
    S.push();
    S.translate(0, (1 - cin) * 40 + cout * 30);
    S.jitter(1, 0.5);
    S.scale(L.portrait ? 1 : 1.1);
    S.rect(0, 0, L.CW, L.CH, 24, 'card');
    const left = -L.CW / 2 + 28;
    const top = -L.CH / 2 + 28;

    // ── 標題、大數字與成長徽章
    const cnt = M.tw(0.1, 0.46, 'o');
    S.text('月活躍用戶', left, top, 13, 'ink', { align: 'left', flat: true, shadow: false, alpha: 0.6, font: 'sans' });
    S.text(`${Math.round(128000 * clamp(cnt)).toLocaleString('en-US')}`, left, top + 34, 32, 'ink', { align: 'left' });
    const bdg = M.tw(0.4, 0.5, 'o');
    if (bdg > 0.01) {
      S.push();
      S.translate(left + 206, top + 34);
      S.scale(clamp(bdg));
      S.rect(0, 0, 56, 22, 11, 'q', { shadow: false });
      S.text('▲ 128%', 0, 1, 11, 'light', { flat: true, shadow: false, font: 'mono' });
      S.pop();
    }

    // ── 刻度線（資料墨水比：只留三條淡線）
    const out = M.tw(0.84, 0.95, 'i');
    const x0 = L.bx0 - 26;
    const x1 = L.bx0 + 5 * L.dx + 26;
    for (let k = 0; k < 3; k++) {
      const gy = L.base - k * 56;
      S.line([x0, gy, x1, gy], 'ink', { w: k === 0 ? 1.6 : 1, alpha: k === 0 ? 0.35 : 0.12, drawOn: false });
      if (det > 0.5) S.text(String(k * 50), x0 - 8, gy, 9, 'ink', { align: 'right', flat: true, shadow: false, alpha: 0.4, font: 'mono' });
    }

    // ── 長條
    const tops: [number, number][] = [];
    HS.forEach((h, i) => {
      const g = M.tw(0.1 + M.stag(i) * 1.2, 0.32 + M.stag(i) * 1.2, 'o') * (1 - out);
      const hh = Math.max(0.5, h * g);
      const x = L.bx0 + i * L.dx;
      tops.push([x, L.base - hh]);
      if (g > 0.003) S.rect(x, L.base - hh / 2, 24, hh, 7, i === 5 ? 'a' : i % 2 ? 's' : 'p');
    });

    // ── 面積與折線
    const lp = M.tw(0.3, 0.52, 'io') * (1 - out);
    if (lp > 0.01) {
      const n = HS.length - 1;
      const reach = lp * n;
      const pts: number[] = [];
      for (let i = 0; i <= n; i++) {
        const px = L.bx0 + i * L.dx;
        const py = L.base - HS[i] - 20;
        if (i <= reach) pts.push(px, py);
        else {
          const f = reach - (i - 1);
          if (f > 0) pts.push(lerp(L.bx0 + (i - 1) * L.dx, px, f), lerp(L.base - HS[i - 1] - 20, py, f));
          break;
        }
      }
      if (pts.length >= 4 && det > 0.4) {
        const area = [...pts, pts[pts.length - 2], L.base, pts[0], L.base];
        S.poly(area, 's', { alpha: 0.16, stroke: false, shadow: false, hl: false, flat: true, drawOn: false });
      }
      if (pts.length >= 4) S.curve(pts, 'ink', { w: 2.6 });
      for (let i = 0; i <= Math.min(n, Math.floor(reach)); i++) S.circle(L.bx0 + i * L.dx, L.base - HS[i] - 20, 4.6, 'light', { stroke: 'ink', outline: true, lw: 0.9, hl: false });
    }

    // ── 最高值的標註（彈出）
    const ann = M.tw(0.36, 0.46, 'o') * (1 - out);
    if (ann > 0.01 && tops[5]) {
      S.push();
      S.translate(tops[5][0] - 4, tops[5][1] - 58);
      S.scale(clamp(ann) * (1 + 0.08 * Math.sin(clamp(ann) * Math.PI)));
      S.rect(0, 0, 50, 24, 8, 'ink', { shadow: false });
      S.poly([-5, 11, 5, 11, 0, 18], 'ink', { stroke: false, shadow: false, hl: false, flat: true });
      S.text(String(Math.round(VALS[5] * clamp(ann))), 0, 1, 13, 'light', { flat: true, shadow: false, font: 'mono' });
      S.pop();
    }

    // ── 圓環：帶縫的弧段，中央數字，下方圖例
    const sweep = M.tw(0.3, 0.62, 'io') * (1 - out);
    let acc = -Math.PI / 2;
    const roles = ['p', 's', 'q', 'a'];
    S.arc(L.dcx, L.dcy, 48, 0, Math.PI * 2, 'ink', { w: 14, alpha: 0.07, drawOn: false });
    SEG.forEach((s, i) => {
      const span = s * Math.PI * 2;
      const vis = clamp(sweep * Math.PI * 2 - (acc + Math.PI / 2), 0, span);
      if (vis > 0.08) S.arc(L.dcx, L.dcy, 48, acc + 0.05, acc + vis - 0.05, roles[i], { w: 14, cap: 'butt' });
      acc += span;
    });
    S.text(`${Math.round(72 * clamp(sweep))}%`, L.dcx, L.dcy + 1, 20, 'ink', { flat: true, shadow: false });
    if (det > 0.4 && sweep > 0.3) {
      LEG.forEach((t, i) => {
        const lx = L.dcx - 60 + (i % 2) * 64;
        const ly = L.dcy + 70 + Math.floor(i / 2) * 15;
        S.circle(lx, ly, 3.6, roles[i], { stroke: false, shadow: false, hl: false, flat: true, alpha: clamp((sweep - 0.3) * 3), drawOn: false });
        S.text(t, lx + 8, ly, 10, 'ink', { align: 'left', flat: true, shadow: false, alpha: 0.6 * clamp((sweep - 0.3) * 3), font: 'sans' });
      });
    }
    S.pop();
    S.alpha = baseA;
  },
};
