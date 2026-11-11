// 復原／重做與 A／B 比較（2.0 F2）。
// - 歷史記的是「文件」：目前場景的風格、動效、主體、微調、畫面比例、音樂。聲音開關、音量、面板收合、頁籤、播放時間都不進歷史。
// - 一次拖曳算一步：按下滑鼠（或手指）到放開之間的所有變動合成一步；鍵盤、按鈕的變動在同一個事件循環裡合成一步。
// - 套用配方、靈感骰子、從連結載入（審查 R-21）都是一般的變動，所以都能復原。
// - A／B：「記下 A」存一份目前的內容；按住「看 A」時舞台暫時換成 A，放開回到現在的（B）。看 A 的期間不進歷史、不存檔。
import { snapAuditionToPlan } from '../audio/engine';
import { sanitizeAudioPrefs } from '../audio/plan';
import type { AudioPrefs } from '../audio/types';
import type { Sel } from '../data/schema';
import type { SubjectId, Tune } from '../engine/types';
import type { Aspect } from './project';
import { useStore } from './store';

type Music = Omit<AudioPrefs, 'on' | 'bgm' | 'sfx' | 'bgmVol' | 'sfxVol'>;
interface Doc {
  v: Sel[];
  m: Sel[];
  subject: SubjectId;
  tune: Tune;
  aspect: Aspect;
  music: Music;
}

const LIMIT = 100;
const musicOfAudio = ({ on: _on, bgm: _b, sfx: _s, bgmVol: _bv, sfxVol: _sv, ...rest }: AudioPrefs): Music => rest;
const docOf = (s: ReturnType<typeof useStore.getState>): Doc => ({ v: s.v, m: s.m, subject: s.subject, tune: s.tune, aspect: s.aspect, music: musicOfAudio(s.audio) });
const same = (a: Doc, b: Doc) => JSON.stringify(a) === JSON.stringify(b);

let undoStack: Doc[] = [];
let redoStack: Doc[] = [];
/** 這一批變動之前的樣子（還沒成為一步） */
let base: Doc | null = null;
let applying = false;
let pointerDown = false;
let commitQueued = false;
let docA: Doc | null = null;
let docB: Doc | null = null;
let started = false;

function publish() {
  const h = useStore.getState().hist;
  const next = { undo: undoStack.length, redo: redoStack.length, a: !!docA, showingA: h.showingA };
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
  useStore.setState((s) => ({ v: d.v, m: d.m, subject: d.subject, tune: d.tune, aspect: d.aspect, audio: sanitizeAudioPrefs({ ...s.audio, ...d.music }) }));
  applying = false;
  snapAuditionToPlan();
}

/** 開機時呼叫一次：開始記錄 */
export function startHistory() {
  if (started) return;
  started = true;
  useStore.subscribe((s, prev) => {
    if (applying || s.hist.showingA) return;
    const changed = s.v !== prev.v || s.m !== prev.m || s.subject !== prev.subject || s.tune !== prev.tune || s.aspect !== prev.aspect || s.audio !== prev.audio;
    if (!changed) return;
    const before = docOf(prev);
    if (s.audio !== prev.audio && s.v === prev.v && s.m === prev.m && s.subject === prev.subject && s.tune === prev.tune && s.aspect === prev.aspect && same(before, docOf(s))) return; // 只動了聲音開關或音量
    if (!base) base = before;
    if (!pointerDown && !commitQueued) {
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

/** 換專案、開檔之後：歷史從頭開始（不能復原到別的專案） */
export function resetHistory() {
  undoStack = [];
  redoStack = [];
  base = null;
  docA = null;
  docB = null;
  useStore.setState({ hist: { undo: 0, redo: 0, a: false, showingA: false } });
}

export function undo() {
  commit();
  const d = undoStack.pop();
  if (!d) return false;
  redoStack.push(docOf(useStore.getState()));
  apply(d);
  publish();
  return true;
}

export function redo() {
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
    if (!docA || st.hist.showingA) return;
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

/** 測試用：目前的堆疊大小 */
export const historySize = () => ({ undo: undoStack.length, redo: redoStack.length });
