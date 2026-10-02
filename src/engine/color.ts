// 色彩工具：解析、OKLab 感知混色、明暗調整。結果皆有快取，供逐幀繪製使用。
import { clamp } from './util';

export type RGB = [number, number, number]; // 0..1

const parseCache = new Map<string, RGB>();
export function rgb(c: string): RGB {
  let v = parseCache.get(c);
  if (v) return v;
  let h = c.trim();
  if (h[0] === '#') {
    h = h.slice(1);
    if (h.length === 3 || h.length === 4) h = h.split('').map((x) => x + x).join('');
    const n = parseInt(h.slice(0, 6), 16);
    v = [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  } else {
    const m = h.match(/[\d.]+/g);
    v = m ? [+m[0] / 255, +m[1] / 255, +m[2] / 255] : [0, 0, 0];
  }
  parseCache.set(c, v);
  return v;
}

const h2 = (x: number) => Math.round(clamp(x) * 255).toString(16).padStart(2, '0');
export function hex(c: RGB): string {
  return '#' + h2(c[0]) + h2(c[1]) + h2(c[2]);
}
export function rgba(c: string, a: number): string {
  const [r, g, b] = rgb(c);
  return `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${clamp(a)})`;
}

const toLin = (x: number) => (x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4));
const toSrgb = (x: number) => (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(Math.max(0, x), 1 / 2.4) - 0.055);

export function toOklab(c: RGB): RGB {
  const r = toLin(c[0]);
  const g = toLin(c[1]);
  const b = toLin(c[2]);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
export function fromOklab(c: RGB): RGB {
  const l_ = c[0] + 0.3963377774 * c[1] + 0.2158037573 * c[2];
  const m_ = c[0] - 0.1055613458 * c[1] - 0.0638541728 * c[2];
  const s_ = c[0] - 0.0894841775 * c[1] - 1.291485548 * c[2];
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  return [
    clamp(toSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)),
    clamp(toSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)),
    clamp(toSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)),
  ];
}

const opCache = new Map<string, string>();
function memo(key: string, f: () => string): string {
  let v = opCache.get(key);
  if (v === undefined) {
    v = f();
    if (opCache.size > 20000) opCache.clear();
    opCache.set(key, v);
  }
  return v;
}

/** OKLab 感知混色 */
export function mix(a: string, b: string, t: number): string {
  const tt = Math.round(clamp(t) * 100) / 100;
  if (tt <= 0) return a;
  if (tt >= 1) return b;
  return memo(`m${a}${b}${tt}`, () => {
    const A = toOklab(rgb(a));
    const B = toOklab(rgb(b));
    return hex(fromOklab([A[0] + (B[0] - A[0]) * tt, A[1] + (B[1] - A[1]) * tt, A[2] + (B[2] - A[2]) * tt]));
  });
}
export function lighten(c: string, amt: number): string {
  const k = Math.round(amt * 100) / 100;
  if (k === 0) return c;
  return memo(`l${c}${k}`, () => {
    const L = toOklab(rgb(c));
    const nl = clamp(L[0] + k * (k > 0 ? 1 - L[0] * 0.35 : 1));
    const chroma = k > 0 ? 1 - k * 0.35 : 1 + k * 0.1;
    return hex(fromOklab([nl, L[1] * chroma, L[2] * chroma]));
  });
}
export const darken = (c: string, amt: number) => lighten(c, -amt);
export function saturate(c: string, k: number): string {
  return memo(`s${c}${k}`, () => {
    const L = toOklab(rgb(c));
    return hex(fromOklab([L[0], L[1] * k, L[2] * k]));
  });
}
export function hueRotate(c: string, deg: number): string {
  const d = Math.round(deg);
  return memo(`h${c}${d}`, () => {
    const L = toOklab(rgb(c));
    const a = (d * Math.PI) / 180;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    return hex(fromOklab([L[0], L[1] * ca - L[2] * sa, L[1] * sa + L[2] * ca]));
  });
}
export function luma(c: string): number {
  const [r, g, b] = rgb(c);
  return 0.299 * r + 0.587 * g + 0.114 * b;
}
/** 依底色挑選可讀的文字色 */
export function readableOn(bg: string, dark = '#111111', light = '#ffffff'): string {
  return luma(bg) > 0.55 ? dark : light;
}
/** 多色加權 OKLab 平均 */
export function blendMany(items: { c: string; w: number }[]): string {
  let sw = 0;
  const acc: RGB = [0, 0, 0];
  for (const it of items) {
    const L = toOklab(rgb(it.c));
    acc[0] += L[0] * it.w;
    acc[1] += L[1] * it.w;
    acc[2] += L[2] * it.w;
    sw += it.w;
  }
  if (sw <= 0) return items[0]?.c ?? '#000000';
  return hex(fromOklab([acc[0] / sw, acc[1] / sw, acc[2] / sw]));
}
