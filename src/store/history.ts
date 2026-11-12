// 復原／重做與 A／B 比較（2.0 F2）。
// - 歷史記的是「文件」：目前場景的風格、動效、主體、微調、畫面比例、音樂。聲音開關、音量、面板收合、頁籤、播放時間都不進歷史。
// - 一次拖曳算一步：按下滑鼠（或手指）到放開之間的所有變動合成一步；鍵盤、按鈕的變動在同一個事件循環裡合成一步。
// - 套用配方、靈感骰子、從連結載入（審查 R-21）都是一般的變動，所以都能復原。
// - A／B：「記下 A」存一份目前的內容；按住「看 A」時舞台暫時換成 A，放開回到現在的（B）。看 A 的期間不進歷史、不存檔。
// - 2.0 α2：生成的內容（自訂主題的 JSON）也是文件的一部分，所以 Agent 的修改、貼回的動畫都能復原。
// - 預覽（Agent 的修改卡）：beginPreview 先把修改放上舞台但不算一步、不存檔；套用＝一步；放棄＝回到原本的；按住「比較」看原本的。
import { snapAuditionToPlan } from '../audio/engine';
import { sanitizeAudioPrefs } from '../audio/plan';
import type { AudioPrefs } from '../audio/types';
import type { Sel } from '../data/schema';
import type { SubjectId, Tune } from '../engine/types';
import { themes } from '../engine/themes';
import type { Aspect, ChatMsg, FilmSettings, Scene } from './project';
import { useStore } from './store';

type Music = Omit<AudioPrefs, 'on' | 'bgm' | 'sfx' | 'bgmVol' | 'sfxVol'>;
interface Doc {
  v: Sel[];
  m: Sel[];
  subject: SubjectId;
  tune: Tune;
  aspect: Aspect;
  music: Music;
  /** 目前自訂主題（生成的內容）的 JSON；沒有就是 null */
  theme: string | null;
  /** α3：場景清單（目前場景那一筆可能是舊的，以上面的即時內容為準）、目前是哪一場、目前場景的對話 */
  scenes: Scene[];
  active: string;
  chat: ChatMsg[];
  content: Record<string, string>;
  /** 2.0 β：整支片子的設定（標記、轉場）與音效替換 */
  film: FilmSettings;
  sfxMap: Record<string, string>;
}

const LIMIT = 100;
const musicOfAudio = ({ on: _on, bgm: _b, sfx: _s, bgmVol: _bv, sfxVol: _sv, ...rest }: AudioPrefs): Music => rest;
// 主題的 JSON 不在 store 裡：記住「上一次看到的」，算變動之前的樣子時用它
let knownTheme: string | null = null;
const docOf = (s: ReturnType<typeof useStore.getState>, theme: string | null = themes.currentJson()): Doc => ({ v: s.v, m: s.m, subject: s.subject, tune: s.tune, aspect: s.aspect, music: musicOfAudio(s.audio), theme, scenes: s.scenes, active: s.activeScene, chat: s.chat, content: s.content, film: s.film, sfxMap: s.sfxMap });
const paused = () => {
  const h = useStore.getState().hist;
  return h.showingA || h.previewing;
};
const same = (a: Doc, b: Doc) => JSON.stringify(a) === JSON.stringify(b);

let undoStack: Doc[] = [];
let redoStack: Doc[] = [];
/** 這一批變動之前的樣子（還沒成為一步） */
let base: Doc | null = null;
let applying = false;
let pointerDown = false;
/** 打字之類的連續操作（從聚焦到離開輸入框）算一步：beginGesture／endGesture */
let gesture = false;
let commitQueued = false;
let docA: Doc | null = null;
let previewBase: Doc | null = null;
/** 預覽結束時通知（session 用來更新對話與修改卡）：applied 套用（含「繼續改別的＝套用」）、discarded 放棄 */
let previewEnd: ((how: 'applied' | 'discarded') => void) | null = null;
export const onPreviewEnd = (f: (how: 'applied' | 'discarded') => void) => {
  previewEnd = f;
};
let previewDoc: Doc | null = null;
let docB: Doc | null = null;
let started = false;

