// 2.0 的儲存：
// - 專案（場景、我的配方、Agent 草稿）存在 IndexedDB 的 style-fusion 資料庫；IndexedDB 不能用（某些無痕模式、被禁止）時退回 localStorage 的 sf-projects-v2；
//   兩者都不能用就只留在記憶體，頂列顯示「沒有存下來」。
// - 個人偏好（主題、版式、聲音開關與音量…）存在 localStorage 的 sf-prefs-v2，不跟著專案走。
// - 舊版（1.x）的 style-fusion-v1：第一次開啟、還沒有任何專案時自動轉成一個單場景專案，收藏變成「我的配方」。原資料保留不刪。
// - 還原時每個欄位都逐一檢查型別與範圍（審查 R-18）：存檔被別的分頁寫壞、被改過、來自舊版，都不會讓頁面打不開。
import { snapAuditionToPlan } from '../audio/engine';
import { importedMidiRaw, setImportedMidi } from '../audio/midiImport';
import { sanitizeAudioPrefs } from '../audio/plan';
import { AUDIO_DEFAULT, type AudioPrefs } from '../audio/types';
import { RECIPES } from '../data/recipes';
import { setSubjectVersion } from '../engine/subjects';
import { thumbs } from '../engine/thumbs';
import { saveBlob, safeStorage } from '../lib/platform';
import { resetHistory } from './history';
import { themes } from '../engine/themes';
import { FILM_DEFAULT, makeProject, MAX_CHAT, newId, sanitizeAgent, sanitizeMidi, sanitizeMix, sanitizeProject, sanitizeRecipes, sceneKindOf, sceneMusicOf, type Project, type SceneMix } from './project';
import { useStore, type RightTab, type UiMode } from './store';

const DB_NAME = 'style-fusion';
const DB_STORE = 'projects';
const LS_PROJECTS = 'sf-projects-v2';
const LS_CURRENT = 'sf-current-project';
const LS_PREFS = 'sf-prefs-v2';
export const LEGACY_KEY = 'style-fusion-v1';
const FALLBACK_TEMPLATE = RECIPES[0].id;

// ---------- 低階：IndexedDB 或 localStorage ----------
interface Backend {
  kind: 'idb' | 'local' | 'memory';
  get(id: string): Promise<unknown>;
  put(p: Project): Promise<void>;
  list(): Promise<{ id: string; name: string; updated: number }[]>;
  remove(id: string): Promise<void>;
}

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, 1);
    } catch (e) {
      return reject(e);
    }
    const timer = setTimeout(() => reject(new Error('IndexedDB 逾時')), 3000);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(DB_STORE)) req.result.createObjectStore(DB_STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => {
      clearTimeout(timer);
      resolve(req.result);
    };
    req.onerror = () => {
      clearTimeout(timer);
      reject(req.error);
    };
    req.onblocked = () => {
      clearTimeout(timer);
      reject(new Error('IndexedDB 被其他分頁擋住'));
    };
  });
}

function idbBackend(db: IDBDatabase): Backend {
  const run = <T,>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>) =>
    new Promise<T>((resolve, reject) => {
      const tx = db.transaction(DB_STORE, mode);
      const r = f(tx.objectStore(DB_STORE));
      tx.oncomplete = () => resolve(r.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error('寫入被中止（空間可能已滿）'));
    });
  return {
    kind: 'idb',
    get: (id) => run('readonly', (s) => s.get(id)),
    put: (p) => run('readwrite', (s) => s.put(p)).then(() => undefined),
    list: async () => {
      const all = (await run('readonly', (s) => s.getAll())) as Project[];
      return all.filter((p) => p && typeof p.id === 'string').map((p) => ({ id: p.id, name: typeof p.name === 'string' ? p.name : '未命名專案', updated: typeof p.updated === 'number' ? p.updated : 0 }));
    },
    remove: (id) => run('readwrite', (s) => s.delete(id)).then(() => undefined),
  };
}

