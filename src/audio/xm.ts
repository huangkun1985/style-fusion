// XM 追蹤器方案：把歌曲轉成 FastTracker II 的 Extended Module。樂器優先用取樣包裡的真實樂器
// （16 位元、多音區、持續音循環），沒有取樣的音色（合成器、人聲…）退回程式生成的小取樣。
// 用自製的 XM 播放器渲染成音訊，也可以輸出標準 .xm 檔，用 OpenMPT、MilkyTracker 等開啟。
import { clamp } from '../engine/util';
import { stepToSec } from './compose';
import type { RenderOpts } from './chip';
import { foldTail, freeverb, master, newStereo, removeMean, yieldNow, type Stereo } from './dsp';
import type { Song, Track, TrackRole } from './types';
import { ROLE_MIX, SEND, ensureSamplesFor, pickDrum, voiceOf } from './sampled';
import { XM_SYN_SCALE } from './xmCalibration';
import { packDrumInstrument, packInstrumentSet, packVolume, type PackSet } from './xmPack';
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
  /** 每個聲道屬於哪個聲部（決定殘響送量；不寫進 .xm） */
  chanRoles: TrackRole[];
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
/** 每個聲部最多用幾條聲道（沒列出的最多 8 條） */
const CHANNEL_CAP: Partial<Record<TrackRole, number>> = { bass: 1, lead: 2, counter: 2, arp: 3 };
/** 取樣鼓在 XM 裡的整體音量修正（與 MIDI 方案的鼓量對齊） */
const DRUM_XM_GAIN = 1;
/** 合成鼓在 XM 裡的取樣增益（對應取樣鼓的 DRUM_SAMPLE_SCALE） */
const SYN_DRUM_SCALE = 0.25;