function publish() {
  const h = useStore.getState().hist;
  const next = { ...h, undo: undoStack.length, redo: redoStack.length, a: !!docA };
  if (next.undo !== h.undo || next.redo !== h.redo || next.a !== h.a) useStore.setState({ hist: next });
}

function commit() {
  commitQueued = false;
  if (!base) return;
  const cur = docOf(useStore.getState());
  if (!same(base, cur)) {
    undoStack.push(base);
    if (undoStack.length > LIMIT) undoStack.shift();
    redoStack = [];
  }
  base = null;
  publish();
}

function apply(d: Doc) {
  applying = true;
  try {
    if (d.theme && d.theme !== themes.currentJson()) themes.add(d.theme);
  } catch {
    /* 存的主題壞了：留著現在的 */
  }
  knownTheme = themes.currentJson();
  useStore.setState((s) => ({ v: d.v, m: d.m, subject: d.subject, tune: d.tune, aspect: d.aspect, audio: sanitizeAudioPrefs({ ...s.audio, ...d.music }), scenes: d.scenes, activeScene: d.active, chat: d.active !== s.activeScene ? d.chat : s.chat, content: d.content, film: d.film, sfxMap: d.sfxMap }));
  applying = false;
  snapAuditionToPlan();
}

/** 開機時呼叫一次：開始記錄 */
export function startHistory() {
  if (started) return;
  started = true;
  knownTheme = themes.currentJson();
  useStore.subscribe((s, prev) => {
    const prevTheme = knownTheme;
    knownTheme = themes.currentJson();
    if (applying || s.hist.showingA) return;
    // 對話（chat）本身不算一步，但跟著文件一起記，換場景、復原時才對得上
    const changed = s.v !== prev.v || s.m !== prev.m || s.subject !== prev.subject || s.tune !== prev.tune || s.aspect !== prev.aspect || s.audio !== prev.audio || s.themeRev !== prev.themeRev || s.scenes !== prev.scenes || s.activeScene !== prev.activeScene || s.content !== prev.content || s.film !== prev.film || s.sfxMap !== prev.sfxMap;
    if (!changed) return;
    if (s.hist.previewing) {
      if (s.hist.comparing) return;
      // 預覽中改了別的東西（換風格、重抽、拖滑桿…）：等於接受這次的結果。預覽變成一步，接下來的改動照常記錄
      const before0 = docOf(prev, prevTheme);
      if (same(before0, docOf(s))) return;
      commitPreview();
    }
    const before = docOf(prev, prevTheme);
    if (same(before, docOf(s))) return; // 只動了聲音開關、音量，或換了主體版本這類不算文件的東西
    if (!base) base = before;
    if (!pointerDown && !gesture && !commitQueued) {
      commitQueued = true;
      queueMicrotask(commit);
    }
  });
  const down = () => {
    pointerDown = true;
  };
  const up = () => {
    if (!pointerDown) return;
    pointerDown = false;
    // 放開之後才結束這一步；click 事件會在 pointerup 之後才觸發，那次變動由微任務收尾
    commit();
  };
  window.addEventListener('pointerdown', down, true);
  window.addEventListener('pointerup', up, true);
  window.addEventListener('pointercancel', up, true);
  window.addEventListener('blur', up);
}

export function beginGesture() {
  commit();
  gesture = true;
}
export function endGesture() {
  gesture = false;
  commit();
}

/** 換專案、開檔之後：歷史從頭開始（不能復原到別的專案） */
export function resetHistory() {
  undoStack = [];
  redoStack = [];
  base = null;
  docA = null;
  docB = null;
  previewBase = previewDoc = null;
  knownTheme = themes.currentJson();
  useStore.setState({ hist: { undo: 0, redo: 0, a: false, showingA: false, previewing: false, comparing: false } });
}

