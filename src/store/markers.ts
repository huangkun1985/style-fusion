// 標記黏在場景上（2.0 正式）：純函數，film.ts 與 scripts/film-test.ts 共用。
import type { Marker } from './project';

/** 一場在片子裡的位置 */
export interface Span {
  id: string;
  start: number;
  dur: number;
}

/** 標記的時間：黏在場景上的＝那一場的開始＋off（場景變短時停在那一場的結尾）；沒黏或那一場被刪掉＝存著的 t */
export function markerTime(shots: Span[], total: number, m: Marker): number {
  const sh = m.scene ? shots.find((x) => x.id === m.scene) : undefined;
  if (sh && m.off !== undefined) return Math.round((sh.start + Math.min(m.off, Math.max(0, sh.dur - 0.01))) * 100) / 100;
  return Math.max(0, Math.min(m.t, Math.max(0, total - 0.01)));
}

/** 片子時間 t 黏到哪一場：那一場的 id 與局部時間 */
export function anchorAt(model: { shots: Span[]; total: number }, t: number): { scene: string; off: number } | null {
  const tt = Math.max(0, Math.min(t, model.total - 0.001));
  const sh = model.shots.find((x) => tt >= x.start && tt < x.start + x.dur) ?? model.shots[model.shots.length - 1];
  return sh ? { scene: sh.id, off: Math.round((tt - sh.start) * 100) / 100 } : null;
}

