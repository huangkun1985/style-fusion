// 匯入 MIDI：把使用者自己的 .mid 檔解析成「歌曲資料」（Song），之後可以用任何聲音方案演奏
// （8-bit NES、Game Boy、C64 SID、Mega Drive FM、MIDI 取樣樂器、XM 追蹤器），也能導出 WAV、MIDI、XM。
// 檔案只在瀏覽器本機處理，不內建、不上傳；小的檔案會存在這個瀏覽器的 localStorage，下次打開還在。
import * as tonejs from '@tonejs/midi';
import { clamp } from '../engine/util';
import { safeStorage } from '../lib/platform';
import { MODE_NAME, type Mode } from './theory';
import { NOTE_NAMES, type ChordInfo, type NoteEv, type Song, type Track, type TrackRole } from './types';

type MidiCtor = typeof import('@tonejs/midi').Midi;
// 在瀏覽器（ESM）與 Node（tsx 載入 CJS）兩種環境都要能取到 Midi 類別
const MidiCls: MidiCtor = (tonejs as unknown as { Midi?: MidiCtor }).Midi ?? (tonejs as unknown as { default: { Midi: MidiCtor } }).default.Midi;

/** 預設一次取多少小節（整首太長，渲染與 XM 都會很大）；使用者可以自己選段落 */
export const DEFAULT_BARS = 48;
export const MAX_BARS = 128;
const MAX_TRACKS = 14;
const PERSIST_LIMIT = 300 * 1024;
const STORE_KEY = 'sf-midi-v1';

export interface ImportedNote {
  /** 起點（16 分音符步數，以檔案的平均速度換算，可含小數） */
  t: number;
  dur: number;
  pitch: number;
  vel: number;
}

export interface ImportedTrack {
  id: string;
  name: string;
  role: TrackRole;
  program: number;
  drum: boolean;
  pan: number;
  /** 軌道音量（CC7）0–1 */
  vol: number;
  notes: ImportedNote[];
}

export interface ImportedMidi {
  /** 每次匯入遞增，用來判斷「是不是同一份檔案」 */
  rev: number;
  name: string;
  /** 平均速度（BPM） */
  bpm: number;
  tempoChanges: number;
  meter: 3 | 4;
  /** 全曲長度（步數） */
  totalSteps: number;
  bars: number;
  key: number;
  mode: Mode;
  tracks: ImportedTrack[];
  /** 原檔有幾個有音符的軌道、因為太多而捨棄了幾個 */
  sourceTracks: number;
  droppedTracks: number;
  /** 檔案是否已存進瀏覽器（太大的不存） */
  persisted: boolean;
}

// ---------- GM 鼓號整理成程式支援的那一組 ----------
export function mapDrum(n: number): number {
  switch (n) {
    case 35:
      return 36;
    case 40:
      return 38;
    case 52:
    case 55:
      return 49;
    case 53:
    case 59:
      return 51;
    case 58:
    case 67:
    case 68:
      return 56;
    case 62:
      return 63;
    case 65:
    case 66:
      return 61;
    case 71:
    case 72:
      return 81;
    case 73:
    case 74:
      return 70;
    case 78:
    case 79:
      return 76;
    default:
      return n;
  }
}
const KNOWN_DRUMS = new Set([36, 37, 38, 39, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 54, 56, 57, 60, 61, 63, 64, 69, 70, 75, 76, 77, 80, 81]);
const drumPitch = (n: number) => {
  const m = mapDrum(n);
  return KNOWN_DRUMS.has(m) ? m : m < 40 ? 36 : 70;
};

const foldPitch = (p: number) => {
  let q = Math.round(p);
  while (q < 24) q += 12;
  while (q > 108) q -= 12;
  return q;
};

