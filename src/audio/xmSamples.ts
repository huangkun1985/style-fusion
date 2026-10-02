// XM 取樣庫：所有取樣都由程式生成（不下載任何音檔）。
// 約定：取樣以 16726 Hz 製作，內容音高為 C-4（MIDI 60 = 261.63 Hz），所以 relativeNote = +12。
import { clamp } from '../engine/util';
import { Noise, Svf } from './dsp';

export const SAMPLE_RATE_XM = 16726;
const TAU = Math.PI * 2;
const F0 = 261.6256;

export interface SampleDef {
  id: string;
  name: string;
  data: Float32Array;
  /** 循環（取樣點），沒有就是單次播放 */
  loop?: [number, number];
  volume: number;
  /** XM 音量包絡：[tick, 0–64] 點；sustainIdx 為持音點 */
  env?: { pts: [number, number][]; sustain: number };
  fadeout: number;
  /** 完整的音階範圍是否適合升降（鼓取樣不隨音高變） */
  drum?: boolean;
  /** 取樣的基準音高（MIDI）；鼓取樣固定用 C-4 觸發 */
  base: number;
}

const N = (n: number) => new Float32Array(n);
const sat = (x: number) => Math.tanh(x);

/** 單週期波形，64 點（16726/64 ≈ 261.3 Hz） */
function cycle(fn: (ph: number) => number, len = 64): Float32Array {
  const d = N(len);
  for (let i = 0; i < len; i++) d[i] = fn(i / len);
  return d;
}

function normalize(d: Float32Array, peak = 0.95): Float32Array {
  let m = 0;
  for (const x of d) m = Math.max(m, Math.abs(x));
  if (m > 0) for (let i = 0; i < d.length; i++) d[i] = (d[i] / m) * peak;
  return d;
}

function lowpassCycle(d: Float32Array, passes: number): Float32Array {
  // 對單週期做循環低通（環狀平均），讓波形比較圓
  const n = d.length;
  let src = d;
  for (let p = 0; p < passes; p++) {
    const dst = N(n);
    for (let i = 0; i < n; i++) dst[i] = (src[(i + n - 1) % n] + 2 * src[i] + src[(i + 1) % n]) / 4;
    src = dst;
  }
  return src;
}

const sawW = (ph: number) => 2 * ph - 1;

/** 較長的循環取樣：多個略為失諧的鋸齒波疊加，循環長度內拍頻剛好整數週期 */
function chorusLoop(cycles: number[], len: number, lp: number, weights?: number[]): Float32Array {
  const d = N(len);
  cycles.forEach((c, k) => {
    const w = weights?.[k] ?? 1;
    for (let i = 0; i < len; i++) {
      const ph = ((i * c) / len) % 1;
      d[i] += sawW(ph) * w;
    }
  });
  return lowpassCycle(d, lp);
}

function ksPluck(len: number, damp: number, bright: number, seed: number): Float32Array {
  const sr = SAMPLE_RATE_XM;
  const D = sr / F0 - 0.5;
  const L = Math.floor(D);
  const frac = D - L;
  const ap = (1 - frac) / (1 + frac);
  const nz = new Noise(seed);
  const buf = N(L + 1);
  let lp = 0;
  for (let i = 0; i < L + 1; i++) {
    lp += bright * (nz.next() - lp);
    buf[i] = lp * (1 + (1 - bright) * 3);
  }
  const out = N(len);
  let idx = 0;
  let apx = 0;
  let apy = 0;
  for (let i = 0; i < len; i++) {
    const j = idx;
    const nx = j + 1 > L ? 0 : j + 1;
    const y = buf[j];
    const filt = damp * 0.5 * (buf[j] + buf[nx]);
    const o = ap * filt + apx - ap * apy;
    apx = filt;
    apy = o;
    buf[j] = o;
    idx = nx;
    out[i] = y;
  }
  return out;
}

function additive(len: number, partials: [number, number, number][]): Float32Array {
  // [倍頻, 振幅, 衰減秒]
  const sr = SAMPLE_RATE_XM;
  const d = N(len);
  for (const [r, a, tau] of partials) {
    const f = F0 * r;
    if (f > sr * 0.45) continue;
    for (let i = 0; i < len; i++) d[i] += a * Math.sin((TAU * f * i) / sr) * Math.exp(-i / sr / tau);
  }
  return d;
}

