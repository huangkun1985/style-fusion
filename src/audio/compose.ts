// 作曲器：依曲風規格與隨機種子產生一首可無縫循環的歌。
// 旋律用「和弦音落在強拍、鄰音經過」的規則生成，同一個樂句 ID 的小節共用隨機決定，所以會有動機的重複與變化。
import { clamp, hash, lerp, rng, strSeed } from '../engine/util';
import { PIECE_BY_ID, parsePiece } from './classics';
import { getImportedMidi, songFromMidi } from './midiImport';
import { DRUMS, DRUM_NOTE, GENRES, KIT_BY_DRUMS, type DrumName, type GenreSpec, type HookFamily, type RhythmKind } from './genres';
import { MODE_NAME, SCALES, chordDegrees, chordLabel, chordPitches, nearestDegree, scaleNote, voice, type Mode } from './theory';
import { NOTE_NAMES, type ChordInfo, type GenreId, type NoteEv, type Song, type Track, type TrackRole } from './types';

// ---------- 與動畫對齊 ----------
export interface LoopPlan {
  bars: number;
  bpm: number;
  /** 一個音樂循環包含幾次動畫循環；0 表示不同步 */
  animLoops: number;
  synced: boolean;
  /** 每次動畫循環剛好是整數拍（視覺節拍脈動才能和音樂完全對齊） */
  beatLocked: boolean;
}

export function planLoop(animSeconds: number, target: number, meter: 3 | 4, sync: boolean, preferLock = false): LoopPlan {
  if (sync) {
    let best: (LoopPlan & { score: number }) | null = null;
    for (const k of [1, 2, 3, 4]) {
      for (const bars of [1, 2, 3, 4, 6, 8, 12, 16]) {
        const beats = bars * meter;
        const locked = beats % k === 0;
        const bpm = (beats * 60) / (k * animSeconds);
        if (bpm < 52 || bpm > 196) continue;
        const len = k * animSeconds;
        let score = Math.abs(Math.log(bpm / target)) * 1.6;
        if (!locked) score += preferLock ? 0.9 : 0.1;
        if (len < 6) score += (6 - len) * 0.14;
        if (len > 26) score += (len - 26) * 0.05;
        if (bars === 1) score += 0.6;
        else if (bars % 4 !== 0) score += meter === 3 ? 0.1 : 0.2;
        else if (bars === 4 || bars === 8) score -= 0.05;
        if (!best || score < best.score) best = { bars, bpm, animLoops: k, synced: true, beatLocked: locked, score };
      }
    }
    if (best) return { bars: best.bars, bpm: best.bpm, animLoops: best.animLoops, synced: true, beatLocked: best.beatLocked };
  }
  return { bars: 8, bpm: clamp(target, 52, 196), animLoops: 0, synced: false, beatLocked: false };
}

// ---------- 節奏型 ----------
type Pat = [number, number][];
const R: Record<RhythmKind, Pat[]> = {
  run: [
    [[0, 2], [2, 2], [4, 2], [6, 2], [8, 2], [10, 2], [12, 2], [14, 2]],
    [[0, 2], [2, 2], [4, 4], [8, 2], [10, 2], [12, 4]],
    [[0, 1], [1, 1], [2, 2], [4, 2], [6, 2], [8, 1], [9, 1], [10, 2], [12, 2], [14, 2]],
    [[0, 4], [4, 2], [6, 2], [8, 2], [10, 2], [12, 4]],
  ],
  sync: [
    [[0, 3], [3, 3], [6, 2], [8, 3], [11, 3], [14, 2]],
    [[0, 2], [3, 2], [6, 3], [10, 2], [12, 2], [14, 2]],
    [[2, 2], [4, 4], [10, 2], [12, 4]],
  ],
  dotted: [
    [[0, 6], [6, 2], [8, 6], [14, 2]],
    [[0, 4], [4, 4], [8, 6], [14, 2]],
    [[0, 8], [8, 4], [12, 4]],
  ],
  long: [[[0, 8], [8, 8]], [[0, 12], [12, 4]], [[0, 16]], [[0, 6], [6, 10]]],
  sparse: [
    [[0, 4], [6, 2], [8, 6]],
    [[2, 3], [8, 4], [12, 4]],
    [[0, 3], [8, 2], [10, 6]],
    [[4, 4], [10, 6]],
  ],
  swingline: [
    [[0, 2], [3, 1], [4, 2], [7, 1], [8, 3], [12, 2], [14, 2]],
    [[2, 2], [4, 1], [6, 2], [8, 2], [11, 1], [12, 4]],
  ],
};
/** 3/4 拍（12 步）的節奏型 */
const R3: Record<RhythmKind, Pat[]> = {
  run: [[[0, 2], [2, 2], [4, 2], [6, 2], [8, 2], [10, 2]], [[0, 4], [4, 2], [6, 2], [8, 4]]],
  sync: [[[0, 3], [3, 3], [6, 3], [9, 3]], [[0, 2], [3, 3], [6, 2], [8, 4]]],
  dotted: [[[0, 6], [6, 2], [8, 4]], [[0, 4], [4, 4], [8, 4]]],
  long: [[[0, 12]], [[0, 8], [8, 4]]],
  sparse: [[[0, 4], [6, 2], [8, 4]], [[2, 4], [8, 4]]],
  swingline: [[[0, 4], [4, 2], [6, 2], [8, 4]]],
};

interface BarChord {
  degree: number;
  start: number;
  len: number;
  pitches: number[];
  rootPc: number;
}

interface Ctx {
  spec: GenreSpec;
  seed: number;
  bars: number;
  spb: number;
  meter: 3 | 4;
  key: number;
  mode: Mode;
  chords: BarChord[][];
  chordAt(bar: number, step: number): BarChord;
}

const seedOf = (a: number, b = 0, c = 0) => Math.floor(hash(a, b, c) * 4294967296) >>> 0;

function tonesInRange(pcsOrPitches: number[], lo: number, hi: number): number[] {
  const out: number[] = [];
  for (const p of pcsOrPitches) {
    const pc = ((p % 12) + 12) % 12;
    for (let o = Math.ceil(lo / 12) * 12; o <= hi + 12; o += 12) {
      const q = o + pc - (o % 12);
      for (const cand of [q - 12, q, q + 12]) if (cand >= lo && cand <= hi && !out.includes(cand)) out.push(cand);
    }
  }
  return out.sort((a, b) => a - b);
}

