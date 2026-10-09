// 取樣演奏：把 General MIDI 音色編號對應到取樣包裡的真實樂器，並提供取樣鼓組。
// 沒有取樣的音色（合成器、人聲、效果音…）仍由 gm.ts 的程式合成處理；取樣載入失敗時整首也會自動退回合成。
import type { Model } from './gm';
import { PACK_PROGRAM } from './pack/meta';
import { drumSamples, instrument, loadDrums, loadInstrument, samplerAvailable, zoneFor, type SampledInst } from './sampler';
import type { Song, TrackRole } from './types';

const TAU = Math.PI * 2;

export interface Voice {
  ids: string[];
  att: number;
  rel: number;
  gain: number;
  /** 顫音：[深度（比例）, 速度 Hz, 延遲秒] */
  vib?: [number, number, number];
  /** 力度越小越暗（單極低通），0 = 不處理 */
  vlp?: number;
  /** 固定的暗化（0–1，越小越暗） */
  dark?: number;
  drive?: number;
  /** 顫音弓（振幅調變） */
  trem?: number;
  /** 合奏：同時疊兩份略微失諧的拷貝 */
  ens?: boolean;
}

const BASE: Record<string, Omit<Voice, 'ids'>> = {
  piano: { att: 0.002, rel: 0.22, gain: 2.1, vlp: 1 },
  epiano: { att: 0.002, rel: 0.4, gain: 2.0, vlp: 1 },
  bass: { att: 0.003, rel: 0.12, gain: 1.45, vlp: 1 },
  nylon: { att: 0.002, rel: 0.2, gain: 2.1, vlp: 1 },
  steel: { att: 0.002, rel: 0.2, gain: 2.1, vlp: 1 },
  eguitar: { att: 0.002, rel: 0.16, gain: 2.1, vlp: 1 },
  harp: { att: 0.002, rel: 0.9, gain: 2.1 },
  organ: { att: 0.01, rel: 0.09, gain: 1.7 },
  harmonium: { att: 0.03, rel: 0.14, gain: 1.8 },
  violin: { att: 0.07, rel: 0.3, gain: 2.0, vib: [0.0075, 5.4, 0.28] },
  cello: { att: 0.08, rel: 0.32, gain: 2.1, vib: [0.005, 5.0, 0.35] },
  contrabass: { att: 0.05, rel: 0.2, gain: 2.2 },
  trumpet: { att: 0.03, rel: 0.12, gain: 2.0 },
  trombone: { att: 0.04, rel: 0.14, gain: 2.0 },
  tuba: { att: 0.04, rel: 0.14, gain: 2.1 },
  horn: { att: 0.05, rel: 0.22, gain: 2.0 },
  sax: { att: 0.035, rel: 0.14, gain: 2.0, vib: [0.005, 5.2, 0.35] },
  flute: { att: 0.05, rel: 0.14, gain: 2.1, vib: [0.0055, 5.3, 0.3] },
  clarinet: { att: 0.035, rel: 0.1, gain: 2.0 },
  bassoon: { att: 0.04, rel: 0.12, gain: 2.1 },
  xylophone: { att: 0.001, rel: 0.25, gain: 1.9 },
  marimba: { att: 0.001, rel: 0.5, gain: 2.0 },
  vibes: { att: 0.002, rel: 1.2, gain: 2.0 },
  glock: { att: 0.001, rel: 0.9, gain: 1.9 },
  kalimba: { att: 0.001, rel: 0.8, gain: 2.1 },
  bells: { att: 0.002, rel: 1.6, gain: 1.8 },
};

