// 緩動曲線庫：所有曲線以「out」形式定義，in / in-out 由鏡像推導。
// 多個動效風格的緩動會按權重「函數級混合」，並可反推最接近的 cubic-bezier 與 CSS linear()。
import { TAU, clamp, round } from './util';

export type EaseId =
  | 'linear'
  | 'sine'
  | 'quad'
  | 'cubic'
  | 'quart'
  | 'quint'
  | 'expo'
  | 'circ'
  | 'back'
  | 'elastic'
  | 'bounce'
  | 'spring'
  | 'material'
  | 'snappy'
  | 'anticipate';

export type EaseFn = (x: number) => number;

export function bezier(x1: number, y1: number, x2: number, y2: number): EaseFn {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sx = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sy = (t: number) => ((ay * t + by) * t + cy) * t;
  const dx = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const e = sx(t) - x;
      if (Math.abs(e) < 1e-6) break;
      const d = dx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= e / d;
    }
    if (t < 0 || t > 1 || Math.abs(sx(t) - x) > 1e-4) {
      let lo = 0;
      let hi = 1;
      t = x;
      for (let i = 0; i < 40; i++) {
        const v = sx(t);
        if (Math.abs(v - x) < 1e-6) break;
        if (v < x) lo = t;
        else hi = t;
        t = (lo + hi) / 2;
      }
    }
    return sy(t);
  };
}

function outBounce(x: number): number {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (x < 1 / d1) return n1 * x * x;
  if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75;
  if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375;
  return n1 * (x -= 2.625 / d1) * x + 0.984375;
}
const c1 = 1.70158;
const c3 = c1 + 1;
const c4 = TAU / 3;

export const OUT: Record<EaseId, EaseFn> = {
  linear: (x) => x,
  sine: (x) => Math.sin((x * Math.PI) / 2),
  quad: (x) => 1 - (1 - x) * (1 - x),
  cubic: (x) => 1 - Math.pow(1 - x, 3),
  quart: (x) => 1 - Math.pow(1 - x, 4),
  quint: (x) => 1 - Math.pow(1 - x, 5),
  expo: (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x)),
  circ: (x) => Math.sqrt(Math.max(0, 1 - (x - 1) * (x - 1))),
  back: (x) => 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2),
  elastic: (x) => (x <= 0 ? 0 : x >= 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * c4) + 1),
  bounce: outBounce,
  spring: (x) => (x >= 1 ? 1 : 1 - Math.exp(-6.5 * x) * Math.cos(2.6 * Math.PI * x)),
  material: bezier(0.2, 0, 0, 1),
  snappy: bezier(0.16, 1, 0.3, 1),
  anticipate: bezier(0.36, -0.45, 0.4, 1.0),
};

export const EASE_INFO: Record<EaseId, { name: string; css?: string; gsap: string; ae: string }> = {
  linear: { name: '線性 Linear', css: 'linear', gsap: 'none', ae: '關閉緩動（線性關鍵影格）' },
  sine: { name: '正弦 Sine', css: 'cubic-bezier(0.61, 1, 0.88, 1)', gsap: 'sine.out', ae: 'Easy Ease Out，影響度 40%' },
  quad: { name: '二次 Quad', css: 'cubic-bezier(0.5, 1, 0.89, 1)', gsap: 'power1.out', ae: 'Easy Ease Out，影響度 50%' },
  cubic: { name: '三次 Cubic', css: 'cubic-bezier(0.33, 1, 0.68, 1)', gsap: 'power2.out', ae: 'Easy Ease Out，影響度 66%' },
  quart: { name: '四次 Quart', css: 'cubic-bezier(0.25, 1, 0.5, 1)', gsap: 'power3.out', ae: 'Easy Ease Out，影響度 75%' },
  quint: { name: '五次 Quint', css: 'cubic-bezier(0.22, 1, 0.36, 1)', gsap: 'power4.out', ae: 'Easy Ease Out，影響度 85%' },
  expo: { name: '指數 Expo', css: 'cubic-bezier(0.16, 1, 0.3, 1)', gsap: 'expo.out', ae: 'Easy Ease Out，影響度 95%' },
  circ: { name: '圓弧 Circ', css: 'cubic-bezier(0, 0.55, 0.45, 1)', gsap: 'circ.out', ae: 'Easy Ease Out，速度曲線陡起' },
  back: { name: '回彈 Back', css: 'cubic-bezier(0.34, 1.56, 0.64, 1)', gsap: 'back.out(1.7)', ae: '慣性回彈表達式 (overshoot)' },
  elastic: { name: '彈性 Elastic', gsap: 'elastic.out(1, 0.3)', ae: '彈性表達式 (freq/decay)' },
  bounce: { name: '彈跳 Bounce', gsap: 'bounce.out', ae: '落地反彈表達式' },
  spring: { name: '彈簧 Spring', gsap: 'elastic.out(0.6, 0.45)', ae: '阻尼彈簧表達式' },
  material: { name: 'Material 標準', css: 'cubic-bezier(0.2, 0, 0, 1)', gsap: 'CustomEase "0.2,0,0,1"', ae: 'Graph Editor：出 0%／入 100% 影響度' },
  snappy: { name: '利落 Snappy', css: 'cubic-bezier(0.16, 1, 0.3, 1)', gsap: 'expo.out', ae: 'Easy Ease Out，影響度 90%' },
  anticipate: { name: '預備 Anticipate', css: 'cubic-bezier(0.36, -0.45, 0.4, 1)', gsap: 'back.inOut(1.4)', ae: '關鍵影格前加反向預備幀' },
};

