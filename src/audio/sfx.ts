// 音效合成：5 個音效包 × 19 種音效，全部由程式生成。
// 每個音效是「音高掃描 + 噪音 + 鈴音」的組合，音效包只改變波形、軟硬度、音高與量化。
import { Noise, Svf } from './dsp';
import type { PackId, SfxKind } from './types';

const TAU = Math.PI * 2;

interface Style {
  wave: 'pulse' | 'sine' | 'fm' | 'tri';
  duty: number;
  /** 位元量化階數，0 = 不量化 */
  crush: number;
  /** 噪音多寡 */
  noise: number;
  /** 音高倍率 */
  pitch: number;
  /** 衰減倍率 */
  decay: number;
  /** 柔化（低通 Hz，0 = 不處理） */
  lp: number;
  vib: number;
  /** FM 指數 */
  fm: number;
}

const STYLES: Record<PackId, Style> = {
  '8bit': { wave: 'pulse', duty: 0.25, crush: 15, noise: 0.9, pitch: 1, decay: 0.9, lp: 0, vib: 0, fm: 0 },
  cartoon: { wave: 'sine', duty: 0.5, crush: 0, noise: 0.5, pitch: 1.05, decay: 1, lp: 9000, vib: 0.35, fm: 0.6 },
  ui: { wave: 'sine', duty: 0.5, crush: 0, noise: 0.35, pitch: 1.15, decay: 0.8, lp: 7000, vib: 0, fm: 0 },
  scifi: { wave: 'fm', duty: 0.5, crush: 0, noise: 0.6, pitch: 1.1, decay: 1.1, lp: 0, vib: 0, fm: 3.2 },
  natural: { wave: 'tri', duty: 0.5, crush: 0, noise: 1.25, pitch: 0.8, decay: 1.2, lp: 6000, vib: 0, fm: 0 },
};

type Env = (t: number) => number;
const expo =
  (tau: number, att = 0.002): Env =>
  (t) =>
    (t < att ? t / att : 1) * Math.exp(-(t - att) / Math.max(1e-4, tau));
const hump =
  (len: number): Env =>
  (t) =>
    Math.sin(Math.PI * Math.min(1, t / len)) ** 1.5;

class Synth {
  readonly sr: number;
  constructor(
    private S: Style,
    sr: number,
    seed: number,
  ) {
    this.sr = sr;
    this.nz = new Noise(seed * 7919 + 13);
  }
  readonly nz: Noise;
  buf = new Float32Array(0);