/** 特殊對應：覆寫取樣包預設的「音色號 → 樂器」 */
const SPECIAL: Record<number, Voice> = {
  28: { ids: ['eguitar'], att: 0.002, rel: 0.05, gain: 2.1, dark: 0.35 },
  29: { ids: ['eguitar'], att: 0.002, rel: 0.12, gain: 1.5, drive: 4, dark: 0.55 },
  30: { ids: ['eguitar'], att: 0.002, rel: 0.12, gain: 1.3, drive: 9, dark: 0.5 },
  31: { ids: ['eguitar'], att: 0.002, rel: 0.4, gain: 1.8 },
  32: { ids: ['bass'], att: 0.004, rel: 0.16, gain: 1.5, dark: 0.3 },
  41: { ids: ['violin'], att: 0.08, rel: 0.3, gain: 2.0, vib: [0.006, 5.2, 0.3] },
  44: { ids: ['violin'], att: 0.02, rel: 0.2, gain: 1.8, trem: 11 },
  48: { ids: ['violin', 'cello'], att: 0.12, rel: 0.4, gain: 1.6, ens: true, vib: [0.004, 5.0, 0.45] },
  49: { ids: ['violin', 'cello'], att: 0.3, rel: 0.55, gain: 1.5, ens: true },
  50: { ids: ['violin', 'cello'], att: 0.09, rel: 0.35, gain: 1.6, ens: true, vib: [0.004, 5.0, 0.4] },
  51: { ids: ['violin', 'cello'], att: 0.25, rel: 0.5, gain: 1.5, ens: true },
  61: { ids: ['trumpet', 'trombone', 'horn'], att: 0.04, rel: 0.15, gain: 1.5, ens: true },
  62: { ids: ['trumpet', 'trombone', 'horn'], att: 0.05, rel: 0.2, gain: 1.5, ens: true },
  63: { ids: ['trumpet', 'trombone', 'horn'], att: 0.06, rel: 0.25, gain: 1.4, ens: true },
  10: { ids: ['glock'], att: 0.001, rel: 0.7, gain: 1.6 },
  8: { ids: ['glock'], att: 0.001, rel: 0.8, gain: 1.6, dark: 0.7 },
};

/** 取樣音色已做響度校正，這裡只調整各聲部之間的相對大小（MIDI 與 XM 方案共用） */
export const ROLE_MIX: Record<TrackRole, number> = { lead: 1, counter: 0.85, arp: 0.8, bass: 0.75, pad: 0.9, chord: 0.7, perc: 1 };
/** 各聲部送進殘響的量（MIDI 與 XM 方案共用） */
export const SEND: Record<TrackRole, number> = { lead: 0.3, arp: 0.34, bass: 0.04, pad: 0.55, chord: 0.28, counter: 0.32, perc: 0.1 };

export function voiceOf(p: number): Voice | null {
  const sp = SPECIAL[p];
  if (sp) return sp;
  const id = PACK_PROGRAM[p];
  if (!id) return null;
  const b = BASE[id];
  return b ? { ids: [id], ...b } : null;
}

/** 這首歌需要哪些取樣樂器 */
export function neededInstruments(song: Song): string[] {
  const out = new Set<string>();
  for (const tr of song.tracks) {
    if (tr.drum) continue;
    const v = voiceOf(tr.program);
    if (v) for (const id of v.ids) out.add(id);
  }
  return [...out];
}

/** 把這首歌需要的取樣載入好；回傳是否可以使用取樣演奏 */
export async function ensureSamplesFor(song: Song): Promise<boolean> {
  if (!samplerAvailable()) return false;
  const ids = neededInstruments(song);
  const [, d] = await Promise.all([Promise.all(ids.map(loadInstrument)), song.tracks.some((t) => t.drum) ? loadDrums() : Promise.resolve(null)]);
  void d;
  return true;
}

function hermite(d: Float32Array, i: number, f: number): number {
  const y0 = d[i - 1] ?? d[i];
  const y1 = d[i];
  const y2 = d[i + 1];
  const y3 = d[i + 2];
  const c1 = 0.5 * (y2 - y0);
  const c2 = y0 - 2.5 * y1 + 2 * y2 - 0.5 * y3;
  const c3 = 0.5 * (y3 - y0) + 1.5 * (y1 - y2);
  return ((c3 * f + c2) * f + c1) * f + y1;
}