function pickPitch(c: Ctx, prev: number, chord: BarChord, strong: boolean, r1: number, lo: number, hi: number): number {
  if (strong) {
    const cands = tonesInRange(chord.pitches, lo, hi).sort((a, b) => Math.abs(a - prev) - Math.abs(b - prev));
    const idx = r1 < 0.55 ? 0 : r1 < 0.85 ? 1 : 2;
    return cands[Math.min(idx, cands.length - 1)] ?? prev;
  }
  const d = nearestDegree(c.key, c.mode, prev);
  const step = r1 < 0.36 ? 1 : r1 < 0.7 ? -1 : r1 < 0.8 ? 2 : r1 < 0.9 ? -2 : 0;
  let p = scaleNote(c.key, c.mode, d + step);
  while (p > hi) p -= 12;
  while (p < lo) p += 12;
  return p;
}

function genLead(c: Ctx): NoteEv[] {
  const L = c.spec.lead!;
  if (L.family && c.meter === 4) return genHook(c);
  const [lo, hi] = L.range;
  const pool = (c.meter === 3 ? R3 : R)[L.rhythm];
  const phraseBars = c.bars >= 4 ? 2 : 1;
  const out: NoteEv[] = [];
  let prev = Math.round((lo + hi) / 2);
  for (let b = 0; b < c.bars; b++) {
    const phrase = Math.floor(b / phraseBars);
    const inP = b % phraseBars;
    const pid = [0, 0, 1, 0][phrase % 4];
    const br = rng(seedOf(c.seed, pid * 31 + inP, 17));
    const pat = pool[Math.floor(br() * pool.length)];
    const cadence = inP === phraseBars - 1;
    const dens = clamp(L.density * (0.7 + 0.3 * c.spec.energy), 0.1, 1);
    pat.forEach(([st, dur], idx) => {
      const rKeep = br();
      const r1 = br();
      const keep = idx === 0 || rKeep < dens;
      if (!keep) return;
      const chord = c.chordAt(b, st);
      const strong = idx === 0 || st % (c.spb / 2) === 0;
      let p = pickPitch(c, prev, chord, strong, r1, lo, hi);
      const last = idx === pat.length - 1;
      if (cadence && last) {
        const cands = tonesInRange([chord.pitches[0], chord.pitches[Math.min(2, chord.pitches.length - 1)] ?? chord.pitches[0]], lo, hi).sort((a, b2) => Math.abs(a - prev) - Math.abs(b2 - prev));
        p = cands[0] ?? p;
      }
      if (out.length && out[out.length - 1].pitch === p && p === prev && r1 > 0.5) p = pickPitch(c, prev, chord, false, 0.1, lo, hi);
      const t = b * c.spb + st;
      const prevNote = out[out.length - 1];
      if (prevNote && prevNote.t + prevNote.dur > t) prevNote.dur = Math.max(0.5, t - prevNote.t - 0.05);
      out.push({ t, dur: Math.max(1, dur * L.legato), pitch: p, vel: clamp((strong ? 0.86 : 0.7) + (br() - 0.5) * 0.1 + (c.spec.energy - 0.5) * 0.1, 0.3, 1) });
      prev = p;
    });
  }
  return out;
}

// ---------- 動機式旋律（流行、R&B、K-Pop…）----------
// 做法：先決定一個 2 小節的「動機」（節奏＋輪廓），樂句 A 之後用同樣的節奏與輪廓換到下一個和弦上再唱一次（A'），
// 第三句回到 A（副歌式的重複），第四句換一個對比的動機 B；強拍落在和弦音上，句尾落在和弦的穩定音。
type Bar = [number, number][];
const HOOK_R: Record<HookFamily, { a: Bar[]; b: Bar[] }> = {
  pop: {
    a: [
      [[0, 2], [2, 2], [4, 3], [7, 1], [8, 4], [12, 4]],
      [[0, 3], [3, 3], [6, 2], [8, 2], [10, 2], [12, 4]],
      [[2, 2], [4, 2], [6, 2], [8, 6], [14, 2]],
      [[0, 4], [4, 2], [6, 2], [8, 8]],
    ],
    b: [
      [[0, 2], [2, 2], [4, 2], [6, 2], [8, 8]],
      [[0, 3], [3, 3], [6, 2], [8, 6]],
      [[0, 2], [2, 2], [4, 4], [8, 4]],
    ],
  },
  kpop: {
    a: [
      [[0, 1], [1, 1], [2, 2], [4, 1], [5, 1], [6, 2], [8, 2], [10, 2], [12, 4]],
      [[0, 2], [2, 1], [3, 1], [4, 2], [6, 2], [8, 1], [9, 1], [10, 2], [12, 2], [14, 2]],
      [[0, 3], [3, 1], [4, 3], [7, 1], [8, 4], [12, 2], [14, 1], [15, 1]],
    ],
    b: [
      [[0, 2], [2, 2], [4, 1], [5, 1], [6, 2], [8, 8]],
      [[0, 1], [1, 1], [2, 2], [4, 4], [8, 4], [12, 4]],
    ],
  },
  rnb: {
    a: [
      [[2, 3], [5, 1], [6, 2], [8, 1], [10, 6]],
      [[0, 1], [1, 2], [4, 3], [7, 1], [8, 2], [11, 1], [12, 4]],
      [[3, 2], [6, 2], [9, 3], [12, 4]],
    ],
    b: [
      [[0, 4], [5, 3], [9, 2], [12, 4]],
      [[2, 2], [5, 2], [8, 8]],
    ],
  },
  ballad: {
    a: [
      [[0, 6], [6, 2], [8, 8]],
      [[0, 4], [4, 4], [8, 6], [14, 2]],
      [[2, 6], [8, 8]],
    ],
    b: [
      [[0, 8], [8, 4], [12, 4]],
      [[0, 6], [6, 2], [8, 4], [12, 4]],
    ],
  },
  rock: {
    a: [
      [[0, 4], [4, 2], [6, 2], [8, 4], [12, 2], [14, 2]],
      [[0, 2], [2, 2], [4, 4], [8, 2], [10, 2], [12, 4]],
      [[0, 3], [3, 1], [4, 4], [8, 4], [12, 4]],
    ],
    b: [
      [[0, 2], [2, 2], [4, 2], [6, 2], [8, 8]],
      [[0, 4], [4, 4], [8, 8]],
    ],
  },
  dance: {
    a: [
      [[0, 1], [3, 1], [6, 1], [8, 2], [11, 1], [14, 2]],
      [[0, 2], [4, 2], [6, 1], [8, 2], [12, 2], [14, 1]],
      [[2, 2], [6, 2], [10, 2], [14, 2]],
    ],
    b: [
      [[0, 2], [4, 2], [8, 4], [12, 4]],
      [[0, 1], [2, 1], [4, 2], [8, 6]],
    ],
  },
  latin: {
    a: [
      [[0, 3], [3, 3], [6, 2], [8, 3], [11, 3], [14, 2]],
      [[0, 2], [3, 2], [6, 2], [8, 2], [11, 2], [14, 2]],
    ],
    b: [
      [[0, 3], [3, 3], [6, 2], [8, 8]],
      [[0, 2], [3, 3], [6, 2], [10, 6]],
    ],
  },
  bossa: {
    a: [
      [[0, 2], [3, 2], [6, 3], [10, 2], [13, 3]],
      [[0, 3], [3, 3], [6, 4], [12, 4]],
    ],
    b: [
      [[0, 2], [3, 2], [6, 2], [8, 8]],
      [[2, 3], [6, 2], [8, 4], [12, 4]],
    ],
  },
  swing: {
    a: [
      [[0, 2], [3, 1], [4, 2], [7, 1], [8, 3], [12, 2], [14, 2]],
      [[2, 2], [4, 1], [6, 2], [8, 2], [11, 1], [12, 4]],
    ],
    b: [
      [[0, 4], [4, 2], [6, 2], [8, 8]],
      [[0, 2], [3, 1], [4, 4], [8, 8]],
    ],
  },
  classic: {
    a: [
      [[0, 4], [4, 4], [8, 4], [12, 2], [14, 2]],
      [[0, 2], [2, 2], [4, 4], [8, 6], [14, 2]],
    ],
    b: [
      [[0, 4], [4, 4], [8, 8]],
      [[0, 6], [6, 2], [8, 8]],
    ],
  },
};
/** 旋律輪廓（音階級數的起伏，會被拉伸到樂句的音符數上） */
const CONTOURS: number[][] = [
  [0, 1, 2, 1, 0, -1, 0],
  [2, 2, 1, 0, 1, 2, 3],
  [0, 2, 4, 3, 2, 0],
  [4, 3, 2, 3, 4, 5, 4],
  [0, 0, 2, 2, 4, 3, 1],
  [3, 4, 3, 1, 2, 0, 0],
  [1, 2, 3, 3, 2, 1, 0],
];

