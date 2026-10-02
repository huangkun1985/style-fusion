// 數學、雜湊與雜訊工具。所有動畫都是「時間的純函數」，因此隨機性一律來自可重現的雜湊。

export const TAU = Math.PI * 2;
export const clamp = (x: number, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const fract = (x: number) => x - Math.floor(x);
export const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
/** 0→1→0 的鐘形窗口（x 在 [a,b] 內） */
export const bump = (a: number, b: number, x: number) => {
  if (x <= a || x >= b) return 0;
  return Math.sin(((x - a) / (b - a)) * Math.PI);
};
export const wrap = (x: number, m: number) => ((x % m) + m) % m;

/** 32-bit 整數雜湊 → [0,1) */
export function hash(a: number, b = 0, c = 0): number {
  let h = Math.imul((a | 0) ^ 0x9e3779b9, 0x85ebca6b);
  h ^= Math.imul((b | 0) + 0x7f4a7c15, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h ^= Math.imul((c | 0) + 0x165667b1, 0x27d4eb2f);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
/** 字串 → 整數種子 */
export function strSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** 一維值雜訊 [-1,1] */
export function noise1(x: number, seed = 0): number {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return lerp(hash(i, seed), hash(i + 1, seed), u) * 2 - 1;
}
/** 二維值雜訊 [-1,1] */
export function noise2(x: number, y: number, seed = 0): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy, seed);
  const b = hash(ix + 1, iy, seed);
  const c = hash(ix, iy + 1, seed);
  const d = hash(ix + 1, iy + 1, seed);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uy) * 2 - 1;
}
export function fbm2(x: number, y: number, seed = 0, oct = 3): number {
  let s = 0;
  let a = 0.5;
  let f = 1;
  for (let i = 0; i < oct; i++) {
    s += a * noise2(x * f, y * f, seed + i * 17);
    f *= 2;
    a *= 0.5;
  }
  return s / 0.875;
}
/** 可無縫循環的雜訊：在圓周上取樣，u ∈ [0,1) 首尾相接 */
export function loopNoise(u: number, radius: number, seed = 0): number {
  const a = u * TAU;
  return noise2(Math.cos(a) * radius + 31.7, Math.sin(a) * radius + 17.3, seed);
}

/** mulberry32 偽隨機產生器 */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function round(x: number, d = 3) {
  const k = 10 ** d;
  return Math.round(x * k) / k;
}