function localBackend(): Backend {
  const read = (): Record<string, Project> => {
    try {
      const o = JSON.parse(safeStorage.getItem(LS_PROJECTS) ?? '{}') as unknown;
      return o && typeof o === 'object' && !Array.isArray(o) ? (o as Record<string, Project>) : {};
    } catch {
      return {};
    }
  };
  return {
    kind: 'local',
    get: async (id) => (Object.hasOwn(read(), id) ? read()[id] : undefined),
    put: async (p) => {
      const all = read();
      all[p.id] = p;
      if (!safeStorage.setItem(LS_PROJECTS, JSON.stringify(all))) throw new Error('localStorage 寫不進去');
    },
    list: async () => Object.values(read()).filter((p) => p && typeof p.id === 'string').map((p) => ({ id: p.id, name: String(p.name ?? '未命名專案'), updated: Number(p.updated) || 0 })),
    remove: async (id) => {
      const all = read();
      delete all[id];
      safeStorage.setItem(LS_PROJECTS, JSON.stringify(all));
    },
  };
}

function memoryBackend(): Backend {
  const mem = new Map<string, Project>();
  return { kind: 'memory', get: async (id) => mem.get(id), put: async (p) => void mem.set(p.id, p), list: async () => [...mem.values()].map((p) => ({ id: p.id, name: p.name, updated: p.updated })), remove: async (id) => void mem.delete(id) };
}