  private ensure(n: number) {
    if (n > this.buf.length) {
      const b = new Float32Array(n);
      b.set(this.buf);
      this.buf = b;
    }
  }
  /** 音高掃描 */
  sweep(at: number, len: number, f0: number, f1: number, env: Env, amp = 1, opts: { wave?: Style['wave']; duty?: number; fm?: number; vib?: number } = {}) {
    const { sr, S } = this;
    const start = Math.round(at * sr);
    const n = Math.round(len * sr);
    this.ensure(start + n);
    const wave = opts.wave ?? S.wave;
    let ph = 0;
    let pm = 0;
    const idx = opts.fm ?? S.fm;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const k = t / len;
      let f = (f0 * Math.pow(f1 / f0, k)) * S.pitch;
      const vib = opts.vib ?? S.vib;
      if (vib) f *= Math.pow(2, (vib / 12) * Math.sin(TAU * 8 * t));
      ph += f / sr;
      let y: number;
      switch (wave) {
        case 'pulse':
          y = ph % 1 < (opts.duty ?? S.duty) ? 1 : -1;
          break;
        case 'tri':
          y = 4 * Math.abs((ph % 1) - 0.5) - 1;
          break;
        case 'fm':
          pm += (f * 2.01) / sr;
          y = Math.sin(TAU * ph + idx * Math.exp(-t / 0.12) * Math.sin(TAU * pm));
          break;
        default:
          y = Math.sin(TAU * ph) + (idx ? 0.25 * idx * Math.sin(TAU * ph * 2) * Math.exp(-t / 0.1) : 0);
      }
      this.buf[start + i] += y * env(t) * amp;
    }
  }
  /** 噪音（可帶通／低通／高通） */
  noise(at: number, len: number, env: Env, amp = 1, f?: { type: 'bp' | 'lp' | 'hp'; fc: number; fc2?: number; q?: number }) {
    const { sr, S } = this;
    const start = Math.round(at * sr);
    const n = Math.round(len * sr);
    this.ensure(start + n);
    const flt = new Svf(sr);
    if (f) flt.set(f.fc, f.q ?? 0.9);
    let held = 0;
    const hold = S.crush ? Math.max(1, Math.round(sr / 8000)) : 1;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      if (f?.fc2 && (i & 15) === 0) flt.set(f.fc * Math.pow(f.fc2 / f.fc, t / len), f.q ?? 0.9);
      if (i % hold === 0) held = this.nz.next();
      let x = held;
      if (f) x = f.type === 'bp' ? flt.bp(x) : f.type === 'lp' ? flt.lp(x) : flt.hp(x);
      this.buf[start + i] += x * env(t) * amp * S.noise;
    }
  }
  /** 鈴音：一組非諧波的衰減正弦 */
  bell(at: number, f: number, tau: number, amp = 1, partials: [number, number][] = [[1, 1], [2.76, 0.35], [5.4, 0.12]]) {
    const { sr, S } = this;
    const len = tau * 5;
    const start = Math.round(at * sr);
    const n = Math.round(len * sr);
    this.ensure(start + n);
    for (const [r, a] of partials) {
      const fr = f * r * S.pitch;
      if (fr > sr * 0.45) continue;
      let ph = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        ph += fr / sr;
        const w = S.wave === 'pulse' ? (ph % 1 < 0.5 ? 1 : -1) * 0.7 : Math.sin(TAU * ph);
        this.buf[start + i] += w * a * amp * Math.exp(-t / (tau * S.decay / r ** 0.35));
      }
    }
  }
  /** 收尾：量化、低通、正規化、淡出 */
  finish(peak = 0.8): Float32Array {
    const { S, sr } = this;
    let b = this.buf;
    if (S.lp) {
      const f = new Svf(sr);
      f.set(S.lp, 0.7);
      for (let i = 0; i < b.length; i++) b[i] = f.lp(b[i]);
    }
    let m = 0;
    for (const x of b) m = Math.max(m, Math.abs(x));
    const g = m > 0 ? peak / m : 1;
    for (let i = 0; i < b.length; i++) {
      let x = b[i] * g;
      if (S.crush) x = Math.round(x * S.crush) / S.crush;
      b[i] = x;
    }
    const fo = Math.min(b.length, Math.round(0.012 * sr));
    for (let i = 0; i < fo; i++) b[b.length - 1 - i] *= i / fo;
    b = b.slice(0, Math.max(1, b.length));
    return b;
  }
}

export const SFX_KINDS: { id: SfxKind; name: string }[] = [
  { id: 'jump', name: '起跳' },
  { id: 'land', name: '落地' },
  { id: 'bounce', name: '彈跳' },
  { id: 'pop', name: '彈出' },
  { id: 'click', name: '點擊' },
  { id: 'toggle', name: '開關' },
  { id: 'whoosh', name: '掃過' },
  { id: 'tick', name: '滴答' },
  { id: 'ping', name: '提示音' },
  { id: 'sparkle', name: '閃光' },
  { id: 'impact', name: '撞擊' },
  { id: 'step', name: '腳步' },
  { id: 'notify', name: '通知' },
  { id: 'rise', name: '上升' },
  { id: 'drop', name: '下降' },
  { id: 'flip', name: '翻轉' },
  { id: 'blip', name: '短嗶' },
  { id: 'splash', name: '水花' },
  { id: 'quack', name: '鴨叫' },
];

