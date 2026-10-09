// 音訊計畫：把「風格組合 + 主體 + 偏好」換算成一首歌與播放設定（有快取，作曲只要幾毫秒）。
import type { Sel } from '../data/schema';
import { loopSeconds } from '../engine/loop';
import { SUBJECTS } from '../engine/subjects';
import type { Move, SubjectId, Tune } from '../engine/types';
import { PIECE_BY_ID } from './classics';
import { composeSong } from './compose';
import { getImportedMidi, hasImportedMidi } from './midiImport';
import { GENRES } from './genres';
import { profileFor, type MusicProfile } from './profile';
import { SCHEME_INFO } from './render';
import { PACK_INFO } from './sfx';
import { AUDIO_DEFAULT, type AudioPrefs, type GenreId, type PackId, type SchemeId, type Song } from './types';

export interface AudioPlan {
  profile: MusicProfile;
  genre: GenreId;
  /** 顯示用的曲風名稱（匯入的 MIDI 沒有曲風，顯示「匯入的 MIDI」） */
  genreLabel: string;
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
    piece: typeof p.piece === 'string' && (p.piece in PIECE_BY_ID || (p.piece === 'import' && hasImportedMidi())) ? p.piece : 'off',
    midiStart: Math.round(num(p.midiStart, 0, 9999, 0)),
    midiBars: Math.round(num(p.midiBars, 0, 256, 0)),
  };
}

const memo = new Map<string, AudioPlan>();
const r3 = (x: number) => Math.round(x * 1000) / 1000;

export function planAudio(i: PlanInput): AudioPlan {
  const { baseMove, subject, tune } = i;
  const prefs = sanitizeAudioPrefs(i.prefs);
  const imp = prefs.piece === 'import' ? getImportedMidi() : null;
  const piece = prefs.piece === 'off' || imp ? null : PIECE_BY_ID[prefs.piece];
  const baseProf = profileFor(i.v, i.m, subject);
  // 名曲的「自動」編曲用該曲的建議；風格混合給的理由改成名曲的說明
  const genre = prefs.genre === 'auto' ? (piece ? piece.genre : baseProf.genre) : prefs.genre;
  const prof: MusicProfile = imp
    ? { ...baseProf, genre, reasons: [`匯入的 MIDI：${imp.name}（${imp.tracks.length} 個音軌、${imp.bars} 小節、原速約 ${Math.round(imp.bpm)} BPM）`, '音軌與音色照原檔；用上面的「聲音方案」轉成 8-bit、Game Boy、C64、FM、MIDI 取樣或 XM，導出區可存成 WAV、MIDI、XM'] }
    : piece
    ? { ...baseProf, genre, reasons: [`名曲：${piece.name}（${piece.composer}），旋律與和弦照原曲`, prefs.genre === 'auto' ? `編曲用這首的建議風格：${GENRES[genre].name}（可在下面改成任何曲風）` : `編曲改成你選的${GENRES[genre].name}`, ...baseProf.reasons.filter((r) => !r.includes('曲風') && !r.includes('→ '))] }
    : baseProf;
  const scheme = prefs.scheme === 'auto' ? prof.scheme : prefs.scheme;
  const pack = prefs.pack === 'off' ? null : prefs.pack === 'auto' ? prof.pack : prefs.pack;
  const L = loopSeconds(SUBJECTS[subject], baseMove, tune);
  const preferLock = baseMove.beat > 0.05 || baseMove.zoomPunch > 0.05;
  const songKey = [genre, prefs.seed, prefs.sync, r3(prefs.tempo), prefs.key, r3(L), r3(prof.tempoMul), r3(prof.energyMul), preferLock, imp ? `import${imp.rev}:${prefs.midiStart}:${prefs.midiBars}` : (piece?.id ?? '')].join('|');
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
    piece: imp ? 'import' : piece?.id,
    midiStart: prefs.midiStart,
    midiBars: prefs.midiBars,
  });
  const plan: AudioPlan = { profile: prof, genre, genreLabel: imp ? '匯入的 MIDI' : (GENRES[genre]?.name ?? ''), scheme, pack, song, key, songKey, musicKey, animSeconds: L };
  if (memo.size > 60) memo.clear();
  memo.set(key, plan);
  return plan;
}
