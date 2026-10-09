// 主體 v2：幾何構成（第二版，藍本是 Dribbble 的疊色幾何海報——黃菱形、藍大圓、粉方塊、橘色重疊區，細線小星與手繪線，筆記見 docs/主體v2參考/geo.md）。
// 參考圖共通的好看原因：只有 4 個色（黃、藍、橘紅、粉）加底色與黑線；每個圖形都很大，彼此重疊；「重疊區有自己的顏色」（像套色印刷的疊印）；
// 圖形裡挖出底色的「窗」；小圓是左右兩色各半；角落有放射線小星與一兩筆手繪線，讓構圖有呼吸。
// 重疊區用凸多邊形裁切（Sutherland–Hodgman）實際算出來再上色。動畫：大圓滾入、菱形旋轉入場並分三段轉 90°、方塊與窗滑入、小圓翻轉、
// 小圓點錯峰彈出，最後逐件收合。時間結構與 v1 相同。顏色只用色板角色。
import type { Cue } from '../../../audio/types';
import { mix } from '../../color';
import { TAU, clamp, lerp } from '../../util';
import type { Subject } from '../types';

type Pt = [number, number];

/** 凸多邊形裁切：回傳 subject 落在 clip（凸、逆時針或順時針皆可）內的部分 */
function clipConvex(subject: Pt[], clip: Pt[]): Pt[] {
  let area = 0;
  for (let i = 0; i < clip.length; i++) {
    const a = clip[i];
    const b = clip[(i + 1) % clip.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  const sgn = area >= 0 ? 1 : -1;
  let out = subject;
  for (let i = 0; i < clip.length && out.length; i++) {
    const a = clip[i];
    const b = clip[(i + 1) % clip.length];
    const inside = (p: Pt) => sgn * ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) >= 0;
    const inter = (p: Pt, q: Pt): Pt => {
      const dx = q[0] - p[0];
      const dy = q[1] - p[1];
      const ex = b[0] - a[0];
      const ey = b[1] - a[1];
      const den = dx * ey - dy * ex || 1e-9;
      const t = ((a[0] - p[0]) * ey - (a[1] - p[1]) * ex) / den;
      return [p[0] + dx * t, p[1] + dy * t];
    };
    const next: Pt[] = [];
    for (let j = 0; j < out.length; j++) {
      const p = out[j];
      const q = out[(j + 1) % out.length];
      if (inside(p)) {
        next.push(p);
        if (!inside(q)) next.push(inter(p, q));
      } else if (inside(q)) next.push(inter(p, q));
    }
    out = next;
  }
  return out;
}
const flat = (p: Pt[]) => p.flatMap((v) => v);
const circlePoly = (cx: number, cy: number, r: number, n = 56): Pt[] => Array.from({ length: n }, (_, i) => [cx + Math.cos((i / n) * TAU) * r, cy + Math.sin((i / n) * TAU) * r] as Pt);
const rectPoly = (cx: number, cy: number, w: number, h: number, rot = 0): Pt[] => {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return ([[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]] as Pt[]).map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c] as Pt);
};

