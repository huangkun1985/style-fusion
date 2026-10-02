// XM 追蹤器方案：把歌曲轉成 FastTracker II 的 Extended Module。樂器優先用取樣包裡的真實樂器
// （16 位元、多音區、持續音循環），沒有取樣的音色（合成器、人聲…）退回程式生成的小取樣。
// 用自製的 XM 播放器渲染成音訊，也可以輸出標準 .xm 檔，用 OpenMPT、MilkyTracker 等開啟。
import { clamp } from '../engine/util';
import { stepToSec } from './compose';
import type { RenderOpts } from './chip';
import { foldTail, freeverb, master, newStereo, removeMean, yieldNow, type Stereo } from './dsp';
import type { Song, Track } from './types';
import { ensureSamplesFor, pickDrum } from './sampled';
import { packDrumInstrument, packInstrument, packVolume } from './xmPack';
import { SAMPLE_RATE_XM, sampleForDrum, sampleForProgram, sampleLibrary } from './xmSamples';

// ---------- 資料結構 ----------
export interface XmSample {
  name: string;
  data: Int8Array | Int16Array;
  bits: 8 | 16;
  loopStart: number;
  loopLen: number;
  loopType: 0 | 1;
  volume: number;
  finetune: number;
  relNote: number;
  pan: number;
}
export interface XmInstrument {
  name: string;
  /** 最多 16 個取樣，由 keymap 依音符選擇 */
  samples: XmSample[];
  /** 96 個音符各自用第幾個取樣 */
  keymap: Uint8Array;
  envOn: boolean;
  envPts: [number, number][];
  envSustain: number;
  fadeout: number;
}
export interface XmCell {
  note: number;
  inst: number;
  vol: number;
  fx: number;
  fxp: number;
}
export interface XmModule {
  name: string;
  channels: number;
  chanNames: string[];
  speed: number;
  bpm: number;
  rows: number;
  /** cells[row][channel] */
  cells: XmCell[][];
  instruments: XmInstrument[];
}

const emptyCell = (): XmCell => ({ note: 0, inst: 0, vol: 0, fx: 0, fxp: 0 });

// ---------- 歌曲 → 模組 ----------
const DRUM_GROUP = (n: number): 'kick' | 'snare' | 'hat' | 'misc' => {
  if (n === 35 || n === 36) return 'kick';
  if (n === 37 || n === 38 || n === 39 || n === 40) return 'snare';
  if (n === 42 || n === 44 || n === 46 || n === 54 || n === 69 || n === 70) return 'hat';
  return 'misc';
};
const MONO_ROLES = new Set(['lead', 'counter', 'arp', 'bass']);
/** 取樣鼓在 XM 裡的整體音量修正（與 MIDI 方案的鼓量對齊） */
const DRUM_XM_GAIN = 1;