export function buildXm(song: Song): XmModule {
  const lib = sampleLibrary();
  const rows = song.steps;
  const stepSec = 60 / song.bpm / 4;
  const instruments: XmInstrument[] = [];
  const instIndex = new Map<string, number>();
  /** 取樣包的真實樂器（快取；沒載入就回傳 0） */
  // 預先掃一遍：每個（音色號、聲像）會用到哪些音高，之後依這些音高一次建好需要的取樣
  const pitchSets = new Map<string, Set<number>>();
  const packKey = (program: number, pan: number) => `pk${program}|${Math.round(clamp(pan, -1, 1) * 3) / 3}`;
  for (const tr of song.tracks) {
    if (tr.drum) continue;
    const set = pitchSets.get(packKey(tr.program, tr.pan)) ?? new Set<number>();
    for (const nt of tr.notes) set.add(Math.round(nt.pitch));
    pitchSets.set(packKey(tr.program, tr.pan), set);
  }
  const packSets = new Map<string, { set: PackSet; nums: number[] } | null>();
  /** 取樣包的真實樂器；沒載入或沒有對應就回傳 null（呼叫端改用合成取樣） */
  const getPackSet = (program: number, pan: number) => {
    const key = packKey(program, pan);
    if (packSets.has(key)) return packSets.get(key)!;
    const bucket = Math.round(clamp(pan, -1, 1) * 3) / 3;
    const set = packInstrumentSet(program, song.bpm, bucket, pitchSets.get(key) ?? []);
    if (!set) {
      packSets.set(key, null);
      return null;
    }
    const nums = set.insts.map((inst) => {
      instruments.push(inst);
      return instruments.length;
    });
    const r = { set, nums };
    packSets.set(key, r);
    return r;
  };
  const getPackDrum = (id: string, pan: number, tau?: number): number => {
    const key = `pd${id}`;
    const hit = instIndex.get(key);
    if (hit !== undefined) return hit;
    const inst = packDrumInstrument(id, pan, tau);
    if (!inst) {
      instIndex.set(key, 0);
      return 0;
    }
    instruments.push(inst);
    instIndex.set(key, instruments.length);
    return instruments.length;
  };
  /** scale < 1：合成鼓要和取樣鼓放在同一個音量量級，用 16 位元縮小（8 位元縮小會變粗糙） */
  const getInst = (sampleId: string, pan: number, scale = 1): number => {
    const bucket = Math.round(clamp(pan, -1, 1) * 3) / 3;
    const key = `${sampleId}|${bucket}|${scale}`;
    const hit = instIndex.get(key);
    if (hit) return hit;
    const def = lib.get(sampleId) ?? lib.get('sq50')!;
    const wide = scale < 1;
    const data = wide ? new Int16Array(def.data.length) : new Int8Array(def.data.length);
    for (let i = 0; i < data.length; i++) data[i] = wide ? Math.max(-32767, Math.min(32767, Math.round(def.data[i] * 32767 * scale))) : Math.max(-127, Math.min(127, Math.round(def.data[i] * 127)));
    const looped = !!def.loop;
    const sm: XmSample = {
      name: def.name.slice(0, 22),
      data,
      bits: wide ? 16 : 8,
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
  const roles: TrackRole[] = [];
  let curRole: TrackRole = 'lead';
  const newCol = (name: string) => {
    cols.push(Array.from({ length: rows }, emptyCell));
    names.push(name);
    roles.push(curRole);
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
    // 上一個音的「放開」(97) 常落在下一個音的起點；新音要蓋掉它，不然前後相接的音會被丟掉
    if (c.note && c.note !== 97) return false;
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

  const fill = (scale: number) => {
  cols.length = 0;
  names.length = 0;
  roles.length = 0;
  for (const tr of song.tracks) {
    curRole = tr.role;
    if (tr.drum) {
      const groups = new Map<string, number>();
      const sorted = [...tr.notes].sort((a, b) => a.t - b.t || b.vel - a.vel);
      let counter = 0;
      for (const nt of sorted) {
        const g = DRUM_GROUP(nt.pitch);
        if (!groups.has(g)) groups.set(g, newCol(`Drums ${g}`));
        const col = cols[groups.get(g)!];
        const pk = pickDrum(nt.pitch, nt.vel, tr.kit ?? 'hybrid', counter++);
        const packed = pk ? getPackDrum(pk.id, tr.pan, pk.tau) : 0;
        if (pk && packed) {
          const v = 64 * pk.gain * (0.35 + 0.65 * nt.vel) * tr.gain * DRUM_XM_GAIN;
          place(col, Math.round(nt.t), clamp(49 + Math.round(pk.semi ?? 0), 1, 96), packed, v);
          continue;
        }
        const def = lib.get(sampleForDrum(nt.pitch))!;
        // 有取樣鼓的曲風，合成鼓（電子曲風的踢鼓、軍鼓…）要降到和取樣鼓同一個量級
        const inst = getInst(def.id, tr.pan, SYN_DRUM_SCALE);
        place(col, Math.round(nt.t), 49, inst, def.volume * nt.vel * tr.gain);
      }
      continue;
    }
    const packed = getPackSet(tr.program, tr.pan);
    const packedInst = packed ? packed.nums[0] : 0;
    const sampleId = sampleForProgram(tr.program);
    const def = lib.get(sampleId)!;
    // 沒有取樣的音色（合成器、合成低音、鋪底…）用程式生成的小取樣；縮放倍率來自校準表，讓它和取樣樂器同一個音量量級
    const synthInst = packed ? 0 : getInst(sampleId, tr.pan, (globalThis as { __noXmCal?: boolean }).__noXmCal ? 1 : (XM_SYN_SCALE[tr.program] ?? 1));
    /** 每個音用離它最近的取樣所在的 XM 樂器 */
    const instFor = (pitch: number) => (packed ? packed.nums[packed.set.pick(pitch)] : synthInst);
    const baseVol = packedInst ? packVolume(tr.program) : def.volume;
    const vol = (nt: { vel: number }) => baseVol * clamp(nt.vel * tr.gain * 1.05, 0.05, 1) * (packedInst ? ROLE_MIX[tr.role] : 1);
    // 聲道分配：每個聲部有聲道上限（低音是單聲道，主旋律與琶音用 2–3 條輪流，和弦與鋪底最多 8 條）。
    // 空著的聲道挑「最久沒用」的那一條，讓上一個音放開後的餘音能留在原聲道繼續衰減，
    // 不然每彈下一個音就把上一個音切掉，鋼琴、豎琴這類餘音長的樂器會變得斷斷續續。
    const cap = Math.max(1, Math.floor((CHANNEL_CAP[tr.role] ?? 8) * scale));
    const vibOf = packed ? voiceOf(tr.program)?.vib : undefined;
    const busy: number[] = [];
    const chIdx: number[] = [];
    const sorted = [...tr.notes].sort((a, b) => a.t - b.t || a.pitch - b.pitch);
    for (const nt of sorted) {
      const row = Math.round(nt.t);
      // 優先用「已經閒置超過一列」的聲道；沒有就開新聲道（到上限為止）；
      // 最後才重用「剛好在這一列結束」的聲道（會切掉它的餘音）或切掉最早結束的音
      let k = -1;
      for (let i = 0; i < busy.length; i++) if (busy[i] < row && (k < 0 || busy[i] < busy[k])) k = i;
      if (k < 0 && busy.length < cap) {
        busy.push(0);
        chIdx.push(newCol(chIdx.length ? `${tr.id} ${busy.length}` : tr.id));
        k = busy.length - 1;
      }
      if (k < 0) for (let i = 0; i < busy.length; i++) if (busy[i] <= row && (k < 0 || busy[i] < busy[k])) k = i;
      if (k < 0) k = busy.indexOf(Math.min(...busy));
      const col = cols[chIdx[k]];
      if (!place(col, row, toXmNote(nt.pitch), instFor(nt.pitch), vol(nt))) continue;
      const end = Math.round(nt.t + nt.dur);
      busy[k] = Math.max(end, row + 1);
      if (end < rows && end > row && !col[end].note) col[end].note = 97;
      // 顫音：只有 MIDI 方案裡也有顫音的樂器（小提琴、大提琴、薩克斯風、長笛…）才加，起音後延遲一下再慢慢加深，和 MIDI 方案一致
      const vib = vibOf;
      if (vib) {
        const stepSec = 60 / song.bpm / 4;
        const startRow = row + Math.ceil(vib[2] / stepSec);
        const speed = clamp(Math.round(vib[1] * 64 * (2.5 / song.bpm)), 1, 15);
        const full = clamp(Math.round(554 * vib[0]), 1, 15);
        for (let r = startRow; r < Math.min(end, rows); r++) {
          if (!col[r].fx && !col[r].note) {
            col[r].fx = 4;
            col[r].fxp = (speed << 4) | (r - startRow < 2 ? Math.max(1, Math.round(full / 2)) : full);
          }
        }
      }
    }
  }
  };
  // 一般歌曲一次就夠；匯入的 MIDI 軌道很多時，聲道可能超過 XM 的 32 個上限，逐步縮小各聲部的聲道上限
  for (const sc of [1, 0.5, 0.25, 0]) {
    fill(sc);
    if (cols.length <= 32) break;
  }

  const cells: XmCell[][] = Array.from({ length: rows }, (_, r) => cols.map((c) => c[r]));
  return {
    name: song.title.slice(0, 20),
    channels: cols.length,
    chanNames: names,
    chanRoles: roles,
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
  /** 上一個 tick 的音量（做逐樣本漸變，避免每個 tick 一階一階跳的雜音）；-1＝新音符，不漸變 */
  lastAmp: number;
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

/** wet：給了就把每個聲道依聲部的殘響送量額外混進這個緩衝（和 MIDI 方案同一組送量） */
export async function renderModule(mod: XmModule, sr: number, bpm: number, tailSec: number, yieldEvery = false, wet?: Stereo): Promise<Stereo> {
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
    lastAmp: -1,
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
        C.lastAmp = -1;
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
      if (amp <= 0.0001 && C.lastAmp <= 0.0001) {
        if (C.keyOff && C.fade === 0) C.playing = false;
        C.lastAmp = amp;
        // 仍要推進位置，避免靜音期間循環取樣停滯
        continue;
      }
      const step = freqOf(C.period) / sr;
      const pa = (C.pan / 255) * Math.PI * 0.5;
      const cl = Math.cos(pa);
      const cr = Math.sin(pa);
      const send = wet ? (SEND[mod.chanRoles[c]] ?? 0.2) : 0;
      // 音量在這個 tick 內從上一個值漸變到新值
      const a0 = C.lastAmp < 0 ? amp : C.lastAmp;
      const da = (amp - a0) / Math.max(1, s1 - s0);
      C.lastAmp = amp;
      const loop = sm.loopType === 1;
      const ls = sm.loopStart;
      const ll = sm.loopLen;
      // 4 點 Hermite 插值（線性插值會在高頻產生鏡像雜音，12 kHz 以上的能量比 MIDI 方案多出十幾 dB）
      const at = (j: number): number => {
        if (j < 0) return d[0];
        if (loop) {
          if (j >= loopEnd) j = ls + ((j - ls) % ll);
          return d[j];
        }
        return j < len ? d[j] : 0;
      };
      let pos = C.pos;
      for (let i = s0; i < s1; i++) {
        let ip = pos | 0;
        if (loop) {
          if (pos >= loopEnd) {
            pos = ls + ((pos - ls) % ll);
            ip = pos | 0;
          }
        } else if (ip >= len) {
          C.playing = false;
          break;
        }
        const f = pos - ip;
        const y0 = ip > 0 ? d[ip - 1] : d[0];
        const y1 = d[ip];
        const y2 = at(ip + 1);
        const y3 = at(ip + 2);
        const c1 = 0.5 * (y2 - y0);
        const c2 = y0 - 2.5 * y1 + 2 * y2 - 0.5 * y3;
        const c3 = 0.5 * (y3 - y0) + 1.5 * (y1 - y2);
        const a = a0 + da * (i - s0);
        const v = (((c3 * f + c2) * f + c1) * f + y1) * scale * a;
        out.l[i] += v * cl;
        out.r[i] += v * cr;
        if (wet) {
          wet.l[i] += v * cl * send;
          wet.r[i] += v * cr * send;
        }
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
  const len = Math.ceil((song.seconds + 2.6) * sr) + 8;
  const wet = newStereo(len + sr);
  const raw = await renderModule(mod, sr, song.bpm, 2.6, opts.yieldEvery, wet);
  // 追蹤器的音量欄位最高 64，沒有 MIDI 方案那樣的增益空間，原始音量比 MIDI 小約 18 dB；
  // 進母帶之前整體加 12 dB（所有聲部一起，不改變平衡），否則沒有鼓的純樂器曲風會碰到母帶的增益上限而偏小聲
  const boost = 4;
  for (let i = 0; i < raw.l.length; i++) {
    raw.l[i] *= boost;
    raw.r[i] *= boost;
  }
  for (let i = 0; i < wet.l.length; i++) {
    wet.l[i] *= boost;
    wet.r[i] *= boost;
  }
  const ext = newStereo(Math.max(raw.l.length, n));
  ext.l.set(raw.l.subarray(0, ext.l.length));
  ext.r.set(raw.r.subarray(0, ext.r.length));
  // 殘響：和 MIDI 方案同一組設定（各聲部的送量也相同），兩個方案的空間感才一致
  const wl = newStereo(ext.l.length);
  wl.l.set(wet.l.subarray(0, wl.l.length));
  wl.r.set(wet.r.subarray(0, wl.r.length));
  const rv = freeverb(wl.l, wl.r, sr, { room: 0.82, damp: 0.42, wet: 1, width: 1 });
  for (let i = 0; i < ext.l.length; i++) {
    ext.l[i] += rv.l[i] * 0.55;
    ext.r[i] += rv.r[i] * 0.55;
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

function packPattern(mod: XmModule, r0 = 0, r1 = mod.rows): Uint8Array {
  const w = new W();
  for (let r = r0; r < r1; r++) {
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
  // 每個樂段最多 256 列；一般歌曲只有一個樂段，匯入的長曲會切成好幾個，依序播放
  const nPat = Math.max(1, Math.ceil(mod.rows / 256));
  w.u16(nPat); // song length
  w.u16(0); // restart
  w.u16(mod.channels);
  w.u16(nPat); // patterns
  w.u16(mod.instruments.length);
  w.u16(1); // linear frequency table
  w.u16(mod.speed);
  w.u16(clamp(Math.round(mod.bpm), 32, 255));
  const order = new Uint8Array(256);
  for (let i = 0; i < nPat; i++) order[i] = i;
  w.bytes(order);
  for (let i = 0; i < nPat; i++) {
    const r0 = i * 256;
    const r1 = Math.min(mod.rows, r0 + 256);
    const packed = packPattern(mod, r0, r1);
    w.u32(9);
    w.u8(0);
    w.u16(r1 - r0);
    w.u16(packed.length);
    w.bytes(packed);
  }
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
