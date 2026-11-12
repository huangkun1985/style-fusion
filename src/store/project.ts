// 專案文件（2.0）：工作單位從「全域一份混合」換成「專案」。專案裡有場景（2.0 α1 先只有一個，但資料結構是多場景的）、
// 我的配方（舊版的「收藏」）、Agent 的初始提示詞設定。存在 IndexedDB（不能用時退回 localStorage），也能存成 .sfproj 檔。
// 這裡只放型別與「外來資料逐欄檢查」（審查 R-18）；讀寫在 persist.ts。
import { sanitizeAudioPrefs } from '../audio/plan';
import { AUDIO_DEFAULT, type AudioPrefs } from '../audio/types';
import { MOTION_MAP } from '../data/motion';
import type { Sel } from '../data/schema';
import { VISUAL_MAP } from '../data/visual';
import type { SubjectId, Tune } from '../engine/types';
import { sanitizeContent } from '../engine/content';
import { isSubjectId, sanitizeSels, sanitizeTune } from './sanitize';
import { cleanMusic, type MusicPrefs } from './share';

export const PROJECT_FORMAT = 'style-fusion-project';
export const PROJECT_VERSION = 1;
/** 決定表第 14 項：最多 12 場 */
export const MAX_SCENES = 12;
export const MAX_RECIPES = 200;

export type Aspect = 'fit' | '16:9' | '4:3' | '1:1' | '9:16';
export const ASPECTS: Record<Aspect, true> = { fit: true, '16:9': true, '4:3': true, '1:1': true, '9:16': true };
export const isAspect = (x: unknown): x is Aspect => typeof x === 'string' && Object.hasOwn(ASPECTS, x);

/** 跟著場景存的音樂：配方碼裡的那些，再加匯入 MIDI 取哪一段（聲音開關與音量是每個人自己的偏好，不跟著專案） */
export type SceneMusic = MusicPrefs & Pick<AudioPrefs, 'midiStart' | 'midiBars'>;
export const sceneMusicOf = (a: AudioPrefs): SceneMusic => ({ ...cleanMusic(a), midiStart: a.midiStart, midiBars: a.midiBars });

/** 一個場景的內容：圖像／動效風格、主體、微調、音樂、畫面比例 */
export interface SceneMix {
  v: Sel[];
  m: Sel[];
  subject: SubjectId;
  tune: Tune;
  music: SceneMusic;
  aspect: Aspect;
  /** 內建模板的內容欄位（α3）：鍵是「主體.欄位」，只存改過的 */
  content?: Record<string, string>;
}

/** 時間點：Agent 輸入框裡的 @03.2s 標籤 */
export interface Stamp {
  /** 循環內的秒數 */
  t: number;
  label: string;
}

/** Agent 對話的一則訊息 */
export interface ChatMsg {
  role: 'user' | 'agent' | 'note';
  text: string;
  at: number;
  stamps?: Stamp[];
  /** 這則回覆帶來的修改結果：applied 套用、discarded 放棄、pending 還沒決定 */
  change?: 'applied' | 'discarded' | 'pending';
  ms?: number;
}
export const MAX_CHAT = 60;

export interface Scene {
  id: string;
  name: string;
  /** template＝內建主體（只能換字、換風格）；generated＝Agent 或使用者匯入的動畫內容（可以對話修改） */
  kind: 'template' | 'generated';
  mix: SceneMix;
  /** 生成的內容（自訂主題檔的 JSON）；只有 generated 的場景有 */
  theme?: string;
  /** 和 Agent 的對話紀錄 */
  chat?: ChatMsg[];
  /** 2.0 β：這一場在片子裡放多久（秒）；沒設定＝一個動畫循環。動畫在裡面照樣循環 */
  dur?: number;
  /** 進到這一場的轉場：cut 直接切（預設）、fade 淡轉場（長度看 FilmSettings.fade） */
  trans?: 'cut' | 'fade';
}

export const SCENE_DUR = { min: 0.5, max: 60 };

/**
 * 片子上的標記（2.0 β，F10）：t 是整支片子的秒數。
 * 2.0 正式：標記黏在某一場上（scene＋off＝那一場開始後幾秒），場景改長度、搬位置時標記跟著走；
 * t 仍然存著（最後一次算出來的時間），舊的專案、找不到那一場時用它。
 */
export interface Marker {
  id: string;
  t: number;
  label: string;
  scene?: string;
  off?: number;
}

