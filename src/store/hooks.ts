import { useMemo } from 'react';
import { planAudio } from '../audio/plan';
import { MOTION_MAP } from '../data/motion';
import type { Sel } from '../data/schema';
import { VISUAL_MAP } from '../data/visual';
import { resolveLook, resolveMove, TUNE_DEFAULT } from '../engine/resolve';
import type { ThumbSpec } from '../engine/thumbs';
import type { SubjectId, Tune } from '../engine/types';
import { useStore } from './store';

/** 目前混合對應的音樂計畫（不論聲音是否開啟都會算，介面要顯示「會是什麼音樂」） */
export function useAudioPlan() {
  const v = useStore((s) => s.v);
  const m = useStore((s) => s.m);
  const tune = useStore((s) => s.tune);
  const subject = useStore((s) => s.subject);
  const prefs = useStore((s) => s.audio);
  const baseMove = useMemo(() => resolveMove(m, MOTION_MAP, tune), [m, tune]);
  const plan = useMemo(() => planAudio({ v, m, subject, tune, prefs, baseMove }), [v, m, subject, tune, prefs, baseMove]);
  return { plan, baseMove, prefs, subject, v, m, tune };
}

export function useLookMove() {
  const { plan, baseMove, prefs, v, m, tune } = useAudioPlan();
  const look = useMemo(() => resolveLook(v, VISUAL_MAP, tune), [v, tune]);
  // 節拍連動：音樂與動畫的整數拍對齊時，視覺的節拍脈動改用音樂的 BPM
  const move = useMemo(
    () => (prefs.on && prefs.bgm && plan.song.beatLocked && baseMove.beat + baseMove.zoomPunch > 0.05 ? { ...baseMove, bpm: plan.song.bpm } : baseMove),
    [baseMove, plan, prefs.on, prefs.bgm],
  );
  return { look, move, v, m, tune };
}

export type ThumbMode = 'solo' | 'subject' | 'stack';

const cache = new Map<string, ThumbSpec>();
const sig = (l: Sel[]) => l.map((x) => `${x.id}${x.w}`).join(',');

/** 風格縮圖的渲染規格：單獨／套用目前主體／疊加到目前混合上 */
export function styleSpec(kind: 'v' | 'm', id: string, mode: ThumbMode, cur: { v: Sel[]; m: Sel[]; subject: SubjectId; tune: Tune }): ThumbSpec {
  const st = kind === 'v' ? VISUAL_MAP[id] : MOTION_MAP[id];
  const subject: SubjectId = mode === 'solo' ? (st?.demo ?? (kind === 'v' ? 'mascot' : 'mascot')) : cur.subject;
  const key = `${kind}|${id}|${mode}|${subject}|${mode === 'stack' ? sig(cur.v) + '/' + sig(cur.m) + JSON.stringify(cur.tune) : ''}`;
  let s = cache.get(key);
  if (s) return s;
  const tune = mode === 'stack' ? cur.tune : TUNE_DEFAULT;
  let v: Sel[] = [];
  let m: Sel[] = [];
  if (kind === 'v') {
    v = mode === 'stack' ? [...cur.v.filter((x) => x.id !== id), { id, w: 1 }] : [{ id, w: 1 }];
    m = mode === 'stack' ? cur.m : [];
  } else {
    m = mode === 'stack' ? [...cur.m.filter((x) => x.id !== id), { id, w: 1 }] : [{ id, w: 1 }];
    v = mode === 'stack' ? cur.v : [];
  }
  s = { subject, look: resolveLook(v, VISUAL_MAP, tune), move: resolveMove(m, MOTION_MAP, tune), tune };
  if (cache.size > 900) cache.clear();
  cache.set(key, s);
  return s;
}

const mixCache = new Map<string, ThumbSpec>();
export function mixSpec(v: Sel[], m: Sel[], subject: SubjectId, tune: Tune = TUNE_DEFAULT): ThumbSpec {
  const key = `${sig(v)}|${sig(m)}|${subject}|${JSON.stringify(tune)}`;
  let s = mixCache.get(key);
  if (!s) {
    s = { subject, look: resolveLook(v, VISUAL_MAP, tune), move: resolveMove(m, MOTION_MAP, tune), tune };
    if (mixCache.size > 300) mixCache.clear();
    mixCache.set(key, s);
  }
  return s;
}