function localWorks() {
  try {
    const k = '__sf_probe__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

let backend: Backend = memoryBackend();

// ---------- 個人偏好（逐欄檢查） ----------
interface Prefs {
  theme: 'system' | 'dark' | 'light';
  uiMode: UiMode;
  rightTab: RightTab;
  panelCollapsed: boolean;
  subjectVer: 'v1' | 'v2';
  thumbsAnimate: boolean;
  motionOverride: boolean;
  onion: boolean;
  path: boolean;
  quality: 0 | 1 | 2;
  browserKind: 'v' | 'm';
  welcomed: boolean;
  locked: string[];
  sound: Pick<AudioPrefs, 'bgm' | 'sfx' | 'bgmVol' | 'sfxVol'>;
  agentEffort: 'low' | 'high';
  agentConsent: boolean;
}

const pick = <T extends string>(x: unknown, ok: readonly T[], d: T): T => (typeof x === 'string' && (ok as readonly string[]).includes(x) ? (x as T) : d);
const bool = (x: unknown, d: boolean) => (typeof x === 'boolean' ? x : d);
const LOCK = /^(v|m):[\w-]{1,40}$|^s:subject$|^a:music$/;

export function sanitizePrefs(raw: unknown): Prefs {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const snd = sanitizeAudioPrefs({ ...AUDIO_DEFAULT, ...((o.sound && typeof o.sound === 'object' ? o.sound : {}) as Partial<AudioPrefs>) });
  return {
    theme: pick(o.theme, ['system', 'dark', 'light'] as const, 'system'),
    uiMode: pick(o.uiMode, ['simple', 'advanced'] as const, 'simple'),
    rightTab: pick(o.rightTab, ['agent', 'tune', 'sound', 'spec'] as const, 'agent'),
    panelCollapsed: bool(o.panelCollapsed, false),
    subjectVer: o.subjectVer === 'v1' ? 'v1' : 'v2',
    thumbsAnimate: bool(o.thumbsAnimate, true),
    motionOverride: bool(o.motionOverride, false),
    onion: bool(o.onion, false),
    path: bool(o.path, false),
    quality: o.quality === 1 || o.quality === 2 ? o.quality : 0,
    browserKind: o.browserKind === 'm' ? 'm' : 'v',
    welcomed: bool(o.welcomed, false),
    locked: Array.isArray(o.locked) ? o.locked.filter((k): k is string => typeof k === 'string' && LOCK.test(k)).slice(0, 20) : [],
    sound: { bgm: snd.bgm, sfx: snd.sfx, bgmVol: snd.bgmVol, sfxVol: snd.sfxVol },
    agentEffort: o.agentEffort === 'high' ? 'high' : 'low',
    agentConsent: bool(o.agentConsent, false),
  };
}

function prefsOf(): Prefs {
  const s = useStore.getState();
  return {
    theme: s.theme,
    uiMode: s.uiMode,
    rightTab: s.rightTab,
    panelCollapsed: s.panelCollapsed,
    subjectVer: s.subjectVer,
    thumbsAnimate: s.thumbsAnimate,
    motionOverride: s.motionOverride,
    onion: s.onion,
    path: s.path,
    quality: s.quality,
    browserKind: s.browserKind,
    welcomed: s.welcomed,
    locked: s.locked,
    sound: { bgm: s.audio.bgm, sfx: s.audio.sfx, bgmVol: s.audio.bgmVol, sfxVol: s.audio.sfxVol },
    agentEffort: s.agentEffort,
    agentConsent: s.agentConsent,
  };
}

function applyPrefs(p: Prefs) {
  setSubjectVersion(p.subjectVer);
  const { sound, ...rest } = p;
  useStore.setState((s) => ({ ...rest, audio: { ...s.audio, ...sound, on: false } }));
}

// ---------- 專案 <-> store ----------
/** 從 store 的即時欄位組出目前場景的內容 */
export function liveMix(): SceneMix {
  const s = useStore.getState();
  return { v: s.v, m: s.m, subject: s.subject, tune: s.tune, music: sceneMusicOf(s.audio), aspect: s.aspect, ...(Object.keys(s.content).length ? { content: s.content } : {}) };
}

/** 目前 store 裡的專案（目前場景換成即時內容） */
export function currentProject(): Project {
  const s = useStore.getState();
  const mix = liveMix();
  const theme = mix.subject === 'custom' ? themes.currentJson() : null;
  const scenes = s.scenes.map((sc) => {
    if (sc.id !== s.activeScene) return sc;
    const { theme: _t, chat: _c, ...rest } = sc;
    return { ...rest, mix, kind: sceneKindOf(mix.subject), ...(theme ? { theme } : {}), ...(s.chat.length ? { chat: s.chat.slice(-MAX_CHAT) } : {}) };
  });
  return {
    format: 'style-fusion-project',
    version: 1,
    id: s.projectId,
    name: s.projectName,
    created: s.projectCreated,
    updated: Date.now(),
    scenes,
    active: s.activeScene,
    recipes: s.saved,
    agent: s.agent,
    ...(s.migratedFrom ? { migratedFrom: s.migratedFrom } : {}),
    ...(importedMidiRaw() ? { midi: importedMidiRaw()! } : {}),
    film: s.film,
    // 只存有用到的真實音效（換掉的舊檔不帶著走；這個 session 裡復原仍拿得到，因為 store 還留著）
    ...(s.sounds.some((x) => Object.values(s.sfxMap).includes(x.id)) ? { sounds: s.sounds.filter((x) => Object.values(s.sfxMap).includes(x.id)) } : {}),
    ...(Object.keys(s.sfxMap).length ? { sfxMap: s.sfxMap } : {}),
  };
}

/** 把專案放進 store（換專案、開檔、開機） */
/** 專案帶著匯入的 MIDI：在檢查場景之前先放回去（場景的音樂設定 piece: 'import' 才認得）。沒有帶的專案沿用目前的（舊版行為） */
function installMidi(raw: unknown) {
  const m = sanitizeMidi((raw as { midi?: unknown } | null)?.midi);
  if (!m || m.b64 === importedMidiRaw()?.b64) return;
  try {
    const bin = atob(m.b64);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    setImportedMidi(u8, m.name);
    useStore.setState((s) => ({ midiRev: s.midiRev + 1 }));
  } catch {
    /* 壞掉就不放 */
  }
}

/** 外來的專案資料 → 專案（先放回 MIDI，再逐欄檢查） */
function parseProject(raw: unknown): Project | null {
  installMidi(raw);
  return sanitizeProject(raw, FALLBACK_TEMPLATE);
}

function loadIntoStore(p: Project) {
  const sc = p.scenes.find((x) => x.id === p.active) ?? p.scenes[0];
  const mx = sc.mix;
  // 生成的內容跟著場景：放回自訂主題（同名的會被取代）；壞掉的就算了，主體退回角色跳躍
  let subjectOk = mx.subject !== 'custom';
  if (sc.theme) {
    try {
      if (sc.theme !== themes.currentJson()) themes.add(sc.theme);
      subjectOk = true;
    } catch {
      /* 主題壞了 */
    }
  } else if (mx.subject === 'custom') subjectOk = themes.has();
  useStore.setState((s) => ({
    projectId: p.id,
    projectName: p.name,
    projectCreated: p.created,
    scenes: p.scenes,
    activeScene: sc.id,
    agent: p.agent,
    migratedFrom: p.migratedFrom,
    saved: p.recipes,
    v: mx.v,
    m: mx.m,
    subject: subjectOk ? mx.subject : 'mascot',
    tune: mx.tune,
    aspect: mx.aspect,
    audio: sanitizeAudioPrefs({ ...s.audio, ...mx.music }),
    chat: sc.chat ?? [],
    stamps: [],
    content: mx.content ?? {},
    film: p.film ?? FILM_DEFAULT,
    filmPlay: false,
    sounds: p.sounds ?? [],
    sfxMap: p.sfxMap ?? {},
    saveState: 'saved',
    view: 'mixer',
  }));
  snapAuditionToPlan();
  thumbs.invalidate();
  resetHistory();
}

// ---------- 舊資料轉換 ----------
/** 讀 1.x 的 style-fusion-v1（zustand persist 的格式：{ state, version }），轉成專案與偏好；沒有或壞掉回傳 null。原資料不刪。 */
export function migrateLegacy(text: string | null): { project: Project; prefs: Prefs } | null {
  if (!text) return null;
  let st: Record<string, unknown>;
  try {
    const o = JSON.parse(text) as { state?: unknown };
    if (!o || typeof o !== 'object' || !o.state || typeof o.state !== 'object') return null;
    st = o.state as Record<string, unknown>;
  } catch {
    return null;
  }
  const mix = sanitizeMix({ v: st.v, m: st.m, subject: st.subject, tune: st.tune, aspect: st.aspect, music: st.audio });
  const recipes = sanitizeRecipes(st.saved);
  const project = makeProject('我的第一個專案', mix, recipes, FALLBACK_TEMPLATE);
  project.migratedFrom = LEGACY_KEY;
  return { project, prefs: sanitizePrefs({ ...st, sound: st.audio }) };
}

// ---------- 開機 ----------
let autosaveOff: (() => void) | null = null;

/** 在畫面出現之前呼叫：選後端、讀偏好、讀目前的專案（沒有就轉舊資料或建新的）、開始自動儲存。回傳要顯示的提示（可能沒有）。 */
export async function bootPersistence(): Promise<string | null> {
  try {
    backend = idbBackend(await openIdb());
  } catch {
    backend = localWorks() ? localBackend() : memoryBackend();
  }
  useStore.setState({ storage: backend.kind });

  let note: string | null = null;
  let prefsRaw: unknown = null;
  try {
    prefsRaw = JSON.parse(safeStorage.getItem(LS_PREFS) ?? 'null');
  } catch {
    /* 壞掉當作沒有 */
  }

  let project: Project | null = null;
  const curId = safeStorage.getItem(LS_CURRENT);
  try {
    if (curId) project = parseProject(await backend.get(curId));
    if (!project) {
      const list = (await backend.list()).sort((a, b) => b.updated - a.updated);
      for (const it of list) {
        project = parseProject(await backend.get(it.id));
        if (project) break;
      }
    }
  } catch {
    project = null;
  }

  if (!project) {
    const legacy = migrateLegacy(safeStorage.getItem(LEGACY_KEY));
    if (legacy) {
      project = legacy.project;
      if (prefsRaw === null) prefsRaw = legacy.prefs;
      note = `已把舊版的資料轉成專案「${project.name}」${project.recipes.length ? `，${project.recipes.length} 個收藏變成「我的配方」` : ''}（原資料保留）`;
    } else {
      // 全新使用者：用 store 預設的隨機起點建一個專案
      project = makeProject('我的第一個專案', liveMix(), [], useStore.getState().agent.template);
    }
  }

  applyPrefs(sanitizePrefs(prefsRaw));
  loadIntoStore(project);
  await writeNow();
  startAutosave();
  return note;
}

// ---------- 自動儲存 ----------
let timer = 0;
let writing: Promise<void> = Promise.resolve();

async function writeNow() {
  window.clearTimeout(timer);
  // 按住看 A 的時候畫面上是 A；不要把 A 存成專案
  const h = useStore.getState().hist;
  if (h.showingA || h.previewing) return;
  const p = currentProject();
  writing = writing.then(async () => {
    try {
      await backend.put(p);
      safeStorage.setItem(LS_CURRENT, p.id);
      useStore.setState({ saveState: 'saved' });
    } catch {
      useStore.setState({ saveState: 'error' });
    }
  });
  await writing;
}

/** 立刻存（關閉分頁前、換專案前） */
export const flushSave = () => writeNow();

function startAutosave() {
  autosaveOff?.();
  let prefsTimer = 0;
  const offStore = useStore.subscribe((s, prev) => {
    const docChanged =
      s.v !== prev.v || s.m !== prev.m || s.subject !== prev.subject || s.tune !== prev.tune || s.aspect !== prev.aspect || s.saved !== prev.saved ||
      s.projectName !== prev.projectName || s.agent !== prev.agent || s.scenes !== prev.scenes || s.chat !== prev.chat || s.themeRev !== prev.themeRev || s.content !== prev.content || s.midiRev !== prev.midiRev || s.film !== prev.film || s.sounds !== prev.sounds || s.sfxMap !== prev.sfxMap ||
      (s.audio !== prev.audio && JSON.stringify(sceneMusicOf(s.audio)) !== JSON.stringify(sceneMusicOf(prev.audio)));
    if (docChanged && !s.hist.showingA && !s.hist.previewing) {
      if (s.saveState !== 'saving') useStore.setState({ saveState: 'saving' });
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void writeNow(), 600);
    }
    const prefsChanged =
      s.theme !== prev.theme || s.uiMode !== prev.uiMode || s.rightTab !== prev.rightTab || s.panelCollapsed !== prev.panelCollapsed || s.subjectVer !== prev.subjectVer ||
      s.thumbsAnimate !== prev.thumbsAnimate || s.motionOverride !== prev.motionOverride || s.onion !== prev.onion || s.path !== prev.path || s.quality !== prev.quality ||
      s.browserKind !== prev.browserKind || s.welcomed !== prev.welcomed || s.locked !== prev.locked || s.audio.bgm !== prev.audio.bgm || s.audio.sfx !== prev.audio.sfx ||
      s.audio.bgmVol !== prev.audio.bgmVol || s.audio.sfxVol !== prev.audio.sfxVol || s.agentEffort !== prev.agentEffort || s.agentConsent !== prev.agentConsent;
    if (prefsChanged) {
      window.clearTimeout(prefsTimer);
      prefsTimer = window.setTimeout(() => safeStorage.setItem(LS_PREFS, JSON.stringify(prefsOf())), 400);
    }
  });
  const onHide = () => {
    if (document.visibilityState === 'hidden') {
      void writeNow();
      safeStorage.setItem(LS_PREFS, JSON.stringify(prefsOf()));
    }
  };
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', onHide);
  autosaveOff = () => {
    offStore();
    document.removeEventListener('visibilitychange', onHide);
    window.removeEventListener('pagehide', onHide);
  };
}

// ---------- 專案操作（頂列的專案選單用） ----------
export const listProjects = () => backend.list().then((l) => l.sort((a, b) => b.updated - a.updated));

export async function switchProject(id: string): Promise<boolean> {
  if (id === useStore.getState().projectId) return true;
  await writeNow();
  const p = parseProject(await backend.get(id));
  if (!p) return false;
  loadIntoStore(p);
  safeStorage.setItem(LS_CURRENT, p.id);
  return true;
}

/** 新專案：沿用目前的風格當第一個場景的起點（可以馬上換）；我的配方是每個專案各自的，新專案從空的開始 */
export async function newProject(name: string) {
  await writeNow();
  const p = makeProject(name || '未命名專案', liveMix(), [], useStore.getState().agent.template);
  loadIntoStore(p);
  await writeNow();
}

export async function deleteProject(id: string) {
  if (id === useStore.getState().projectId) return false;
  await backend.remove(id);
  return true;
}

export const fileSafe = (s: string) => s.replace(/[\\/:*?"<>|\s]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'project';

/** 存成 .sfproj（JSON）：場景、生成的內容、對話、匯入的 MIDI、片子的標記、真實音效都在裡面，傳到另一台電腦用「開啟檔案」就能打開 */
export function saveProjectFile(): boolean {
  const p = currentProject();
  const blob = new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' });
  return saveBlob(blob, `${fileSafe(p.name)}.sfproj`);
}

/** 從 .sfproj 開啟：檔案內容逐欄檢查；開成一個新的專案（新的 id），原本的專案留著，不會被覆蓋 */
export async function openProjectFile(file: File): Promise<string | null> {
  if (file.size > 40_000_000) return '檔案太大（超過 40 MB），不像是專案檔';
  let raw: unknown;
  try {
    raw = JSON.parse(await file.text());
  } catch {
    return '這不是專案檔（內容不是 JSON）';
  }
  const p = parseProject(raw);
  if (!p) return '這不是 Style Fusion 的專案檔（缺少 format 或場景）';
  await writeNow();
  p.id = newId();
  p.updated = Date.now();
  loadIntoStore(p);
  await writeNow();
  return null;
}

export { sanitizeAgent };