function genHook(c: Ctx): NoteEv[] {
  const L = c.spec.lead!;
  const fam = HOOK_R[L.family!];
  const [lo, hi] = L.range;
  const rr = rng(seedOf(c.seed, 71, 5));
  const n = SCALES[c.mode].length;
  const mid = nearestDegree(c.key, c.mode, Math.round((lo + hi) / 2) - 2);
  const pickBars = (): Bar[] => [fam.a[Math.floor(rr() * fam.a.length)], fam.b[Math.floor(rr() * fam.b.length)]];
  const motifs = {
    A: { id: 1, bars: pickBars(), contour: CONTOURS[Math.floor(rr() * CONTOURS.length)], home: mid },
    B: { id: 2, bars: pickBars(), contour: CONTOURS[Math.floor(rr() * CONTOURS.length)], home: mid + 2 },
  };
  const toneSet = (chordDeg: number) => new Set(chordDegrees(c.mode, chordDeg, 'triad').map((x) => ((x % n) + n) % n));
  const snap = (deg: number, chordDeg: number): number => {
    const tones = toneSet(chordDeg);
    for (const off of [0, -1, 1, -2, 2]) if (tones.has((((deg + off) % n) + n) % n)) return deg + off;
    return deg;
  };
  const toPitch = (deg: number) => {
    let p = scaleNote(c.key, c.mode, deg, 4);
    while (p > hi) p -= 12;
    while (p < lo) p += 12;
    return p;
  };
  const dens = clamp(L.density * (0.75 + 0.25 * c.spec.energy), 0.3, 1);
  const P = Math.ceil(c.bars / 2);
  const out: NoteEv[] = [];
  for (let p = 0; p < P; p++) {
    const kind = P === 1 ? 'A' : P === 2 ? (['A', 'A2'] as const)[p] : P === 3 ? (['A', 'A2', 'A'] as const)[p] : (['A', 'A2', 'A', 'B'] as const)[p % 4];
    const m = kind === 'B' ? motifs.B : motifs.A;
    const final = p === P - 1;
    const items: { bar: number; st: number; dur: number }[] = [];
    for (let k = 0; k < 2; k++) {
      const bar = p * 2 + k;
      if (bar >= c.bars) break;
      for (const [st, dur] of m.bars[k]) items.push({ bar, st, dur });
    }
    // 依密度刪音，但用動機自己的亂數，所以重複的樂句會刪掉同樣的音
    const kept = items.filter((it, i) => i === 0 || it.st === 0 || it.dur >= 3 || rng(seedOf(c.seed, 900 + m.id, i))() < dens);
    const cnt = kept.length;
    kept.forEach((it, i) => {
      const u = cnt > 1 ? i / (cnt - 1) : 0;
      const ci = m.contour[Math.min(m.contour.length - 1, Math.round(u * (m.contour.length - 1)))];
      let deg = m.home + ci;
      const chord = c.chordAt(it.bar, it.st);
      const last = i === cnt - 1;
      const strong = i === 0 || (it.st % 4 === 0 && it.dur >= 2);
      if (last) {
        // 句尾：最後一句落在和弦根音，A' 落在三音或五音（半終止），其餘落在和弦音
        const tones = chordDegrees(c.mode, chord.degree, 'triad');
        const target = final ? tones[0] : kind === 'A2' ? tones[1] : tones[2];
        let best = target;
        for (const o of [-n, 0, n]) if (Math.abs(target + o - deg) < Math.abs(best - deg)) best = target + o;
        deg = best;
      } else if (strong) deg = snap(deg, chord.degree);
      const hum = (rng(seedOf(c.seed, 700 + m.id, i + p * 31))() - 0.5) * 0.05;
      const t = it.bar * c.spb + it.st + (i === 0 ? 0 : hum);
      const accent = strong ? 0.86 : 0.7;
      const vel = clamp(accent + (kind === 'B' ? 0.05 : 0) + (c.spec.energy - 0.5) * 0.1 + hum, 0.35, 1);
      // 後面緊接休止時讓音符收短一點，保留呼吸
      out.push({ t, dur: Math.max(1, it.dur * L.legato), pitch: toPitch(deg), vel });
    });
  }
  // 音符不重疊
  out.sort((a, b) => a.t - b.t);
  for (let i = 0; i + 1 < out.length; i++) if (out[i].t + out[i].dur > out[i + 1].t) out[i].dur = Math.max(0.5, out[i + 1].t - out[i].t - 0.05);
  return out;
}