function fmBell(len: number, ratio: number, index: number, tauC: number, tauM: number): Float32Array {
  const sr = SAMPLE_RATE_XM;
  const d = N(len);
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    d[i] = Math.sin(TAU * F0 * t + index * Math.exp(-t / tauM) * Math.sin(TAU * F0 * ratio * t)) * Math.exp(-t / tauC);
  }
  return d;
}

const ENV_SUSTAIN = (a: number, d: number, s: number, r: number): { pts: [number, number][]; sustain: number } => ({
  pts: [
    [0, 0],
    [a, 64],
    [a + d, Math.round(s * 64)],
    [a + d + r, 0],
  ],
  sustain: 2,
});

// ---------- 鼓 ----------
function kick(): Float32Array {
  const sr = SAMPLE_RATE_XM;
  const n = Math.round(sr * 0.32);
  const d = N(n);
  let ph = 0;
  const nz = new Noise(5);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    ph += (46 + 110 * Math.exp(-t / 0.03)) / sr;
    d[i] = sat(1.6 * Math.sin(TAU * ph)) * Math.exp(-t / 0.1) + nz.next() * Math.exp(-t / 0.003) * 0.3;
  }
  return d;
}
function snare(): Float32Array {
  const sr = SAMPLE_RATE_XM;
  const n = Math.round(sr * 0.28);
  const d = N(n);
  const nz = new Noise(9);
  const bp = new Svf(sr);
  bp.set(1700, 0.9);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    ph += (190 + 50 * Math.exp(-t / 0.02)) / sr;
    d[i] = bp.bp(nz.next()) * Math.exp(-t / 0.08) * 1.7 + Math.sin(TAU * ph) * Math.exp(-t / 0.05) * 0.5 + nz.next() * Math.exp(-t / 0.14) * 0.25;
  }
  return d;
}
function hat(tau: number, len: number): Float32Array {
  const sr = SAMPLE_RATE_XM;
  const n = Math.round(sr * len);
  const d = N(n);
  const nz = new Noise(21);
  const hp = new Svf(sr);
  hp.set(4800, 0.8);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    d[i] = hp.hp(nz.next()) * Math.exp(-t / tau);
  }
  return d;
}
function tom(): Float32Array {
  const sr = SAMPLE_RATE_XM;
  const n = Math.round(sr * 0.5);
  const d = N(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    ph += (F0 * 0.5 * (1 + 0.5 * Math.exp(-t / 0.04))) / sr;
    d[i] = Math.sin(TAU * ph) * Math.exp(-t / 0.16);
  }
  return d;
}
function clap(): Float32Array {
  const sr = SAMPLE_RATE_XM;
  const n = Math.round(sr * 0.3);
  const d = N(n);
  const nz = new Noise(33);
  const bp = new Svf(sr);
  bp.set(1300, 1.2);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const burst = t < 0.03 ? (t % 0.008 < 0.004 ? 1 : 0.4) : 0;
    d[i] = bp.bp(nz.next()) * (burst * 1.4 + Math.exp(-t / 0.07) * 0.7);
  }
  return d;
}
function crash(): Float32Array {
  const sr = SAMPLE_RATE_XM;
  const n = Math.round(sr * 1.4);
  const d = N(n);
  const nz = new Noise(41);
  const hp = new Svf(sr);
  hp.set(3200, 0.8);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    d[i] = hp.hp(nz.next()) * Math.exp(-t / 0.4);
  }
  return d;
}
function blip(freqs: number[], tau: number, len: number): Float32Array {
  const sr = SAMPLE_RATE_XM;
  const n = Math.round(sr * len);
  const d = N(n);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    let a = 0;
    for (const f of freqs) a += Math.sin(TAU * f * t);
    d[i] = (a / freqs.length) * Math.exp(-t / tau);
  }
  return d;
}

// ---------- 樣本庫 ----------
let cache: Map<string, SampleDef> | null = null;

