// 把取樣包裡的真實樂器轉成 XM 樂器：16 位元取樣、每個樂器最多 16 個取樣（依音高分區）、持續音保留循環。
// 為了讓 .xm 檔不要過大，取樣率降到 32 kHz（保留到取樣本身的 16 kHz 上限）、持續音只留「起音 + 一小段循環」、衰減音限制長度。
import { clamp } from '../engine/util';
import { CALIBRATION } from './calibration';
import { XM_PACK_SCALE } from './xmCalibration';
import { voiceOf, type Voice } from './sampled';
import { drumSamples, instrument, zoneFor, type SampledInst, type Zone } from './sampler';
import type { XmInstrument, XmSample } from './xm';

export const XM_RATE = 32000;
const REF = 8363;

/** 讓取樣在「音高 = 它的實際音高」時，以原始取樣率播放所需的相對音符與微調 */
export function relFor(rate: number, rootMidi: number): { rel: number; ft: number } {
  const x = 12 * Math.log2(rate / REF) + 60 - rootMidi;
  const rel = Math.round(x);
  return { rel, ft: clamp(Math.round((x - rel) * 128), -128, 127) };
}

function resample(src: Float32Array, from: number, to: number, outLen?: number): Float32Array {
  if (from <= to) return src;
  const k = from / to;
  // 先用加窗 sinc 低通（截止在新取樣率的 Nyquist 之下），不然高頻會折疊回來變成金屬般的雜音
  const taps = 31;
  const half = (taps - 1) / 2;
  const fc = 0.46 / k;
  const h = new Float32Array(taps);
  let sum = 0;
  for (let i = 0; i < taps; i++) {
    const m = i - half;
    const sinc = m === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * m) / (Math.PI * m);
    h[i] = sinc * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (taps - 1)));
    sum += h[i];
  }
  for (let i = 0; i < taps; i++) h[i] /= sum;
  const f = new Float32Array(src.length);
  const last = src.length - 1;
  for (let i = 0; i < src.length; i++) {
    let acc = 0;
    for (let j = 0; j < taps; j++) acc += h[j] * src[Math.min(last, Math.max(0, i + j - half))];
    f[i] = acc;
  }
  const n = outLen ?? Math.floor(src.length / k);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = i * k;
    const i0 = Math.floor(x);
    const fr = x - i0;
    out[i] = f[i0] * (1 - fr) + (f[Math.min(last, i0 + 1)] ?? 0) * fr;
  }
  return out;
}

function toInt16(x: Float32Array): Int16Array {
  const o = new Int16Array(x.length);
  for (let i = 0; i < x.length; i++) o[i] = Math.max(-32767, Math.min(32767, Math.round(x[i] * 32767)));
  return o;
}

/** MIDI 方案在播放時做的音色處理（固定暗化、失真）；XM 沒有這些效果，要預先烘焙進取樣 */
interface Bake {
  dark?: number;
  drive?: number;
  /** 失真前的輸入增益（對應 MIDI 方案的 gain × 0.85） */
  amp: number;
}

function bakeData(d: Float32Array, b?: Bake): Float32Array {
  if (!b || (!b.dark && !b.drive)) return d;
  const o = new Float32Array(d.length);
  let lp = 0;
  const norm = b.drive ? 1 / Math.tanh(b.drive * 0.6) : 1;
  for (let i = 0; i < d.length; i++) {
    let x = d[i];
    if (b.dark) {
      lp += Math.min(b.dark, 0.995) * (x - lp);
      x = lp;
    }
    if (b.drive) x = Math.tanh(x * b.amp * b.drive * 2.4) * norm * 0.5;
    o[i] = x;
  }
  return o;
}

interface Opts {
  bake?: Bake;
  sus: boolean;
  maxSec: number;
  pan: number;
  volume: number;
  name: string;
}

