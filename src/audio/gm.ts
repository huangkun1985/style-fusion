// MIDI 方案：用 General MIDI 音色編號演奏，音色全部由程式合成（加法／調頻／Karplus-Strong／濾波鋸齒波／共振峰）。
// 同一份歌曲也能導出標準 MIDI 檔（見 midi.ts），在任何 GM 音源裡播放。
import { clamp } from '../engine/util';
import type { RenderOpts } from './chip';
import { Noise, Svf, foldTail, freeverb, master, newStereo, noteSpan, panGains, removeMean, yieldNow, type Stereo } from './dsp';
import { CALIBRATION } from './calibration';
import { ensureSamplesFor, sampledDrum, sampledModel } from './sampled';
import { mtof } from './theory';
import type { Song, TrackRole } from './types';

const TAU = Math.PI * 2;
const SN = 4096;
const SINE = new Float32Array(SN + 2);
for (let i = 0; i <= SN + 1; i++) SINE[i] = Math.sin((TAU * i) / SN);
const sinT = (ph: number) => {
  const x = (ph - Math.floor(ph)) * SN;
  const i = x | 0;
  return SINE[i] + (SINE[i + 1] - SINE[i]) * (x - i);
};
function blep(t: number, dt: number): number {
  if (t < dt) {
    const x = t / dt;
    return x + x - x * x - 1;
  }
  if (t > 1 - dt) {
    const x = (t - 1) / dt;
    return x * x + x + x + 1;
  }
  return 0;
}
const sawB = (ph: number, dt: number) => 2 * ph - 1 - blep(ph, dt);
const sqB = (ph: number, dt: number, duty = 0.5) => (ph < duty ? 1 : -1) + blep(ph, dt) - blep(ph >= duty ? ph - duty : ph - duty + 1, dt);

export interface Ctx {
  s: Float32Array;
  n: number;
  sr: number;
  f: number;
  vel: number;
  dur: number;
  nz: Noise;
}
export interface Model {
  att: number;
  /** 釋放（或自然餘音）時間 */
  rel: number;
  gain: number;
  render(c: Ctx): void;
}

// ---------- 模型 ----------
const piano = (bright: number, honky = 0): Model => ({
  att: 0.002,
  rel: 0.16,
  gain: 0.8,
  render({ s, n, sr, f, vel, nz }) {
    const B = 0.00022 * Math.pow(f / 261.6, 2);
    const tau0 = 3.4 * Math.pow(110 / Math.max(f, 55), 0.38);
    const strings = honky > 0 ? [1 - honky, 1 + honky] : [1];
    for (const sd of strings) {
      for (let p = 1; p <= 16; p++) {
        const fp = f * sd * p * Math.sqrt(1 + B * p * p);
        if (fp > sr * 0.44) break;
        const a = (1 / Math.pow(p, 1.05)) * (p === 1 ? 1 : 0.4 + 0.6 * bright * (0.35 + vel)) / strings.length;
        const mul = Math.exp(-1 / ((tau0 / (1 + 0.65 * (p - 1))) * sr));
        const inc = fp / sr;
        let ph = (p * 0.37) % 1;
        let e = a;
        for (let i = 0; i < n; i++) {
          s[i] += e * sinT(ph);
          ph += inc;
          e *= mul;
        }
      }
    }
    const nh = Math.min(n, Math.round(0.006 * sr));
    let lp = 0;
    for (let i = 0; i < nh; i++) {
      lp += 0.3 * (nz.next() - lp);
      s[i] += lp * 0.5 * vel * (1 - i / nh);
    }
    const nsh = Math.min(n, Math.round(0.4 * sr));
    for (let i = 0; i < nsh; i++) s[i] *= 1 + 0.7 * Math.exp(-i / (0.05 * sr));
  },
});