function genHarmony(c: Ctx, lead: NoteEv[]): NoteEv[] {
  return lead.map((n) => {
    const d = nearestDegree(c.key, c.mode, n.pitch);
    return { t: n.t, dur: n.dur, pitch: scaleNote(c.key, c.mode, d + (c.spec.harmonyStep ?? -2)), vel: n.vel * 0.62 };
  });
}

function genArp(c: Ctx): NoteEv[] {
  const A = c.spec.arp!;
  const out: NoteEv[] = [];
  const rate = A.rate;
  for (let b = 0; b < c.bars; b++) {
    for (const ch of c.chords[b]) {
      const pool = tonesInRange(ch.pitches, A.range[0], A.range[1]);
      if (pool.length < 2) continue;
      const seq =
        A.kind === 'up'
          ? pool
          : A.kind === 'updown'
            ? pool.concat(pool.slice(1, -1).reverse())
            : A.kind === 'broken'
              ? [0, 2, 1, 2, 3, 2, 1, 2].map((i) => pool[Math.min(i, pool.length - 1)])
              : [0, 1, 2, 1, 3, 2, 1, 0].map((i) => pool[Math.min(i, pool.length - 1)]);
      let i = 0;
      for (let s = 0; s < ch.len; s += rate) {
        const accent = (s % 4 === 0 ? 0.12 : 0) + (s % 8 === 0 ? 0.06 : 0);
        out.push({ t: b * c.spb + ch.start + s, dur: rate * 0.9, pitch: seq[i % seq.length], vel: clamp(A.vel + accent, 0.2, 0.8) });
        i++;
      }
    }
  }
  return out;
}

function bassRoot(pc: number, lo = 36): number {
  return lo + ((pc - (lo % 12) + 12) % 12);
}

function genBass(c: Ctx): NoteEv[] {
  const out: NoteEv[] = [];
  const kind = c.spec.bass;
  const e = c.spec.energy;
  const nextRoot = (b: number, ci: number): number => {
    const list = c.chords[b];
    if (ci + 1 < list.length) return bassRoot(list[ci + 1].rootPc);
    return bassRoot(c.chords[(b + 1) % c.bars][0].rootPc);
  };
  for (let b = 0; b < c.bars; b++) {
    c.chords[b].forEach((ch, ci) => {
      const base = b * c.spb + ch.start;
      const len = ch.len;
      const r = bassRoot(ch.rootPc);
      const fifth = r + 7;
      const add = (s: number, d: number, p: number, v: number) => {
        if (s < len) out.push({ t: base + s, dur: Math.min(d, len - s + 0.5), pitch: p, vel: clamp(v, 0.2, 1) });
      };
      switch (kind) {
        case 'root':
          add(0, len * 0.55, r, 0.8);
          if (len >= 12) add(Math.floor(len * 0.625), len * 0.3, ch.degree % 2 ? r : fifth, 0.6);
          break;
        case 'octave':
          for (let s = 0; s < len; s += 2) add(s, 1.7, s % 4 === 0 ? r : r + 12, s % 4 === 0 ? 0.85 : 0.7);
          break;
        case 'pedal':
          for (let s = 0; s < len; s += 2) add(s, 1.6, r + (s % 8 === 6 ? 12 : 0), s % 4 === 2 ? 0.85 : 0.65);
          break;
        case 'arpbass':
          for (let s = 0, i = 0; s < len; s += 2, i++) add(s, 1.8, [r, fifth, r + 12, fifth][i % 4], 0.75);
          break;
        case 'sync': {
          const pat: Pat = [[0, 2], [3, 1], [6, 2], [8, 2], [11, 1], [14, 2]];
          pat.forEach(([s, d], i) => add(s, d, [r, r + 12, r, fifth, r + 12, r][i % 6], i % 3 === 0 ? 0.9 : 0.7));
          break;
        }
        case 'walk': {
          const n = Math.max(1, Math.round(len / 4));
          const approach = nextRoot(b, ci);
          for (let i = 0; i < n; i++) {
            let p = r;
            if (i === 1) p = scaleNote(c.key, c.mode, ch.degree + 2, 2) + (r - scaleNote(c.key, c.mode, ch.degree, 2));
            if (i === 2) p = fifth;
            if (i === n - 1 && n > 1) p = approach + (approach > r ? -1 : 1);
            if (i === 1 && n === 2) p = fifth;
            add(i * 4, 3.6, clamp(p, 33, 58), i === 0 ? 0.85 : 0.72);
          }
          break;
        }
        case 'sustained':
          add(0, len * 1.02, r, 0.62);
          break;
        case 'fifth':
          add(0, len * 0.4, r, 0.8);
          add(Math.floor(len / 2), len * 0.4, fifth, 0.65);
          break;
        case 'oompah':
          add(0, 3, r, 0.8);
          add(Math.floor(len / 2), 3, fifth, 0.7);
          break;
        case 'pop': {
          // 3-3-2 的切分：根音為主，句尾用經過音帶向下一個和弦
          const approach = nextRoot(b, ci);
          add(0, 2.7, r, 0.9);
          add(3, 2.7, r, 0.7);
          add(6, 1.7, r + (len > 12 ? 12 : 0), 0.62);
          add(8, 2.7, r, 0.85);
          add(11, 2.7, r, 0.7);
          add(14, 1.7, approach > r ? approach - 2 : fifth, 0.62);
          break;
        }
        case 'kbass':
          add(0, 5, r, 0.92);
          add(6, 1.8, r, 0.7);
          add(8, 3.5, r, 0.85);
          add(12, 2.5, fifth - 12 + 12, 0.7);
          add(14, 1.5, r + 12, 0.6);
          break;
        case 'rnb': {
          const approach = nextRoot(b, ci);
          add(0, 5, r, 0.85);
          add(6, 2, r, 0.5);
          add(10, 4, ch.degree % 2 ? fifth : r, 0.75);
          add(14, 1.8, approach > r ? approach - 1 : approach + 1, 0.55);
          break;
        }
        case 'house':
          for (const s of [2, 6, 10, 14]) add(s, 1.6, s === 14 ? r + 12 : r, s === 2 ? 0.9 : 0.78);
          break;
        case 'rock8': {
          const approach = nextRoot(b, ci);
          for (let s = 0; s < len; s += 2) add(s, 1.75, s === len - 2 && approach !== r ? approach : r, s % 8 === 0 ? 0.92 : 0.78);
          break;
        }
        case 'bossa':
          add(0, 5, r, 0.8);
          add(6, 2.5, fifth, 0.62);
          add(8, 5, r, 0.74);
          add(14, 2, fifth, 0.6);
          break;
        case 'disco':
          for (let s = 0; s < len; s += 2) add(s, 1.7, s % 4 === 0 ? r : r + 12, s % 4 === 0 ? 0.88 : 0.74);
          break;
        case 'reggae':
          add(6, 2, r, 0.7);
          add(8, 4, r, 0.9);
          add(14, 2, fifth, 0.65);
          break;
        case 'trap808':
          add(0, 6, r, 0.95);
          add(8, 3, r, 0.85);
          add(12, 1.5, r, 0.7);
          add(14, 1.8, r + 12, 0.6);
          break;
        case 'tumbao':
          add(2, 3, r, 0.82);
          add(6, 2, r, 0.7);
          add(8, 2.5, fifth, 0.75);
          add(11, 3, r, 0.8);
          add(14, 2, r + 12 - 12, 0.65);
          break;
      }
    });
  }
  void e;
  return out;
}