export const inOf = (out: EaseFn): EaseFn => (x) => 1 - out(1 - x);
export const ioOf =
  (out: EaseFn): EaseFn =>
  (x) =>
    x < 0.5 ? (1 - out(1 - 2 * x)) / 2 : (1 + out(2 * x - 1)) / 2;

/** 權重混合：neutral + Σ w_i (f_i - neutral) / max(1, Σw) */
export function blendEase(parts: { id: EaseId; w: number }[], neutral: EaseId = 'cubic'): EaseFn {
  const base = OUT[neutral];
  const items = parts.filter((p) => p.w > 0).map((p) => [OUT[p.id], p.w] as const);
  if (!items.length) return base;
  const sw = items.reduce((s, [, w]) => s + w, 0);
  const k = 1 / Math.max(1, sw);
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    const b = base(x);
    let acc = 0;
    for (const [f, w] of items) acc += w * (f(x) - b);
    return b + acc * k;
  };
}

// ---------- 曲線擬合 ----------
function nelderMead(f: (p: number[]) => number, start: number[], step = 0.15, iters = 220) {
  const n = start.length;
  let pts: number[][] = [start.slice()];
  for (let i = 0; i < n; i++) {
    const p = start.slice();
    p[i] += step;
    pts.push(p);
  }
  let vals = pts.map(f);
  for (let it = 0; it < iters; it++) {
    const idx = vals.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
    pts = idx.map((i) => pts[i]);
    vals = idx.map((i) => vals[i]);
    const centroid = new Array(n).fill(0);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) centroid[j] += pts[i][j] / n;
    const worst = pts[n];
    const refl = centroid.map((c, j) => c + (c - worst[j]));
    const fr = f(refl);
    if (fr < vals[0]) {
      const exp = centroid.map((c, j) => c + 2 * (c - worst[j]));
      const fe = f(exp);
      if (fe < fr) {
        pts[n] = exp;
        vals[n] = fe;
      } else {
        pts[n] = refl;
        vals[n] = fr;
      }
    } else if (fr < vals[n - 1]) {
      pts[n] = refl;
      vals[n] = fr;
    } else {
      const con = centroid.map((c, j) => c + 0.5 * (worst[j] - c));
      const fc = f(con);
      if (fc < vals[n]) {
        pts[n] = con;
        vals[n] = fc;
      } else {
        for (let i = 1; i <= n; i++) {
          pts[i] = pts[i].map((v, j) => pts[0][j] + 0.5 * (v - pts[0][j]));
          vals[i] = f(pts[i]);
        }
      }
    }
  }
  let bi = 0;
  for (let i = 1; i < vals.length; i++) if (vals[i] < vals[bi]) bi = i;
  return { p: pts[bi], v: vals[bi] };
}

/** 反推最接近的 cubic-bezier(x1,y1,x2,y2) */
export function fitBezier(f: EaseFn): { p: [number, number, number, number]; err: number } {
  const N = 28;
  const xs = Array.from({ length: N }, (_, i) => (i + 0.5) / N);
  const ys = xs.map(f);
  const err = (p: number[]) => {
    const [x1, y1, x2, y2] = p;
    if (x1 < 0 || x1 > 1 || x2 < 0 || x2 > 1) return 1e9;
    const b = bezier(x1, y1, x2, y2);
    let e = 0;
    for (let i = 0; i < N; i++) {
      const d = b(xs[i]) - ys[i];
      e += d * d;
    }
    return e / N;
  };
  const seeds = [
    [0.33, 1, 0.68, 1],
    [0.25, 0.1, 0.25, 1],
    [0.2, 0, 0, 1],
    [0.34, 1.56, 0.64, 1],
    [0.5, 0, 0.5, 1],
    [0.12, 0.8, 0.3, 1.2],
  ];
  let best = { p: seeds[0], v: Infinity };
  for (const s of seeds) {
    const r = nelderMead(err, s);
    if (r.v < best.v) best = r;
  }
  const p = best.p.map((v, i) => (i % 2 === 0 ? clamp(v) : v)).map((v) => round(v, 3)) as [number, number, number, number];
  return { p, err: Math.sqrt(best.v) };
}

function rdp(pts: [number, number][], eps: number): [number, number][] {
  if (pts.length < 3) return pts;
  const [ax, ay] = pts[0];
  const [bx, by] = pts[pts.length - 1];
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  let md = 0;
  let mi = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + bx * ay - by * ax) / len;
    if (d > md) {
      md = d;
      mi = i;
    }
  }
  if (md > eps) {
    const l = rdp(pts.slice(0, mi + 1), eps);
    const r = rdp(pts.slice(mi), eps);
    return l.slice(0, -1).concat(r);
  }
  return [pts[0], pts[pts.length - 1]];
}

/** 取樣為 CSS linear() 緩動函數（可精確表達回彈、彈跳等曲線） */
export function cssLinear(f: EaseFn, samples = 96, eps = 0.0025): string {
  const pts: [number, number][] = Array.from({ length: samples + 1 }, (_, i) => [i / samples, f(i / samples)]);
  const keep = rdp(pts, eps);
  const parts = keep.map(([x, y], i) => {
    const yy = round(y, 3);
    if (i === 0 || i === keep.length - 1) return `${yy}`;
    return `${yy} ${round(x * 100, 1)}%`;
  });
  return `linear(${parts.join(', ')})`;
}

/** 取樣為 SVG path（GSAP CustomEase 可直接使用） */
export function easePath(f: EaseFn, samples = 40): string {
  const pts = Array.from({ length: samples + 1 }, (_, i) => {
    const x = i / samples;
    return `${round(x, 3)},${round(f(x), 3)}`;
  });
  return `M${pts[0]} L${pts.slice(1).join(' ')}`;
}
