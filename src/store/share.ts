// 配方碼：把一組混合狀態編成可貼上的短字串（也用於網址 #mix=）
import type { Sel } from '../data/schema';
import type { SubjectId, Tune } from '../engine/types';
import { MOTION_MAP } from '../data/motion';
import { VISUAL_MAP } from '../data/visual';
import { SUBJECTS } from '../engine/subjects';

export interface MixCode {
  v: Sel[];
  m: Sel[];
  s: SubjectId;
  t?: Partial<Tune>;
  n?: string;
}

const b64e = (s: string) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64d = (s: string) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));

export function encodeMix(m: MixCode): string {
  const compact = {
    v: m.v.map((x) => `${x.id}:${Math.round(x.w * 100)}`).join(','),
    m: m.m.map((x) => `${x.id}:${Math.round(x.w * 100)}`).join(','),
    s: m.s,
    t: m.t,
    n: m.n,
  };
  return 'SF1.' + b64e(JSON.stringify(compact));
}

export function decodeMix(code: string): MixCode | null {
  try {
    const raw = code.trim().replace(/^.*?SF1\./, '');
    const o = JSON.parse(b64d(raw)) as { v: string; m: string; s: string; t?: Partial<Tune>; n?: string };
    const parse = (str: string, lib: Record<string, unknown>) =>
      (str ? str.split(',') : [])
        .map((p) => {
          const [id, w] = p.split(':');
          return { id, w: Math.max(0, Math.min(1.5, (parseInt(w) || 100) / 100)) };
        })
        .filter((x) => lib[x.id]);
    const s = (SUBJECTS as Record<string, unknown>)[o.s] ? (o.s as SubjectId) : 'mascot';
    return { v: parse(o.v, VISUAL_MAP), m: parse(o.m, MOTION_MAP), s, t: o.t, n: o.n };
  } catch {
    return null;
  }
}