/** 整支片子的設定 */
export interface FilmSettings {
  /** 淡轉場長度（秒） */
  fade: number;
  /** 決定表第 15 項：picture＝畫面遷就音樂（場景邊緣吸到小節線，預設）；music＝音樂遷就畫面（速度微調，最多 ±6%） */
  sync: 'picture' | 'music';
  markers: Marker[];
}
export const FILM_DEFAULT: FilmSettings = { fade: 0.4, sync: 'picture', markers: [] };
export const MAX_MARKERS = 40;

/** 真實音效（2.0 β，F11b）：從 Freesound 下載、修剪、對齊音量之後跟著專案存 */
export interface SoundAsset {
  id: string;
  name: string;
  author: string;
  /** CC0／BY／BY-NC */
  license: string;
  /** Freesound 的頁面（讀我與規格頁列出來源） */
  page: string;
  /** 秒 */
  dur: number;
  /** 修剪後的 WAV（base64，單聲道 22.05 kHz 16 位元） */
  b64: string;
  /** 2.0 正式：音量微調（dB，−12～+12；對齊響度之後再加），沒設＝0 */
  gain?: number;
  /** 2.0 正式：用了原始錄音的哪一段（秒）；沒設＝自動「只留第一下」 */
  range?: [number, number];
  /** Freesound 的試聽檔網址（重新選片段時要再抓一次原始錄音） */
  preview?: string;
}
export const MAX_SOUNDS = 24;

/** 我的配方（舊版叫「收藏」） */
export interface SavedMix {
  id: string;
  name: string;
  v: Sel[];
  m: Sel[];
  subject: SubjectId;
  tune: Tune;
  /** 音樂；舊的收藏沒有（載入時保留目前的音樂） */
  audio?: MusicPrefs;
  created: number;
}

/** Agent 面板的初始提示詞（手動模式也用同一份） */
export interface AgentDraft {
  /** 風格模板：案例配方的 id */
  template: string;
  /** 主題一行；空字串＝用模板的示範主題 */
  topic: string;
  seconds: number;
}

export interface Project {
  format: typeof PROJECT_FORMAT;
  version: number;
  id: string;
  name: string;
  created: number;
  updated: number;
  scenes: Scene[];
  active: string;
  recipes: SavedMix[];
  agent: AgentDraft;
  /** 從哪裡轉來的（例如舊版的本機資料 style-fusion-v1）；只做紀錄 */
  migratedFrom?: string;
  /** 匯入的 MIDI 原始檔（base64）；α3 起跟著專案走 */
  midi?: { name: string; b64: string };
  /** 2.0 β：整支片子的設定（淡轉場、對齊方式、標記） */
  film?: FilmSettings;
  /** 2.0 β：真實音效與「哪一種音效換成哪一個檔」 */
  sounds?: SoundAsset[];
  sfxMap?: Record<string, string>;
}

export const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const str = (x: unknown, d: string, max = 80) => (typeof x === 'string' && x.trim() ? x.trim().slice(0, max) : d);
const time = (x: unknown, d: number) => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? x : d);
const obj = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {});
const ID = /^[\w-]{1,40}$/;
const idOf = (x: unknown) => (typeof x === 'string' && ID.test(x) ? x : newId());

export const sceneKindOf = (subject: SubjectId): Scene['kind'] => (subject === 'custom' ? 'generated' : 'template');

export function sanitizeMix(raw: unknown, fallbackSubject: SubjectId = 'mascot'): SceneMix {
  const o = obj(raw);
  const music = obj(o.music);
  const a = sanitizeAudioPrefs({ ...AUDIO_DEFAULT, ...music } as Partial<AudioPrefs>);
  return {
    v: sanitizeSels(o.v, VISUAL_MAP),
    m: sanitizeSels(o.m, MOTION_MAP),
    subject: isSubjectId(o.subject) ? o.subject : fallbackSubject,
    tune: sanitizeTune(o.tune),
    music: sceneMusicOf(a),
    aspect: isAspect(o.aspect) ? o.aspect : 'fit',
    ...(Object.keys(sanitizeContent(o.content)).length ? { content: sanitizeContent(o.content) } : {}),
  };
}

export function sanitizeRecipe(raw: unknown): SavedMix | null {
  const o = obj(raw);
  if (typeof o.id !== 'string' || !o.id) return null;
  return {
    id: o.id.slice(0, 40),
    name: str(o.name, '未命名配方'),
    v: sanitizeSels(o.v, VISUAL_MAP),
    m: sanitizeSels(o.m, MOTION_MAP),
    subject: isSubjectId(o.subject) ? o.subject : 'mascot',
    tune: sanitizeTune(o.tune),
    ...(o.audio && typeof o.audio === 'object' ? { audio: cleanMusic(o.audio as Partial<MusicPrefs>) } : {}),
    created: time(o.created, Date.now()),
  };
}

