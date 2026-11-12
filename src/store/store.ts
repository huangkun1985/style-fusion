import { create } from 'zustand';
import { snapAuditionToPlan } from '../audio/engine';
import { sanitizeAudioPrefs } from '../audio/plan';
import { PIECES } from '../audio/classics';
import { GENRES } from '../audio/genres';
import { clearImportedMidi, getImportedMidi, setImportedMidi } from '../audio/midiImport';
import { AUDIO_DEFAULT, type AudioPrefs, type GenreId, type SchemeId } from '../audio/types';
import { MOTION, MOTION_MAP } from '../data/motion';
import { RECIPES, STARTERS } from '../data/recipes';
import type { Recipe, Sel } from '../data/schema';
import { VISUAL, VISUAL_MAP } from '../data/visual';
import { TUNE_DEFAULT } from '../engine/resolve';
import { SUBJECT_ORDER } from '../engine/subjects';
import { setSubjectVersion, type SubjectVer } from '../engine/subjects';
import { setContent } from '../engine/content';
import { thumbs } from '../engine/thumbs';
import { themes } from '../engine/themes';
import { is3D, type SubjectId, type Tune } from '../engine/types';
import { isSubjectId, MAX_PER_KIND, sanitizeSels, sanitizeTune } from './sanitize';
import { cleanMusic, decodeMix, musicOf, type MusicPrefs } from './share';

import type { WallFilter } from '../lib/styleWall';
import { FILM_DEFAULT, type AgentDraft, type Aspect, type ChatMsg, type FilmSettings, type SavedMix, type Scene, type SoundAsset, type Stamp } from './project';

export type { Aspect, SavedMix } from './project';
export type View = 'mixer' | 'library' | 'recipes' | 'saved';
/** 2.0 版式：簡潔（預設：舞台、播放列、場景帶、Agent）／進階（再加素材庫、混合配方、右側的調整／聲音／規格） */
export type UiMode = 'simple' | 'advanced';
/** 右側面板的頁籤（進階模式才有後三個） */
export type RightTab = 'agent' | 'tune' | 'sound' | 'spec';
export type SaveState = 'saved' | 'saving' | 'error';
export type InfoTab = 'brief' | 'sound' | 'tune' | 'code' | 'prompt';
export type Kind = 'v' | 'm';
export type ThemePref = 'system' | 'dark' | 'light';

interface State {
  view: View;
  v: Sel[];
  m: Sel[];
  subject: SubjectId;
  aspect: Aspect;
  tune: Tune;
  onion: boolean;
  path: boolean;
  grid4: boolean;
  thumbsAnimate: boolean;
  motionOverride: boolean;
  quality: 0 | 1 | 2;
  browserKind: Kind;
  browserCat: string;
  search: string;
  infoTab: InfoTab;
  mobileTab: 'styles' | 'mix' | 'brief' | 'sound' | 'tune' | 'code' | 'prompt';
  locked: string[];
  saved: SavedMix[];
  detail: { kind: Kind; id: string } | null;
  exportOpen: boolean;
  shareOpen: boolean;
  starterOpen: boolean;
  /** 「匯入主題」視窗 */
  themeOpen: boolean;
  /** 匯入或切換自訂主題、切換主體版本時加一（不存檔），讓循環秒數等重算 */
  themeRev: number;
  /** 主體版本：v1 原設計、v2 重新設計；全域切換 */
  subjectVer: SubjectVer;
  setSubjectVer: (v: SubjectVer) => void;
  welcomed: boolean;
  audio: AudioPrefs;
  /** 匯入的 MIDI 每次更換就加一（不存檔），讓音樂計畫重算 */
  midiRev: number;
  /** 「填滿」比例下舞台實際量到的長寬比（不存檔）：音效提示點的左右位置等要跟著重算 */
  fitAr: number;
  theme: ThemePref;
  toast: { id: number; text: string } | null;

