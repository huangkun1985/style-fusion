// Agent 的執行狀態（放在 React 之外：生成中換頁籤、收起面板都不會中斷）。
// 一次只跑一個請求；結果先「預覽」在舞台上（history.beginPreview），使用者按套用才變成一步、才存檔。
import { create } from 'zustand';
import { clock } from '../engine/clock';
import { themes } from '../engine/themes';
import { beginPreview, commitPreview, discardPreview } from '../store/history';
import type { ChatMsg, Stamp } from '../store/project';
import { recipeById } from '../lib/agentPrompt';
import { useStore } from '../store/store';
import { diffThemes, FRAME_BUDGET_MS, generate, measureFrameMs, modify, stampLabel, type AgentResult } from './agent';
import { AgentError } from './bridge';

export interface PendingChange {
  kind: 'generate' | 'modify';
  summary: string;
  range: [number, number] | null;
  changed: number;
  frameMs: number;
  retried: boolean;
  ms: number;
}

interface RunState {
  running: null | { kind: 'generate' | 'modify'; startedAt: number; phase: 'thinking' | 'writing' | 'retry'; chars: number };
  pending: PendingChange | null;
  error: string;
  /** 「再試一次」要重送的請求 */
  last: null | { kind: 'generate' } | { kind: 'modify'; text: string; stamps: Stamp[] };
}

export const useAgentRun = create<RunState>(() => ({ running: null, pending: null, error: '', last: null }));
let ctl: AbortController | null = null;

const pushChat = (m: Omit<ChatMsg, 'at'>) => {
  const s = useStore.getState();
  useStore.setState({ chat: [...s.chat, { ...m, at: Date.now() }].slice(-60) });
};
const markLastPending = (change: 'applied' | 'discarded') => {
  const chat = useStore.getState().chat;
  const i = chat.map((m) => m.change).lastIndexOf('pending');
  if (i < 0) return;
  useStore.setState({ chat: chat.map((m, j) => (j === i ? { ...m, change } : m)) });
};

/** 把一份結果放上舞台預覽並做成修改卡（生成、修改、手動貼回都走這裡） */
export function previewResult(r: Pick<AgentResult, 'json' | 'theme' | 'summary' | 'note' | 'ms' | 'retried'>, kind: 'generate' | 'modify') {
  const before = useStore.getState().subject === 'custom' ? themes.currentJson() : null;
  if (useStore.getState().hist.previewing) {
    discardPreview();
    markLastPending('discarded');
  }
  // 生成的內容綁定它的風格模板：換成模板的風格與動效（放棄時一起還原）
  const tpl = kind === 'generate' ? recipeById(useStore.getState().agent.template) : null;
  beginPreview(r.json, tpl ? { v: tpl.v.map(([id, w]) => ({ id, w })), m: tpl.m.map(([id, w]) => ({ id, w })) } : {});
  const d = kind === 'modify' ? diffThemes(before, r.theme, r.json) : { changed: 0, range: null };
  let frameMs = 0;
  try {
    frameMs = measureFrameMs();
  } catch {
    frameMs = 0;
  }
  const summary = r.summary || (kind === 'generate' ? `生成了「${r.theme.name}」（${r.theme.loop} 秒）` : '改好了');
  useAgentRun.setState({ pending: { kind, summary, range: d.range, changed: d.changed, frameMs, retried: r.retried, ms: r.ms }, error: '' });
  pushChat({ role: 'agent', text: summary, change: 'pending', ms: r.ms });
  if (kind === 'generate') clock.set(0);
}

async function runIt(kind: 'generate' | 'modify', text = '', stamps: Stamp[] = []) {
  if (useAgentRun.getState().running) return;
  ctl = new AbortController();
  useAgentRun.setState({ running: { kind, startedAt: Date.now(), phase: 'thinking', chars: 0 }, error: '', last: kind === 'generate' ? { kind } : { kind, text, stamps } });
  const onProgress = (p: { phase: 'thinking' | 'writing' | 'retry'; chars: number }) => {
    const r = useAgentRun.getState().running;
    if (r) useAgentRun.setState({ running: { ...r, ...p } });
  };
  try {
    const history = useStore.getState().chat;
    const r = kind === 'generate' ? await generate(ctl.signal, onProgress) : await modify(text, stamps, history, ctl.signal, onProgress);
    useAgentRun.setState({ running: null });
    previewResult(r, kind);
  } catch (e) {
    const aborted = e instanceof AgentError && e.code === 'aborted';
    const msg = aborted ? '已取消' : e instanceof AgentError ? e.message : `回覆的格式不對，自動重問一次之後還是不行：${(e as Error).message.split('\n')[0]}`;
    useAgentRun.setState({ running: null, error: aborted ? '' : msg });
    pushChat({ role: 'note', text: msg });
  } finally {
    ctl = null;
  }
}

export function startGenerate() {
  const { agent } = useStore.getState();
  pushChat({ role: 'user', text: `生成：${agent.topic.trim() || '（模板的示範主題）'}　${agent.seconds} 秒` });
  void runIt('generate');
}

export function startModify(text: string) {
  const s = useStore.getState();
  const stamps = s.stamps;
  pushChat({ role: 'user', text, ...(stamps.length ? { stamps } : {}) });
  useStore.setState({ stamps: [] });
  void runIt('modify', text, stamps);
}

export function retryLast() {
  const l = useAgentRun.getState().last;
  if (!l || useAgentRun.getState().running) return;
  if (useStore.getState().hist.previewing) rejectChange();
  pushChat({ role: 'note', text: '再試一次' });
  if (l.kind === 'generate') void runIt('generate');
  else void runIt('modify', l.text, l.stamps);
}

/** 請 Agent 簡化（每幀超過 6 ms 時） */
export function askSimplify() {
  const ms = useAgentRun.getState().pending?.frameMs ?? 0;
  if (useStore.getState().hist.previewing) acceptChange();
  startModify(`這段動畫每幀要 ${ms.toFixed(1)} ms，超過 ${FRAME_BUDGET_MS} ms 的預算。請在外觀盡量不變的前提下簡化：減少圖層與點的數量、合併相同動作的圖層、拿掉看不出來的細節。`);
}

export function cancelRun() {
  ctl?.abort();
}

export function acceptChange() {
  commitPreview();
  markLastPending('applied');
  useAgentRun.setState({ pending: null });
}

export function rejectChange() {
  discardPreview();
  markLastPending('discarded');
  useAgentRun.setState({ pending: null });
}

/** 把目前播放頭的時間變成輸入框上的標籤 */
export function addStampNow() {
  const theme = themes.current();
  const s = useStore.getState();
  if (s.subject !== 'custom' || !theme) return;
  const t = ((clock.t % theme.loop) + theme.loop) % theme.loop;
  const r = Math.round(t * 100) / 100;
  if (s.stamps.some((x) => Math.abs(x.t - r) < 0.05) || s.stamps.length >= 8) return;
  useStore.setState({ stamps: [...s.stamps, { t: r, label: stampLabel(theme, r) }] });
}

/** 換專案、換場景時：不要讓上一個專案的修改卡留著 */
useStore.subscribe((s, prev) => {
  if (s.projectId !== prev.projectId && useAgentRun.getState().pending) useAgentRun.setState({ pending: null });
});