export function sanitizeRecipes(raw: unknown): SavedMix[] {
  if (!Array.isArray(raw)) return [];
  const out: SavedMix[] = [];
  for (const x of raw) {
    const r = sanitizeRecipe(x);
    if (r && !out.some((o) => o.id === r.id)) out.push(r);
    if (out.length >= MAX_RECIPES) break;
  }
  return out;
}

export function sanitizeStamps(raw: unknown): Stamp[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x) => x && typeof x === 'object' && typeof (x as Stamp).t === 'number' && Number.isFinite((x as Stamp).t))
    .slice(0, 8)
    .map((x) => ({ t: Math.max(0, Math.min(600, (x as Stamp).t)), label: typeof (x as Stamp).label === 'string' ? (x as Stamp).label.slice(0, 40) : '' }));
}

export function sanitizeChat(raw: unknown): ChatMsg[] {
  if (!Array.isArray(raw)) return [];
  const out: ChatMsg[] = [];
  for (const x of raw.slice(-MAX_CHAT)) {
    const o = obj(x);
    if (o.role !== 'user' && o.role !== 'agent' && o.role !== 'note') continue;
    if (typeof o.text !== 'string') continue;
    const st = sanitizeStamps(o.stamps);
    out.push({
      role: o.role,
      text: o.text.slice(0, 4000),
      at: time(o.at, Date.now()),
      ...(st.length ? { stamps: st } : {}),
      ...(o.change === 'applied' || o.change === 'discarded' ? { change: o.change } : o.change === 'pending' ? { change: 'discarded' as const } : {}),
      ...(typeof o.ms === 'number' && Number.isFinite(o.ms) ? { ms: o.ms } : {}),
    });
  }
  return out;
}

export function sanitizeAgent(raw: unknown, fallbackTemplate: string): AgentDraft {
  const o = obj(raw);
  const sec = typeof o.seconds === 'number' && Number.isFinite(o.seconds) ? Math.round(Math.min(30, Math.max(2, o.seconds))) : 8;
  return { template: typeof o.template === 'string' && ID.test(o.template) ? o.template : fallbackTemplate, topic: typeof o.topic === 'string' ? o.topic.slice(0, 300) : '', seconds: sec };
}

/** 外來的專案（IndexedDB、localStorage、.sfproj 檔）：格式不對回傳 null；其餘逐欄整理成合法的值 */
export function sanitizeProject(raw: unknown, fallbackTemplate: string): Project | null {
  const o = obj(raw);
  if (o.format !== PROJECT_FORMAT) return null;
  const scenes: Scene[] = [];
  for (const s of Array.isArray(o.scenes) ? o.scenes : []) {
    const so = obj(s);
    const mix = sanitizeMix(so.mix);
    let id = idOf(so.id);
    if (scenes.some((x) => x.id === id)) id = newId();
    const theme = typeof so.theme === 'string' && so.theme.length <= 400_000 ? so.theme : undefined;
    const chat = sanitizeChat(so.chat);
    const dur = typeof so.dur === 'number' && Number.isFinite(so.dur) ? Math.min(SCENE_DUR.max, Math.max(SCENE_DUR.min, so.dur)) : undefined;
    scenes.push({
      id,
      name: str(so.name, `場景 ${scenes.length + 1}`, 40),
      kind: so.kind === 'generated' || so.kind === 'template' ? so.kind : sceneKindOf(mix.subject),
      mix,
      ...(theme ? { theme } : {}),
      ...(chat.length ? { chat } : {}),
      ...(dur ? { dur } : {}),
      ...(so.trans === 'fade' ? { trans: 'fade' as const } : {}),
    });
    if (scenes.length >= MAX_SCENES) break;
  }
  if (!scenes.length) return null;
  const now = Date.now();
  return {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    id: idOf(o.id),
    name: str(o.name, '未命名專案', 60),
    created: time(o.created, now),
    updated: time(o.updated, now),
    scenes,
    active: typeof o.active === 'string' && scenes.some((s) => s.id === o.active) ? o.active : scenes[0].id,
    recipes: sanitizeRecipes(o.recipes),
    agent: sanitizeAgent(o.agent, fallbackTemplate),
    ...(typeof o.migratedFrom === 'string' ? { migratedFrom: o.migratedFrom.slice(0, 40) } : {}),
    ...(sanitizeMidi(o.midi) ? { midi: sanitizeMidi(o.midi)! } : {}),
    film: sanitizeFilm(o.film),
    ...sanitizeSounds(o.sounds, o.sfxMap),
  };
}