  // ----- 2.0：專案（目前場景的內容就是上面的 v／m／subject／tune／aspect／audio 的音樂部分） -----
  projectId: string;
  projectName: string;
  projectCreated: number;
  /** 全部場景；目前場景（activeScene）裡存的 mix 可能是舊的，存檔時以上面的即時欄位為準 */
  scenes: Scene[];
  activeScene: string;
  agent: AgentDraft;
  migratedFrom?: string;
  saveState: SaveState;
  /** 存在哪裡：IndexedDB、localStorage（IndexedDB 不能用時）、只在記憶體（兩者都不能用） */
  storage: 'idb' | 'local' | 'memory';
  /** 復原／重做與 A／B 的狀態（history.ts 維護，介面用來決定按鈕能不能按） */
  hist: { undo: number; redo: number; a: boolean; showingA: boolean; previewing: boolean; comparing: boolean };
  uiMode: UiMode;
  rightTab: RightTab;
  /** Agent 面板收成 48 px 的窄條 */
  panelCollapsed: boolean;
  /** 起點選擇器的用途：start＝套整組配方；agent＝替 Agent 選風格模板（只換風格，不換主體） */
  starterFor: 'start' | 'agent';
  setAgent: (p: Partial<AgentDraft>) => void;
  /** 目前場景的 Agent 對話（存檔時寫回場景） */
  chat: ChatMsg[];
  /** 輸入框上的時間點標籤（不存檔） */
  stamps: Stamp[];
  /** 思考深度：快（low）／仔細（high）；偏好 */
  agentEffort: 'low' | 'high';
  /** 使用者看過「內容會送到你的 Claude 帳號」的說明；偏好 */
  agentConsent: boolean;
  /** 風格牆（α3）：開著時舞台換成 3×3；篩選與第幾批（換一批＋1）不存檔 */
  wall: boolean;
  wallFilter: WallFilter;
  wallBatch: number;
  /** 目前場景的模板內容欄位（α3 F9）；鍵是「主體.欄位」，只放改過的 */
  content: Record<string, string>;
  /** 2.0 β：整支片子的設定（淡轉場、對齊方式、標記）；跟著專案存、進復原歷史 */
  film: FilmSettings;
  /** 2.0 β：播放整支片子（時鐘是整支的時間）；不存檔 */
  filmPlay: boolean;
  /** 2.0 β：真實音效（跟著專案存）與「哪一種音效換成哪一個檔」 */
  sounds: SoundAsset[];
  sfxMap: Record<string, string>;
  /** 全螢幕展示時的規格卡（S 鍵）；不存檔 */
  specCard: boolean;

  set: (p: Partial<State>) => void;
  toggle: (kind: Kind, id: string) => void;
  add: (kind: Kind, id: string) => void;
  setWeight: (kind: Kind, id: string, w: number) => void;
  remove: (kind: Kind, id: string) => void;
  promote: (kind: Kind, id: string) => void;
  clear: (kind?: Kind) => void;
  setTune: (p: Partial<Tune>) => void;
  resetTune: () => void;
  setAudio: (p: Partial<AudioPrefs>) => void;
  /** 匯入 MIDI 檔；成功回傳 null，失敗回傳錯誤訊息 */
  importMidi: (bytes: ArrayBuffer, name: string) => string | null;
  clearMidi: () => void;
  applyRecipe: (r: Recipe) => void;
  randomize: () => void;
  toggleLock: (kind: Kind | 's' | 'a', id: string) => void;
  saveCurrent: (name: string) => void;
  loadSaved: (id: string) => void;
  deleteSaved: (id: string) => void;
  renameSaved: (id: string, name: string) => void;
  importCode: (code: string) => boolean;
  showToast: (text: string) => void;
}


/** 第一次開啟時隨機挑一個起點案例，避免每個人看到的都是同一個畫面 */
function randomStarter(): Recipe {
  const pool = STARTERS.map((s) => RECIPES.find((r) => r.id === s.recipe)).filter((r): r is Recipe => !!r);
  return pool[Math.floor(Math.random() * pool.length)] ?? RECIPES[0];
}
const FIRST = randomStarter();
const pickOne = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
const round2 = (x: number) => Math.round(x * 20) / 20;

const round05 = (x: number) => Math.round(x * 20) / 20;

/** 靈感骰子的微調部分：速度、循環長度、線條與後期強度、色板混合方式、隨機種子；大半的參數維持原樣，才不會每次都亂成一團 */
function randomTune(base: Tune): Tune {
  const r = Math.random;
  return {
    ...base,
    speed: r() < 0.5 ? 1 : round05(0.7 + r() * 0.9),
    loopMul: r() < 0.7 ? 1 : pickOne([0.75, 1.25, 1.5, 2]),
    strokeMul: r() < 0.55 ? 1 : round05(0.7 + r() * 0.9),
    fxMul: r() < 0.55 ? 1 : round05(0.6 + r() * 0.8),
    paletteMode: pickOne(['interleave', 'dominant', 'blend'] as const),
    seed: Math.floor(r() * 9999),
    custom: {},
  };
}