const epiano = (): Model => ({
  att: 0.002,
  rel: 0.3,
  gain: 0.85,
  render({ s, n, sr, f, vel }) {
    let pc = 0;
    let pm1 = 0;
    let pm2 = 0;
    const decC = Math.exp(-1 / (1.3 * sr));
    const decM1 = Math.exp(-1 / (0.1 * sr));
    const decM2 = Math.exp(-1 / (0.9 * sr));
    let ec = 1;
    let m1 = 2.4 * (0.5 + vel);
    let m2 = 0.7;
    for (let i = 0; i < n; i++) {
      s[i] = ec * Math.sin(TAU * pc + m1 * Math.sin(TAU * pm1) + m2 * Math.sin(TAU * pm2));
      pc += f / sr;
      pm1 += (f * 14) / sr;
      pm2 += f / sr;
      ec *= decC;
      m1 *= decM1;
      m2 *= decM2;
    }
  },
});

/** 彈撥金屬棒／木琴類：一組非諧波的衰減正弦 */
const mallet = (ratios: number[], taus: number[], amps: number[], trem = 0, rel = 1.2): Model => ({
  att: 0.001,
  rel,
  gain: 0.8,
  render({ s, n, sr, f, vel }) {
    const scale = clamp(Math.pow(262 / f, 0.45), 0.35, 2.2);
    ratios.forEach((r, k) => {
      const fr = f * r;
      if (fr > sr * 0.44) return;
      const mul = Math.exp(-1 / (taus[k] * scale * sr));
      let ph = 0;
      let e = amps[k] * (k === 0 ? 1 : 0.5 + vel * 0.6);
      for (let i = 0; i < n; i++) {
        const tv = trem ? 1 - 0.3 + 0.3 * Math.sin((TAU * trem * i) / sr) : 1;
        s[i] += e * tv * sinT(ph);
        ph += fr / sr;
        e *= mul;
      }
    });
  },
});

const organ = (bars: number[]): Model => ({
  att: 0.012,
  rel: 0.07,
  gain: 0.6,
  render({ s, n, sr, f }) {
    const harm = [1, 2, 3, 4, 6, 8];
    harm.forEach((h, k) => {
      if (f * h > sr * 0.44) return;
      let ph = 0;
      for (let i = 0; i < n; i++) {
        s[i] += bars[k] * sinT(ph + 0.0025 * Math.sin((TAU * 5.4 * i) / sr));
        ph += (f * h) / sr;
      }
    });
  },
});

/** Karplus–Strong 撥弦 */
const pluck = (damp: number, bright: number, rel: number, pick = 0, bend = 0): Model => ({
  att: 0,
  rel,
  gain: 0.9,
  render({ s, n, sr, f, vel, nz }) {
    const D = sr / f - 0.5;
    const L = Math.max(2, Math.floor(D));
    const frac = D - L;
    const ap = (1 - frac) / (1 + frac);
    const buf = new Float32Array(L + 1);
    let lp = 0;
    for (let i = 0; i < L + 1; i++) {
      lp += bright * (nz.next() - lp);
      buf[i] = lp * (1 + (1 - bright) * 3);
    }
    let idx = 0;
    let apx = 0;
    let apy = 0;
    for (let i = 0; i < n; i++) {
      const j = idx;
      const nx = j + 1 > L ? 0 : j + 1;
      const y = buf[j];
      const filt = damp * 0.5 * (buf[j] + buf[nx]);
      const out = ap * filt + apx - ap * apy;
      apx = filt;
      apy = out;
      buf[j] = out;
      idx = j + 1 > L ? 0 : j + 1;
      s[i] = y * vel;
    }
    if (pick > 0) {
      const np = Math.min(n, Math.round(0.004 * sr));
      for (let i = 0; i < np; i++) s[i] += nz.next() * pick * vel * (1 - i / np);
    }
    void bend;
  },
});

const bassFinger = (slap = 0): Model => ({
  att: 0.003,
  rel: 0.09,
  gain: 0.95,
  render({ s, n, sr, f, vel }) {
    const flt = new Svf(sr);
    let ph = 0;
    let ph2 = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      if ((i & 15) === 0) flt.set(240 + (500 + 900 * slap) * Math.exp(-t / 0.09) * (0.5 + vel), 1.1 + slap);
      const saw = sawB(ph, f / sr);
      s[i] = flt.lp(saw) * 0.9 + sinT(ph2) * 0.55;
      ph += f / sr;
      if (ph >= 1) ph -= 1;
      ph2 += f / sr;
    }
  },
});