/** 把一個音區以指定音高疊加進 s（n 個輸出取樣） */
function playZone(s: Float32Array, n: number, sr: number, inst: SampledInst, f: number, amp: number, v: Voice, vel: number, detune: number) {
  const midi = 69 + 12 * Math.log2(f / 440);
  const z = zoneFor(inst, midi);
  const base = ((f * detune) / (440 * Math.pow(2, (z.root - 69) / 12))) * (z.rate / sr);
  const d = z.data;
  const loop = z.loop;
  const loopLen = loop ? loop[1] - loop[0] : 0;
  const end = z.len - 2;
  // 力度越小越暗；固定暗化
  let a = 1;
  if (v.vlp) a = 0.3 + 0.7 * Math.pow(vel, 0.6);
  if (v.dark) a = Math.min(a, v.dark);
  const useLp = a < 0.995;
  let lp = 0;
  let pos = 0;
  const vib = v.vib;
  for (let i = 0; i < n; i++) {
    if (loop) {
      if (pos >= loop[1]) pos -= loopLen;
    } else if (pos >= end) break;
    const ip = pos | 0;
    let x = hermite(d, ip, pos - ip) * amp;
    if (useLp) {
      lp += a * (x - lp);
      x = lp;
    }
    s[i] += x;
    let step = base;
    if (vib) {
      const t = i / sr;
      if (t > vib[2]) step *= 1 + vib[0] * Math.min(1, (t - vib[2]) / 0.4) * Math.sin(TAU * vib[1] * t);
    }
    pos += step;
  }
}

const modelCache = new Map<string, Model | null>();

/** 取得某個音色號的取樣模型；樂器還沒載入或沒有對應就回傳 null（呼叫端退回合成音色） */
export function sampledModel(p: number): Model | null {
  const v = voiceOf(p);
  if (!v) return null;
  const insts = v.ids.map(instrument);
  if (insts.some((x) => !x)) return null;
  const key = `${p}`;
  const hit = modelCache.get(key);
  if (hit) return hit;
  const list = insts as SampledInst[];
  const m: Model = {
    att: v.att,
    rel: v.rel,
    gain: 1,
    render({ s, n, sr, f, vel, dur }) {
      const midi = 69 + 12 * Math.log2(f / 440);
      const amp = v.gain * 0.85;
      if (v.ens && list.length > 1) {
        // 合奏：依音高在高音／低音樂器間過渡，並疊兩份略微失諧的拷貝
        const hi = list[0];
        const lo = list[list.length - 1];
        const mix = Math.min(1, Math.max(0, (midi - 52) / 10));
        const voices: [SampledInst, number][] = list.length === 3 ? (midi >= 60 ? [[list[0], 1], [list[2], 0.6]] : midi >= 48 ? [[list[2], 1], [list[1], 0.7]] : [[list[1], 1], [list[2], 0.6]]) : [[hi, mix], [lo, 1 - mix]];
        for (const [inst, w] of voices) {
          if (w <= 0.01) continue;
          playZone(s, n, sr, inst, f, (amp * w) / 1.4, v, vel, 0.9965);
          playZone(s, n, sr, inst, f, (amp * w) / 1.4, v, vel, 1.0035);
        }
      } else {
        playZone(s, n, sr, list[0], f, amp, v, vel, 1);
      }
      if (v.trem) {
        const w = (TAU * v.trem) / sr;
        for (let i = 0; i < n; i++) s[i] *= 0.55 + 0.45 * Math.sin(w * i) * Math.sin(w * i);
      }
      if (v.drive) {
        const k = v.drive;
        const norm = 1 / Math.tanh(k * 0.6);
        for (let i = 0; i < n; i++) s[i] = Math.tanh(s[i] * k * 2.4) * norm * 0.5;
      }
      void dur;
    },
  };
  modelCache.set(key, m);
  return m;
}

export function clearSampledCache() {
  modelCache.clear();
}

