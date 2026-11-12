// 真實音效（2.0 β，F11b）：從 Freesound 下載的錄音，修剪前後的靜音、對齊音量後存成小的 WAV（單聲道 22.05 kHz 16 位元，base64）跟著專案走。
// 播放與混音時：有「換成真實音效」的種類，就用解碼後的檔案取代程式合成的那一個（engine.ts 的 sfxBuffer、mixdown.ts）。
// 下載與搜尋只有 start.bat 開時可以（要靠本機伺服器代抓，見 scripts/agent-bridge.ts 的 sfx-search／sfx-fetch）；存好的音效任何開法都能播。
import type { SfxKind } from './types';
import { SAMPLE_RATE } from './types';

export const STORE_SR = 22050;
/** 對齊到的峰值（和程式合成的音效差不多大聲） */
const TARGET_PEAK = 0.62;
/** 存起來的最長秒數（音效點用不到更長的） */
export const MAX_SFX_SEC = 4;

let real: Partial<Record<SfxKind, Float32Array>> = {};
let gains: Partial<Record<SfxKind, number>> = {};
let rev = 0;
export const realSfxRev = () => rev;
/** 目前生效的真實音效（取樣率 SAMPLE_RATE） */
export const realSfx = (kind: SfxKind): Float32Array | null => real[kind] ?? null;
/** 使用者對這種音效的音量微調（dB；對齊響度之後再加） */
export const realGainDb = (kind: SfxKind): number => gains[kind] ?? 0;

const decoded = new Map<string, Float32Array>();

/** store 同步過來：哪一種音效用哪一個檔 */
export function setRealSfx(map: Record<string, string>, sounds: { id: string; b64: string; gain?: number }[]) {
  const next: Partial<Record<SfxKind, Float32Array>> = {};
  const g: Partial<Record<SfxKind, number>> = {};
  for (const [kind, id] of Object.entries(map)) {
    const s = sounds.find((x) => x.id === id);
    if (!s) continue;
    let pcm = decoded.get(s.b64.slice(0, 64) + s.b64.length);
    if (!pcm) {
      try {
        pcm = upsample(decodeWav16(b64ToBytes(s.b64)), STORE_SR, SAMPLE_RATE);
      } catch {
        continue;
      }
      decoded.set(s.b64.slice(0, 64) + s.b64.length, pcm);
    }
    next[kind as SfxKind] = pcm;
    if (s.gain) g[kind as SfxKind] = s.gain;
  }
  real = next;
  gains = g;
  rev++;
}

export function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}

export function bytesToB64(u8: Uint8Array): string {
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < u8.length; i += CH) s += String.fromCharCode(...u8.subarray(i, i + CH));
  return btoa(s);
}

/** 單聲道 16 位元 WAV（只讀我們自己寫的格式） */
export function decodeWav16(u8: Uint8Array): Float32Array {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  if (dv.getUint32(0, false) !== 0x52494646) throw new Error('不是 WAV');
  let p = 12;
  while (p + 8 <= u8.length) {
    const id = dv.getUint32(p, false);
    const size = dv.getUint32(p + 4, true);
    if (id === 0x64617461) {
      const n = Math.floor(Math.min(size, u8.length - p - 8) / 2);
      const out = new Float32Array(n);
      for (let i = 0; i < n; i++) out[i] = dv.getInt16(p + 8 + i * 2, true) / 32768;
      return out;
    }
    p += 8 + size + (size & 1);
  }
  throw new Error('WAV 沒有資料');
}

export function encodeWav16(x: Float32Array, sr: number): Uint8Array {
  const n = x.length;
  const buf = new ArrayBuffer(44 + n * 2);
  const dv = new DataView(buf);
  const w = (o: number, s: string) => [...s].forEach((c, i) => dv.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF');
  dv.setUint32(4, 36 + n * 2, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, 1, true);
  dv.setUint32(24, sr, true);
  dv.setUint32(28, sr * 2, true);
  dv.setUint16(32, 2, true);
  dv.setUint16(34, 16, true);
  w(36, 'data');
  dv.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) dv.setInt16(44 + i * 2, Math.max(-32768, Math.min(32767, Math.round(x[i] * 32767))), true);
  return new Uint8Array(buf);
}

/** 「有聲部分」的 RMS（比峰值低 30 dB 以上的不算） */
function activeRms(x: Float32Array): number {
  let peak = 0;
  for (let i = 0; i < x.length; i++) peak = Math.max(peak, Math.abs(x[i]));
  const th = peak * 0.0316;
  let s = 0;
  let n = 0;
  for (let i = 0; i < x.length; i++)
    if (Math.abs(x[i]) > th) {
      s += x[i] * x[i];
      n++;
    }
  return n ? Math.sqrt(s / n) : 0;
}

const matched = new WeakMap<Float32Array, Map<string, Float32Array>>();
/**
 * 音量對齊：真實音效的「有聲部分」響度調到和它取代的那個合成音效一樣（倍率 0.25～4，峰值不超過 0.95）。
 * key 是音效包＋種類（換音效包時重算）
 */
export function levelMatched(real: Float32Array, synth: Float32Array, key: string, gainDb = 0): Float32Array {
  let m = matched.get(real);
  if (!m) matched.set(real, (m = new Map()));
  key = `${key}|${gainDb}`;
  const hit = m.get(key);
  if (hit) return hit;
  const rr = activeRms(real);
  const sr = activeRms(synth);
  let g = rr > 0 && sr > 0 ? Math.min(4, Math.max(0.25, sr / rr)) : 1;
  g *= Math.pow(10, gainDb / 20);
  let peak = 0;
  for (let i = 0; i < real.length; i++) peak = Math.max(peak, Math.abs(real[i]));
  // 峰值上限：使用者自己調大時放寬到 0.99（還是不削波）
  const cap = gainDb > 0 ? 0.99 : 0.95;
  if (peak * g > cap) g = cap / Math.max(1e-9, peak);
  const out = new Float32Array(real.length);
  for (let i = 0; i < real.length; i++) out[i] = real[i] * g;
  m.set(key, out);
  return out;
}

