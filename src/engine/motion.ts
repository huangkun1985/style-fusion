// MotionCtx：把「真實時間」轉成「風格化的動畫時間」，並提供主體繪製用的動效工具。
// 時間管線：幀率步進 → 循環 → 往返 → 打擊停頓 → 速度曲線 → 關鍵姿勢停格 → 跳幀
import { OUT, ioOf, inOf } from './easing';
import { TAU, clamp, fract, hash, lerp, loopNoise } from './util';
import type { Move } from './types';

const ZERO = { x: 0, y: 0, r: 0 };
const backIO = ioOf(OUT.back);
const backIN = inOf(OUT.back);

function hitstopRemap(u: number, ev: number[], h: number): number {
  const evs = [...ev].sort((a, b) => a - b);
  const n = evs.length;
  if (!n || h <= 0) return u;
  const total = Math.min(0.5, n * h);
  const hh = total / n;
  const s = 1 / (1 - total);
  let acc = 0;
  for (const e of evs) {
    const pe = e / s + acc;
    if (u < pe) return (u - acc) * s;
    if (u < pe + hh) return e;
    acc += hh;
  }
  return Math.min(0.99999, (u - acc) * s);
}
function holdRemap(u: number, h: number, segs = 8): number {
  const x = u * segs;
  const i = Math.floor(x);
  const s = x - i;
  const hf = Math.min(0.85, 0.85 * h);
  const k = s < hf ? 0 : (s - hf) / (1 - hf);
  const e = k * k * (3 - 2 * k);
  return (i + e) / segs;
}
function stutterRemap(u: number, amt: number, L: number, seed: number): number {
  const chunk = 0.085 / L;
  const idx = Math.floor(u / chunk);
  const r = hash(idx, seed, 77);
  if (r < amt * 0.3) return fract(u - chunk * (1 + Math.floor(hash(idx, seed, 78) * 3)));
  if (r < amt * 0.5) return idx * chunk;
  return u;
}

export class MotionCtx {
  readonly mv: Move;
  readonly L: number;
  readonly tReal: number;
  readonly seed: number;
  readonly ev: number[];
  readonly key: number;
  /** 風格化後的循環進度 0..1 */
  u: number;
  /** 風格化後的秒數 */
  t: number;
  /** 步進後的真實時間 */
  tStep: number;
  /** 抖動用幀號（隨幀率變化） */
  jframe: number;
  /** 線條沸騰用幀號 */
  bframe: number;

  constructor(mv: Move, L: number, tReal: number, seed: number, ev: number[] = [], key = 0.5) {
    this.mv = mv;
    this.L = L;
    this.tReal = tReal;
    this.seed = seed;
    this.ev = ev;
    this.key = key;
    const fps = mv.fps;
    const ts = fps > 0 ? Math.floor(tReal * fps + 1e-6) / fps : tReal;
    this.tStep = ts;
    this.jframe = Math.floor(ts * (fps > 0 ? fps : 12) + 1e-6);
    this.bframe = Math.floor(tReal * Math.max(1, mv.boilFps) + 1e-6);
    let u = fract(ts / L);
    if (mv.pingpong > 0.35) u = 1 - Math.abs(1 - 2 * u);
    if (mv.hitstop > 0.02 && ev.length) u = hitstopRemap(u, ev, mv.hitstop * 0.05);
    if (mv.ramp > 0.02) u = fract(u - Math.min(0.9, mv.ramp * 0.85) * Math.sin(TAU * (u - key)) / TAU);
    if (mv.holds > 0.02) u = holdRemap(u, mv.holds);
    if (mv.stutter > 0.02) u = stutterRemap(u, mv.stutter, L, seed);
    this.u = clamp(u, 0, 0.99999);
    this.t = this.u * L;
  }

  /** 同參數、不同時間的上下文（殘影、洋蔥皮、速度估算） */
  at(tReal: number): MotionCtx {
    return new MotionCtx(this.mv, this.L, tReal, this.seed, this.ev, this.key);
  }

  // ----- 緩動 -----
  out(x: number) {
    return this.mv.ease(clamp(x));
  }
  in(x: number) {
    return 1 - this.mv.ease(1 - clamp(x));
  }
  io(x: number) {
    const e = this.mv.ease;
    x = clamp(x);
    return x < 0.5 ? (1 - e(1 - 2 * x)) / 2 : (1 + e(2 * x - 1)) / 2;
  }
  /** 0..1 的區段進度（線性） */
  seg(a: number, b: number) {
    return clamp((this.u - a) / (b - a));
  }
  /**
   * 補間進度：套用混合緩動，並按風格加入預備動作（起點反向）與過衝（終點越界回彈）
   * kind: 'o' 減速進場、'i' 加速離場、'io' 兩端緩
   */
  tw(a: number, b: number, kind: 'o' | 'i' | 'io' = 'io'): number {
    const x = (this.u - a) / (b - a);
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let e = kind === 'o' ? this.out(x) : kind === 'i' ? this.in(x) : this.io(x);
    const ov = Math.min(1, this.mv.over);
    const an = Math.min(1, this.mv.antic);
    if (ov > 0.01 && kind !== 'i') {
      const b2 = kind === 'o' ? OUT.back(x) : x < 0.5 ? e : backIO(x);
      e = lerp(e, b2, ov);
    }
    if (an > 0.01 && kind !== 'o') {
      const a2 = kind === 'i' ? backIN(x) : x < 0.5 ? backIO(x) : e;
      e = lerp(e, a2, an * 0.85);
    }
    return e;
  }
  /** 依幀變化的隨機抖動（定格動畫） */
  jit(id: number, k = 1): { x: number; y: number; r: number } {
    const j = this.mv.jitter * k;
    if (j <= 0.001) return ZERO;
    const f = this.jframe;
    return {
      x: (hash(f, id, this.seed) - 0.5) * 7 * j,
      y: (hash(f, id + 101, this.seed) - 0.5) * 7 * j,
      r: (hash(f, id + 202, this.seed) - 0.5) * 0.08 * j,
    };
  }
  /** 可循環的平滑雜訊 [-1,1] */
  nz(id: number, cycles = 1) {
    return loopNoise(this.u, 0.6 + cycles * 0.55, this.seed * 13 + id * 7);
  }
  /** 正弦循環（整數圈數確保無縫） */
  osc(cycles: number, phase = 0) {
    return Math.sin(TAU * (this.u * Math.max(1, Math.round(cycles)) + phase));
  }
  /** 錯峰延遲（正規化時間） */
  stag(i: number) {
    return i * this.mv.stagger * 0.04;
  }
  /** 漂浮位移 */
  fl(id: number, amp = 8) {
    const c = Math.max(1, Math.round(this.L / 2.4));
    return this.mv.float * amp * Math.sin(TAU * (this.u * c + hash(id, 3) ));
  }
  /** 事件後經過秒數 */
  since(e: number) {
    return fract(this.u - e + 1) * this.L;
  }
  /** 事件衝擊脈衝（指數衰減） */
  pulse(decay = 9) {
    let s = 0;
    for (const e of this.ev) {
      const d = this.since(e);
      if (d < 1.2) s += Math.exp(-d * decay);
    }
    return s;
  }
  /** 節拍脈衝 */
  beat(decay = 7) {
    const beats = Math.max(1, Math.round((this.L * this.mv.bpm) / 60));
    return Math.exp(-fract(this.u * beats) * decay);
  }
  /** 像素化位移（像素逐格動畫） */
  snap(v: number) {
    const s = this.mv.snap;
    if (s < 0.05) return v;
    const g = 2 + s * 5;
    return Math.round(v / g) * g;
  }
}
