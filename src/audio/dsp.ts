// DSP 基礎：噪音、濾波器、包絡、殘響、混音與響度。全部對 Float32Array 逐樣本運算，無 DOM 依賴。
import { clamp } from '../engine/util';
import { stepToSec } from './compose';
import type { NoteEv, Song } from './types';

export interface Stereo {
  l: Float32Array;
  r: Float32Array;
}
export const newStereo = (n: number): Stereo => ({ l: new Float32Array(n), r: new Float32Array(n) });

/** 等功率聲像：pan −1…1 */
export function panGains(pan: number): [number, number] {
  const a = ((clamp(pan, -1, 1) + 1) * Math.PI) / 4;
  return [Math.cos(a), Math.sin(a)];
}

/** 可重現的噪音（xorshift32） */
export class Noise {
  private s: number;
  constructor(seed = 1) {
    this.s = (seed >>> 0) || 0x9e3779b9;
  }
  next(): number {
    let x = this.s;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.s = x >>> 0;
    return (this.s / 4294967296) * 2 - 1;
  }
}

/** TPT 狀態變數濾波器（Cytomic） */
export class Svf {
  private ic1 = 0;
  private ic2 = 0;
  private a1 = 0;
  private a2 = 0;
  private a3 = 0;
  private k = 1;
  constructor(private sr: number) {}
  set(fc: number, q: number) {
    const f = clamp(fc, 20, this.sr * 0.45);
    const g = Math.tan((Math.PI * f) / this.sr);
    this.k = 1 / Math.max(0.3, q);
    this.a1 = 1 / (1 + g * (g + this.k));
    this.a2 = g * this.a1;
    this.a3 = g * this.a2;
  }
  /** 回傳 [lp, bp, hp] */
  run(x: number, out: number[]): void {
    const v3 = x - this.ic2;
    const v1 = this.a1 * this.ic1 + this.a2 * v3;
    const v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3;
    this.ic1 = 2 * v1 - this.ic1;
    this.ic2 = 2 * v2 - this.ic2;
    out[0] = v2;
    out[1] = v1;
    out[2] = x - this.k * v1 - v2;
  }
  lp(x: number): number {
    const v3 = x - this.ic2;
    const v1 = this.a1 * this.ic1 + this.a2 * v3;
    const v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3;
    this.ic1 = 2 * v1 - this.ic1;
    this.ic2 = 2 * v2 - this.ic2;
    return v2;
  }
  bp(x: number): number {
    const v3 = x - this.ic2;
    const v1 = this.a1 * this.ic1 + this.a2 * v3;
    const v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3;
    this.ic1 = 2 * v1 - this.ic1;
    this.ic2 = 2 * v2 - this.ic2;
    return v1;
  }
  hp(x: number): number {
    const v3 = x - this.ic2;
    const v1 = this.a1 * this.ic1 + this.a2 * v3;
    const v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3;
    this.ic1 = 2 * v1 - this.ic1;
    this.ic2 = 2 * v2 - this.ic2;
    return x - this.k * v1 - v2;
  }
}

/** ADSR（秒）。t 為距離音符起點的時間，dur 為按住時間，之後進入 release。 */
export function adsr(t: number, dur: number, a: number, d: number, s: number, r: number): number {
  let lv: number;
  const tt = Math.min(t, dur);
  if (tt < a) lv = a > 0 ? tt / a : 1;
  else if (tt < a + d) lv = 1 - (1 - s) * ((tt - a) / d);
  else lv = s;
  if (t > dur) {
    const k = 1 - (t - dur) / Math.max(1e-4, r);
    return k <= 0 ? 0 : lv * k;
  }
  return lv;
}

/** 單音量化（多少階，例如 NES 的 15 階） */
export const quant = (x: number, steps: number) => Math.round(x * steps) / steps;

/** 一階低通（處理整段緩衝） */
export function onePoleLP(buf: Float32Array, fc: number, sr: number) {
  const a = 1 - Math.exp((-2 * Math.PI * fc) / sr);
  let y = 0;
  for (let i = 0; i < buf.length; i++) {
    y += a * (buf[i] - y);
    buf[i] = y;
  }
}

/** 去除直流偏移（整段平均值；對循環緩衝是安全的） */
export function removeMean(buf: Float32Array) {
  let s = 0;
  for (let i = 0; i < buf.length; i++) s += buf[i];
  const m = s / buf.length;
  for (let i = 0; i < buf.length; i++) buf[i] -= m;
}

/** 直流阻斷（單次音效用） */
export function dcBlock(buf: Float32Array) {
  let x1 = 0;
  let y1 = 0;
  for (let i = 0; i < buf.length; i++) {
    const x = buf[i];
    y1 = x - x1 + 0.995 * y1;
    x1 = x;
    buf[i] = y1;
  }
}

// ---------- 殘響（Freeverb） ----------
const COMB = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
const ALLP = [556, 441, 341, 225];