/** 一個音區 → 一個 XM 取樣 */
function zoneToSample(z: Zone, o: Opts): XmSample {
  const zdata = bakeData(z.data, o.bake);
  let seg: Float32Array;
  let loop: [number, number] | null = null;
  if (o.sus && z.loop) {
    // 持續音：直接用取樣包建置時做好、驗證過的無縫循環（從頭取到循環終點），不要自己重做接縫——
    // 重取一段再做交叉淡化，兩端波形不會剛好同相，每循環一次就會凹或凸一下（約每 0.3 秒一次的嗡嗡聲）
    seg = zdata.slice(0, z.loop[1]);
    loop = z.loop;
  } else {
    let n = Math.min(z.len, Math.round(o.maxSec * z.rate));
    // 衰減音的尾巴常常已經是靜音（−48 dB 以下），切掉可以省很多空間
    let peak = 0;
    for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(zdata[i]));
    let last = n - 1;
    while (last > 0 && Math.abs(zdata[last]) < peak * 0.004) last--;
    n = Math.max(Math.round(0.2 * z.rate), Math.min(n, last + Math.round(0.1 * z.rate)));
    seg = zdata.slice(0, n);
    if (n < z.len) {
      const fade = Math.min(n, Math.round(0.12 * z.rate));
      for (let i = 0; i < fade; i++) seg[n - 1 - i] *= i / fade;
    }
  }
  // 低音區沒有高頻，用低取樣率就夠（省空間）；高音區才需要完整的 32 kHz
  let rate = Math.min(z.rate, z.root < 55 ? 16000 : z.root < 67 ? 24000 : XM_RATE);
  let ls = 0;
  let ll = 0;
  let data: Int16Array;
  if (loop && rate < z.rate) {
    // 微調取樣率（變動小於 0.01%），讓原本的循環長度剛好對應整數個樣本；音高由 relFor 依實際取樣率補回
    const Ls = loop[1] - loop[0];
    ll = Math.max(2, Math.round((Ls * rate) / z.rate));
    rate = (ll * z.rate) / Ls;
    ls = Math.round((loop[0] * rate) / z.rate);
    data = toInt16(resample(seg, z.rate, rate, ls + ll));
  } else {
    data = toInt16(resample(seg, z.rate, rate));
    if (loop) {
      ls = loop[0];
      ll = Math.min(data.length - ls, loop[1] - loop[0]);
    }
  }
  const { rel, ft } = relFor(rate, z.root);
  return {
    name: o.name.slice(0, 22),
    data,
    bits: 16,
    loopStart: ls,
    loopLen: ll,
    loopType: loop ? 1 : 0,
    volume: o.volume,
    finetune: ft,
    relNote: rel,
    pan: Math.round(128 + clamp(o.pan, -1, 1) * 100),
  };
}

/** 依發音／釋放時間組出音量包絡（XM 的 tick 單位） */
function envelope(v: Voice, bpm: number): { pts: [number, number][]; sustain: number } {
  const tick = 2.5 / bpm;
  const rel = clamp(Math.round(v.rel / tick), 2, 80);
  const att = Math.round(v.att / tick);
  if (att >= 2) return { pts: [[0, 0], [att, 64], [att + 1, 64], [att + 1 + rel, 0]], sustain: 2 };
  return { pts: [[0, 64], [1, 64], [1 + rel, 0]], sustain: 1 };
}

/** 這個音色號在 XM 裡的相對音量（0–64），與 MIDI 方案的 gain 對齊 */
export function packVolume(p: number): number {
  const v = voiceOf(p);
  const res = (globalThis as { __noXmCal?: boolean }).__noXmCal ? 1 : (XM_PACK_SCALE[p] ?? 1);
  return v ? clamp(Math.round(42 * (v.drive ? 0.56 : v.gain / 2.1) * (CALIBRATION[p] ?? 1) * res), 8, 64) : 40;
}

export interface PackSet {
  /** 這個音色號在 XM 裡用到的樂器（每個最多 16 個取樣，XM 的上限） */
  insts: XmInstrument[];
  /** 某個音高（MIDI 號）要用上面第幾個樂器 */
  pick: (midi: number) => number;
}

/**
 * 以取樣包的真實樂器建立 XM 樂器：**每個音都用離它最近的取樣**，而且只放這首歌用得到的音區。
 * 以前每個樂器只挑 8–10 個音區（XM 一個樂器最多 16 個取樣），音被拉伸得比較遠；
 * 現在音區放不下時，就拆成好幾個 XM 樂器，轉換時依每個音的音高決定用哪一個（XM 每個音符本來就可以指定樂器）。
 * 樂器還沒載入或沒有對應時回傳 null（呼叫端改用合成取樣）。
 */