function genComp(c: Ctx): NoteEv[] {
  const out: NoteEv[] = [];
  const kind = c.spec.comp;
  if (kind === 'none') return out;
  for (let b = 0; b < c.bars; b++) {
    c.chords[b].forEach((ch, ci) => {
      const base = b * c.spb + ch.start;
      const len = ch.len;
      const notes = voice(ch.pitches, 52, 76, 64);
      const hit = (s: number, d: number, v: number) => {
        if (s >= len) return;
        for (const p of notes) out.push({ t: base + s, dur: Math.min(d, len - s), pitch: p, vel: clamp(v, 0.2, 0.9) });
      };
      const half = c.meter === 3 ? 4 : 4;
      void half;
      switch (kind) {
        case 'stabs':
          for (const [s, v] of c.spec.id === 'funk' ? ([[0, 0.75], [3, 0.55], [6, 0.65], [10, 0.6], [12, 0.5]] as [number, number][]) : ([[0, 0.7], [6, 0.55], [10, 0.5]] as [number, number][])) hit(s, 2, v);
          break;
        case 'charleston':
          hit(0, 5, 0.62);
          hit(6, 3, 0.52);
          break;
        case 'skank':
          hit(4, 2, 0.6);
          hit(12, 2, 0.6);
          break;
        case 'block':
          for (let s = 0; s < len; s += 4) hit(s, 3, s === 0 ? 0.65 : 0.5);
          break;
        case 'oompah':
          if (c.meter === 3) {
            hit(4, 3, 0.55);
            hit(8, 3, 0.5);
          } else {
            hit(4, 3, 0.6);
            hit(12, 3, 0.6);
          }
          break;
        case 'strum': {
          const seq = [0, 1, 2, 1, 3, 1, 2, 1];
          for (let s = 0, i = 0; s < len; s += 2, i++) {
            const p = notes[seq[i % seq.length] % notes.length];
            out.push({ t: base + s, dur: 3, pitch: p, vel: s % 8 === 0 ? 0.62 : 0.46 });
          }
          break;
        }
        case 'pianoPop': {
          // 3-3-2 切分；第一拍與第三拍再加一個低八度的根音，像左手
          const hits: [number, number, number][] = [[0, 2.8, 0.7], [3, 2.8, 0.55], [6, 1.8, 0.6], [8, 2.8, 0.66], [11, 2.8, 0.55], [14, 1.8, 0.55]];
          for (const [s, d, v] of hits) {
            hit(s, d, v + (c.meter === 4 ? 0 : 0));
            if ((s === 0 || s === 8) && s < len) out.push({ t: base + s, dur: Math.min(d + 1, len - s), pitch: ch.pitches[0] - 12 + (ch.pitches[0] - 12 < 36 ? 12 : 0), vel: 0.5 });
          }
          break;
        }
        case 'pianoBallad': {
          // 分解和弦：低音 → 五音 → 高八度 → 三音，每兩步一個音
          const root = ch.pitches[0] - (ch.pitches[0] > 52 ? 12 : 0);
          const third = notes.find((p) => ((p - ch.pitches[0]) % 12 + 12) % 12 === 4 || ((p - ch.pitches[0]) % 12 + 12) % 12 === 3) ?? notes[1] ?? root + 4;
          const fifth = root + 7;
          const seq = [root, fifth, root + 12, third + (third < 60 ? 12 : 0), fifth + 12, third + (third < 60 ? 12 : 0), root + 12, fifth];
          for (let s = 0, i = 0; s < len; s += 2, i++) out.push({ t: base + s, dur: 3.6, pitch: seq[i % seq.length], vel: s % 8 === 0 ? 0.6 : 0.42 });
          break;
        }
        case 'strumGuitar': {
          // 下刷 / 上刷：音符依序錯開一點點，像真的在掃弦
          const gtr = voice(ch.pitches, 48, 72, 58);
          const hits: [number, number, boolean][] = [[0, 0.64, true], [4, 0.54, true], [6, 0.44, false], [10, 0.44, false], [12, 0.58, true], [14, 0.44, false]];
          for (const [s, v, down] of hits) {
            if (s >= len) continue;
            const order = down ? gtr : [...gtr].reverse();
            order.forEach((p, k) => out.push({ t: base + s + k * 0.07, dur: Math.min(3, len - s), pitch: p, vel: clamp(v - k * 0.01, 0.2, 0.9) }));
          }
          break;
        }
        case 'offbeat':
          for (const s of [2, 6, 10, 14]) hit(s, 1.3, s === 2 ? 0.64 : 0.56);
          break;
        case 'rnbKeys': {
          const keys = voice(ch.pitches, 55, 79, 66);
          for (const [s, d, v] of [[0, 5, 0.6], [6, 2.5, 0.42], [10, 5, 0.55]] as [number, number, number][]) {
            if (s >= len) continue;
            keys.forEach((p, k) => out.push({ t: base + s + k * 0.03, dur: Math.min(d, len - s + 1), pitch: p, vel: v }));
          }
          break;
        }
        case 'powerChug': {
          const root = ch.pitches[0] > 55 ? ch.pitches[0] - 12 : ch.pitches[0];
          const pc = [root, root + 7, root + 12];
          for (let s = 0; s < len; s += 2) {
            const open = s === len - 2;
            for (const p of pc) out.push({ t: base + s, dur: open ? 2.6 : 1.5, pitch: p, vel: s % 4 === 0 ? 0.78 : 0.6 });
          }
          break;
        }
        case 'bossaGtr':
          for (const [s, v] of [[0, 0.55], [3, 0.44], [6, 0.5], [10, 0.5], [13, 0.44]] as [number, number][]) hit(s, 2.6, v);
          break;
        case 'alberti': {
          const trio = voice(ch.pitches, 48, 67, 57);
          const per = c.meter === 3 ? 6 : 8;
          const seq = [0, 2, 1, 2];
          for (let i = 0; i < per; i++) {
            const s = i * 2;
            if (s >= len) break;
            out.push({ t: base + s, dur: 2.3, pitch: trio[seq[i % 4] % trio.length], vel: i % 4 === 0 ? 0.5 : 0.38 });
          }
          break;
        }
        case 'dembow':
          for (const [s, v] of [[0, 0.62], [3, 0.5], [6, 0.5], [8, 0.6], [11, 0.5], [14, 0.5]] as [number, number][]) hit(s, 1.8, v);
          break;
        case 'discoGtr': {
          const scratch = voice(ch.pitches, 60, 79, 70).slice(0, 3);
          for (const s of [0, 2, 3, 4, 6, 7, 8, 10, 11, 12, 14, 15]) {
            if (s >= len) continue;
            scratch.forEach((p, k) => out.push({ t: base + s + k * 0.02, dur: 0.7, pitch: p, vel: s % 4 === 0 ? 0.5 : 0.36 }));
          }
          break;
        }
      }
      void ci;
    });
  }
  return out;
}