const synthBass = (kind: number): Model => ({
  att: 0.002,
  rel: 0.07,
  gain: 0.85,
  render({ s, n, sr, f, vel }) {
    const flt = new Svf(sr);
    let p1 = 0;
    let p2 = 0.3;
    let p3 = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      if ((i & 15) === 0) flt.set(180 + (kind === 38 ? 2200 : 1400) * Math.exp(-t / 0.12) * (0.5 + vel * 0.7), 3.2);
      const o = sawB(p1, f / sr) * 0.6 + sawB(p2, (f * 1.006) / sr) * 0.5 + sqB(p3, (f * 0.5) / sr) * 0.4;
      s[i] = flt.lp(o);
      p1 = (p1 + f / sr) % 1;
      p2 = (p2 + (f * 1.006) / sr) % 1;
      p3 = (p3 + (f * 0.5) / sr) % 1;
    }
  },
});

const strings = (solo: boolean, lpFc: number, att: number, rel: number): Model => ({
  att,
  rel,
  gain: 0.5,
  render({ s, n, sr, f, nz }) {
    const flt = new Svf(sr);
    flt.set(Math.min(lpFc, f * 6), 0.9);
    const dets = solo ? [1] : [0.993, 1, 1.007, 1.0025];
    const ph = dets.map((_, k) => k * 0.23);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const vib = t > (solo ? 0.15 : 0.3) ? Math.pow(2, (0.28 / 12) * Math.sin(TAU * 5.2 * (t - 0.15))) : 1;
      let o = 0;
      for (let k = 0; k < dets.length; k++) {
        o += sawB(ph[k], (f * dets[k] * vib) / sr);
        ph[k] = (ph[k] + (f * dets[k] * vib) / sr) % 1;
      }
      o /= dets.length;
      s[i] = flt.lp(o + (solo ? nz.next() * 0.012 : 0));
    }
  },
});

const choir = (): Model => ({
  att: 0.3,
  rel: 0.45,
  gain: 0.7,
  render({ s, n, sr, f, nz }) {
    const forms: [number, number, number][] = [
      [800, 7, 1],
      [1150, 8, 0.6],
      [2900, 9, 0.25],
    ];
    const fl = forms.map(([fc, q]) => {
      const x = new Svf(sr);
      x.set(fc, q);
      return x;
    });
    let p1 = 0;
    let p2 = 0.5;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const vib = Math.pow(2, (0.2 / 12) * Math.sin(TAU * 5 * t));
      const src = sawB(p1, (f * vib) / sr) + sawB(p2, (f * vib * 1.004) / sr) + nz.next() * 0.02;
      p1 = (p1 + (f * vib) / sr) % 1;
      p2 = (p2 + (f * vib * 1.004) / sr) % 1;
      let o = 0;
      for (let k = 0; k < 3; k++) o += fl[k].bp(src) * forms[k][2];
      s[i] = o * 0.9;
    }
  },
});

const brass = (bright: number, section: boolean, att: number): Model => ({
  att,
  rel: 0.12,
  gain: 0.62,
  render({ s, n, sr, f, vel }) {
    const flt = new Svf(sr);
    const dets = section ? [0.996, 1.004] : [1];
    const ph = dets.map((_, k) => k * 0.31);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      if ((i & 15) === 0) flt.set(Math.min(7000, f * (1.6 + bright * (1 - Math.exp(-t / 0.09)) * (0.6 + vel))), 1.2);
      const vib = t > 0.25 ? Math.pow(2, (0.18 / 12) * Math.sin(TAU * 5.3 * (t - 0.25))) : 1;
      let o = 0;
      for (let k = 0; k < dets.length; k++) {
        o += sawB(ph[k], (f * dets[k] * vib) / sr);
        ph[k] = (ph[k] + (f * dets[k] * vib) / sr) % 1;
      }
      s[i] = flt.lp(o / dets.length);
    }
  },
});

