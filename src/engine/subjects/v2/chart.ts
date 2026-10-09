// 主體 v2：數據圖表（第二版，藍本是 Dribbble 的「Overview／Portfolio Performance」儀表板，筆記見 docs/主體v2參考/chart.md）。
// 參考圖共通的好看原因：資料墨水比高——大數字加綠色變化量膠囊；細瘦的垂直長條當「背景資料」，面積圖與被強調的時間窗用同一個強調色；
// 深色小標註（tooltip）釘在高點上；環形儀表分段、中央大數字加綠色小膠囊；清單列左邊一條色帶、右邊數值與漲跌；髮絲邊框的卡片、極淡的格線。
// 動畫：卡片滑入 → 大數字滾動 → 細長條錯峰長出 → 面積與折線描繪 → 標註彈出並釘在高點 → 環形儀表弧段掃過 → 清單列依序滑入 → 整齊收合。
// 時間結構與 v1 相同。顏色只用色板角色：一個強調色（p）＋ink 的不同濃度＋語意綠（q）。
import type { Cue } from '../../../audio/types';
import { mix } from '../../color';
import { TAU, clamp, hash, lerp } from '../../util';
import type { Subject } from '../types';

const N = 30; // 細長條數
const PEAK = 22; // 標註釘的位置
const SEG = [0.46, 0.26, 0.18, 0.1];
const ROWS: [string, string, string][] = [
  ['Risk Asset Exposure', '$12,480', '+25.6%'],
  ['Total Value Staked', '$8,960', '+10.9%'],
  ['Stable Reserve', '$5,420', '+12.3%'],
];
const MONTHS = ['Jan', 'Mar', 'May', 'Jul', 'Sep'];

/** 資料：細長條高度（0..1），有一個明顯的高峰 */
const DATA = Array.from({ length: N }, (_, i) => {
  const t = i / (N - 1);
  return clamp(0.28 + 0.34 * t + 0.16 * Math.sin(t * 9 + 1) + 0.1 * (hash(i, 7) - 0.5) + 0.3 * Math.exp(-Math.pow((i - PEAK) / 2.6, 2)), 0.1, 1);
});

function layout(Wu: number) {
  const portrait = Wu < 520;
  const CW = portrait ? 320 : 540;
  const CH = portrait ? 440 : 300;
  const cw = portrait ? 252 : 292; // 圖表寬
  const ch = portrait ? 96 : 112;
  const cx0 = portrait ? -cw / 2 : -CW / 2 + 28;
  const base = portrait ? -52 : 68; // 圖表底線
  const dcx = portrait ? 0 : CW / 2 - 92;
  const dcy = portrait ? 118 : -14;
  return { portrait, CW, CH, cw, ch, cx0, base, dcx, dcy, step: cw / (N - 1) };
}