export function packInstrumentSet(program: number, bpm: number, pan: number, pitches: Iterable<number>): PackSet | null {
  const v = voiceOf(program);
  if (!v) return null;
  const insts = v.ids.map(instrument);
  if (insts.some((x) => !x)) return null;
  const list = insts as SampledInst[];
  const bake: Bake | undefined = v.dark || v.drive ? { dark: v.dark, drive: v.drive, amp: v.gain * 0.85 } : undefined;
  const whichOf = (midi: number) => {
    // 合奏樂器：低音區用最後一個樂器，高音區用第一個；三個時中段用中間的
    if (list.length === 2) return midi < 54 ? 1 : 0;
    if (list.length === 3) return midi < 48 ? 1 : midi < 60 ? 2 : 0;
    return 0;
  };
  const zoneOf = new Map<number, { z: Zone; ch: number }>();
  const used = new Map<Zone, number>();
  const want = [...new Set([...pitches].map((p) => clamp(Math.round(p), 12, 107)))].sort((x, y) => x - y);
  for (const midi of want) {
    const ch = whichOf(midi);
    const z = zoneFor(list[ch], midi);
    zoneOf.set(midi, { z, ch });
    used.set(z, ch);
  }
  // 依（樂器、根音）排序後，每 16 個取樣一個 XM 樂器
  const zones = [...used.entries()].sort((a, b) => a[1] - b[1] || a[0].root - b[0].root);
  const groups: [Zone, number][][] = [];
  for (let i = 0; i < zones.length; i += 16) groups.push(zones.slice(i, i + 16));
  if (!groups.length) groups.push([]);
  const env = envelope(v, bpm);
  const groupOfZone = new Map<Zone, number>();
  const out: XmInstrument[] = groups.map((g, gi) => {
    const samples: XmSample[] = g.map(([z, ch]) => {
      groupOfZone.set(z, gi);
      const inst = list[ch];
      return zoneToSample(z, { sus: inst.sus, maxSec: inst.id === 'piano' ? 1.9 : 1.6, pan, volume: 64, name: `${inst.id} ${Math.round(z.root)}`, bake });
    });
    // 沒在這首歌用到的音符，就對到這個樂器裡最近的取樣
    const keymap = new Uint8Array(96);
    for (let i = 0; i < 96; i++) {
      const midi = i + 12;
      const hit = zoneOf.get(midi);
      let idx = hit ? g.findIndex(([z]) => z === hit.z) : -1;
      if (idx < 0 && g.length) {
        let best = 0;
        let bd = Infinity;
        g.forEach(([z], k) => {
          const d = Math.abs(z.root - midi);
          if (d < bd) {
            bd = d;
            best = k;
          }
        });
        idx = best;
      }
      keymap[i] = Math.max(0, idx);
    }
    const label = gi === 0 && groups.length === 1 ? v.ids.join('+') : `${v.ids.join('+')} ${gi + 1}`;
    return { name: label.slice(0, 22), samples, keymap, envOn: true, envPts: env.pts, envSustain: env.sustain, fadeout: 0 };
  });
  return {
    insts: out,
    pick: (midi) => {
      const hit = zoneOf.get(clamp(Math.round(midi), 12, 107));
      if (hit) return groupOfZone.get(hit.z) ?? 0;
      // 沒有預先登記的音高（不應該發生）：用最近的已登記音高
      let best = want[0] ?? 60;
      for (const w of want) if (Math.abs(w - midi) < Math.abs(best - midi)) best = w;
      const h2 = zoneOf.get(best);
      return h2 ? (groupOfZone.get(h2.z) ?? 0) : 0;
    },
  };
}

/** 取樣鼓在 XM 裡的取樣增益：旋律取樣的音量要靠 MIDI 方案的 ×1.8 才到位，XM 沒有那個空間（音量上限 64），所以改把鼓降下來 */
export const DRUM_SAMPLE_SCALE = 0.3;

/** 取樣鼓 → XM 樂器（單一取樣；音高變化用觸發的音符高低）。tau：額外的指數衰減（秒），與 MIDI 方案一致 */
export function packDrumInstrument(id: string, pan: number, tau?: number): XmInstrument | null {
  const bank = drumSamples();
  const d = bank?.[id];
  if (!d) return null;
  // 鼓的能量集中在高頻，維持原取樣率；只有長度不同的樂器（持續很久的鈸）才會讓檔案變大
  const src = new Float32Array(d.data.length);
  for (let i = 0; i < src.length; i++) src[i] = d.data[i] * DRUM_SAMPLE_SCALE * (tau ? Math.exp(-i / d.rate / tau) : 1);
  const data = toInt16(src);
  const { rel, ft } = relFor(d.rate, 60);
  const sm: XmSample = { name: `drum ${id}`.slice(0, 22), data, bits: 16, loopStart: 0, loopLen: 0, loopType: 0, volume: 64, finetune: ft, relNote: rel, pan: Math.round(128 + clamp(pan, -1, 1) * 100) };
  return { name: `drum ${id}`.slice(0, 22), samples: [sm], keymap: new Uint8Array(96), envOn: false, envPts: [], envSustain: 0, fadeout: 0 };
}