const reed = (kind: 'sax' | 'clarinet' | 'oboe'): Model => ({
  att: 0.035,
  rel: 0.1,
  gain: 0.7,
  render({ s, n, sr, f, nz }) {
    const f1 = new Svf(sr);
    const f2 = new Svf(sr);
    const lp = new Svf(sr);
    f1.set(kind === 'oboe' ? 1400 : 700, 2.5);
    f2.set(kind === 'oboe' ? 3000 : 1700, 3);
    lp.set(kind === 'clarinet' ? 2400 : 4200, 0.8);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const vib = t > 0.2 ? Math.pow(2, (0.22 / 12) * Math.sin(TAU * 5.4 * (t - 0.2))) : 1;
      const dt = (f * vib) / sr;
      const src = kind === 'clarinet' ? sqB(ph, dt) : kind === 'oboe' ? sqB(ph, dt, 0.14) : sawB(ph, dt);
      ph = (ph + dt) % 1;
      const body = kind === 'clarinet' ? src : f1.bp(src) * 1.3 + f2.bp(src) * 0.7 + src * 0.25;
      s[i] = lp.lp(body + nz.next() * 0.05);
    }
  },
});

const pipe = (breath: number, h2: number): Model => ({
  att: 0.07,
  rel: 0.1,
  gain: 0.75,
  render({ s, n, sr, f, nz }) {
    const bp = new Svf(sr);
    bp.set(Math.min(f * 4, 9000), 1.6);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const vib = t > 0.25 ? Math.pow(2, (0.15 / 12) * Math.sin(TAU * 5 * (t - 0.25))) : 1;
      const tone = sinT(ph) + h2 * sinT(ph * 2) + 0.04 * sinT(ph * 3);
      ph += (f * vib) / sr;
      s[i] = tone * 0.7 + bp.bp(nz.next()) * breath * (1 + 2 * Math.exp(-t / 0.05));
    }
  },
});

const lead = (kind: 'square' | 'saw' | 'calliope'): Model => ({
  att: 0.006,
  rel: 0.08,
  gain: 0.55,
  render({ s, n, sr, f, nz }) {
    const flt = new Svf(sr);
    flt.set(kind === 'square' ? 5200 : 6400, 0.8);
    let p1 = 0;
    let p2 = 0.4;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const vib = t > 0.18 ? Math.pow(2, (0.2 / 12) * Math.sin(TAU * 5.5 * (t - 0.18))) : 1;
      const dt = (f * vib) / sr;
      let o: number;
      if (kind === 'square') o = sqB(p1, dt);
      else if (kind === 'saw') o = sawB(p1, dt) * 0.6 + sawB(p2, dt * 1.004) * 0.5;
      else o = sinT(p1) + 0.35 * sinT(p1 * 3) + nz.next() * 0.03 * Math.exp(-t / 0.1);
      p1 = (p1 + dt) % 1;
      p2 = (p2 + dt * 1.004) % 1;
      s[i] = flt.lp(o);
    }
  },
});

const pad = (fc: number, sweep: boolean, att: number, rel: number): Model => ({
  att,
  rel,
  gain: 0.42,
  render({ s, n, sr, f }) {
    const flt = new Svf(sr);
    const dets = [0.994, 1, 1.006, 1.0021];
    const ph = dets.map((_, k) => k * 0.19);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      if ((i & 15) === 0) flt.set(fc * (sweep ? 0.35 + 1.2 * Math.min(1, t / 1.4) : 1) * (1 + 0.15 * Math.sin(TAU * 0.3 * t)), 0.8);
      let o = 0;
      for (let k = 0; k < dets.length; k++) {
        o += sawB(ph[k], (f * dets[k]) / sr);
        ph[k] = (ph[k] + (f * dets[k]) / sr) % 1;
      }
      s[i] = flt.lp(o / dets.length);
    }
  },
});

const clavinet = (): Model => ({
  att: 0.001,
  rel: 0.05,
  gain: 0.7,
  render({ s, n, sr, f, vel }) {
    const flt = new Svf(sr);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      if ((i & 15) === 0) flt.set(900 + 4200 * Math.exp(-t / 0.05) * (0.4 + vel), 2.2);
      s[i] = flt.lp(sqB(ph, f / sr, 0.28)) * Math.exp(-t / 0.28);
      ph = (ph + f / sr) % 1;
    }
  },
});