export function sampleLibrary(): Map<string, SampleDef> {
  if (cache) return cache;
  const lib = new Map<string, SampleDef>();
  const add = (s: Omit<SampleDef, 'base' | 'fadeout' | 'volume'> & { base?: number; fadeout?: number; volume?: number }) =>
    lib.set(s.id, { base: 60, fadeout: 0x500, volume: 64, ...s } as SampleDef);
  const full = (d: Float32Array): [number, number] => [0, d.length];

  const sq = (duty: number) => cycle((ph) => (ph < duty ? 1 : -1));
  const w50 = sq(0.5);
  add({ id: 'sq50', name: 'Square 50%', data: w50, loop: full(w50), env: ENV_SUSTAIN(1, 4, 0.8, 2), volume: 50 });
  const w25 = sq(0.25);
  add({ id: 'sq25', name: 'Square 25%', data: w25, loop: full(w25), env: ENV_SUSTAIN(1, 3, 0.75, 2), volume: 50 });
  const w12 = sq(0.125);
  add({ id: 'sq12', name: 'Square 12.5%', data: w12, loop: full(w12), env: ENV_SUSTAIN(0, 3, 0.65, 2), volume: 48 });
  const wsaw = cycle(sawW);
  add({ id: 'saw', name: 'Saw', data: wsaw, loop: full(wsaw), env: ENV_SUSTAIN(1, 5, 0.75, 3), volume: 46 });
  const wtri = cycle((ph) => 4 * Math.abs(ph - 0.5) - 1);
  add({ id: 'tri', name: 'Triangle', data: wtri, loop: full(wtri), env: ENV_SUSTAIN(0, 2, 0.95, 1), volume: 60 });
  const wbass = normalize(lowpassCycle(cycle((ph) => sawW(ph) * 0.8 + Math.sin(TAU * ph * 0.5 + 0) * 0.0 + (ph < 0.5 ? 0.5 : -0.5) * 0.4), 1));
  add({ id: 'bass', name: 'Bass', data: wbass, loop: full(wbass), env: ENV_SUSTAIN(0, 5, 0.7, 2), volume: 64 });
  const worgan = normalize(cycle((ph) => Math.sin(TAU * ph) + 0.6 * Math.sin(TAU * ph * 2) + 0.4 * Math.sin(TAU * ph * 3) + 0.25 * Math.sin(TAU * ph * 4) + 0.15 * Math.sin(TAU * ph * 6)));
  add({ id: 'organ', name: 'Organ', data: worgan, loop: full(worgan), env: ENV_SUSTAIN(0, 2, 0.9, 1), volume: 52 });
  const wbrass = normalize(lowpassCycle(cycle(sawW), 1));
  add({ id: 'brass', name: 'Brass', data: wbrass, loop: full(wbrass), env: ENV_SUSTAIN(3, 4, 0.85, 3), volume: 52 });
  const wreed = normalize(lowpassCycle(cycle((ph) => (ph < 0.5 ? 1 : -1) * 0.8 + sawW(ph) * 0.3), 2));
  add({ id: 'reed', name: 'Reed', data: wreed, loop: full(wreed), env: ENV_SUSTAIN(2, 4, 0.8, 3), volume: 56 });
  const wflute = normalize(cycle((ph) => Math.sin(TAU * ph) + 0.15 * Math.sin(TAU * ph * 2)));
  add({ id: 'flute', name: 'Flute', data: wflute, loop: full(wflute), env: ENV_SUSTAIN(3, 3, 0.9, 3), volume: 62 });
  const wchoir = normalize(chorusLoop([128, 129, 127], 8192, 5, [1, 0.8, 0.8]));
  add({ id: 'choir', name: 'Choir', data: wchoir, loop: full(wchoir), env: ENV_SUSTAIN(10, 6, 0.9, 8), volume: 44 });
  const wpad = normalize(chorusLoop([256, 257, 255, 258], 16384, 6, [1, 0.9, 0.9, 0.7]));
  add({ id: 'pad', name: 'Pad', data: wpad, loop: full(wpad), env: ENV_SUSTAIN(14, 8, 0.9, 14), volume: 42, fadeout: 0x300 });
  const wstr = normalize(chorusLoop([128, 129, 127], 8192, 2, [1, 0.8, 0.8]));
  add({ id: 'strings', name: 'Strings', data: wstr, loop: full(wstr), env: ENV_SUSTAIN(8, 6, 0.9, 8), volume: 46, fadeout: 0x400 });

  const HOLD = { pts: [[0, 64], [2, 64]] as [number, number][], sustain: 1 };
  add({ id: 'pluck', name: 'Pluck', data: normalize(ksPluck(Math.round(SAMPLE_RATE_XM * 0.9), 0.9985, 0.7, 7)), env: HOLD, fadeout: 0x900, volume: 62 });
  add({ id: 'guitar', name: 'Guitar', data: normalize(ksPluck(Math.round(SAMPLE_RATE_XM * 0.8), 0.998, 0.45, 13)), env: HOLD, fadeout: 0x900, volume: 62 });
  add({ id: 'bell', name: 'Bell', data: normalize(fmBell(Math.round(SAMPLE_RATE_XM * 1.6), 3.51, 3.2, 0.7, 0.35)), env: HOLD, fadeout: 0x200, volume: 56 });
  add({ id: 'piano', name: 'Piano', data: normalize(additive(Math.round(SAMPLE_RATE_XM * 1.4), [[1, 1, 1.4], [2, 0.5, 0.8], [3, 0.38, 0.55], [4, 0.25, 0.4], [5, 0.18, 0.3], [6, 0.12, 0.22], [8, 0.08, 0.15]])), env: HOLD, fadeout: 0x800, volume: 60 });
  add({ id: 'ep', name: 'E.Piano', data: normalize(fmBell(Math.round(SAMPLE_RATE_XM * 1.2), 14, 2.6, 0.9, 0.08)), env: HOLD, fadeout: 0x600, volume: 58 });
  add({ id: 'marimba', name: 'Marimba', data: normalize(additive(Math.round(SAMPLE_RATE_XM * 0.5), [[1, 1, 0.3], [3.9, 0.4, 0.07], [9.2, 0.15, 0.03]])), env: HOLD, fadeout: 0xa00, volume: 62 });

  add({ id: 'kick', name: 'Kick', data: normalize(kick()), drum: true, volume: 64 });
  add({ id: 'snare', name: 'Snare', data: normalize(snare()), drum: true, volume: 60 });
  add({ id: 'hatc', name: 'Hat closed', data: normalize(hat(0.025, 0.12)), drum: true, volume: 40 });
  add({ id: 'hato', name: 'Hat open', data: normalize(hat(0.18, 0.7)), drum: true, volume: 38 });
  add({ id: 'tom', name: 'Tom', data: normalize(tom()), drum: true, volume: 62 });
  add({ id: 'clap', name: 'Clap', data: normalize(clap()), drum: true, volume: 56 });
  add({ id: 'crash', name: 'Crash', data: normalize(crash()), drum: true, volume: 40 });
  add({ id: 'wood', name: 'Wood block', data: normalize(blip([1200, 1750], 0.03, 0.12)), drum: true, volume: 52 });
  add({ id: 'cow', name: 'Cowbell', data: normalize(blip([560, 845], 0.1, 0.35)), drum: true, volume: 48 });
  add({ id: 'shaker', name: 'Shaker', data: normalize(hat(0.04, 0.16)), drum: true, volume: 30 });
  add({ id: 'tri', name: 'Triangle perc', data: normalize(blip([3400, 6900], 0.35, 0.9)), drum: true, volume: 40 });
  cache = lib;
  return lib;
}