export function sanitizeFilm(raw: unknown): FilmSettings {
  const o = obj(raw);
  const fade = typeof o.fade === 'number' && Number.isFinite(o.fade) ? Math.min(2, Math.max(0.1, o.fade)) : FILM_DEFAULT.fade;
  const markers: Marker[] = [];
  for (const x of Array.isArray(o.markers) ? o.markers : []) {
    const m = obj(x);
    if (typeof m.t !== 'number' || !Number.isFinite(m.t)) continue;
    const anchor = typeof m.scene === 'string' && /^[\w-]{1,40}$/.test(m.scene) && typeof m.off === 'number' && Number.isFinite(m.off) ? { scene: m.scene, off: Math.max(0, Math.min(SCENE_DUR.max, m.off)) } : {};
    markers.push({ id: idOf(m.id), t: Math.max(0, Math.min(600, m.t)), label: typeof m.label === 'string' ? m.label.slice(0, 40) : '', ...anchor });
    if (markers.length >= MAX_MARKERS) break;
  }
  markers.sort((a, b) => a.t - b.t);
  return { fade, sync: o.sync === 'music' ? 'music' : 'picture', markers };
}

const LICENSES = new Set(['CC0', 'BY', 'BY-NC']);
export function sanitizeSounds(raw: unknown, rawMap: unknown): { sounds?: SoundAsset[]; sfxMap?: Record<string, string> } {
  const sounds: SoundAsset[] = [];
  for (const x of Array.isArray(raw) ? raw : []) {
    const o = obj(x);
    if (typeof o.b64 !== 'string' || o.b64.length > 3_000_000 || !B64.test(o.b64)) continue;
    const page = typeof o.page === 'string' && /^https:\/\/freesound\.org\/[\w/.-]*$/.test(o.page) ? o.page : '';
    sounds.push({
      id: idOf(o.id),
      name: str(o.name, '音效', 80),
      author: str(o.author, '?', 60),
      license: typeof o.license === 'string' && LICENSES.has(o.license) ? o.license : 'BY',
      page,
      dur: typeof o.dur === 'number' && Number.isFinite(o.dur) ? Math.max(0, Math.min(30, o.dur)) : 0,
      b64: o.b64,
      ...(typeof o.gain === 'number' && Number.isFinite(o.gain) && o.gain !== 0 ? { gain: Math.max(-12, Math.min(12, Math.round(o.gain * 2) / 2)) } : {}),
      ...(Array.isArray(o.range) && o.range.length === 2 && o.range.every((v) => typeof v === 'number' && Number.isFinite(v)) && o.range[1] > o.range[0] ? { range: [Math.max(0, o.range[0]), Math.min(600, o.range[1])] as [number, number] } : {}),
      ...(typeof o.preview === 'string' && /^https:\/\/cdn\.freesound\.org\/previews\/[\w/.-]+$/.test(o.preview) ? { preview: o.preview } : {}),
    });
    if (sounds.length >= MAX_SOUNDS) break;
  }
  const map: Record<string, string> = {};
  const m = obj(rawMap);
  for (const [k, v] of Object.entries(m)) if (/^[a-z]{2,12}$/.test(k) && typeof v === 'string' && sounds.some((s) => s.id === v)) map[k] = v;
  return { ...(sounds.length ? { sounds } : {}), ...(Object.keys(map).length ? { sfxMap: map } : {}) };
}

const B64 = /^[A-Za-z0-9+/]+={0,2}$/;
export function sanitizeMidi(raw: unknown): { name: string; b64: string } | null {
  const o = obj(raw);
  if (typeof o.b64 !== 'string' || o.b64.length > 4_000_000 || o.b64.length < 16 || !B64.test(o.b64)) return null;
  return { name: str(o.name, '匯入的 MIDI', 100), b64: o.b64 };
}

export function makeProject(name: string, mix: SceneMix, recipes: SavedMix[], template: string): Project {
  const now = Date.now();
  const scene: Scene = { id: newId(), name: '場景 1', kind: sceneKindOf(mix.subject), mix };
  return { format: PROJECT_FORMAT, version: PROJECT_VERSION, id: newId(), name, created: now, updated: now, scenes: [scene], active: scene.id, recipes, agent: { template, topic: '', seconds: 8 } };
}