const taiko = (base: number): Model => ({
  att: 0.001,
  rel: 0.6,
  gain: 1,
  render({ s, n, sr, vel, nz }) {
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const f = base * (0.62 + 0.38 * Math.exp(-t / 0.05));
      ph += f / sr;
      s[i] = (sinT(ph) * Math.exp(-t / 0.22) + nz.next() * Math.exp(-t / 0.006) * 0.4) * vel;
    }
  },
});

const bellFm = (): Model => ({
  att: 0.001,
  rel: 1.8,
  gain: 0.7,
  render({ s, n, sr, f }) {
    let pc = 0;
    let pm = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const idx = 3.5 * Math.exp(-t / 0.5);
      s[i] = Math.sin(TAU * pc + idx * Math.sin(TAU * pm)) * Math.exp(-t / 1.4);
      pc += f / sr;
      pm += (f * 3.51) / sr;
    }
  },
});

// ---------- 音色表 ----------
const cache = new Map<number, Model>();
function modelOf(p: number): Model {
  const hit = cache.get(p);
  if (hit) return hit;
  const m = build(p);
  cache.set(p, m);
  return m;
}
function build(p: number): Model {
  if (p <= 3) return piano(p === 1 ? 1.5 : 1, p === 3 ? 0.004 : 0);
  if (p <= 5) return epiano();
  if (p === 6) return pluck(0.998, 0.9, 0.5, 0.2);
  if (p === 7) return clavinet();
  if (p === 8) return mallet([1, 2, 4.1, 6.3], [1.2, 0.5, 0.25, 0.12], [1, 0.45, 0.25, 0.15]);
  if (p === 9) return mallet([1, 2.76, 5.4, 8.93], [1.4, 0.7, 0.4, 0.2], [1, 0.55, 0.3, 0.2]);
  if (p === 10) return mallet([1, 2, 3, 4, 5], [0.9, 0.5, 0.3, 0.2, 0.12], [1, 0.5, 0.3, 0.2, 0.1]);
  if (p === 11) return mallet([1, 4, 10], [1.8, 0.5, 0.2], [1, 0.35, 0.12], 5.2, 1.6);
  if (p === 12) return mallet([1, 3.9, 9.2], [0.45, 0.12, 0.05], [1, 0.4, 0.15], 0, 0.5);
  if (p === 13) return mallet([1, 3, 6], [0.2, 0.07, 0.03], [1, 0.5, 0.25], 0, 0.3);
  if (p === 14) return mallet([1, 2.76, 5.4, 8.93, 11.34], [2.5, 1.5, 0.9, 0.5, 0.3], [1, 0.6, 0.4, 0.25, 0.15], 0, 2.5);
  if (p === 15) return pluck(0.997, 0.7, 0.4, 0.1);
  if (p <= 20) return organ([0.9, 0.7, 0.55, 0.4, 0.25, 0.2]);
  if (p <= 23) return organ([0.8, 0.4, 0.6, 0.2, 0.1, 0.05]);
  if (p <= 25) return pluck(p === 24 ? 0.9955 : 0.998, p === 24 ? 0.45 : 0.75, 0.4, 0.15);
  if (p <= 31) return pluck(0.998, 0.8, 0.35, 0.15);
  if (p === 32) return pluck(0.9992, 0.18, 0.3, 0.08);
  if (p === 33 || p === 34 || p === 35) return bassFinger(0);
  if (p === 36 || p === 37) return bassFinger(1);
  if (p === 38 || p === 39) return synthBass(p);
  if (p <= 41) return strings(true, 3600, 0.1, 0.25);
  if (p <= 44) return strings(true, 1700, 0.12, 0.3);
  if (p === 45) return pluck(0.994, 0.6, 0.15, 0.1);
  if (p === 46) return pluck(0.9985, 0.5, 0.8, 0.05);
  if (p === 47) return taiko(95);
  if (p <= 51) return strings(false, 3200, 0.28, 0.4);
  if (p <= 55) return choir();
  if (p <= 59) return brass(4, false, 0.07);
  if (p <= 63) return brass(3, p === 61 || p === 62, 0.08);
  if (p <= 66) return reed('sax');
  if (p === 67 || p === 66) return reed('sax');
  if (p === 68 || p === 69) return reed('oboe');
  if (p <= 71) return reed('clarinet');
  if (p === 72 || p === 73) return pipe(0.07, 0.12);
  if (p <= 75) return pipe(0.1, 0.08);
  if (p === 76 || p === 77) return pipe(0.2, 0.05);
  if (p <= 79) return pipe(0.05, 0.04);
  if (p === 80) return lead('square');
  if (p === 82) return lead('calliope');
  if (p <= 87) return lead('saw');
  if (p === 88) return pad(2600, false, 0.7, 1);
  if (p === 89) return pad(1300, false, 0.55, 0.9);
  if (p === 90) return pad(3200, false, 0.4, 0.7);
  if (p === 91 || p === 92) return choir();
  if (p === 95) return pad(3000, true, 0.6, 0.9);
  if (p <= 97) return pad(2000, false, 0.5, 0.8);
  if (p === 98) return bellFm();
  if (p <= 103) return pad(2400, true, 0.5, 0.8);
  if (p === 104) return pluck(0.9985, 0.9, 0.5, 0.25);
  if (p === 105) return pluck(0.996, 0.95, 0.25, 0.3);
  if (p === 106) return pluck(0.9965, 0.92, 0.3, 0.35);
  if (p === 107) return pluck(0.998, 0.7, 0.7, 0.15);
  if (p === 108) return mallet([1, 5.4, 11], [0.6, 0.15, 0.06], [1, 0.4, 0.2], 0, 0.7);
  if (p <= 111) return strings(true, 3200, 0.06, 0.2);
  if (p === 112) return mallet([1, 2.76, 5.4, 8.93], [1, 0.5, 0.3, 0.2], [1, 0.6, 0.4, 0.3], 0, 1.5);
  if (p === 114) return mallet([1, 2.3, 3.6, 5.1], [0.7, 0.4, 0.25, 0.15], [1, 0.7, 0.5, 0.3], 0, 0.9);
  if (p === 115) return mallet([1, 1.8], [0.05, 0.03], [1, 0.5], 0, 0.1);
  if (p === 116) return taiko(80);
  if (p <= 119) return taiko(p === 117 ? 160 : 120);
  return lead('saw');
}

