// 把取樣包裡的真實樂器轉成 XM 樂器：16 位元取樣、每個樂器最多 16 個取樣（依音高分區）、持續音保留循環。
// 為了讓 .xm 檔不要過大，取樣率降到 22.05 kHz、持續音只留「起音 + 一小段循環」、衰減音限制長度。
import { clamp } from '../engine/util';
import { CALIBRATION } from './calibration';
import { voiceOf, type Voice } from './sampled';
import { drumSamples, instrument, zoneFor, type SampledInst, type Zone } from './sampler';
import type { XmInstrument, XmSample } from './xm';

export const XM_RATE = 22050;
const REF = 8363;

/** 讓取樣在「音高 = 它的實際音高」時，以原始取樣率播放所需的相對音符與微調 */
export function relFor(rate: number, rootMidi: number): { rel: number; ft: number } {
  const x = 12 * Math.log2(rate / REF) + 60 - rootMidi;
  const rel = Math.round(x);
  return { rel, ft: clamp(Math.round((x - rel) * 128), -128, 127) };
}

function resample(src: Float32Array, from: number, to: number): Float32Array {
  if (from <= to) return src;
  const k = from / to;
  // 先做一次簡單的低通，降低混疊
  const f = new Float32Array(src.length);
  for (let i = 0; i < src.length; i++) f[i] = 0.25 * (src[Math.max(0, i - 1)] + src[Math.min(src.length - 1, i + 1)]) + 0.5 * src[i];
  const n = Math.floor(src.length / k);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = i * k;
    const i0 = Math.floor(x);
    const fr = x - i0;
    out[i] = f[i0] * (1 - fr) + (f[Math.min(src.length - 1, i0 + 1)] ?? 0) * fr;
  }
  return out;
}

function toInt16(x: Float32Array): Int16Array {
  const o = new Int16Array(x.length);
  for (let i = 0; i < x.length; i++) o[i] = Math.max(-32767, Math.min(32767, Math.round(x[i] * 32767)));
  return o;
}

interface Opts {
  sus: boolean;
  maxSec: number;
  pan: number;
  volume: number;
  name: string;
}

/** 一個音區 → 一個 XM 取樣 */
function zoneToSample(z: Zone, o: Opts): XmSample {
  let seg: Float32Array;
  let loop: [number, number] | null = null;
  if (o.sus && z.loop) {
    // 持續音：起音後 0.5 秒開始取一段循環（長度沿用建置時算好的整數個週期），在尾端重新烘焙交叉淡化
    const L = z.loop[1] - z.loop[0];
    const start = Math.min(Math.round(0.5 * z.rate), z.loop[0]);
    seg = z.data.slice(0, start + L);
    const xf = Math.min(Math.round(0.06 * z.rate), Math.floor(L / 2));
    for (let j = 0; j < xf; j++) {
      const w = j / xf;
      const idx = seg.length - xf + j;
      seg[idx] = seg[idx] * Math.cos((w * Math.PI) / 2) + seg[idx - L] * Math.sin((w * Math.PI) / 2);
    }
    loop = [start, start + L];
  } else {
    const n = Math.min(z.len, Math.round(o.maxSec * z.rate));
    seg = z.data.slice(0, n);
    if (n < z.len) {
      const fade = Math.round(0.12 * z.rate);
      for (let i = 0; i < fade; i++) seg[n - 1 - i] *= i / fade;
    }
  }
  const rate = Math.min(z.rate, XM_RATE);
  const k = z.rate / rate;
  const data = toInt16(resample(seg, z.rate, rate));
  const { rel, ft } = relFor(rate, z.root);
  const ls = loop ? Math.round(loop[0] / k) : 0;
  const ll = loop ? Math.min(data.length - ls, Math.round((loop[1] - loop[0]) / k)) : 0;
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

const pickEvenly = <T>(arr: T[], max: number): T[] => {
  if (arr.length <= max) return arr;
  const out: T[] = [];
  for (let i = 0; i < max; i++) out.push(arr[Math.round((i * (arr.length - 1)) / (max - 1))]);
  return out;
};

/** 這個音色號在 XM 裡的相對音量（0–64），與 MIDI 方案的 gain 對齊 */
export function packVolume(p: number): number {
  const v = voiceOf(p);
  return v ? clamp(Math.round(42 * (v.gain / 2.1) * (CALIBRATION[p] ?? 1)), 8, 64) : 40;
}

/** 以取樣包的真實樂器建立 XM 樂器；樂器還沒載入或沒有對應時回傳 null（呼叫端改用合成取樣） */
export function packInstrument(program: number, bpm: number, pan: number): XmInstrument | null {
  const v = voiceOf(program);
  if (!v) return null;
  const insts = v.ids.map(instrument);
  if (insts.some((x) => !x)) return null;
  const list = insts as SampledInst[];
  // 每個音高由哪個樂器的哪個音區負責
  const maxZones = list.length > 1 ? 5 : list[0].zones.length > 14 ? 8 : 10;
  const chosen = list.map((inst) => ({ inst, zones: pickEvenly(inst.zones, maxZones) }));
  const samples: XmSample[] = [];
  const keymap = new Uint8Array(96);
  const cache = new Map<Zone, number>();
  for (let i = 0; i < 96; i++) {
    const midi = i + 12;
    // 合奏樂器：低音區用最後一個樂器，高音區用第一個；三個時中段用中間的
    let which = 0;
    if (list.length === 2) which = midi < 54 ? 1 : 0;
    else if (list.length === 3) which = midi < 48 ? 1 : midi < 60 ? 2 : 0;
    const ch = chosen[which];
    const pseudo: SampledInst = { id: ch.inst.id, sus: ch.inst.sus, zones: ch.zones };
    const z = zoneFor(pseudo, midi);
    let idx = cache.get(z);
    if (idx === undefined) {
      idx = samples.length;
      if (idx >= 16) idx = 15;
      else {
        samples.push(zoneToSample(z, { sus: ch.inst.sus, maxSec: ch.inst.id === 'piano' ? 1.9 : 1.6, pan, volume: 64, name: `${ch.inst.id} ${Math.round(z.root)}` }));
        cache.set(z, idx);
      }
    }
    keymap[i] = idx;
  }
  const env = envelope(v, bpm);
  return { name: v.ids.join('+').slice(0, 22), samples, keymap, envOn: true, envPts: env.pts, envSustain: env.sustain, fadeout: 0 };
}

/** 取樣鼓 → XM 樂器（單一取樣；音高變化用觸發的音符高低） */
export function packDrumInstrument(id: string, pan: number): XmInstrument | null {
  const bank = drumSamples();
  const d = bank?.[id];
  if (!d) return null;
  const rate = Math.min(d.rate, XM_RATE);
  const data = toInt16(resample(d.data, d.rate, rate));
  const { rel, ft } = relFor(rate, 60);
  const sm: XmSample = { name: `drum ${id}`.slice(0, 22), data, bits: 16, loopStart: 0, loopLen: 0, loopType: 0, volume: 64, finetune: ft, relNote: rel, pan: Math.round(128 + clamp(pan, -1, 1) * 100) };
  return { name: `drum ${id}`.slice(0, 22), samples: [sm], keymap: new Uint8Array(96), envOn: false, envPts: [], envSustain: 0, fadeout: 0 };
}