function genPad(c: Ctx): NoteEv[] {
  const out: NoteEv[] = [];
  for (let b = 0; b < c.bars; b++) {
    for (const ch of c.chords[b]) {
      const notes = voice(ch.pitches, 50, 74, 62);
      for (const p of notes) out.push({ t: b * c.spb + ch.start, dur: ch.len + 0.4, pitch: p, vel: 0.42 });
    }
  }
  return out;
}

function parseDrum(p: string | undefined, spb: number): [number, number][] {
  if (!p) return [];
  const out: [number, number][] = [];
  for (let i = 0; i < Math.min(p.length, spb); i++) {
    const ch = p[i];
    if (ch === 'x') out.push([i, 0.7]);
    else if (ch === 'X') out.push([i, 0.95]);
    else if (ch === 'o') out.push([i, 0.32]);
  }
  return out;
}

function genDrums(c: Ctx): NoteEv[] {
  const out: NoteEv[] = [];
  // 鼓型是 none 的曲風（鋼琴獨奏、純樂器…）完全不放鼓；三拍子才用華爾茲鼓型
  if (c.spec.drums === 'none') return out;
  const base = DRUMS[c.spec.drums] ?? {};
  const pat = c.meter === 3 ? DRUMS.waltz : base;
  const names = Object.keys(pat) as DrumName[];
  const rollable = ['chip', 'chipFast', 'rock', 'fourFloor', 'techno', 'pop', 'funk', 'boomBap', 'march', 'popBeat', 'popLift', 'kpop', 'rockBeat', 'rockDrive', 'house', 'disco', 'cityPop', 'hiphop'].includes(c.spec.drums);
  const r = rng(seedOf(c.seed, 99, 3));
  for (let b = 0; b < c.bars; b++) {
    const fill = rollable && c.bars >= 4 && b % 4 === 3 && c.meter === 4;
    for (const name of names) {
      const hits = parseDrum(pat[name], c.spb);
      for (const [s, v] of hits) {
        if (fill && s >= 12 && (name === 'hatC' || name === 'hatO' || name === 'shaker' || name === 'kick')) continue;
        const accent = name === 'hatC' || name === 'shaker' || name === 'hatO' ? (s % 4 === 0 ? 0.1 : -0.05) : 0;
        // 能量低的曲風，鈸、沙鈴這類高頻打擊要收小聲，不然會蓋過旋律
        const soft = ['hatC', 'hatP', 'hatO', 'shaker', 'tamb', 'ride'].includes(name) ? 0.5 + 0.5 * c.spec.energy : 0.75 + 0.25 * c.spec.energy;
        out.push({ t: b * c.spb + s, dur: 1, pitch: DRUM_NOTE[name], vel: clamp((v + accent) * soft + (r() - 0.5) * 0.08, 0.12, 1) });
      }
    }
    if (fill) {
      out.push({ t: b * c.spb + 12, dur: 1, pitch: DRUM_NOTE.tomH, vel: 0.7 });
      out.push({ t: b * c.spb + 13, dur: 1, pitch: DRUM_NOTE.tomM, vel: 0.75 });
      out.push({ t: b * c.spb + 14, dur: 1, pitch: DRUM_NOTE.tomL, vel: 0.85 });
      out.push({ t: b * c.spb + 15, dur: 1, pitch: DRUM_NOTE.snare, vel: 0.95 });
    }
    if (c.spec.drums === 'soft' && b % 2 === 0) out.push({ t: b * c.spb, dur: 2, pitch: DRUM_NOTE.tomL, vel: 0.6 });
  }
  if (c.spec.crash) out.push({ t: 0, dur: 4, pitch: DRUM_NOTE.crash, vel: 0.7 });
  return out;
}