// ---------- GM 鼓組 ----------
const METAL = [205.3, 304.4, 369.6, 522.7, 540.0, 800.0];
function drum(buf: Float32Array, sr: number, start: number, note: number, vel: number, nz: Noise) {
  const put = (len: number, fn: (t: number, i: number) => number) => {
    const n = Math.min(buf.length - start, Math.ceil(len * sr));
    for (let i = 0; i < n; i++) buf[start + i] += fn(i / sr, i) * vel;
  };
  const metal = (t: number, scale: number) => {
    let a = 0;
    for (const f of METAL) a += (((t * f * scale) % 1) < 0.5 ? 1 : -1);
    return a / 6;
  };
  switch (note) {
    case 35:
    case 36: {
      let ph = 0;
      put(0.4, (t) => {
        ph += (45 + 90 * Math.exp(-t / 0.028)) / sr;
        return Math.tanh(1.8 * sinT(ph)) * Math.exp(-t / 0.11) * 0.95 + nz.next() * Math.exp(-t / 0.003) * 0.25;
      });
      break;
    }
    case 38:
    case 40: {
      const bp = new Svf(sr);
      bp.set(1900, 0.8);
      const hp = new Svf(sr);
      hp.set(4500, 0.7);
      let ph = 0;
      put(0.35, (t) => {
        ph += (185 + 60 * Math.exp(-t / 0.02)) / sr;
        const x = nz.next();
        return bp.bp(x) * Math.exp(-t / 0.075) * 1.6 + hp.hp(x) * Math.exp(-t / 0.12) * 0.35 + sinT(ph) * Math.exp(-t / 0.05) * 0.5;
      });
      break;
    }
    case 37: {
      let ph = 0;
      put(0.08, (t) => {
        ph += 1750 / sr;
        return (sinT(ph) * 0.5 + nz.next() * 0.3) * Math.exp(-t / 0.012);
      });
      break;
    }
    case 39: {
      const bp = new Svf(sr);
      bp.set(1300, 1.1);
      put(0.4, (t) => {
        const burst = t < 0.032 ? (t % 0.008 < 0.004 ? 1 : 0.35) : 0;
        return bp.bp(nz.next()) * (burst * 1.3 + Math.exp(-t / 0.07) * 0.7);
      });
      break;
    }
    case 42:
    case 44:
    case 46: {
      const hp = new Svf(sr);
      hp.set(7500, 0.9);
      const tau = note === 46 ? 0.2 : note === 44 ? 0.04 : 0.028;
      put(note === 46 ? 0.9 : 0.25, (t) => (hp.hp(nz.next()) * 0.7 + hp.hp(metal(t, 1.6)) * 0.5) * Math.exp(-t / tau) * 0.55);
      break;
    }
    case 41:
    case 43:
    case 45:
    case 47:
    case 48:
    case 50: {
      const f = 78 + (note - 41) * 20;
      let ph = 0;
      put(0.6, (t) => {
        ph += (f * (1 + 0.5 * Math.exp(-t / 0.04))) / sr;
        return (sinT(ph) * Math.exp(-t / 0.17) + nz.next() * Math.exp(-t / 0.004) * 0.2) * 0.95;
      });
      break;
    }
    case 49:
    case 55:
    case 57: {
      const hp = new Svf(sr);
      hp.set(3500, 0.8);
      put(2.2, (t) => (hp.hp(nz.next()) * 0.65 + hp.hp(metal(t, 2.4)) * 0.45) * Math.exp(-t / 0.55) * 0.5);
      break;
    }
    case 51:
    case 53:
    case 59: {
      const hp = new Svf(sr);
      hp.set(5200, 0.8);
      let ph = 0;
      put(1.2, (t) => {
        ph += 3200 / sr;
        return (hp.hp(nz.next()) * 0.3 * Math.exp(-t / 0.35) + sinT(ph) * 0.3 * Math.exp(-t / 0.55) + hp.hp(metal(t, 2.1)) * 0.25 * Math.exp(-t / 0.3)) * 0.8;
      });
      break;
    }
    case 54: {
      const hp = new Svf(sr);
      hp.set(6500, 0.9);
      put(0.3, (t) => hp.hp(nz.next()) * Math.exp(-t / 0.06) * (0.6 + 0.4 * Math.sin(t * 90)) * 0.6);
      break;
    }
    case 56: {
      const bp = new Svf(sr);
      bp.set(1000, 2);
      put(0.4, (t) => bp.bp(((t * 562) % 1 < 0.5 ? 1 : -1) + ((t * 845) % 1 < 0.5 ? 1 : -1)) * Math.exp(-t / 0.13) * 1.1);
      break;
    }
    case 69:
    case 70: {
      const bp = new Svf(sr);
      bp.set(6500, 1.2);
      put(0.15, (t) => bp.bp(nz.next()) * Math.sin(Math.min(1, t / 0.012) * 1.57) * Math.exp(-t / 0.035) * 1.1);
      break;
    }
    case 75:
    case 76:
    case 77: {
      const f = note === 75 ? 1600 : note === 76 ? 1250 : 900;
      let ph = 0;
      put(0.12, (t) => {
        ph += f / sr;
        return (sinT(ph) + 0.4 * sinT(ph * 1.5)) * Math.exp(-t / 0.025) * 0.7;
      });
      break;
    }
    case 80:
    case 81: {
      let ph = 0;
      put(note === 81 ? 1.4 : 0.3, (t) => {
        ph += 3400 / sr;
        return (sinT(ph) + 0.3 * sinT(ph * 2.76)) * Math.exp(-t / (note === 81 ? 0.5 : 0.08)) * 0.5;
      });
      break;
    }
    default: {
      const bp = new Svf(sr);
      bp.set(2500, 1);
      put(0.2, (t) => bp.bp(nz.next()) * Math.exp(-t / 0.04) * 0.7);
    }
  }
}