/** 線性插值改取樣率 */
export function upsample(x: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return x;
  const n = Math.round((x.length * to) / from);
  const out = new Float32Array(n);
  const k = from / to;
  for (let i = 0; i < n; i++) {
    const p = i * k;
    const i0 = Math.floor(p);
    const f = p - i0;
    out[i] = (x[i0] ?? 0) * (1 - f) + (x[Math.min(x.length - 1, i0 + 1)] ?? 0) * f;
  }
  return out;
}

/**
 * 自動選段（「只留第一下」）：x 是解碼後的單聲道、取樣率 sr。回傳秒數 [a, b]。
 * 1. 修剪前後的靜音（比峰值低 40 dB 的部分；開頭留 5 毫秒）
 * 2. 只留第一下（之後安靜 150 毫秒就結束）；最長 MAX_SFX_SEC 秒
 */
export function autoRange(x: Float32Array, sr: number): [number, number] {
  let peak = 1e-9;
  for (let i = 0; i < x.length; i++) peak = Math.max(peak, Math.abs(x[i]));
  const th = peak * 0.01;
  let a = 0;
  while (a < x.length && Math.abs(x[a]) < th) a++;
  let b = x.length - 1;
  while (b > a && Math.abs(x[b]) < th) b--;
  a = Math.max(0, a - Math.round(sr * 0.005));
  // 長的錄音常常是好幾下（例如連續丟枕頭 30 秒）：只留第一下——從開頭往後找，音量（50 毫秒的 RMS）掉到峰值的 −40 dB 以下
  // 而且持續 150 毫秒，就在那裡結束
  const win = Math.round(sr * 0.05);
  const quietNeed = Math.round(sr * 0.15);
  const floor = peak * 0.01;
  let quiet = 0;
  let acc = 0;
  for (let i = a; i < Math.min(b, a + Math.round(sr * MAX_SFX_SEC)); i++) {
    acc += x[i] * x[i] - (i - win >= a ? x[i - win] * x[i - win] : 0);
    if (i - a < Math.round(sr * 0.08)) continue;
    if (Math.sqrt(Math.max(0, acc) / win) < floor) {
      quiet++;
      if (quiet >= quietNeed) {
        b = i - quietNeed + Math.round(sr * 0.06);
        break;
      }
    } else quiet = 0;
  }
  b = Math.min(x.length, b + Math.round(sr * 0.04), a + Math.round(sr * MAX_SFX_SEC));
  return [a / sr, Math.max(a + 1, b) / sr];
}

/**
 * 切出 [a, b] 秒（最長 MAX_SFX_SEC）：開頭 3 毫秒淡入、結尾 30 毫秒淡出，峰值對齊到 TARGET_PEAK，轉成 22.05 kHz。
 * 使用者自己選片段（2.0 正式）與自動選段都走這裡
 */
export function cutSfx(x: Float32Array, sr: number, a: number, b: number): { pcm: Float32Array; dur: number } {
  const i0 = Math.max(0, Math.min(x.length - 1, Math.round(a * sr)));
  const i1 = Math.max(i0 + 1, Math.min(x.length, Math.round(b * sr), i0 + Math.round(sr * MAX_SFX_SEC)));
  const seg = x.slice(i0, i1);
  const fin = Math.min(seg.length, Math.round(sr * 0.003));
  for (let i = 0; i < fin; i++) seg[i] *= i / fin;
  const fade = Math.min(seg.length, Math.round(sr * 0.03));
  for (let i = 0; i < fade; i++) seg[seg.length - 1 - i] *= i / fade;
  let segPeak = 1e-9;
  for (let i = 0; i < seg.length; i++) segPeak = Math.max(segPeak, Math.abs(seg[i]));
  const g = TARGET_PEAK / segPeak;
  for (let i = 0; i < seg.length; i++) seg[i] *= g;
  const out = resampleDown(seg, sr, STORE_SR);
  return { pcm: out, dur: out.length / STORE_SR };
}

/** 整理一段下載的錄音：自動選段（只留第一下）＋切出來。range 是用了原始錄音的哪一段（秒） */
export function prepareSfx(x: Float32Array, sr: number): { pcm: Float32Array; dur: number; range: [number, number] } {
  const range = autoRange(x, sr);
  return { ...cutSfx(x, sr, range[0], range[1]), range };
}

/** 降取樣（先做簡單的低通避免疊頻） */
function resampleDown(x: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return x;
  if (from > to) {
    const k = Math.max(1, Math.round(from / to));
    const y = new Float32Array(x.length);
    let acc = 0;
    for (let i = 0; i < x.length; i++) {
      acc += x[i] - (i >= k ? x[i - k] : 0);
      y[i] = acc / k;
    }
    return upsample(y, from, to);
  }
  return upsample(x, from, to);
}

/** 用瀏覽器的解碼器把 MP3 轉成單聲道 PCM */
export async function decodeToMono(bytes: ArrayBuffer): Promise<{ x: Float32Array; sr: number }> {
  const Ctx = window.OfflineAudioContext;
  const ctx = new Ctx(1, 1, 44100);
  const buf = await ctx.decodeAudioData(bytes.slice(0));
  const x = new Float32Array(buf.length);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) x[i] += d[i] / buf.numberOfChannels;
  }
  return { x, sr: buf.sampleRate };
}