export function buildXm(song: Song): XmModule {
  const lib = sampleLibrary();
  const rows = song.steps;
  const stepSec = 60 / song.bpm / 4;
  const instruments: XmInstrument[] = [];
  const instIndex = new Map<string, number>();
  /** 取樣包的真實樂器（快取；沒載入就回傳 0） */
  const getPackInst = (program: number, pan: number): number => {
    const bucket = Math.round(clamp(pan, -1, 1) * 3) / 3;
    const key = `pk${program}|${bucket}`;
    const hit = instIndex.get(key);
    if (hit !== undefined) return hit;
    const inst = packInstrument(program, song.bpm, bucket);
    if (!inst) {
      instIndex.set(key, 0);
      return 0;
    }
    instruments.push(inst);
    instIndex.set(key, instruments.length);
    return instruments.length;
  };
  const getPackDrum = (id: string, pan: number): number => {
    const key = `pd${id}`;
    const hit = instIndex.get(key);
    if (hit !== undefined) return hit;
    const inst = packDrumInstrument(id, pan);
    if (!inst) {
      instIndex.set(key, 0);
      return 0;
    }
    instruments.push(inst);
    instIndex.set(key, instruments.length);
    return instruments.length;
  };
  const getInst = (sampleId: string, pan: number): number => {
    const bucket = Math.round(clamp(pan, -1, 1) * 3) / 3;
    const key = `${sampleId}|${bucket}`;
    const hit = instIndex.get(key);
    if (hit) return hit;
    const def = lib.get(sampleId) ?? lib.get('sq50')!;
    const data = new Int8Array(def.data.length);
    for (let i = 0; i < data.length; i++) data[i] = Math.max(-127, Math.min(127, Math.round(def.data[i] * 127)));
    const looped = !!def.loop;
    const sm: XmSample = {
      name: def.name.slice(0, 22),
      data,
      bits: 8,
      loopStart: looped ? def.loop![0] : 0,
      loopLen: looped ? def.loop![1] : 0,
      loopType: looped ? 1 : 0,
      volume: def.volume,
      finetune: looped ? 2 : 0,
      relNote: 12,
      pan: Math.round(128 + bucket * 100),
    };
    instruments.push({
      name: `${def.name}${bucket ? (bucket < 0 ? ' L' : ' R') : ''}`.slice(0, 22),
      samples: [sm],
      keymap: new Uint8Array(96),
      envOn: !!def.env,
      envPts: def.env ? def.env.pts : [],
      envSustain: def.env ? def.env.sustain : 0,
      fadeout: def.fadeout,
    });
    instIndex.set(key, instruments.length);
    return instruments.length;
  };

  const cols: XmCell[][] = [];
  const names: string[] = [];
  const newCol = (name: string) => {
    cols.push(Array.from({ length: rows }, emptyCell));
    names.push(name);
    return cols.length - 1;
  };
  const swingTicks = (row: number) => {
    if (!song.swing) return 0;
    const d = stepToSec(song, row) / stepSec - row;
    return clamp(Math.round(d * 6), 0, 5);
  };
  const toXmNote = (pitch: number) => clamp(Math.round(pitch) - 11, 1, 96);
  const place = (col: XmCell[], row: number, note: number, inst: number, vol: number) => {
    if (row < 0 || row >= rows) return false;
    const c = col[row];
    if (c.note) return false;
    c.note = note;
    c.inst = inst;
    c.vol = 0x10 + clamp(Math.round(vol), 1, 64);
    const dt = swingTicks(row);
    if (dt > 0 && !c.fx) {
      c.fx = 0xe;
      c.fxp = 0xd0 | dt;
    }
    return true;
  };

  for (const tr of song.tracks) {
    if (tr.drum) {
      const groups = new Map<string, number>();
      const sorted = [...tr.notes].sort((a, b) => a.t - b.t || b.vel - a.vel);
      let counter = 0;
      for (const nt of sorted) {
        const g = DRUM_GROUP(nt.pitch);
        if (!groups.has(g)) groups.set(g, newCol(`Drums ${g}`));
        const col = cols[groups.get(g)!];
        const pk = pickDrum(nt.pitch, nt.vel, tr.kit ?? 'hybrid', counter++);
        const packed = pk ? getPackDrum(pk.id, tr.pan) : 0;
        if (pk && packed) {
          const v = 64 * pk.gain * (0.35 + 0.65 * nt.vel) * tr.gain * DRUM_XM_GAIN;
          place(col, Math.round(nt.t), clamp(49 + Math.round(pk.semi ?? 0), 1, 96), packed, v);
          continue;
        }
        const def = lib.get(sampleForDrum(nt.pitch))!;
        const inst = getInst(def.id, tr.pan);
        place(col, Math.round(nt.t), 49, inst, def.volume * nt.vel * tr.gain);
      }
      continue;
    }
    const packedInst = getPackInst(tr.program, tr.pan);
    const sampleId = sampleForProgram(tr.program);
    const def = lib.get(sampleId)!;
    const inst = packedInst || getInst(sampleId, tr.pan);
    const baseVol = packedInst ? packVolume(tr.program) : def.volume;
    const vol = (nt: { vel: number }) => baseVol * clamp(nt.vel * tr.gain * 1.05, 0.05, 1);
    if (MONO_ROLES.has(tr.role)) {
      const ci = newCol(tr.id);
      const col = cols[ci];
      const sorted = [...tr.notes].sort((a, b) => a.t - b.t);
      for (const nt of sorted) {
        const row = Math.round(nt.t);
        if (!place(col, row, toXmNote(nt.pitch), inst, vol(nt))) continue;
        const end = Math.round(nt.t + nt.dur);
        if (end < rows && end > row && !col[end].note) col[end].note = 97;
        if ((tr.role === 'lead' || tr.role === 'counter') && nt.dur >= 6) {
          for (let r = row + 2; r < Math.min(end, rows); r++) {
            if (!col[r].fx && !col[r].note) {
              col[r].fx = 4;
              col[r].fxp = 0x35;
            }
          }
        }
      }
    } else {
      // 和弦／鋪底：多聲部，依需要配置聲道
      const busy: number[] = [];
      const chIdx: number[] = [];
      const sorted = [...tr.notes].sort((a, b) => a.t - b.t || a.pitch - b.pitch);
      for (const nt of sorted) {
        const row = Math.round(nt.t);
        let k = busy.findIndex((b) => b <= row);
        if (k < 0 && busy.length < 4) {
          busy.push(0);
          chIdx.push(newCol(`${tr.id} ${busy.length}`));
          k = busy.length - 1;
        }
        if (k < 0) continue;
        const col = cols[chIdx[k]];
        if (!place(col, row, toXmNote(nt.pitch), inst, vol(nt))) continue;
        const end = Math.round(nt.t + nt.dur);
        busy[k] = end;
        if (end < rows && !col[end].note) col[end].note = 97;
      }
    }
  }

  const cells: XmCell[][] = Array.from({ length: rows }, (_, r) => cols.map((c) => c[r]));
  return {
    name: song.title.slice(0, 20),
    channels: cols.length,
    chanNames: names,
    speed: 6,
    bpm: song.bpm,
    rows,
    cells,
    instruments,
  };
}