// ---------- 主渲染 ----------
/** 取樣音色已做響度校正，這裡只調整各聲部之間的相對大小 */
const ROLE_MIX: Record<TrackRole, number> = { lead: 1, counter: 0.85, arp: 0.8, bass: 0.75, pad: 0.9, chord: 0.7, perc: 1 };
const SEND: Record<TrackRole, number> = { lead: 0.3, arp: 0.34, bass: 0.04, pad: 0.55, chord: 0.28, counter: 0.32, perc: 0.1 };

export async function renderGm(song: Song, opts: RenderOpts): Promise<Stereo> {
  const sr = opts.sr;
  const n = Math.round(song.seconds * sr);
  const tail = Math.round(2.8 * sr);
  const dry = newStereo(n + tail);
  const wet = newStereo(n + tail);
  const nz = new Noise((opts.seed ?? 1) * 40503 + 7);
  const scratch = new Float32Array(Math.round(sr * 14));
  // 真實取樣（載入失敗或沒有取樣的音色會自動用程式合成的版本）
  const sampled = await ensureSamplesFor(song);
  // 取樣鼓的峰值約 0.4–0.6，合成鼓要降到同一個量級才不會蓋過旋律
  const synthDrumGain = sampled ? 0.6 : 1;
  let drumCount = 0;
  for (const tr of song.tracks) {
    const [gl, gr] = panGains(tr.pan);
    const send = SEND[tr.role] ?? 0.2;
    if (tr.drum) {
      const buf = new Float32Array(n + tail);
      for (const nt of tr.notes) {
        const [s0] = noteSpan(song, nt);
        const at = Math.round(s0 * sr);
        if (!sampledDrum(buf, sr, at, nt.pitch, nt.vel, tr.kit ?? 'hybrid', drumCount++)) drum(buf, sr, at, nt.pitch, nt.vel * synthDrumGain, nz);
      }
      for (let i = 0; i < buf.length; i++) {
        dry.l[i] += buf[i] * tr.gain * 0.9 * gl;
        dry.r[i] += buf[i] * tr.gain * 0.9 * gr;
        wet.l[i] += buf[i] * tr.gain * send * gl;
        wet.r[i] += buf[i] * tr.gain * send * gr;
      }
    } else {
      const model = sampledModel(tr.program) ?? modelOf(tr.program);
      // 響度校正：讓不同音色在同樣力度下聽感音量一致（校正腳本跑的時候用 __noCal 關掉）
      const cal = (globalThis as { __noCal?: boolean }).__noCal ? 1 : (CALIBRATION[tr.program] ?? 1);
      const mg = tr.gain * model.gain * cal * (sampledModel(tr.program) ? ROLE_MIX[tr.role] : 1);
      for (const nt of tr.notes) {
        const [s0, s1] = noteSpan(song, nt);
        const start = Math.round(s0 * sr);
        const dur = Math.max(0.03, s1 - s0);
        const len = Math.min(Math.ceil((dur + model.rel) * sr), scratch.length, n + tail - start);
        if (len <= 0) continue;
        scratch.fill(0, 0, len);
        model.render({ s: scratch, n: len, sr, f: mtof(nt.pitch), vel: nt.vel, dur, nz });
        const nAtt = Math.max(1, Math.round(model.att * sr));
        const nDur = Math.round(dur * sr);
        const nRel = Math.max(1, Math.round(model.rel * sr));
        for (let i = 0; i < len; i++) {
          let g = i < nAtt ? i / nAtt : 1;
          if (i > nDur) g *= Math.max(0, 1 - (i - nDur) / nRel);
          const v = scratch[i] * g * mg * nt.vel;
          const o = start + i;
          dry.l[o] += v * gl;
          dry.r[o] += v * gr;
          wet.l[o] += v * send * gl;
          wet.r[o] += v * send * gr;
        }
      }
    }
    if (opts.yieldEvery) await yieldNow();
  }
  const rv = freeverb(wet.l, wet.r, sr, { room: 0.82, damp: 0.42, wet: 1, width: 1 });
  for (let i = 0; i < dry.l.length; i++) {
    dry.l[i] += rv.l[i] * 0.55;
    dry.r[i] += rv.r[i] * 0.55;
  }
  const out = foldTail(dry, n);
  removeMean(out.l);
  removeMean(out.r);
  if (!opts.raw) master(out, 0.12);
  return out;
}