/** 靈感骰子挑主體：用到 3D 材質或 3D 運鏡時挑 3D 主體，否則挑 2D 主體（約一成機率跨界）；一定換成和現在不同的 */
function randomSubject(current: SubjectId, v: Sel[], m: Sel[]): SubjectId {
  const wants3d = v.some((x) => VISUAL_MAP[x.id]?.cat === 'dim3d') || m.some((x) => MOTION_MAP[x.id]?.cat === 'cam3d');
  // 還沒匯入主題的話，不要抽到「自訂主題」（只會看到一張提示）
  const ok = (id: SubjectId) => id !== current && (id !== 'custom' || themes.has());
  const same = SUBJECT_ORDER.filter((id) => is3D(id) === wants3d && ok(id));
  const other = SUBJECT_ORDER.filter((id) => is3D(id) !== wants3d && ok(id));
  return pickOne(Math.random() < 0.1 && other.length ? other : same.length ? same : other);
}

/** 從清單裡挑一個，但盡量不要和目前的一樣（骰子按下去要看得出有變） */
const pickDifferent = <T,>(arr: T[], cur: T) => pickOne(arr.length > 1 ? arr.filter((x) => x !== cur) : arr);

/** 靈感骰子的音樂部分：新的種子、曲風、聲音方案、調性、速度，有時直接抽一首名曲。聲音開關與音量不動。
 *  曲風與聲音方案是真的抽卡（6 種方案、所有曲風平均抽，而且一定和現在的不同），不再回到「自動」讓風格決定。 */
function randomAudio(cur: AudioPrefs): Partial<AudioPrefs> {
  const r = Math.random;
  const schemes: SchemeId[] = ['nes', 'gb', 'sid', 'fm', 'midi', 'xm'];
  const usePiece = r() < 0.3;
  const genres = Object.keys(GENRES) as GenreId[];
  return {
    seed: Math.floor(r() * 9999),
    piece: usePiece ? pickOne([...PIECES.map((p) => p.id), ...(getImportedMidi() ? ['import'] : [])]) : 'off',
    midiStart: 0,
    midiBars: 0,
    // 抽到名曲時偶爾用它建議的編曲；其餘都是隨機曲風
    genre: usePiece && r() < 0.4 ? 'auto' : pickDifferent(genres, cur.genre as GenreId),
    scheme: pickDifferent(schemes, cur.scheme as SchemeId),
    key: r() < 0.6 ? -1 : Math.floor(r() * 12),
    tempo: r() < 0.7 ? 1 : Math.round((0.85 + r() * 0.35) * 100) / 100,
    pack: 'auto',
  };
}

