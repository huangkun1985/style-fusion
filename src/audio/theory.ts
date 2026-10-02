// 音樂理論：音階、和弦、聲部排列。純函數，無 DOM 依賴（Node 測試也能跑）。
import { NOTE_NAMES } from './types';

export const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  harmMinor: [0, 2, 3, 5, 7, 8, 11],
  pentMaj: [0, 2, 4, 7, 9],
  pentMin: [0, 3, 5, 7, 10],
  hirajoshi: [0, 2, 3, 7, 8],
  inSen: [0, 1, 5, 7, 8],
} as const;
export type Mode = keyof typeof SCALES;

export const MODE_NAME: Record<Mode, string> = {
  major: '大調',
  minor: '自然小調',
  dorian: '多利安',
  mixolydian: '米索利底安',
  lydian: '利底安',
  phrygian: '弗里吉安',
  harmMinor: '和聲小調',
  pentMaj: '大調五聲',
  pentMin: '小調五聲',
  hirajoshi: '平調子',
  inSen: '陰旋',
};

export const isPenta = (m: Mode) => SCALES[m].length === 5;

/** 音階第 degree 級（可為負、可超過一個八度）的 MIDI 音高。root 為 pitch class 0–11，oct4 的 C = 60。 */
export function scaleNote(root: number, mode: Mode, degree: number, baseOct = 4): number {
  const sc = SCALES[mode];
  const n = sc.length;
  const oct = Math.floor(degree / n);
  const idx = ((degree % n) + n) % n;
  return 12 * (baseOct + 1) + root + sc[idx] + 12 * oct;
}

/** 找出最接近某音高的音階級數（在 scaleNote 的座標系中） */
export function nearestDegree(root: number, mode: Mode, pitch: number, baseOct = 4): number {
  const n = SCALES[mode].length;
  let best = 0;
  let bd = Infinity;
  const center = Math.round(((pitch - 12 * (baseOct + 1) - root) / 12) * n);
  for (let d = center - n; d <= center + n; d++) {
    const dist = Math.abs(scaleNote(root, mode, d, baseOct) - pitch);
    if (dist < bd) {
      bd = dist;
      best = d;
    }
  }
  return best;
}

export type ChordKind = 'triad' | 'seventh' | 'sus' | 'power' | 'add9' | 'ninth' | 'sixth';

/** 級數 d 上的和弦音（相對音階級數）。七聲音階用疊三度，五聲音階用「根音、三級、四級」的開放和聲。 */
export function chordDegrees(mode: Mode, d: number, kind: ChordKind): number[] {
  if (isPenta(mode)) return kind === 'power' ? [d, d + 3] : [d, d + 2, d + 3];
  if (kind === 'power') return [d, d + 4];
  if (kind === 'sus') return [d, d + 3, d + 4];
  if (kind === 'seventh') return [d, d + 2, d + 4, d + 6];
  if (kind === 'add9') return [d, d + 2, d + 4, d + 8];
  if (kind === 'ninth') return [d, d + 2, d + 4, d + 6, d + 8];
  if (kind === 'sixth') return [d, d + 2, d + 4, d + 5];
  return [d, d + 2, d + 4];
}

/** 和弦實際音高（MIDI），最低音接近 low */
export function chordPitches(root: number, mode: Mode, d: number, kind: ChordKind, low = 48): number[] {
  const degs = chordDegrees(mode, d, kind);
  const base = scaleNote(root, mode, d, 4);
  let shift = 0;
  while (base + shift - 12 >= low - 6) shift -= 12;
  while (base + shift < low - 6) shift += 12;
  return degs.map((dd) => scaleNote(root, mode, dd, 4) + shift);
}

/** 把和弦音排進 [lo, hi]，盡量靠近 center */
export function voice(pitches: number[], lo: number, hi: number, center: number): number[] {
  const out = pitches.map((p) => {
    let q = p;
    while (q < lo) q += 12;
    while (q > hi) q -= 12;
    return q;
  });
  out.sort((a, b) => a - b);
  // 若整體偏離中心超過半個八度就整組移位
  const mean = out.reduce((s, x) => s + x, 0) / out.length;
  if (mean - center > 7 && out[0] - 12 >= lo) return out.map((x) => x - 12);
  if (center - mean > 7 && out[out.length - 1] + 12 <= hi) return out.map((x) => x + 12);
  return out;
}

const QUALITY: [string, number[]][] = [
  ['maj9', [0, 2, 4, 7, 11]],
  ['m9', [0, 2, 3, 7, 10]],
  ['9', [0, 2, 4, 7, 10]],
  ['m11', [0, 2, 3, 5, 7, 10]],
  ['maj7', [0, 4, 7, 11]],
  ['m7', [0, 3, 7, 10]],
  ['7', [0, 4, 7, 10]],
  ['m7♭5', [0, 3, 6, 10]],
  ['dim7', [0, 3, 6, 9]],
  ['m', [0, 3, 7]],
  ['', [0, 4, 7]],
  ['dim', [0, 3, 6]],
  ['aug', [0, 4, 8]],
  ['sus4', [0, 5, 7]],
  ['sus2', [0, 2, 7]],
  ['5', [0, 7]],
  ['6', [0, 4, 7, 9]],
  ['m6', [0, 3, 7, 9]],
  ['add9', [0, 2, 4, 7]],
];

/** 由實際音高推出和弦名稱（顯示用） */
export function chordLabel(pitches: number[]): { root: number; quality: string; label: string } {
  const pcs = [...new Set(pitches.map((p) => ((p % 12) + 12) % 12))];
  let best = { root: pcs[0] ?? 0, quality: '', score: -1 };
  for (const r of pcs) {
    const iv = pcs.map((p) => (p - r + 12) % 12).sort((a, b) => a - b);
    for (const [q, tpl] of QUALITY) {
      if (iv.length === tpl.length && tpl.every((t, i) => t === iv[i])) {
        const score = 10 + (r === ((pitches[0] % 12) + 12) % 12 ? 2 : 0) - QUALITY.findIndex(([n]) => n === q) * 0.01;
        if (score > best.score) best = { root: r, quality: q, score };
      }
    }
  }
  if (best.score < 0) {
    const r = ((pitches[0] % 12) + 12) % 12;
    return { root: r, quality: 'add', label: `${NOTE_NAMES[r]}add` };
  }
  return { root: best.root, quality: best.quality, label: `${NOTE_NAMES[best.root]}${best.quality}` };
}

export const midiName = (p: number) => `${NOTE_NAMES[((p % 12) + 12) % 12]}${Math.floor(p / 12) - 1}`;
export const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