/** GM 程式號 → 取樣 id */
export function sampleForProgram(p: number): string {
  if (p <= 3) return 'piano';
  if (p <= 5) return 'ep';
  if (p === 6 || p === 7) return 'pluck';
  if (p === 12 || p === 13) return 'marimba';
  if (p <= 15) return 'bell';
  if (p <= 23) return 'organ';
  if (p <= 31) return p <= 24 || p >= 26 ? 'guitar' : 'pluck';
  if (p <= 39) return 'bass';
  if (p <= 44) return 'strings';
  if (p === 45 || p === 46) return 'pluck';
  if (p === 47) return 'tom';
  if (p <= 51) return 'strings';
  if (p <= 55) return 'choir';
  if (p <= 63) return 'brass';
  if (p <= 71) return 'reed';
  if (p <= 79) return 'flute';
  if (p === 80) return 'sq50';
  if (p === 81) return 'saw';
  if (p <= 87) return 'saw';
  if (p <= 95) return 'pad';
  if (p <= 103) return 'bell';
  if (p <= 108) return 'pluck';
  if (p <= 111) return 'strings';
  if (p <= 114) return 'bell';
  return 'marimba';
}

/** GM 鼓號 → 取樣 id */
export function sampleForDrum(note: number): string {
  switch (note) {
    case 35:
    case 36:
      return 'kick';
    case 37:
    case 76:
    case 77:
      return 'wood';
    case 38:
    case 40:
      return 'snare';
    case 39:
      return 'clap';
    case 42:
    case 44:
      return 'hatc';
    case 46:
      return 'hato';
    case 41:
    case 43:
    case 45:
    case 47:
    case 48:
    case 50:
      return 'tom';
    case 49:
    case 51:
    case 55:
    case 57:
    case 59:
      return 'crash';
    case 56:
      return 'cow';
    case 54:
    case 69:
    case 70:
      return 'shaker';
    case 80:
    case 81:
      return 'tri';
    default:
      return 'wood';
  }
}

export { clamp };