// ---------- 播放器 ----------
const periodOf = (note: number, finetune: number) => 7680 - (note - 1) * 64 - finetune / 2;
const freqOf = (period: number) => 8363 * Math.pow(2, (4608 - period) / 768);

interface Chan {
  inst: XmInstrument | null;
  sm: XmSample | null;
  lastInst: number;
  pos: number;
  playing: boolean;
  period: number;
  basePeriod: number;
  vol: number;
  pan: number;
  envTick: number;
  envVal: number;
  keyOff: boolean;
  fade: number;
  vibPos: number;
  vibSpeed: number;
  vibDepth: number;
  vibOn: boolean;
  arp: [number, number] | null;
  vs: number;
  cut: number;
  retrig: number;
  pending: { cell: XmCell; at: number } | null;
}

function envAt(pts: [number, number][], t: number): number {
  if (!pts.length) return 64;
  if (t <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (t <= pts[i][0]) {
      const [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      return x1 === x0 ? y1 : y0 + ((y1 - y0) * (t - x0)) / (x1 - x0);
    }
  }
  return pts[pts.length - 1][1];
}

export async function renderModule(mod: XmModule, sr: number, bpm: number, tailSec: number, yieldEvery = false): Promise<Stereo> {
  const tickSec = 2.5 / bpm;
  const tickLen = tickSec * sr;
  const rowTicks = mod.speed;
  const bodyTicks = mod.rows * rowTicks;
  const tailTicks = Math.ceil(tailSec / tickSec);
  const totalTicks = bodyTicks + tailTicks;
  const n = Math.ceil(totalTicks * tickLen) + 4;
  const out = newStereo(n);
  const chans: Chan[] = Array.from({ length: mod.channels }, () => ({
    inst: null,
    sm: null,
    lastInst: 0,
    pos: 0,
    playing: false,
    period: 0,
    basePeriod: 0,
    vol: 0,
    pan: 128,
    envTick: 0,
    envVal: 1,
    keyOff: false,
    fade: 32768,
    vibPos: 0,
    vibSpeed: 0,
    vibDepth: 0,
    vibOn: false,
    arp: null,
    vs: 0,
    cut: -1,
    retrig: 0,
    pending: null,
  }));

  const trigger = (C: Chan, cell: XmCell) => {
    if (cell.inst) C.lastInst = cell.inst;
    if (cell.note >= 1 && cell.note <= 96) {
      const inst = mod.instruments[(cell.inst || C.lastInst) - 1];
      if (inst) {
        const sm = inst.samples[inst.keymap[cell.note - 1]] ?? inst.samples[0];
        C.inst = inst;
        C.sm = sm;
        C.pos = 0;
        C.playing = true;
        C.keyOff = false;
        C.envTick = 0;
        C.fade = 32768;
        C.vol = sm.volume;
        C.pan = sm.pan;
        C.basePeriod = periodOf(cell.note + sm.relNote, sm.finetune);
        C.period = C.basePeriod;
        C.vibPos = 0;
      }
    } else if (cell.note === 97) C.keyOff = true;
    if (cell.vol >= 0x10 && cell.vol <= 0x50) C.vol = cell.vol - 0x10;
    const p = cell.fxp;
    switch (cell.fx) {
      case 0:
        if (p) C.arp = [p >> 4, p & 15];
        break;
      case 4:
        if (p >> 4) C.vibSpeed = p >> 4;
        if (p & 15) C.vibDepth = p & 15;
        C.vibOn = true;
        break;
      case 8:
        C.pan = p;
        break;
      case 0xa:
        C.vs = p;
        break;
      case 0xc:
        C.vol = Math.min(64, p);
        break;
      case 0xe:
        if (p >> 4 === 0xc) C.cut = p & 15;
        else if (p >> 4 === 9) C.retrig = p & 15;
        break;
    }
    if (C.cut === 0) C.vol = 0;
  };

  let samplePtr = 0;
  for (let tk = 0; tk < totalTicks; tk++) {
    const row = Math.floor(tk / rowTicks);
    const tick = tk % rowTicks;
    for (let c = 0; c < mod.channels; c++) {
      const C = chans[c];
      if (tick === 0) {
        C.arp = null;
        C.vibOn = false;
        C.vs = 0;
        C.cut = -1;
        C.retrig = 0;
        C.pending = null;
        if (row < mod.rows) {
          const cell = mod.cells[row][c];
          if (cell.fx === 0xe && cell.fxp >> 4 === 0xd && (cell.fxp & 15) > 0 && (cell.fxp & 15) < rowTicks) C.pending = { cell, at: cell.fxp & 15 };
          else trigger(C, cell);
        }
      } else {
        if (C.pending && C.pending.at === tick) {
          trigger(C, { ...C.pending.cell, fx: 0, fxp: 0 });
          C.pending = null;
        }
        if (C.arp) {
          const k = tick % 3;
          C.period = C.basePeriod - (k === 0 ? 0 : k === 1 ? C.arp[0] : C.arp[1]) * 64;
        }
        if (C.vibOn) {
          C.vibPos = (C.vibPos + C.vibSpeed) & 63;
          C.period = C.basePeriod + (Math.sin((C.vibPos * Math.PI * 2) / 64) * 64 * C.vibDepth) / 32;
        }
        if (C.vs) C.vol = clamp(C.vol + (C.vs >> 4 ? C.vs >> 4 : -(C.vs & 15)), 0, 64);
        if (C.cut === tick) C.vol = 0;
        if (C.retrig && tick % C.retrig === 0) C.pos = 0;
      }
      // 包絡與淡出
      const I = C.inst;
      if (I) {
        if (I.envOn) {
          C.envVal = envAt(I.envPts, C.envTick) / 64;
          const susT = I.envPts[I.envSustain]?.[0] ?? 0;
          if (C.keyOff || C.envTick < susT) C.envTick++;
        } else C.envVal = C.keyOff ? 0 : 1;
        if (C.keyOff) C.fade = Math.max(0, C.fade - I.fadeout);
      }
    }
    // 合成這一個 tick 的樣本
    const s0 = Math.floor(tk * tickLen);
    const s1 = Math.min(n, Math.floor((tk + 1) * tickLen));
    for (let c = 0; c < mod.channels; c++) {
      const C = chans[c];
      if (!C.playing || !C.inst || !C.sm) continue;
      const sm = C.sm;
      const d = sm.data;
      const scale = sm.bits === 16 ? 1 / 32768 : 1 / 128;
      const len = d.length;
      const loopEnd = sm.loopStart + sm.loopLen;
      const amp = (C.vol / 64) * C.envVal * (C.fade / 32768) * 0.32;
      if (amp <= 0.0001) {
        if (C.keyOff && C.fade === 0) C.playing = false;
        // 仍要推進位置，避免靜音期間循環取樣停滯
        continue;
      }
      const step = freqOf(C.period) / sr;
      const pa = (C.pan / 255) * Math.PI * 0.5;
      const gl = Math.cos(pa) * amp;
      const gr = Math.sin(pa) * amp;
      let pos = C.pos;
      for (let i = s0; i < s1; i++) {
        let ip = pos | 0;
        if (sm.loopType === 1) {
          if (pos >= loopEnd) {
            pos = sm.loopStart + ((pos - sm.loopStart) % sm.loopLen);
            ip = pos | 0;
          }
        } else if (ip >= len) {
          C.playing = false;
          break;
        }
        const fr = pos - ip;
        let i1 = ip + 1;
        if (sm.loopType === 1 ? i1 >= loopEnd : i1 >= len) i1 = sm.loopType === 1 ? sm.loopStart : ip;
        const v = (d[ip] + (d[i1] - d[ip]) * fr) * scale;
        out.l[i] += v * gl;
        out.r[i] += v * gr;
        pos += step;
      }
      C.pos = pos;
    }
    samplePtr = s1;
    if (yieldEvery && tk % 200 === 199) await yieldNow();
  }
  void samplePtr;
  return out;
}

// ---------- 主渲染 ----------
export async function renderXm(song: Song, opts: RenderOpts): Promise<Stereo> {
  const sr = opts.sr;
  await ensureSamplesFor(song);
  const mod = buildXm(song);
  const n = Math.round(song.seconds * sr);
  const raw = await renderModule(mod, sr, song.bpm, 2.6, opts.yieldEvery);
  const ext = newStereo(Math.max(raw.l.length, n));
  ext.l.set(raw.l.subarray(0, ext.l.length));
  ext.r.set(raw.r.subarray(0, ext.r.length));
  const rv = freeverb(ext.l, ext.r, sr, { room: 0.6, damp: 0.5, wet: 1 });
  for (let i = 0; i < ext.l.length; i++) {
    ext.l[i] += rv.l[i] * 0.22;
    ext.r[i] += rv.r[i] * 0.22;
  }
  const out = foldTail(ext, n);
  removeMean(out.l);
  removeMean(out.r);
  master(out, 0.12);
  return out;
}

// ---------- 檔案輸出（FastTracker II .xm v1.04） ----------
class W {
  private parts: number[] = [];
  u8(v: number) {
    this.parts.push(v & 255);
  }
  u16(v: number) {
    this.parts.push(v & 255, (v >> 8) & 255);
  }
  u32(v: number) {
    this.parts.push(v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255);
  }
  str(s: string, len: number, pad = 0) {
    for (let i = 0; i < len; i++) this.parts.push(i < s.length ? s.charCodeAt(i) & 127 : pad);
  }
  bytes(b: ArrayLike<number>) {
    for (let i = 0; i < b.length; i++) this.parts.push(b[i] & 255);
  }
  get length() {
    return this.parts.length;
  }
  out(): Uint8Array {
    return Uint8Array.from(this.parts);
  }
}

function packPattern(mod: XmModule): Uint8Array {
  const w = new W();
  for (let r = 0; r < mod.rows; r++) {
    for (let c = 0; c < mod.channels; c++) {
      const x = mod.cells[r][c];
      let flags = 0;
      if (x.note) flags |= 1;
      if (x.inst) flags |= 2;
      if (x.vol) flags |= 4;
      if (x.fx) flags |= 8;
      if (x.fxp) flags |= 16;
      if (flags === 31) {
        w.u8(x.note);
        w.u8(x.inst);
        w.u8(x.vol);
        w.u8(x.fx);
        w.u8(x.fxp);
      } else {
        w.u8(0x80 | flags);
        if (flags & 1) w.u8(x.note);
        if (flags & 2) w.u8(x.inst);
        if (flags & 4) w.u8(x.vol);
        if (flags & 8) w.u8(x.fx);
        if (flags & 16) w.u8(x.fxp);
      }
    }
  }
  return w.out();
}

export function writeXm(mod: XmModule, trackerName = 'Style Fusion'): Uint8Array {
  const w = new W();
  w.str('Extended Module: ', 17, 0x20);
  w.str(mod.name, 20, 0);
  w.u8(0x1a);
  w.str(trackerName, 20, 0x20);
  w.u16(0x0104);
  w.u32(276);
  w.u16(1); // song length
  w.u16(0); // restart
  w.u16(mod.channels);
  w.u16(1); // patterns
  w.u16(mod.instruments.length);
  w.u16(1); // linear frequency table
  w.u16(mod.speed);
  w.u16(clamp(Math.round(mod.bpm), 32, 255));
  const order = new Uint8Array(256);
  w.bytes(order);
  // 唯一的 pattern
  const packed = packPattern(mod);
  w.u32(9);
  w.u8(0);
  w.u16(mod.rows);
  w.u16(packed.length);
  w.bytes(packed);
  // 樂器
  for (const inst of mod.instruments) {
    w.u32(263);
    w.str(inst.name, 22);
    w.u8(0);
    w.u16(inst.samples.length);
    w.u32(40);
    w.bytes(inst.keymap); // 每個音符用第幾個取樣
    const pts = inst.envPts.slice(0, 12);
    for (let i = 0; i < 12; i++) {
      w.u16(pts[i]?.[0] ?? 0);
      w.u16(pts[i]?.[1] ?? 0);
    }
    w.bytes(new Uint8Array(48)); // 聲像包絡
    w.u8(inst.envOn ? pts.length : 0);
    w.u8(0);
    w.u8(inst.envSustain);
    w.u8(0);
    w.u8(0);
    w.u8(0);
    w.u8(0);
    w.u8(0);
    w.u8(inst.envOn ? 3 : 0); // 開啟＋持音
    w.u8(0);
    w.u8(0);
    w.u8(0);
    w.u8(0);
    w.u8(0);
    w.u16(inst.fadeout);
    w.bytes(new Uint8Array(22));
    // 取樣標頭（長度與循環位置以位元組計；16 位元取樣乘 2）
    for (const sm of inst.samples) {
      const bpsm = sm.bits === 16 ? 2 : 1;
      w.u32(sm.data.length * bpsm);
      w.u32(sm.loopStart * bpsm);
      w.u32(sm.loopLen * bpsm);
      w.u8(sm.volume);
      w.u8(sm.finetune & 255);
      w.u8(sm.loopType | (sm.bits === 16 ? 0x10 : 0));
      w.u8(sm.pan);
      w.u8(sm.relNote & 255);
      w.u8(0);
      w.str(sm.name, 22);
    }
    // 取樣資料（差分編碼）
    for (const sm of inst.samples) {
      let prev = 0;
      if (sm.bits === 16) {
        const delta = new Uint8Array(sm.data.length * 2);
        for (let i = 0; i < sm.data.length; i++) {
          const d = (sm.data[i] - prev) & 0xffff;
          delta[i * 2] = d & 255;
          delta[i * 2 + 1] = d >> 8;
          prev = sm.data[i];
        }
        w.bytes(delta);
      } else {
        const delta = new Uint8Array(sm.data.length);
        for (let i = 0; i < sm.data.length; i++) {
          delta[i] = (sm.data[i] - prev) & 255;
          prev = sm.data[i];
        }
        w.bytes(delta);
      }
    }
  }
  return w.out();
}

export { SAMPLE_RATE_XM };
export type { Track };