export const chart2: Subject = {
  id: 'chart',
  name: '數據圖表',
  en: 'Data Chart',
  desc: '克制的儀表板動效：大數字滾動、細長條錯峰長出、面積與折線描繪、標註釘在高點、環形儀表弧段掃過、清單列依序滑入，再整齊收合。',
  loop: 4.2,
  key: 0.3,
  hero: 0.75,
  events: (env) => {
    const L = layout(env.Wu);
    return [
      { u: 0.34, x: L.cx0 + PEAK * L.step, y: L.base, k: 0.5 },
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
    const g = M.tw(0.1, 0.34, 'o');
    const out = M.tw(0.86, 0.96, 'i');
    return [L.cx0 + PEAK * L.step, L.base - DATA[PEAK] * L.ch * g * (1 - out)];
  },
  draw(S, M, env) {
    const L = layout(env.Wu);
    const pal = S.pal;
    const baseA = S.alpha;
    const det = S.look.detail;
    const mv = M.mv;
    const cin = M.tw(0.0, 0.14, 'o');
    const cout = M.tw(0.92, 1.0, 'i');
    const out = M.tw(0.84, 0.95, 'i');
    const FL = { stroke: false, shadow: false, hl: false, flat: true, drawOn: false } as const;

    // ── 色彩：一個強調色＋ink 的不同濃度＋語意綠
    const hair = mix(pal.card, pal.ink, 0.085);
    const barC = mix(pal.card, pal.ink, 0.1);
    const tint = mix(pal.p, pal.card, 0.84);
    const slateD = mix(pal.ink, pal.card, 0.16);
    const slateL = mix(pal.ink, pal.card, 0.7);
    const amber = mix(pal.a, pal.card, 0.1);
    const segC = [pal.p, slateD, slateL, amber];
    const posBg = mix(pal.q, pal.card, 0.84);
    // 像素風格下的小字改畫成色條
    const cell = (S.look.post.find((q) => q.fx === 'pixelate')?.p.size ?? 0) * 400;
    const T = (str: string, x: number, y: number, size: number, c: string, o: { a?: number; align?: CanvasTextAlign; font?: 'mono' } = {}) => {
      const al = o.align ?? 'left';
      if (cell > 1.2 && size * 1.08 < cell * 3.6) {
        const w = Math.max(cell * 2, S.measure(str, size));
        const cxx = al === 'left' ? x + w / 2 : al === 'right' ? x - w / 2 : x;
        S.rect(cxx, y, w, Math.max(cell * 0.9, size * 0.5), 1, c, { alpha: (o.a ?? 1) * 0.55, ...FL });
        return;
      }
      S.text(str, x, y, size, c, { flat: true, shadow: false, alpha: o.a ?? 1, align: al, ...(size < 13 ? { stroke: false as const } : {}), ...(o.font ? { font: o.font } : {}) });
    };

    S.alpha = baseA * clamp(cin * 1.3) * (1 - cout);
    S.push();
    S.translate(0, (1 - cin) * 40 + cout * 30);
    S.jitter(1, 0.5);
    S.scale(L.portrait ? 1 : 1.12);
    // 卡片：髮絲邊框＋極淡下緣陰影
    S.rect(0, 2, L.CW - 2, L.CH, 16, 'ink', { alpha: 0.05, ...FL });
    S.rect(0, 0, L.CW, L.CH, 16, 'card', { shadow: false, hl: false, stroke: hair, outline: true, lw: 0.4, drawOn: false });
    const left = -L.CW / 2 + 28;
    const top = -L.CH / 2 + 26;

    // ── 標題、大數字與成長膠囊、區間分頁
    const cnt = M.tw(0.1, 0.46, 'o');
    T('Portfolio Performance', left, top, 10.5, 'ink', { a: 0.55 });
    T(`$${(128.4 * clamp(cnt)).toFixed(1)}K`, left, top + 30, 28, 'ink');
    const bdg = M.tw(0.4, 0.5, 'o');
    if (bdg > 0.01) {
      S.push();
      S.translate(left + S.measure('$128.4K', 28) + 14, top + 31);
      S.scale(clamp(bdg));
      S.rect(31, 0, 62, 20, 10, posBg, FL);
      T('▲ 14.6%', 31, 0.5, 10.5, 'q', { align: 'center' });
      S.pop();
    }
    if (!L.portrait) {
      ['1W', '1M', '3M', '1Y'].forEach((t, i) => {
        const x = left + L.cw - 96 + i * 26;
        if (i === 2) S.rect(x, top + 2, 24, 16, 8, tint, FL);
        T(t, x, top + 2, 8.5, i === 2 ? 'p' : 'ink', { align: 'center', a: i === 2 ? 1 : 0.45 });
      });
    }

    // ── 細長條（背景資料）、面積、折線
    const x0 = L.cx0;
    const yb = L.base;
    const grow = (i: number) => M.tw(0.1 + (i / (N - 1)) * 0.2, 0.3 + (i / (N - 1)) * 0.2, 'o') * (1 - out);
    const win0 = 12; // 被強調的時間窗（第 12–24 根）
    const win1 = 24;
    const wp = M.tw(0.34, 0.46, 'o');
    for (let k = 1; k <= 2; k++) {
      const gy = yb - (k * L.ch) / 2.2;
      S.line([x0 - 6, gy, x0 + L.cw + 6, gy], 'ink', { w: 0.8, alpha: 0.1, dash: [3, 4], drawOn: false });
    }
    S.line([x0 - 6, yb, x0 + L.cw + 6, yb], 'ink', { w: 1, alpha: 0.18, drawOn: false });
    const pts: number[] = [];
    let drawn = 0;
    for (let i = 0; i < N; i++) {
      const g = grow(i);
      const h = Math.max(0.5, DATA[i] * L.ch * 0.82 * g);
      const x = x0 + i * L.step;
      const inWin = i >= win0 && i <= win1;
      const hi = inWin ? wp : 0;
      if (g > 0.003) {
        S.rect(x, yb - h / 2, Math.max(2.2, L.step * 0.46), h, 1.1, barC, FL);
        if (hi > 0.02) S.rect(x, yb - h / 2, Math.max(2.2, L.step * 0.46), h, 1.1, pal.p, { ...FL, alpha: 0.85 * hi });
      }
      if (g > 0.01) {
        pts.push(x, yb - DATA[i] * L.ch * 0.82 * g);
        drawn = i;
      }
    }
    const lp = M.tw(0.3, 0.52, 'io') * (1 - out);
    if (lp > 0.01 && pts.length >= 4) {
      const upto = Math.max(2, Math.floor((pts.length / 2) * clamp(lp * 1.05)));
      const seg = pts.slice(0, upto * 2);
      if (seg.length >= 4 && det > 0.4) S.poly([...seg, seg[seg.length - 2], yb, seg[0], yb], pal.p, { ...FL, alpha: 0.14 });
      if (seg.length >= 4) S.curve(seg, pal.p, { w: 2, cap: 'round' });
    }
    void drawn;

    // ── 月份軸標
    if (det > 0.5) MONTHS.forEach((m, i) => T(m, x0 + (i / (MONTHS.length - 1)) * L.cw, yb + 13, 8, 'ink', { align: 'center', a: 0.38 }));

    // ── 標註：深色小膠囊釘在高點，加一條垂直虛線
    const ann = M.tw(0.36, 0.46, 'o') * (1 - out);
    if (ann > 0.01) {
      const ax = x0 + PEAK * L.step;
      const ay = yb - DATA[PEAK] * L.ch * 0.82;
      S.line([ax, ay, ax, yb], 'ink', { w: 0.9, alpha: 0.35 * clamp(ann), dash: [3, 3], drawOn: false });
      S.circle(ax, ay, 3.6, 'card', { stroke: pal.p, outline: true, lw: 1, hl: false, shadow: false, flat: true, drawOn: false });
      S.push();
      S.translate(ax, ay - 20);
      S.scale(clamp(ann) * (1 + 0.08 * Math.sin(clamp(ann) * Math.PI) * (0.5 + mv.exag)));
      S.rect(0, 0, 78, 20, 6, 'ink', { shadow: false });
      S.poly([-4, 9, 4, 9, 0, 14], 'ink', FL);
      T('Actual: $12.8K', 0, 0.5, 9, 'light', { align: 'center' });
      S.pop();
    }

    // ── 環形儀表（弧段有縫）、中央數字與「Health Score」膠囊
    const sweep = M.tw(0.3, 0.62, 'io') * (1 - out);
    const R0 = L.portrait ? 40 : 42;
    let acc = -Math.PI / 2;
    S.arc(L.dcx, L.dcy, R0, 0, TAU, 'ink', { w: 11, alpha: 0.06, drawOn: false });
    SEG.forEach((s, i) => {
      const span = s * TAU;
      const vis = clamp(sweep * TAU - (acc + Math.PI / 2), 0, span);
      if (vis > 0.1) S.arc(L.dcx, L.dcy, R0, acc + 0.06, acc + vis - 0.06, segC[i], { w: 11, cap: 'butt' });
      acc += span;
    });
    T(`${(75.8 * clamp(sweep)).toFixed(1)}%`, L.dcx, L.dcy - 3, 17, 'ink', { align: 'center' });
    if (sweep > 0.5) {
      S.alpha = baseA * clamp(cin * 1.3) * (1 - cout) * clamp((sweep - 0.5) * 3);
      S.rect(L.dcx, L.dcy + 14, 54, 14, 7, posBg, FL);
      T('Health Score', L.dcx, L.dcy + 14.5, 7.5, 'q', { align: 'center' });
      S.alpha = baseA * clamp(cin * 1.3) * (1 - cout);
    }

    // ── 清單列：左邊一條色帶、名稱與金額、右邊漲跌
    const lx = L.portrait ? -L.CW / 2 + 28 : L.dcx - 74;
    const lw = L.portrait ? L.CW - 56 : 150;
    const ly0 = L.portrait ? L.dcy + 66 : L.dcy + 56;
    ROWS.forEach(([name, val, chg], i) => {
      const rp = M.tw(0.5 + i * 0.05, 0.64 + i * 0.05, 'o') * (1 - out);
      if (rp <= 0.01) return;
      const y = ly0 + i * (L.portrait ? 32 : 31);
      S.push();
      S.translate((1 - rp) * 30, 0);
      S.alpha = baseA * clamp(rp) * (1 - cout);
      S.rect(lx, y, 2.4, 20, 1.2, segC[i], FL);
      T(name, lx + 8, y - 5, 8, 'ink', { a: 0.55 });
      T(val, lx + 8, y + 6, 11.5, 'ink');
      T(chg, lx + lw, y, 8.5, 'q', { align: 'right' });
      S.pop();
    });
    S.pop();
    S.alpha = baseA;
  },
};