export function freeverb(inL: Float32Array, inR: Float32Array, sr: number, opts: { room?: number; damp?: number; wet?: number; width?: number } = {}): Stereo {
  const room = opts.room ?? 0.8;
  const damp = opts.damp ?? 0.35;
  const wet = opts.wet ?? 1;
  const width = opts.width ?? 1;
  const n = inL.length;
  const outL = new Float32Array(n);
  const outR = new Float32Array(n);
  const sc = sr / 44100;
  const run = (src: Float32Array, spread: number, dst: Float32Array) => {
    const combs = COMB.map((len) => {
      const L = Math.round((len + spread) * sc);
      return { buf: new Float32Array(L), idx: 0, f: 0, L };
    });
    const alls = ALLP.map((len) => {
      const L = Math.round((len + spread) * sc);
      return { buf: new Float32Array(L), idx: 0, L };
    });
    const fb = room * 0.28 + 0.7;
    for (let i = 0; i < n; i++) {
      const x = src[i] * 0.015;
      let acc = 0;
      for (const c of combs) {
        const o = c.buf[c.idx];
        c.f = o * (1 - damp) + c.f * damp;
        c.buf[c.idx] = x + c.f * fb;
        if (++c.idx >= c.L) c.idx = 0;
        acc += o;
      }
      for (const a of alls) {
        const bo = a.buf[a.idx];
        const o = -acc + bo;
        a.buf[a.idx] = acc + bo * 0.5;
        if (++a.idx >= a.L) a.idx = 0;
        acc = o;
      }
      dst[i] = acc;
    }
  };
  const mono = new Float32Array(n);
  for (let i = 0; i < n; i++) mono[i] = (inL[i] + inR[i]) * 0.5;
  const tmpL = new Float32Array(n);
  const tmpR = new Float32Array(n);
  run(mono, 0, tmpL);
  run(mono, 23, tmpR);
  const w1 = wet * (width / 2 + 0.5);
  const w2 = wet * ((1 - width) / 2);
  for (let i = 0; i < n; i++) {
    outL[i] = tmpL[i] * w1 + tmpR[i] * w2;
    outR[i] = tmpR[i] * w1 + tmpL[i] * w2;
  }
  return { l: outL, r: outR };
}

// ---------- 混音與整理 ----------
/** 軟限幅：0.6 以下線性，之上以 tanh 圓滑壓縮 */
export function softLimit(buf: Float32Array) {
  for (let i = 0; i < buf.length; i++) {
    const x = buf[i];
    const a = Math.abs(x);
    if (a > 0.6) buf[i] = Math.sign(x) * (0.6 + 0.4 * Math.tanh((a - 0.6) / 0.4));
  }
}

/**
 * 把超出循環長度的尾巴折回開頭（讓殘響與釋音在循環點平滑接上），並把長度裁成 n。
 * 輸入緩衝長度 = n + tail。
 */
export function foldTail(s: Stereo, n: number): Stereo {
  const out = newStereo(n);
  const total = s.l.length;
  for (let i = 0; i < n; i++) {
    out.l[i] = s.l[i];
    out.r[i] = s.r[i];
  }
  for (let i = n; i < total; i++) {
    const j = (i - n) % n;
    out.l[j] += s.l[i];
    out.r[j] += s.r[i];
  }
  return out;
}

/** 響度正規化到目標 RMS，並限制峰值 */
export function master(s: Stereo, targetRms = 0.13, ceiling = 0.97): { peak: number; rms: number } {
  let sum = 0;
  const n = s.l.length;
  for (let i = 0; i < n; i++) sum += s.l[i] * s.l[i] + s.r[i] * s.r[i];
  const rms = Math.sqrt(sum / (2 * n)) || 1e-9;
  const g = Math.min(targetRms / rms, 8);
  for (let i = 0; i < n; i++) {
    s.l[i] *= g;
    s.r[i] *= g;
  }
  softLimit(s.l);
  softLimit(s.r);
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(s.l[i]), Math.abs(s.r[i]));
  if (peak > ceiling) {
    const k = ceiling / peak;
    for (let i = 0; i < n; i++) {
      s.l[i] *= k;
      s.r[i] *= k;
    }
    peak = ceiling;
  }
  return { peak, rms: Math.min(targetRms, rms * g) };
}

/** 淡入淡出（避免端點爆音，用於非循環的試聽或單次音效） */
export function fadeEdges(buf: Float32Array, fadeIn: number, fadeOut: number) {
  const n = buf.length;
  for (let i = 0; i < fadeIn && i < n; i++) buf[i] *= i / fadeIn;
  for (let i = 0; i < fadeOut && i < n; i++) buf[n - 1 - i] *= i / fadeOut;
}

/** 步數換算：回傳音符的起訖秒（含搖擺） */
export function noteSpan(song: Pick<Song, 'bpm' | 'swing'>, n: NoteEv): [number, number] {
  return [stepToSec(song, n.t), stepToSec(song, n.t + n.dur)];
}

/** 讓出事件迴圈，避免長時間渲染凍結介面 */
export const yieldNow = () => new Promise<void>((r) => setTimeout(r, 0));