// ---------- 主函式 ----------
export interface ComposeOpts {
  genre: GenreId;
  seed: number;
  animSeconds: number;
  sync: boolean;
  /** 速度倍率 */
  tempo: number;
  /** -1 自動 */
  key: number;
  /** 額外的速度偏好（風格混合給的修正倍率） */
  bpmMul?: number;
  /** 風格給的能量修正 */
  energyMul?: number;
  /** 優先讓每次動畫循環剛好是整數拍（視覺有節拍脈動時） */
  preferLock?: boolean;
  /** 名曲 id（classics.ts）：旋律與和弦照原曲，genre 變成「編曲風格」；'import' 是使用者匯入的 MIDI */
  piece?: string;
  /** 匯入的 MIDI：從第幾小節開始、取幾小節（0＝自動） */
  midiStart?: number;
  midiBars?: number;
}

export function composeSong(o: ComposeOpts): Song {
  if (o.piece === 'import') {
    const imp = getImportedMidi();
    if (imp) return songFromMidi(imp, { animSeconds: o.animSeconds, sync: o.sync, tempo: o.tempo, key: o.key, start: o.midiStart ?? 0, bars: o.midiBars ?? 0, preferLock: o.preferLock });
  }
  if (o.piece && PIECE_BY_ID[o.piece]) return composeFromPiece(o);
  const base = GENRES[o.genre];
  const spec: GenreSpec = o.energyMul && o.energyMul !== 1 ? { ...base, energy: clamp(base.energy * o.energyMul, 0.1, 1) } : base;
  const rnd = rng(seedOf(o.seed, strSeed(o.genre) & 0xffff, 5));
  const meter = spec.meter ?? 4;
  const spb = meter === 3 ? 12 : 16;
  const target = lerp(spec.bpm[0], spec.bpm[1], rnd()) * o.tempo * (o.bpmMul ?? 1);
  const plan = planLoop(o.animSeconds, target, meter, o.sync, !!o.preferLock);
  const key = o.key >= 0 ? o.key : spec.keys[Math.floor(rnd() * spec.keys.length)];
  const mode = spec.modes[Math.floor(rnd() * spec.modes.length)];
  const prog = spec.progs[Math.floor(rnd() * spec.progs.length)];
  const perBar = spec.chordsPerBar ?? 1;
  const bars = plan.bars;
  const seed = seedOf(o.seed, strSeed(o.genre) & 0xffff, 1);

  // 和弦
  const chords: BarChord[][] = [];
  const chordInfos: ChordInfo[] = [];
  const nSeg = bars * perBar;
  for (let b = 0; b < bars; b++) {
    const row: BarChord[] = [];
    for (let ci = 0; ci < perBar; ci++) {
      const seg = b * perBar + ci;
      // 進行比小節少時等距取樣，比小節多時循環
      const idx = nSeg >= prog.length ? seg % prog.length : Math.floor((seg * prog.length) / nSeg);
      const degree = prog[idx];
      const pitches = chordPitches(key, mode, degree, spec.chordKind, 48);
      const start = ci * (spb / perBar);
      const info = chordLabel(pitches);
      row.push({ degree, start, len: spb / perBar, pitches, rootPc: info.root });
      chordInfos.push({ bar: b, step: start, root: info.root, quality: info.quality, notes: pitches, label: info.label });
    }
    chords.push(row);
  }
  const ctx: Ctx = {
    spec,
    seed,
    bars,
    spb,
    meter,
    key,
    mode,
    chords,
    chordAt: (bar, step) => {
      const row = chords[bar % bars];
      let cur = row[0];
      for (const ch of row) if (step >= ch.start) cur = ch;
      return cur;
    },
  };

  const tracks: Track[] = [];
  const push = (id: string, role: TrackRole, notes: NoteEv[], gain: number, pan: number, drum = false) => {
    if (!notes.length) return;
    tracks.push({ id, role, program: spec.prog[role] ?? 0, notes, pan, gain, drum });
  };
  const lead = spec.lead ? genLead(ctx) : [];
  push('lead', 'lead', lead, 0.95, 0, false);
  if (spec.harmony) push('counter', 'counter', genHarmony(ctx, lead), 0.7, 0.22);
  if (spec.arp) push('arp', 'arp', genArp(ctx), 0.62, -0.3);
  push('bass', 'bass', genBass(ctx), 0.95, 0);
  if (spec.pad) push('pad', 'pad', genPad(ctx), 0.55, 0.12);
  if (spec.comp !== 'none') push('chord', 'chord', genComp(ctx), 0.7, 0.28);
  push('drums', 'perc', genDrums(ctx), 1, 0, true);
  const dt = tracks.find((t) => t.drum);
  if (dt) dt.kit = spec.kit ?? KIT_BY_DRUMS[spec.drums] ?? 'hybrid';

  const stepSec = 60 / plan.bpm / 4;
  const steps = bars * spb;
  return {
    title: `${spec.name} · ${NOTE_NAMES[key]} ${MODE_NAME[mode]} · ${Math.round(plan.bpm)} BPM`,
    genre: o.genre,
    bpm: plan.bpm,
    meter,
    stepsPerBar: spb,
    bars,
    steps,
    swing: spec.swing,
    key,
    mode,
    tracks,
    chords: chordInfos,
    seconds: steps * stepSec,
    animSeconds: o.animSeconds,
    animLoops: plan.animLoops,
    beatLocked: plan.beatLocked,
  };
}

// ---------- 名曲 ----------
/** 名曲的循環：整首（可重複 reps 次）剛好是動畫循環的整數倍。XM 只有一個 256 列的樂段，所以總步數不能超過 256。 */
export function planPieceLoop(animSeconds: number, bars: number, meter: 3 | 4, target: number, sync: boolean, preferLock = false): LoopPlan & { reps: number } {
  const spb = meter === 3 ? 12 : 16;
  const beats = bars * meter;
  const maxReps = Math.max(1, Math.min(4, Math.floor(256 / (bars * spb))));
  if (sync) {
    let best: (LoopPlan & { reps: number; score: number }) | null = null;
    for (let reps = 1; reps <= maxReps; reps++) {
      for (let k = 1; k <= 60; k++) {
        const len = k * animSeconds;
        const bpm = (reps * beats * 60) / len;
        if (bpm < 40 || bpm > 200) continue;
        const locked = (reps * beats) % k === 0;
        let score = Math.abs(Math.log(bpm / target)) * 1.6 + (reps - 1) * 0.06;
        if (!locked) score += preferLock ? 0.9 : 0.1;
        if (len < 8) score += (8 - len) * 0.08;
        if (len > 75) score += (len - 75) * 0.03;
        if (!best || score < best.score) best = { bars: bars * reps, bpm, animLoops: k, synced: true, beatLocked: locked, reps, score };
      }
    }
    if (best) return { bars: best.bars, bpm: best.bpm, animLoops: best.animLoops, synced: true, beatLocked: best.beatLocked, reps: best.reps };
  }
  return { bars, bpm: clamp(target, 40, 200), animLoops: 0, synced: false, beatLocked: false, reps: 1 };
}

