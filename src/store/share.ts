// 配方碼：把一組混合狀態編成可貼上的短字串（也用於網址 #mix=）
import { sanitizeAudioPrefs } from '../audio/plan';
import { AUDIO_DEFAULT, type AudioPrefs } from '../audio/types';
import type { Sel } from '../data/schema';
import type { SubjectId, Tune } from '../engine/types';
import { MOTION_MAP } from '../data/motion';
import { VISUAL_MAP } from '../data/visual';
import { SUBJECTS } from '../engine/subjects';

/** 跟著配方一起存的音樂設定（不含聲音開關與音量，那是每個人自己的偏好） */
export type MusicPrefs = Pick<AudioPrefs, 'genre' | 'scheme' | 'pack' | 'sync' | 'seed' | 'tempo' | 'key' | 'piece'>;

export const musicOf = (a: AudioPrefs): MusicPrefs => ({ genre: a.genre, scheme: a.scheme, pack: a.pack, sync: a.sync, seed: a.seed, tempo: a.tempo, key: a.key, piece: a.piece });

/** 把可能來自舊資料或別人配方碼的音樂設定整理成合法的值 */
export function cleanMusic(raw: Partial<MusicPrefs> | null | undefined): MusicPrefs {
  return musicOf(sanitizeAudioPrefs({ ...AUDIO_DEFAULT, ...(raw ?? {}) }));
}

export interface MixCode {
  v: Sel[];
  m: Sel[];
  s: SubjectId;
  t?: Partial<Tune>;
  n?: string;
  /** 音樂；舊版配方碼沒有這一項（載入時保留目前的音樂） */
  a?: MusicPrefs;
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
    // 音樂用陣列存，碼比較短：曲風、聲音方案、音效包、對齊、種子、速度、調性、名曲
    a: m.a ? [m.a.genre, m.a.scheme, m.a.pack, m.a.sync ? 1 : 0, m.a.seed, m.a.tempo, m.a.key, m.a.piece] : undefined,
  };
  return 'SF1.' + b64e(JSON.stringify(compact));
}

export function decodeMix(code: string): MixCode | null {
  try {
    const raw = code.trim().replace(/^.*?SF1\./, '');
    const o = JSON.parse(b64d(raw)) as { v: string; m: string; s: string; t?: Partial<Tune>; n?: string; a?: unknown[] };
    const parse = (str: string, lib: Record<string, unknown>) =>
      (str ? str.split(',') : [])
        .map((p) => {
          const [id, w] = p.split(':');
          return { id, w: Math.max(0, Math.min(1.5, (parseInt(w) || 100) / 100)) };
        })
        .filter((x) => lib[x.id]);
    const s = (SUBJECTS as Record<string, unknown>)[o.s] ? (o.s as SubjectId) : 'mascot';
    const a = Array.isArray(o.a)
      ? cleanMusic({ genre: o.a[0] as MusicPrefs['genre'], scheme: o.a[1] as MusicPrefs['scheme'], pack: o.a[2] as MusicPrefs['pack'], sync: o.a[3] === 1, seed: o.a[4] as number, tempo: o.a[5] as number, key: o.a[6] as number, piece: o.a[7] as string })
      : undefined;
    return { v: parse(o.v, VISUAL_MAP), m: parse(o.m, MOTION_MAP), s, t: o.t, n: o.n, a };
  } catch {
    return null;
  }
}