// ---------- 調性偵測（Krumhansl–Schmuckler 音級輪廓） ----------
const MAJ_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MIN_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function corr(a: number[], b: number[]): number {
  const n = a.length;
  const ma = a.reduce((s, x) => s + x, 0) / n;
  const mb = b.reduce((s, x) => s + x, 0) / n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

export function detectKey(tracks: { drum: boolean; notes: { pitch: number; dur: number }[] }[]): { key: number; mode: Mode } {
  const hist = new Array(12).fill(0);
  for (const t of tracks) if (!t.drum) for (const n of t.notes) hist[((n.pitch % 12) + 12) % 12] += Math.min(n.dur, 16);
  let best = { key: 0, mode: 'major' as Mode, r: -2 };
  for (let k = 0; k < 12; k++) {
    const rot = hist.map((_, i) => hist[(i + k) % 12]);
    const rM = corr(rot, MAJ_PROFILE);
    const rm = corr(rot, MIN_PROFILE);
    if (rM > best.r) best = { key: k, mode: 'major', r: rM };
    if (rm > best.r) best = { key: k, mode: 'minor', r: rm };
  }
  return { key: best.key, mode: best.mode };
}

// ---------- 軌道角色 ----------
interface Stat {
  mean: number;
  poly: number;
  avgDur: number;
  cover: number;
}

function statOf(notes: ImportedNote[], total: number): Stat {
  if (!notes.length) return { mean: 60, poly: 1, avgDur: 1, cover: 0 };
  const sorted = [...notes].sort((a, b) => a.t - b.t);
  let active: number[] = [];
  let polySum = 0;
  let meanSum = 0;
  let durSum = 0;
  for (const n of sorted) {
    active = active.filter((e) => e > n.t + 1e-6);
    polySum += active.length + 1;
    active.push(n.t + n.dur);
    meanSum += n.pitch;
    durSum += n.dur;
  }
  return { mean: meanSum / sorted.length, poly: polySum / sorted.length, avgDur: durSum / sorted.length, cover: durSum / Math.max(1, total) };
}

const ROLE_GAIN: Record<TrackRole, number> = { lead: 0.95, counter: 0.7, arp: 0.62, bass: 0.95, pad: 0.55, chord: 0.7, perc: 1 };

/** 依音高、同時發聲數、音長與 GM 音色，替每個旋律軌道猜它在編曲裡的角色（決定 8-bit 的聲道、混音比例與殘響） */
export function assignRoles(tracks: { program: number; notes: ImportedNote[] }[], total: number): TrackRole[] {
  const stats = tracks.map((t) => statOf(t.notes, total));
  const roles: (TrackRole | null)[] = tracks.map((t, i) => {
    const s = stats[i];
    const bassProg = t.program >= 32 && t.program <= 39;
    if ((bassProg && s.mean < 66) || (s.mean < 50 && s.poly < 1.7)) return 'bass';
    if (s.poly >= 2.0) return s.avgDur >= 8 ? 'pad' : 'chord';
    return null;
  });
  // 剩下的單音軌道：覆蓋率高又偏高音的是主旋律，其餘依音長分成琶音或和聲
  const mono = roles.map((r, i) => (r === null ? i : -1)).filter((i) => i >= 0);
  if (mono.length) {
    const score = (i: number) => (stats[i].cover + 0.05) * (0.4 + stats[i].mean / 80);
    const lead = mono.reduce((a, b) => (score(b) > score(a) ? b : a));
    for (const i of mono) roles[i] = i === lead ? 'lead' : stats[i].avgDur <= 2.5 ? 'arp' : 'counter';
  } else if (!roles.includes('lead')) {
    // 全是和弦軌（例如一個鋼琴軌）：音高最高的當主旋律
    const poly = roles.map((r, i) => (r === 'chord' || r === 'pad' ? i : -1)).filter((i) => i >= 0);
    if (poly.length) roles[poly.reduce((a, b) => (stats[b].mean > stats[a].mean ? b : a))] = 'lead';
  }
  return roles.map((r) => r ?? 'counter');
}

// ---------- 解析 ----------
let counter = 0;

export function parseMidiFile(bytes: ArrayBuffer | Uint8Array, name: string): ImportedMidi {
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let midi: InstanceType<MidiCtor>;
  try {
    midi = new MidiCls(buf);
  } catch {
    throw new Error('這不是有效的 MIDI 檔');
  }
  let endSec = 0;
  let endTicks = 0;
  for (const tr of midi.tracks)
    for (const n of tr.notes) {
      endSec = Math.max(endSec, n.time + n.duration);
      endTicks = Math.max(endTicks, n.ticks + n.durationTicks);
    }
  if (!(endSec > 0)) throw new Error('這個 MIDI 檔裡沒有音符');
  const ppq = midi.header.ppq || 480;
  // 平均速度：用實際時間換算步數，有變速的檔案也能保留原本的時間感
  const bpm = clamp((endTicks / ppq) * (60 / endSec), 30, 300);
  const k = bpm / 15;
  const sig = midi.header.timeSignatures[0]?.timeSignature;
  const meter: 3 | 4 = sig && (sig[0] === 3 || (sig[1] === 8 && sig[0] === 6)) ? 3 : 4;

  const drums: ImportedNote[] = [];
  const raw: { name: string; program: number; pan: number; vol: number; notes: ImportedNote[] }[] = [];
  for (const tr of midi.tracks) {
    if (!tr.notes.length) continue;
    if (tr.instrument.percussion) {
      for (const n of tr.notes) drums.push({ t: n.time * k, dur: 1, pitch: drumPitch(n.midi), vel: clamp(n.velocity, 0.08, 1) });
      continue;
    }
    const cc = (num: number) => tr.controlChanges?.[num]?.[0]?.value;
    const notes = tr.notes.map((n) => ({ t: n.time * k, dur: Math.max(0.25, n.duration * k), pitch: foldPitch(n.midi), vel: clamp(n.velocity, 0.08, 1) }));
    raw.push({ name: tr.name || tr.instrument.name || '', program: clamp(tr.instrument.number, 0, 127), pan: clamp(((cc(10) ?? 0.5) - 0.5) * 1.8, -0.9, 0.9), vol: clamp(cc(7) ?? 1, 0, 1), notes });
  }
  if (!raw.length && !drums.length) throw new Error('這個 MIDI 檔裡沒有可用的音軌');
  // 軌道太多時，留下音符最多的
  raw.sort((a, b) => b.notes.length - a.notes.length);
  const kept = raw.slice(0, MAX_TRACKS);
  const droppedTracks = raw.length - kept.length;
  let total = 0;
  for (const t of [...kept, { notes: drums }]) for (const n of t.notes) total = Math.max(total, n.t + n.dur);
  total = Math.max(total, 1);
  const roles = assignRoles(kept, total);
  const used = new Map<string, number>();
  const tracks: ImportedTrack[] = kept.map((t, i) => {
    const role = roles[i];
    const c = (used.get(role) ?? 0) + 1;
    used.set(role, c);
    return { id: c === 1 ? role : `${role}${c}`, name: t.name, role, program: t.program, drum: false, pan: t.pan, vol: t.vol, notes: t.notes.sort((a, b) => a.t - b.t) };
  });
  if (drums.length) tracks.push({ id: 'drums', name: '鼓', role: 'perc', program: 0, drum: true, pan: 0, vol: 1, notes: drums.sort((a, b) => a.t - b.t) });
  const spb = meter === 3 ? 12 : 16;
  const { key, mode } = detectKey(tracks);
  const imp: ImportedMidi = {
    rev: ++counter,
    name: name.replace(/\.(mid|midi|kar)$/i, '') || '匯入的 MIDI',
    bpm,
    tempoChanges: midi.header.tempos.length,
    meter,
    totalSteps: Math.ceil(total),
    bars: Math.max(1, Math.ceil(total / spb)),
    key,
    mode,
    tracks,
    sourceTracks: raw.length + (drums.length ? 1 : 0),
    droppedTracks,
    persisted: false,
  };
  return imp;
}

// ---------- 目前匯入的檔案（模組內的單一狀態，小檔案會存進瀏覽器） ----------
let current: ImportedMidi | null = null;

export const getImportedMidi = () => current;
export const hasImportedMidi = () => current !== null;

function toB64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function setImportedMidi(bytes: ArrayBuffer | Uint8Array, name: string): ImportedMidi {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const imp = parseMidiFile(u8, name);
  current = imp;
  if (u8.length <= PERSIST_LIMIT) {
    safeStorage.setItem(STORE_KEY, JSON.stringify({ name, b64: toB64(u8) }));
    imp.persisted = safeStorage.getItem(STORE_KEY) !== null;
  } else safeStorage.removeItem(STORE_KEY);
  return imp;
}

export function clearImportedMidi() {
  current = null;
  safeStorage.removeItem(STORE_KEY);
}

// 啟動時還原上次匯入的檔案（要在 store 建立之前完成，儲存的偏好才認得 'import'）
try {
  const saved = safeStorage.getItem(STORE_KEY);
  if (saved) {
    const o = JSON.parse(saved) as { name: string; b64: string };
    const bin = atob(o.b64);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    current = parseMidiFile(u8, o.name);
    current.persisted = true;
  }
} catch {
  /* 存的資料壞了：當作沒有 */
}

// ---------- 和弦偵測（只用來在鋼琴捲簾上標示，不影響發聲） ----------
const TPL: [string, number[]][] = [
  ['', [0, 4, 7]],
  ['m', [0, 3, 7]],
  ['7', [0, 4, 7, 10]],
  ['m7', [0, 3, 7, 10]],
  ['maj7', [0, 4, 7, 11]],
  ['dim', [0, 3, 6]],
  ['sus4', [0, 5, 7]],
];

function detectChords(tracks: Track[], spb: number, bars: number): ChordInfo[] {
  const pool = tracks.filter((t) => !t.drum && (t.role === 'bass' || t.role === 'chord' || t.role === 'pad'));
  const src = pool.length ? pool : tracks.filter((t) => !t.drum);
  const win = spb / 2;
  const out: ChordInfo[] = [];
  let prev = '';
  for (let w = 0; w < bars * 2; w++) {
    const a = w * win;
    const b = a + win;
    const wt = new Array(12).fill(0);
    let bassPc = -1;
    let bassW = 0;
    for (const t of src)
      for (const n of t.notes) {
        const ov = Math.min(b, n.t + n.dur) - Math.max(a, n.t);
        if (ov <= 0) continue;
        const pc = ((n.pitch % 12) + 12) % 12;
        wt[pc] += ov * (0.4 + n.vel);
        if (t.role === 'bass' && ov > bassW) {
          bassW = ov;
          bassPc = pc;
        }
      }
    const total = wt.reduce((s, x) => s + x, 0);
    if (total < 1e-6) continue;
    let best = { r: 0, q: '', iv: [0, 4, 7], s: -1e9, share: 0 };
    for (let r = 0; r < 12; r++)
      for (const [q, iv] of TPL) {
        const inSum = iv.reduce((s, i) => s + wt[(r + i) % 12], 0);
        const s = inSum - 0.6 * (total - inSum) + wt[r] * 0.4 + (r === bassPc ? total * 0.25 : 0) - (iv.length > 3 ? total * 0.04 : 0);
        if (s > best.s) best = { r, q, iv, s, share: inSum / total };
      }
    if (best.share < 0.55) continue;
    const label = `${NOTE_NAMES[best.r]}${best.q}`;
    if (label === prev) continue;
    prev = label;
    out.push({ bar: Math.floor(a / spb), step: a % spb, root: best.r, quality: best.q, notes: best.iv.map((i) => 48 + best.r + i), label });
  }
  return out;
}

// ---------- 轉成 Song ----------
export interface ImportOpts {
  animSeconds: number;
  sync: boolean;
  /** 速度倍率 */
  tempo: number;
  /** -1 自動，0–11 */
  key: number;
  /** 從第幾小節開始（0 起算）、取幾小節（0＝自動） */
  start: number;
  bars: number;
  preferLock?: boolean;
}

/** 整段剛好是動畫循環的整數倍：在原速附近找最接近的 k；找不到就不對齊 */
function planImportLoop(animSeconds: number, bars: number, meter: 3 | 4, target: number, sync: boolean, preferLock: boolean) {
  const beats = bars * meter;
  if (sync) {
    let best: { bpm: number; k: number; locked: boolean; score: number } | null = null;
    for (let k = 1; k <= 800; k++) {
      const len = k * animSeconds;
      if (len > 900) break;
      const bpm = (beats * 60) / len;
      if (bpm < target * 0.8 || bpm > target * 1.25 || bpm < 30 || bpm > 300) continue;
      const locked = beats % k === 0;
      const score = Math.abs(Math.log(bpm / target)) + (locked ? 0 : preferLock ? 0.5 : 0.02);
      if (!best || score < best.score) best = { bpm, k, locked, score };
    }
    if (best) return { bpm: best.bpm, animLoops: best.k, beatLocked: best.locked };
  }
  return { bpm: clamp(target, 30, 300), animLoops: 0, beatLocked: false };
}

export function songFromMidi(imp: ImportedMidi, o: ImportOpts): Song {
  const meter = imp.meter;
  const spb = meter === 3 ? 12 : 16;
  const totalBars = imp.bars;
  let start = clamp(Math.floor(o.start) || 0, 0, totalBars - 1);
  const want = o.bars > 0 ? o.bars : Math.min(DEFAULT_BARS, totalBars - start);
  let nBars = clamp(Math.floor(want), 1, Math.min(MAX_BARS, totalBars - start));

  const slice = (): Track[] => {
    const S0 = start * spb;
    const S1 = S0 + nBars * spb;
    const out: Track[] = [];
    for (const t of imp.tracks) {
      const notes: NoteEv[] = [];
      for (const n of t.notes) {
        if (n.t >= S1 || n.t + n.dur <= S0) continue;
        if (t.drum && n.t < S0) continue;
        const a = Math.max(n.t, S0);
        const b = t.drum ? a + 1 : Math.min(n.t + n.dur, S1);
        // 一直延續到段落開頭的長音保留下來，其他在段落前就結束的不要
        if (b - a < 0.2) continue;
        notes.push({ t: a - S0, dur: b - a, pitch: n.pitch, vel: n.vel });
      }
      if (notes.length)
        out.push({
          id: t.id,
          role: t.role,
          program: t.program,
          drum: t.drum || undefined,
          kit: t.drum ? 'acoustic' : undefined,
          notes,
          pan: t.pan,
          gain: ROLE_GAIN[t.role] * (0.6 + 0.4 * t.vol),
        });
    }
    return out;
  };
  let tracks = slice();
  if (!tracks.length && start > 0) {
    // 這一段是空的：回到開頭
    start = 0;
    nBars = clamp(nBars, 1, Math.min(MAX_BARS, totalBars));
    tracks = slice();
  }

  // 移調：選了調性就把整段平移到那個調（取 −5…+6 個半音）
  const want12 = o.key >= 0 ? o.key : imp.key;
  let sh = (((want12 - imp.key) % 12) + 12) % 12;
  if (sh > 6) sh -= 12;
  const key = (imp.key + sh + 12) % 12;
  if (sh) for (const t of tracks) if (!t.drum) for (const n of t.notes) n.pitch = foldPitch(n.pitch + sh);

  const target = imp.bpm * clamp(o.tempo, 0.5, 2);
  const plan = planImportLoop(o.animSeconds, nBars, meter, target, o.sync, !!o.preferLock);
  const steps = nBars * spb;
  const stepSec = 60 / plan.bpm / 4;
  return {
    title: `${imp.name} · ${NOTE_NAMES[key]} ${MODE_NAME[imp.mode]} · ${Math.round(plan.bpm)} BPM`,
    genre: 'pop',
    bpm: plan.bpm,
    meter,
    stepsPerBar: spb,
    bars: nBars,
    steps,
    swing: 0,
    key,
    mode: imp.mode,
    tracks,
    chords: detectChords(tracks, spb, nBars),
    seconds: steps * stepSec,
    animSeconds: o.animSeconds,
    animLoops: plan.animLoops,
    beatLocked: plan.beatLocked,
  };
}