/** 用名曲的旋律與和弦，配上指定曲風的低音、伴奏、鼓與音色 */
function composeFromPiece(o: ComposeOpts): Song {
  const pp = parsePiece(PIECE_BY_ID[o.piece!]);
  const piece = pp.piece;
  const base = GENRES[o.genre];
  const meter = piece.meter;
  const spb = pp.spb;
  const perBar = piece.chordsPerBar;
  const spec: GenreSpec = { ...base, meter, chordsPerBar: perBar, energy: clamp(base.energy * (o.energyMul ?? 1), 0.1, 1), harmony: piece.round ? false : base.harmony };
  const target = piece.bpm * o.tempo * clamp(o.bpmMul ?? 1, 0.88, 1.12);
  const plan = planPieceLoop(o.animSeconds, pp.bars, meter, target, o.sync, !!o.preferLock);
  const reps = plan.bars / pp.bars;
  const bars = plan.bars;
  // 移調：選了調性就把整首平移到那個調（取 −5…+6 個半音，音域變化最小）
  const want = o.key >= 0 ? o.key : piece.key;
  let sh = (((want - piece.key) % 12) + 12) % 12;
  if (sh > 6) sh -= 12;
  const key = (piece.key + sh + 12) % 12;
  const mode = piece.mode;

  const chords: BarChord[][] = [];
  const chordInfos: ChordInfo[] = [];
  for (let b = 0; b < bars; b++) {
    const row: BarChord[] = pp.chords[b % pp.bars].map((pc, ci) => {
      const rootPc = (pc.rootPc + sh + 12) % 12;
      let r = 48 + rootPc;
      if (r > 53) r -= 12;
      const pitches = pc.intervals.map((i) => r + i);
      const start = ci * (spb / perBar);
      const info = chordLabel(pitches);
      chordInfos.push({ bar: b, step: start, root: info.root, quality: info.quality, notes: pitches, label: info.label });
      return { degree: nearestDegree(key, mode, r), start, len: spb / perBar, pitches, rootPc };
    });
    chords.push(row);
  }
  const ctx: Ctx = {
    spec,
    seed: seedOf(o.seed, strSeed(piece.id) & 0xffff, 1),
    bars,
    spb,
    meter,
    key,
    mode,
    chords,
    chordAt: (bar, step) => {
      let cur = chords[bar % bars][0];
      for (const ch of chords[bar % bars]) if (step >= ch.start) cur = ch;
      return cur;
    },
  };

  const steps = bars * spb;
  const legato = piece.legato ?? 0.95;
  const lead: NoteEv[] = [];
  for (let rep = 0; rep < reps; rep++) {
    for (const n of pp.notes) {
      const t = rep * pp.bars * spb + n.t;
      lead.push({ t, dur: clamp(n.dur * legato, 0.5, steps - t), pitch: n.pitch + sh, vel: clamp((n.t % spb === 0 ? 0.9 : n.t % 4 === 0 ? 0.82 : 0.72) + (spec.energy - 0.5) * 0.1, 0.35, 1) });
    }
  }

  const tracks: Track[] = [];
  const push = (id: string, role: TrackRole, notes: NoteEv[], gain: number, pan: number, drum = false) => {
    if (!notes.length) return;
    tracks.push({ id, role, program: spec.prog[role] ?? 0, notes, pan, gain, drum });
  };
  push('lead', 'lead', lead, 0.95, 0);
  if (piece.round) {
    const delay = piece.round * spb;
    push('round', 'counter', lead.map((n) => ({ ...n, t: (n.t + delay) % steps, dur: Math.min(n.dur, steps - ((n.t + delay) % steps)), vel: n.vel * 0.72 })).sort((a, b) => a.t - b.t), 0.8, 0.25);
  }
  if (spec.harmony) push('counter', 'counter', genHarmony(ctx, lead), 0.7, 0.22);
  if (spec.arp) push('arp', 'arp', genArp(ctx), 0.62, -0.3);
  push('bass', 'bass', genBass(ctx), 0.95, 0);
  if (spec.pad) push('pad', 'pad', genPad(ctx), 0.55, 0.12);
  if (spec.comp !== 'none') push('chord', 'chord', genComp(ctx), 0.7, 0.28);
  push('drums', 'perc', genDrums(ctx), 1, 0, true);
  const dt = tracks.find((t) => t.drum);
  if (dt) dt.kit = spec.kit ?? KIT_BY_DRUMS[spec.drums] ?? 'hybrid';

  const stepSec = 60 / plan.bpm / 4;
  return {
    title: `${piece.name} · ${GENRES[o.genre].name}編曲 · ${NOTE_NAMES[key]} ${MODE_NAME[mode]} · ${Math.round(plan.bpm)} BPM`,
    genre: o.genre,
    bpm: plan.bpm,
    meter,
    stepsPerBar: spb,
    bars,
    steps,
    swing: spec.swing,
    key,
    mode,
    tracks,
    chords: chordInfos,
    seconds: steps * stepSec,
    animSeconds: o.animSeconds,
    animLoops: plan.animLoops,
    beatLocked: plan.beatLocked,
  };
}

/** 步數 → 秒（含搖擺：每拍的後半拍延後） */
export function stepToSec(song: Pick<Song, 'bpm' | 'swing'>, t: number): number {
  const beat = Math.floor(t / 4);
  const x = t - beat * 4;
  const d = song.swing * 2;
  const w = x < 2 ? (x * (2 + d)) / 2 : 2 + d + ((x - 2) * (2 - d)) / 2;
  return (beat * 4 + w) * (60 / song.bpm / 4);
}

export { SCALES };