export const geo2: Subject = {
  id: 'geo',
  name: '幾何構成',
  en: 'Geometric',
  desc: '疊色幾何海報：黃菱形、藍大圓、粉方塊彼此重疊（重疊區有自己的顏色）、挖出底色的窗、左右兩色的小圓與放射線小星；滾入、分段旋轉、滑入、翻轉與錯峰彈出，最能看出緩動曲線的性格。',
  loop: 4,
  key: 0.24,
  hero: 0.72,
  events: () => [
    { u: 0.24, x: 70, y: 0, k: 0.9 },
    { u: 0.38, x: -100, y: 0, k: 0.5 },
    { u: 0.53, x: -100, y: 0, k: 0.5 },
  ],
  cues(M) {
    const out: Cue[] = [
      { u: 0.02, kind: 'whoosh', k: 0.45 },
      { u: 0.12, kind: 'pop', k: 0.5 },
      { u: 0.24, kind: 'land', k: 0.9 },
      { u: 0.32, kind: 'land', k: 0.4 },
      { u: 0.55, kind: 'flip', k: 0.6 },
    ];
    for (const t0 of [0.3, 0.45, 0.6]) out.push({ u: t0 + 0.08, kind: 'tick', k: 0.7 });
    for (let i = 0; i < 5; i++) out.push({ u: 0.41 + M.stag(i) * 1.6, kind: 'blip', k: 0.4 });
    out.push({ u: 0.88, kind: 'whoosh', k: 0.5 });
    return out;
  },
  track(M, env) {
    const p = M.tw(0.02, 0.24, 'o');
    const ex = M.tw(0.86, 0.98, 'i');
    return [lerp(-env.Wu / 2 - 160, 70, p) - ex * 40, 0];
  },
  draw(S, M, env) {
    const mv = M.mv;
    const u = M.u;
    const pal = S.pal;
    const hw = env.Wu / 2;
    const A = Math.min(1.05, hw / 330);
    const det = S.look.detail;
    const exit = (i: number) => 1 - M.tw(0.86 + M.stag(i) * 0.6, 0.98, 'i');
    const baseA = S.alpha;
    const FL = { stroke: false, shadow: false, hl: false, flat: true, drawOn: false } as const;
    // 四個主色：黃（a）、藍（s）、橘紅（p）、粉（p 混 light）；重疊區用橘紅、粉方塊壓在藍圓上
    const yellow = pal.a;
    const blue = pal.s;
    const coral = pal.p;
    const pink = mix(pal.p, pal.light, 0.55);
    const ink = pal.ink;
    const bg = pal.bg;
    const G = { shadow: false, hl: false } as const;

    S.push();
    S.scale(A);

    // ── 大圓（藍）：從左側滾入；半徑 138
    const cp = M.tw(0.02, 0.24, 'o');
    const ce = exit(0);
    const CX = lerp(-hw / A - 200, 70, cp);
    const CY = -4;
    const CR = 138;
    const circle = circlePoly(CX, CY, CR, 64);

    // ── 菱形（黃）：旋轉著放大入場，再分三段各轉 90°（正方形轉 90° 外觀一樣，所以可以無縫循環）
    const dp = M.tw(0.06, 0.26, 'o');
    const de = exit(1);
    let rot = Math.PI / 4;
    for (const t0 of [0.3, 0.45, 0.6]) rot += M.tw(t0, t0 + 0.08, mv.holds > 0.4 ? 'o' : 'io') * (Math.PI / 2);
    rot += (1 - dp) * 0.9;
    const DX = -96;
    const DY = 0;
    const DS = 210 * clamp(dp * 1.04) * de;
    const diamond = rectPoly(DX, DY, DS, DS, rot);

    // ── 粉方塊：從右下滑入，壓在藍圓上
    const qp = M.tw(0.14, 0.34, 'o');
    const qe = exit(2);
    const QX = 118;
    const QY = lerp(env.Hu / 2 / A + 160, 24, qp);
    const QS = 176 * qe;
    const square = rectPoly(QX, QY, QS, QS, 0);

    // 底層：藍圓、黃菱形
    if (ce > 0.01 && cp > 0.01) S.circle(CX, CY, CR * ce, blue, G);
    if (de > 0.01 && dp > 0.01) S.poly(flat(diamond), yellow, G);
    // 重疊區（橘紅）：菱形 ∩ 藍圓
    if (ce > 0.4 && de > 0.4 && dp > 0.2) {
      const lens = clipConvex(circle, diamond);
      if (lens.length > 2) S.poly(flat(lens), coral, FL);
    }
    // 粉方塊在最上；它與藍圓的重疊區比較亮（印刷疊印的感覺：加一塊更淡的粉）
    if (qe > 0.01 && qp > 0.01) {
      S.poly(flat(square), pink, G);
      const over = clipConvex(circle, square);
      if (over.length > 2 && det > 0.45) S.poly(flat(over), mix(pink, blue, 0.18), { ...FL, alpha: 0.9 });
    }

    // ── 菱形裡的「窗」：藍色圓＋挖出底色的矩形（跟著菱形的出現）
    const wp = M.tw(0.2, 0.38, 'o');
    const we = exit(3);
    if (wp > 0.01 && we > 0.01) {
      S.push();
      S.translate(DX + 8, DY + 4);
      S.scale(clamp(wp) * we);
      S.circle(0, 0, 70, blue, { ...G, alpha: 0.95 });
      S.rect(-4, 0, 54, 82, 0, bg, { ...FL, alpha: 1 });
      S.pop();
    }

    // ── 方塊上的「三角窗」：底色三角形向右滑入，旁邊一個橘紅小圓
    const tp = M.tw(0.28, 0.44, 'o');
    const te = exit(4);
    if (tp > 0.01 && te > 0.01) {
      S.push();
      S.translate(QX - 28 + (1 - tp) * 90, QY - 6);
      S.scale(te);
      S.poly([-46, -62, 74, 0, -46, 62], bg, { ...FL, alpha: 1 });
      S.pop();
      S.circle(QX + 44, QY + 8, 46 * clamp(tp) * te, coral, { ...G, alpha: 0.95 });
    }

    // ── 兩個小圓：左右兩色各半，其中一個翻轉
    const hp = M.tw(0.2, 0.34, 'o');
    const flip = M.tw(0.5, 0.6, 'io');
    const he = exit(5);
    if (hp > 0.01 && he > 0.01) {
      const halfCircle = (cx: number, cy: number, r: number, c1: string, c2: string, sx: number) => {
        S.push();
        S.translate(cx, cy);
        S.scale(clamp(hp) * he * sx, clamp(hp) * he);
        const left: number[] = [];
        const right: number[] = [];
        for (let k = 0; k <= 22; k++) {
          const a = Math.PI / 2 + (k / 22) * Math.PI;
          left.push(Math.cos(a) * r, Math.sin(a) * r);
          right.push(Math.cos(a + Math.PI) * r, Math.sin(a + Math.PI) * r);
        }
        S.poly(left, c1, G);
        S.poly(right, c2, G);
        S.pop();
      };
      halfCircle(-278, -58, 34, blue, coral, 1 - 2 * flip);
      halfCircle(222, 126, 36, yellow, coral, 1);
    }

    // ── 放射線小星與手繪線（資訊的細節層，ink 色）
    const sp = M.tw(0.3, 0.46, 'o');
    if (sp > 0.01 && det > 0.4) {
      S.alpha = baseA * clamp(sp) * exit(6);
      S.push();
      S.translate(-262, 124);
      S.rotate(u * TAU * 0.25);
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * TAU;
        S.line([Math.cos(a) * 8, Math.sin(a) * 8, Math.cos(a) * 30 * clamp(sp), Math.sin(a) * 30 * clamp(sp)], ink, { w: 1.1, alpha: 0.85, drawOn: false });
      }
      S.pop();
      if (det > 0.55) {
        S.curve([60, -150, 88, -166, 118, -148, 142, -162], ink, { w: 1.6, alpha: 0.9 });
        S.curve([40, 148, 22, 160, 4, 148, -14, 158], ink, { w: 1.6, alpha: 0.9 });
      }
      S.alpha = baseA;
    }

    // ── 圓點：3×2 點陣錯峰彈出（左下）
    for (let i = 0; i < 6; i++) {
      const dpp = M.tw(0.35 + M.stag(i) * 1.6, 0.47 + M.stag(i) * 1.6, 'o');
      if (dpp <= 0.01) continue;
      S.push();
      S.translate(-282 + (i % 3) * 19, -148 + Math.floor(i / 3) * 19);
      S.jitter(10 + i);
      S.scale(dpp * exit(7));
      S.circle(0, 0, 6, i === 4 ? coral : ink, { ...G, flat: true });
      S.pop();
    }

    // ── 角落小字
    const tpx = M.tw(0.34, 0.5, 'o');
    if (tpx > 0.01 && det > 0.4) {
      S.alpha = baseA * clamp(tpx) * exit(7);
      S.text('FORM FOLLOWS', 196, -150, 9, 'ink', { flat: true, shadow: false, stroke: false, font: 'mono', alpha: 0.7, align: 'left' });
      S.text('FUNCTION  1919', 196, -137, 9, 'ink', { flat: true, shadow: false, stroke: false, font: 'mono', alpha: 0.7, align: 'left' });
      S.alpha = baseA;
    }
    S.pop();
  },
};
