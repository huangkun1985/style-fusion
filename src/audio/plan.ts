// 音訊計畫：把「風格組合 + 主體 + 偏好」換算成一首歌與播放設定（有快取，作曲只要幾毫秒）。
import type { Sel } from '../data/schema';
import { loopSeconds } from '../engine/loop';
import { SUBJECTS } from '../engine/subjects';
import type { Move, SubjectId, Tune } from '../engine/types';
import { composeSong } from './compose';
import { GENRES } from './genres';
import { profileFor, type MusicProfile } from './profile';
import { SCHEME_INFO } from './render';
import { PACK_INFO } from './sfx';
import { AUDIO_DEFAULT, type AudioPrefs, type GenreId, type PackId, type SchemeId, type Song } from './types';

export interface AudioPlan {
  profile: MusicProfile;
  genre: GenreId;
  scheme: SchemeId;
  /** null＝關閉音效 */
  pack: PackId | null;
  song: Song;
  /** 內容識別：任何設定（含音效包）都一樣才相同 */
  key: string;
  /** 「同一首歌」的識別：曲風、種子、速度、調性、動畫長度…都一樣（與聲音方案、音效包無關） */
  songKey: string;
  /** 「同一段音樂聲音」的識別：歌 + 聲音方案。相同就不必重新渲染（音效包不影響音樂） */
  musicKey: string;
  animSeconds: number;
}

export interface PlanInput {
  v: Sel[];
  m: Sel[];
  subject: SubjectId;
  tune: Tune;
  prefs: AudioPrefs;
  /** 尚未套用「節拍連動」的動效（用來算循環長度） */
  baseMove: Move;
}

/** 把可能來自舊版或損壞的本機儲存的偏好設定，整理成一定合法的值 */
export function sanitizeAudioPrefs(raw: Partial<AudioPrefs> | null | undefined): AudioPrefs {
  const p = { ...AUDIO_DEFAULT, ...(raw ?? {}) };
  const num = (x: unknown, lo: number, hi: number, d: number) => (typeof x === 'number' && isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d);
  return {
    on: !!p.on,
    bgm: !!p.bgm,
    sfx: !!p.sfx,
    scheme: p.scheme === 'auto' || p.scheme in SCHEME_INFO ? p.scheme : 'auto',
    genre: p.genre === 'auto' || p.genre in GENRES ? p.genre : 'auto',
    pack: p.pack === 'auto' || p.pack === 'off' || p.pack in PACK_INFO ? p.pack : 'auto',
    bgmVol: num(p.bgmVol, 0, 1, AUDIO_DEFAULT.bgmVol),
    sfxVol: num(p.sfxVol, 0, 1, AUDIO_DEFAULT.sfxVol),
    sync: !!p.sync,
    seed: Math.round(num(p.seed, 0, 99999, AUDIO_DEFAULT.seed)),
    tempo: num(p.tempo, 0.5, 2, 1),
    key: Math.round(num(p.key, -1, 11, -1)),
  };
}

const memo = new Map<string, AudioPlan>();
const r3 = (x: number) => Math.round(x * 1000) / 1000;

export function planAudio(i: PlanInput): AudioPlan {
  const { baseMove, subject, tune } = i;
  const prefs = sanitizeAudioPrefs(i.prefs);
  const prof = profileFor(i.v, i.m, subject);
  const genre = prefs.genre === 'auto' ? prof.genre : prefs.genre;
  const scheme = prefs.scheme === 'auto' ? prof.scheme : prefs.scheme;
  const pack = prefs.pack === 'off' ? null : prefs.pack === 'auto' ? prof.pack : prefs.pack;
  const L = loopSeconds(SUBJECTS[subject], baseMove, tune);
  const preferLock = baseMove.beat > 0.05 || baseMove.zoomPunch > 0.05;
  const songKey = [genre, prefs.seed, prefs.sync, r3(prefs.tempo), prefs.key, r3(L), r3(prof.tempoMul), r3(prof.energyMul), preferLock].join('|');
  const musicKey = `${songKey}|${scheme}`;
  const key = `${musicKey}|${pack}`;
  const hit = memo.get(key);
  // 同一首歌可能對應不同風格組合；理由文字要跟著目前的組合走
  if (hit) return { ...hit, profile: prof };
  const song = composeSong({
    genre,
    seed: prefs.seed,
    animSeconds: L,
    sync: prefs.sync,
    tempo: prefs.tempo,
    key: prefs.key,
    bpmMul: prof.tempoMul,
    energyMul: prof.energyMul,
    preferLock,
  });
  const plan: AudioPlan = { profile: prof, genre, scheme, pack, song, key, songKey, musicKey, animSeconds: L };
  if (memo.size > 60) memo.clear();
  memo.set(key, plan);
  return plan;
}