export function undo() {
  if (paused()) return false;
  commit();
  const d = undoStack.pop();
  if (!d) return false;
  redoStack.push(docOf(useStore.getState()));
  apply(d);
  publish();
  return true;
}

export function redo() {
  if (paused()) return false;
  commit();
  const d = redoStack.pop();
  if (!d) return false;
  undoStack.push(docOf(useStore.getState()));
  apply(d);
  publish();
  return true;
}

/** 記下目前的內容當作 A */
export function markA() {
  docA = docOf(useStore.getState());
  publish();
}
export function clearA() {
  if (useStore.getState().hist.showingA) showA(false);
  docA = null;
  publish();
}
/** 按住時 true、放開時 false */
export function showA(on: boolean) {
  const st = useStore.getState();
  if (on) {
    if (!docA || st.hist.showingA || st.hist.previewing) return;
    commit();
    docB = docOf(st);
    useStore.setState({ hist: { ...st.hist, showingA: true } });
    apply(docA);
  } else {
    if (!st.hist.showingA || !docB) return;
    const b = docB;
    docB = null;
    apply(b);
    useStore.setState({ hist: { ...useStore.getState().hist, showingA: false } });
  }
}

// ---------- 預覽（Agent 的修改卡） ----------
/** 把一份新的主題 JSON 放上舞台試看：不算一步、不存檔。主題格式不對會丟出錯誤（舞台不變） */
/** patch：同時要換的其他東西（生成時換成風格模板的風格與動效），也算在這次預覽裡，放棄時一起還原 */
export function beginPreview(json: string, patch: Partial<Pick<Doc, 'v' | 'm'>> = {}) {
  const st = useStore.getState();
  if (st.hist.showingA) showA(false);
  if (st.hist.previewing) discardPreview();
  commit();
  previewBase = docOf(useStore.getState());
  useStore.setState({ hist: { ...useStore.getState().hist, previewing: true, comparing: false } });
  try {
    applying = true;
    themes.add(json);
    useStore.setState({ subject: 'custom', ...patch });
  } catch (e) {
    applying = false;
    previewBase = null;
    useStore.setState({ hist: { ...useStore.getState().hist, previewing: false } });
    throw e;
  } finally {
    applying = false;
  }
  knownTheme = themes.currentJson();
  previewDoc = docOf(useStore.getState());
}

/** 套用：變成一步可以復原的動作，並存檔 */
export function commitPreview() {
  const st = useStore.getState();
  if (!st.hist.previewing || !previewBase || !previewDoc) return;
  if (st.hist.comparing) compareOriginal(false);
  undoStack.push(previewBase);
  if (undoStack.length > LIMIT) undoStack.shift();
  redoStack = [];
  previewBase = previewDoc = null;
  useStore.setState({ hist: { ...useStore.getState().hist, previewing: false, comparing: false }, themeRev: useStore.getState().themeRev + 1 });
  publish();
  previewEnd?.('applied');
}

/** 放棄：回到修改之前 */
export function discardPreview() {
  const st = useStore.getState();
  if (!st.hist.previewing || !previewBase) return;
  const base = previewBase;
  previewBase = previewDoc = null;
  apply(base);
  useStore.setState({ hist: { ...useStore.getState().hist, previewing: false, comparing: false } });
  previewEnd?.('discarded');
}

/** 按住「比較」：暫時看修改之前的，放開回到修改後的 */
export function compareOriginal(on: boolean) {
  const st = useStore.getState();
  if (!st.hist.previewing || !previewBase || !previewDoc || st.hist.comparing === on) return;
  apply(on ? previewBase : previewDoc);
  useStore.setState({ hist: { ...useStore.getState().hist, comparing: on } });
}

/** 測試用：目前的堆疊大小 */
export const historySize = () => ({ undo: undoStack.length, redo: redoStack.length });