export const useStore = create<State>()((set, get) => ({
      view: 'mixer',
      v: FIRST.v.map(([id, w]) => ({ id, w })),
      m: FIRST.m.map(([id, w]) => ({ id, w })),
      subject: FIRST.subject,
      aspect: 'fit',
      tune: { ...TUNE_DEFAULT },
      onion: false,
      path: false,
      grid4: false,
      thumbsAnimate: true,
      motionOverride: false,
      quality: 0,
      browserKind: 'v',
      browserCat: 'all',
      search: '',
      infoTab: 'brief',
      mobileTab: 'styles',
      locked: [],
      saved: [],
      detail: null,
      exportOpen: false,
      shareOpen: false,
      starterOpen: false,
      themeOpen: false,
      themeRev: 0,
      subjectVer: 'v2',
      setSubjectVer: (v) => {
        setSubjectVersion(v);
        thumbs.invalidate();
        set((st) => ({ subjectVer: v, themeRev: st.themeRev + 1 }));
      },
      welcomed: false,
      audio: { ...AUDIO_DEFAULT },
      midiRev: 0,
      fitAr: 16 / 9,
      theme: 'system',
      toast: null,
      projectId: '',
      projectName: '我的專案',
      projectCreated: Date.now(),
      scenes: [],
      activeScene: '',
      agent: { template: FIRST.id, topic: '', seconds: 8 },
      saveState: 'saved',
      storage: 'memory',
      hist: { undo: 0, redo: 0, a: false, showingA: false, previewing: false, comparing: false },
      uiMode: 'simple',
      rightTab: 'agent',
      panelCollapsed: false,
      starterFor: 'start',
      setAgent: (p) => set({ agent: { ...get().agent, ...p } }),
      chat: [],
      stamps: [],
      agentEffort: 'low',
      agentConsent: false,
      wall: false,
      wallFilter: 'all',
      wallBatch: 1,
      content: {},
      film: FILM_DEFAULT,
      filmPlay: false,
      sounds: [],
      sfxMap: {},
      specCard: false,

      set: (p) => set(p),
      toggle: (kind, id) => {
        const list = get()[kind];
        if (list.some((x) => x.id === id)) get().remove(kind, id);
        else get().add(kind, id);
      },
      add: (kind, id) => {
        const list = get()[kind];
        if (list.some((x) => x.id === id)) return;
        let next = [...list, { id, w: 1 }];
        if (next.length > MAX_PER_KIND) {
          next = next.slice(next.length - MAX_PER_KIND);
          get().showToast(`最多同時混合 ${MAX_PER_KIND} 個${kind === 'v' ? '圖像' : '動效'}風格，已移除最早加入的一個`);
        }
        set({ [kind]: next } as Partial<State>);
      },
      setWeight: (kind, id, w) => set({ [kind]: get()[kind].map((x) => (x.id === id ? { ...x, w } : x)) } as Partial<State>),
      remove: (kind, id) =>
        set({
          [kind]: get()[kind].filter((x) => x.id !== id),
          locked: get().locked.filter((k) => k !== `${kind}:${id}`),
        } as Partial<State>),
      promote: (kind, id) => {
        const list = get()[kind];
        const it = list.find((x) => x.id === id);
        if (!it) return;
        set({ [kind]: [{ ...it, w: Math.max(it.w, 1) }, ...list.filter((x) => x.id !== id)] } as Partial<State>);
      },
      clear: (kind) => {
        if (!kind || kind === 'v') set({ v: [] });
        if (!kind || kind === 'm') set({ m: [] });
      },
      setTune: (p) => set({ tune: { ...get().tune, ...p } }),
      resetTune: () => set({ tune: { ...TUNE_DEFAULT, seed: get().tune.seed } }),
      setAudio: (p) => set({ audio: sanitizeAudioPrefs({ ...get().audio, ...p }) }),
      applyRecipe: (r) => {
        set({
          v: r.v.map(([id, w]) => ({ id, w })),
          m: r.m.map(([id, w]) => ({ id, w })),
          subject: r.subject,
          view: 'mixer',
          locked: [],
          starterOpen: false,
          welcomed: true,
        });
        get().showToast(`已套用配方「${r.name}」；不滿意可以按 Ctrl+Z 復原`);
      },
      randomize: () => {
        const { v, m, locked } = get();
        const keepV = v.filter((x) => locked.includes(`v:${x.id}`));
        const keepM = m.filter((x) => locked.includes(`m:${x.id}`));
        const nv: Sel[] = [...keepV];
        const used = new Set(nv.map((x) => x.id));
        const fullLooks = VISUAL.filter((s) => s.look.pal && !used.has(s.id));
        if (!nv.length) {
          const s = pickOne(fullLooks);
          nv.push({ id: s.id, w: 1 });
          used.add(s.id);
        }
        if (Math.random() < 0.6 && nv.length < 3) {
          const pool = VISUAL.filter((s) => !used.has(s.id) && s.cat !== VISUAL_MAP[nv[0].id]?.cat);
          const s = pickOne(pool);
          nv.push({ id: s.id, w: round2(0.45 + Math.random() * 0.5) });
        }
        const nm: Sel[] = [...keepM];
        const usedM = new Set(nm.map((x) => x.id));
        const target = Math.max(nm.length, Math.random() < 0.55 ? 2 : 1);
        const hints = nv.flatMap((x) => VISUAL_MAP[x.id]?.pairs ?? []).filter((id) => MOTION_MAP[id] && !usedM.has(id));
        while (nm.length < target) {
          const id = hints.length && Math.random() < 0.5 ? pickOne(hints) : pickOne(MOTION.filter((s) => !usedM.has(s.id))).id;
          if (usedM.has(id)) continue;
          usedM.add(id);
          nm.push({ id, w: nm.length === 0 ? 1 : round2(0.5 + Math.random() * 0.5) });
        }
        // 主體（UI、跳躍、文字…）、微調參數與音樂也一起隨機；鎖定的保留
        const musicLocked = locked.includes('a:music');
        const subjectLocked = locked.includes('s:subject');
        const patch: Partial<State> = { v: nv, m: nm, tune: randomTune(get().tune) };
        if (!subjectLocked) patch.subject = randomSubject(get().subject, nv, nm);
        if (!musicLocked) {
          patch.audio = sanitizeAudioPrefs({ ...get().audio, ...randomAudio(get().audio) });
          snapAuditionToPlan();
        }
        set(patch);
        const kept = [subjectLocked && '主體', musicLocked && '音樂'].filter(Boolean).join('、');
        get().showToast(kept ? `已隨機（${kept}已鎖定，沒有更動）` : '已隨機：主體、風格、動效、微調與音樂'); 
      },
      toggleLock: (kind, id) => {
        const k = `${kind}:${id}`;
        const l = get().locked;
        set({ locked: l.includes(k) ? l.filter((x) => x !== k) : [...l, k] });
      },
      saveCurrent: (name) => {
        const s = get();
        const mix: SavedMix = {
          id: Math.random().toString(36).slice(2, 10),
          name: name || '未命名配方',
          v: s.v,
          m: s.m,
          subject: s.subject,
          tune: s.tune,
          audio: musicOf(s.audio),
          created: Date.now(),
        };
        set({ saved: [mix, ...s.saved] });
        get().showToast(`已存成我的配方「${mix.name}」`);
      },
      loadSaved: (id) => {
        const it = get().saved.find((x) => x.id === id);
        if (!it) return;
        set({ v: sanitizeSels(it.v, VISUAL_MAP), m: sanitizeSels(it.m, MOTION_MAP), subject: isSubjectId(it.subject) ? it.subject : 'mascot', tune: sanitizeTune(it.tune), ...(it.audio ? { audio: { ...get().audio, ...cleanMusic(it.audio) } } : {}), view: 'mixer' });
        get().showToast(`已載入「${it.name}」`);
      },
      deleteSaved: (id) => set({ saved: get().saved.filter((x) => x.id !== id) }),
      renameSaved: (id, name) => set({ saved: get().saved.map((x) => (x.id === id ? { ...x, name } : x)) }),
      importCode: (code) => {
        const mix = decodeMix(code);
        if (!mix) return false;
        set({ v: sanitizeSels(mix.v, VISUAL_MAP), m: sanitizeSels(mix.m, MOTION_MAP), subject: mix.s, tune: sanitizeTune(mix.t ?? {}), ...(mix.a ? { audio: { ...get().audio, ...mix.a } } : {}), view: 'mixer' });
        return true;
      },
      importMidi: (bytes, name) => {
        try {
          const imp = setImportedMidi(bytes, name);
          set({ midiRev: get().midiRev + 1, audio: { ...get().audio, piece: 'import', midiStart: 0, midiBars: 0 } });
          get().showToast(`已匯入「${imp.name}」：${imp.tracks.length} 個音軌、${imp.bars} 小節`);
          return null;
        } catch (e) {
          return (e as Error).message || '匯入失敗';
        }
      },
      clearMidi: () => {
        clearImportedMidi();
        const a = get().audio;
        set({ midiRev: get().midiRev + 1, audio: a.piece === 'import' ? { ...a, piece: 'off', midiStart: 0, midiBars: 0 } : a });
      },
      showToast: (text) => {
        const id = Date.now();
        set({ toast: { id, text } });
        setTimeout(() => {
          if (get().toast?.id === id) set({ toast: null });
        }, 2600);
      },
}));

// 主題匯入、切換、刪除時，讓所有用到循環秒數與主體名稱的地方重算
themes.onChange(() => useStore.setState((s) => ({ themeRev: s.themeRev + 1 })));

// 模板的內容欄位改了（打字、換場景、復原）：同步到繪圖端，縮圖重畫
useStore.subscribe((s, prev) => {
  if (s.content !== prev.content) {
    setContent(s.content);
    thumbs.invalidate();
  }
});