export const PACK_INFO: Record<PackId, { name: string; desc: string }> = {
  '8bit': { name: '8-bit', desc: '脈衝波與量化噪音，遊戲機的嗶嗶聲' },
  cartoon: { name: '卡通', desc: '滑音哨、彈簧、木琴叮咚' },
  ui: { name: '介面', desc: '柔和的點擊、泡泡與玻璃叮聲' },
  scifi: { name: '科幻', desc: '調頻掃頻、雷射與電子脈衝' },
  natural: { name: '自然', desc: '悶重的撞擊、風聲、木頭與紙張的聲響' },
};

export function synthSfx(pack: PackId, kind: SfxKind, sr: number, variant = 0): Float32Array {
  const S = STYLES[pack];
  const y = new Synth(S, sr, variant + 1 + kind.length * 31);
  const d = S.decay;
  const nat = pack === 'natural';
  const toon = pack === 'cartoon';
  const sci = pack === 'scifi';
  const bit = pack === '8bit';
  switch (kind) {
    case 'jump':
      if (nat) {
        y.noise(0, 0.22, hump(0.22), 0.5, { type: 'bp', fc: 500, fc2: 1800, q: 1.2 });
        y.sweep(0, 0.16, 180, 260, expo(0.1), 0.4);
      } else y.sweep(0, toon ? 0.3 : 0.2, toon ? 260 : 300, toon ? 1300 : 780, expo(0.14 * d), 1);
      break;
    case 'land':
      y.sweep(0, 0.2, 170, 48, expo(0.07 * d), 1, { wave: bit ? 'tri' : 'sine', fm: 0 });
      y.noise(0, 0.12, expo(0.03 * d), nat ? 0.9 : 0.6, { type: 'lp', fc: nat ? 700 : 1500 });
      if (toon) y.sweep(0.01, 0.2, 520, 300, expo(0.06), 0.35, { wave: 'sine', fm: 0 });
      break;
    case 'bounce':
      if (toon || sci) {
        y.sweep(0, 0.28, 220, 520, expo(0.18 * d), 1, { vib: 0.6 });
        y.sweep(0.04, 0.24, 160, 420, expo(0.14), 0.5);
      } else {
        y.sweep(0, 0.12, 330, 190, expo(0.07 * d), 1);
        y.noise(0, 0.05, expo(0.015), 0.35, { type: 'lp', fc: 900 });
      }
      break;
    case 'pop':
      y.sweep(0, 0.09, 1300, 380, expo(0.03 * d), 1, { fm: 0 });
      y.noise(0, 0.012, expo(0.004), 0.6, { type: 'hp', fc: 2500 });
      break;
    case 'click':
      y.noise(0, 0.02, expo(0.004), 0.9, { type: 'hp', fc: 2200 });
      y.sweep(0, 0.03, 1900, 1500, expo(0.01), 0.5, { fm: 0 });
      break;
    case 'toggle':
      y.sweep(0, 0.05, 700, 700, expo(0.015), 0.9, { fm: 0 });
      y.noise(0, 0.01, expo(0.003), 0.4, { type: 'hp', fc: 2500 });
      y.sweep(0.06, 0.07, 1050, 1050, expo(0.02), 1, { fm: 0 });
      y.noise(0.06, 0.01, expo(0.003), 0.4, { type: 'hp', fc: 2500 });
      break;
    case 'whoosh':
      y.noise(0, 0.5, hump(0.5), 1, { type: 'bp', fc: nat ? 350 : 500, fc2: nat ? 1600 : 3800, q: nat ? 0.9 : 1.4 });
      if (sci) y.sweep(0, 0.5, 200, 1400, hump(0.5), 0.3);
      break;
    case 'tick':
      if (nat || toon) {
        y.sweep(0, 0.04, 1500, 1100, expo(0.01), 0.8, { fm: 0 });
        y.noise(0, 0.01, expo(0.003), 0.4, { type: 'bp', fc: 2000 });
      } else y.sweep(0, 0.02, 3200, 3000, expo(0.006), 0.9, { fm: 0 });
      break;
    case 'ping':
      y.bell(0, 1319, 0.22, 1, bit ? [[1, 1]] : [[1, 1], [2.0, 0.3], [3.0, 0.1]]);
      break;
    case 'sparkle':
      [1047, 1319, 1568, 2093, 2637, 3136].forEach((f, i) => y.bell(i * 0.055, f, 0.14, 0.7, bit ? [[1, 1]] : [[1, 1], [2.76, 0.2]]));
      break;
    case 'impact':
      y.noise(0, 0.4, expo(0.1 * d), 1, { type: 'lp', fc: 2500, fc2: 300 });
      y.sweep(0, 0.45, 130, 32, expo(0.14 * d), 1.1, { wave: bit ? 'tri' : 'sine', fm: 0 });
      if (!nat) y.noise(0, 0.03, expo(0.006), 0.7, { type: 'hp', fc: 3000 });
      break;
    case 'step':
      y.noise(0, 0.08, expo(0.02), 0.9, { type: 'lp', fc: nat ? 500 : 900 });
      y.sweep(0, 0.09, 110, 60, expo(0.03), 0.7, { wave: 'sine', fm: 0 });
      break;
    case 'notify':
      y.bell(0, 988, 0.16, 1, bit ? [[1, 1]] : [[1, 1], [2.0, 0.25]]);
      y.bell(0.12, 1319, 0.26, 1, bit ? [[1, 1]] : [[1, 1], [2.0, 0.25]]);
      break;
    case 'rise':
      y.sweep(0, 0.55, 220, 1100, (t) => Math.min(1, t / 0.05) * Math.min(1, (0.55 - t) / 0.08), 0.9);
      y.noise(0, 0.55, (t) => (t / 0.55) ** 2, 0.5, { type: 'hp', fc: 1500 });
      break;
    case 'drop':
      y.sweep(0, 0.45, 1000, 160, expo(0.22 * d), 1);
      break;
    case 'flip':
      y.noise(0, 0.14, hump(0.14), 0.9, { type: 'bp', fc: 1200, fc2: 3200, q: 1.5 });
      y.sweep(0, 0.12, 700, 320, expo(0.05), 0.5);
      break;
    case 'blip':
      y.sweep(0, 0.07, 880, 880, expo(0.025), 1, { fm: sci ? 1.5 : 0 });
      break;
    case 'splash': {
      // 入水的一瞬間：由亮到悶的帶通噪音（水花），底下一個短促的低音，再冒出幾顆上揚的小氣泡
      y.noise(0, 0.38, (t) => Math.min(1, t / 0.006) * Math.exp(-t / (0.11 * d)), 1, { type: 'bp', fc: nat ? 2200 : 3200, fc2: 700, q: 0.8 });
      y.sweep(0, 0.12, 240, 90, expo(0.04 * d), 0.55, { wave: bit ? 'tri' : 'sine', fm: 0 });
      [0.03, 0.08, 0.15, 0.23].forEach((at, i) => {
        const f = 500 + ((i * 397) % 700);
        y.sweep(at, 0.07, f, f * 2.1, expo(0.025), 0.28, { wave: bit ? 'pulse' : 'sine', fm: 0, vib: 0 });
      });
      break;
    }
    case 'quack': {
      // 「呱—克」：兩段沙啞的窄脈衝波（高頻泛音多，聽起來鼻音重），加 70 Hz 的振幅顫動做出沙啞感
      const buzz =
        (len: number): Env =>
        (t) =>
          Math.min(1, t / 0.008) * Math.max(0, 1 - t / len) ** 0.8 * (0.7 + 0.3 * Math.sin(TAU * 70 * t));
      const f = toon ? 1.15 : 1;
      y.sweep(0, 0.13, 520 * f, 400 * f, buzz(0.13), 1, { wave: 'pulse', duty: 0.18 });
      y.sweep(0.11, 0.1, 380 * f, 260 * f, buzz(0.1), 0.8, { wave: 'pulse', duty: 0.22 });
      y.noise(0, 0.1, expo(0.03), 0.25, { type: 'bp', fc: 1800, q: 1.2 });
      break;
    }
  }
  return y.finish(0.8);
}