// ---------- 取樣鼓組 ----------
/** 鼓組風格：electronic 保留合成的踢／軍鼓／鈸（電子曲風），hybrid 只留合成踢鼓，acoustic 全部用取樣 */
export type Kit = 'acoustic' | 'hybrid' | 'electronic';

const TOM_SEMI: Record<number, number> = { 50: 0, 48: -2.5, 47: -4.5, 45: -6.5, 43: -9, 41: -11 };

export interface DrumPick {
  id: string;
  gain: number;
  semi?: number;
  /** 額外的指數衰減（秒），把過長的共鳴收緊 */
  tau?: number;
}

export function pickDrum(note: number, vel: number, kit: Kit, k: number): DrumPick | null {
  const eStyle = kit === 'electronic';
  switch (note) {
    case 35:
    case 36:
      return kit === 'acoustic' ? { id: vel > 0.85 ? 'kickHard' : 'kick', gain: 0.75, tau: 0.17 } : null;
    case 37:
      return { id: 'rim', gain: 0.6 };
    case 38:
    case 40:
      return eStyle ? null : { id: vel < 0.45 ? 'snareS' : vel < 0.8 ? 'snareM' : 'snareH', gain: 0.8 };
    case 39:
      return { id: k % 2 ? 'clap2' : 'clap', gain: 0.75 };
    case 42:
      return eStyle ? null : { id: k % 2 ? 'hatC2' : 'hatC', gain: 0.3 };
    case 44:
      return eStyle ? null : { id: 'hatP', gain: 0.3 };
    case 46:
      return eStyle ? null : { id: 'hatO', gain: 0.3 };
    case 41:
    case 43:
    case 45:
    case 47:
    case 48:
    case 50:
      return eStyle ? null : { id: 'tom', gain: 0.6, semi: TOM_SEMI[note], tau: 0.28 };
    case 49:
    case 57:
      return eStyle ? null : { id: 'crash', gain: 0.4 };
    case 51:
    case 59:
      return eStyle ? null : { id: 'ride', gain: 0.28 };
    case 53:
      return eStyle ? null : { id: 'rideBell', gain: 0.3 };
    case 54:
      return { id: 'tamb', gain: 0.22 };
    case 56:
      return { id: 'cowbell', gain: 0.45 };
    case 60:
    case 61:
      return { id: 'bongo', gain: 0.6, semi: note === 60 ? 0 : -4 };
    case 63:
    case 64:
      return { id: 'conga', gain: 0.5, tau: 0.25, semi: note === 63 ? 0 : -5 };
    case 69:
    case 70:
      return { id: 'shaker', gain: 0.18 };
    case 75:
    case 76:
    case 77:
      return { id: 'wood', gain: 0.5, semi: note === 75 ? 3 : note === 76 ? 0 : -3 };
    case 80:
    case 81:
      return { id: 'tri', gain: 0.35 };
    default:
      return null;
  }
}

/** 試著用取樣演奏一個鼓點；沒有對應或鼓取樣未載入時回傳 false（呼叫端改用合成鼓） */
export function sampledDrum(buf: Float32Array, sr: number, start: number, note: number, vel: number, kit: Kit, counter: number): boolean {
  const bank = drumSamples();
  if (!bank) return false;
  const pk = pickDrum(note, vel, kit, counter);
  if (!pk) return false;
  const smp = bank[pk.id];
  if (!smp) return false;
  const ratio = (smp.rate / sr) * Math.pow(2, (pk.semi ?? 0) / 12);
  const amp = pk.gain * (0.35 + 0.65 * vel) * 0.95;
  const d = smp.data;
  const lim = d.length - 3;
  let pos = 0;
  const dec = pk.tau ? Math.exp(-1 / (pk.tau * sr)) : 1;
  let env = 1;
  for (let i = start; i < buf.length && pos < lim; i++) {
    const ip = pos | 0;
    buf[i] += hermite(d, ip, pos - ip) * amp * env;
    pos += ratio;
    env *= dec;
  }
  return true;
}

export { loadDrums, loadInstrument };
