// Agent 的流程（2.0 α2）：一句話生成（F4）、對話修改（F5）、時間點（F6）。
// 只動「生成的內容」（自訂主題檔），不碰內建模板；回覆一律用 parseTheme 驗證，不合格自動帶著錯誤重問一次。
import { MOTION_MAP } from '../data/motion';
import { VISUAL_MAP } from '../data/visual';
import { Renderer } from '../engine/renderer';
import { resolveLook, resolveMove } from '../engine/resolve';
import { parseTheme, themes, type Theme } from '../engine/themes';
import { COLOR_GUIDE, THEME_SPEC_SUMMARY } from '../engine/themeTemplates';
import { agentPrompt, extractThemeJson } from '../lib/agentPrompt';
import type { ChatMsg, Stamp } from '../store/project';
import { useStore } from '../store/store';
import { runAgent } from './bridge';
import { stampContext } from './themeTools';

export { diffThemes, stampContext, stampLabel } from './themeTools';

export const FRAME_BUDGET_MS = 6;

export interface AgentResult {
  json: string;
  theme: Theme;
  summary: string;
  /** 回覆裡 JSON 之前的說明（規劃、時間表） */
  note: string;
  ms: number;
  retried: boolean;
}

type Progress = (p: { phase: 'thinking' | 'writing' | 'retry'; chars: number }) => void;

const summaryOf = (text: string) => (text.match(/摘要[:：]\s*(.+)/)?.[1] ?? '').trim().slice(0, 300);
const noteOf = (text: string) => {
  const i = text.lastIndexOf('```json');
  return (i > 0 ? text.slice(0, i) : '').replace(/```[\s\S]*?```/g, '').trim().slice(0, 1500);
};

/** 呼叫 Claude、取出 JSON、驗證；不合格就把錯誤訊息附上重問一次 */
async function ask(prompt: string, signal: AbortSignal, onProgress?: Progress): Promise<AgentResult> {
  const effort = useStore.getState().agentEffort;
  let chars = 0;
  const onDelta = (t: string) => {
    chars += t.length;
    onProgress?.({ phase: 'writing', chars });
  };
  const first = await runAgent(prompt, { effort, signal, onDelta });
  let text = first.text;
  const firstSummary = summaryOf(first.text);
  const firstNote = noteOf(first.text);
  let ms = first.ms;
  let retried = false;
  let json = extractThemeJson(text);
  let theme: Theme;
  try {
    theme = parseTheme(json);
  } catch (e) {
    retried = true;
    chars = 0;
    onProgress?.({ phase: 'retry', chars: 0 });
    const fix = `${prompt}\n\n---\n你上一次的回答如下：\n${text.slice(-60_000)}\n\n---\n這份 JSON 沒有通過檢查，錯誤訊息：\n${(e as Error).message}\n\n請修正這個錯誤，其他部分不要改。先寫一行「摘要：修正了…」，再把完整 JSON 放在最後一個 \`\`\`json 程式碼區塊。`;
    const second = await runAgent(fix, { effort, signal, onDelta });
    text = second.text;
    ms += second.ms;
    json = extractThemeJson(text);
    theme = parseTheme(json); // 第二次還是不合格就丟出錯誤，介面顯示「再試一次」
  }
  // 重問的回答只會說「修正了…」：摘要與說明用第一次的（說的是這段動畫本身）
  return { json, theme, summary: (retried && firstSummary) || summaryOf(text), note: (retried && firstNote) || noteOf(text), ms, retried };
}

/** 一句話生成：用 α1 的初始提示詞（風格模板＋主題＋長度） */
export function generate(signal: AbortSignal, onProgress?: Progress) {
  const { agent } = useStore.getState();
  const prompt = `${agentPrompt(agent)}\n\n（請把步驟 1 的規劃寫短一點，5 行以內；JSON 之前另外寫一行「摘要：」用一句話說這段動畫在演什麼。）`;
  onProgress?.({ phase: 'thinking', chars: 0 });
  return ask(prompt, signal, onProgress);
}

// ---------- 對話修改 ----------
export function modify(message: string, stamps: Stamp[], history: ChatMsg[], signal: AbortSignal, onProgress?: Progress) {
  const prompt = buildModifyPrompt(message, stamps, history);
  onProgress?.({ phase: 'thinking', chars: 0 });
  return ask(prompt, signal, onProgress);
}

/** 修改用的提示詞（連上 Claude 時直接送；手動模式複製出去） */
export function buildModifyPrompt(message: string, stamps: Stamp[], history: ChatMsg[]): string {
  const json = themes.currentJson();
  const theme = themes.current();
  if (!json || !theme) throw new Error('這個場景沒有生成的內容可以修改');
  const recent = history
    .filter((m) => m.role !== 'note')
    .slice(-6)
    .map((m) => `${m.role === 'user' ? '使用者' : 'Agent'}：${m.text.slice(0, 300)}`)
    .join('\n');
  const prompt = `你是 Style Fusion 的動畫修改助手。下面是一個動畫主題檔（JSON），請依照使用者的修改意見修改它。

【規則】
- 只改使用者要求的部分；沒提到的圖層、關鍵影格、數值、顏色一律保持原樣（包括順序與 id）。
- 仍然要符合格式：每條關鍵影格 u 從 0 到 1、首尾相等可以無縫循環；顏色只用色板角色（圖層裡不能出現 #rrggbb）；音效的 u 要對到動作。
- 「這裡」「這個時間」指的是下面附的時間點。
- 輸出：第一行寫「摘要：」用一句中文說改了什麼，要帶數值（例如「煙的上升從 0.8 秒改成 1.6 秒；杯子放大 20%」）；然後把**完整的** JSON 放在最後一個 \`\`\`json 程式碼區塊（不能有註解）。

${THEME_SPEC_SUMMARY}

${COLOR_GUIDE}

【目前的動畫（${theme.loop} 秒一個循環）】
\`\`\`json
${json}
\`\`\`
${stamps.length ? `\n【使用者附的時間點】\n${stamps.map((s) => stampContext(theme, s)).join('\n')}\n` : ''}${recent ? `\n【之前的對話】\n${recent}\n` : ''}
【使用者的修改意見】
${message}`;
  return prompt;
}

/** 手動模式貼回的回答：取出 JSON、驗證（不合格丟出錯誤） */
export function parseAnswer(text: string): Pick<AgentResult, 'json' | 'theme' | 'summary' | 'note' | 'ms' | 'retried'> {
  const json = extractThemeJson(text);
  return { json, theme: parseTheme(json), summary: summaryOf(text), note: noteOf(text), ms: 0, retried: false };
}

let bench: Renderer | null = null;
/** 目前舞台上的內容在 640×360 每幀要幾毫秒（30 格平均，用目前的風格） */
export function measureFrameMs(): number {
  const s = useStore.getState();
  if (s.subject !== 'custom') return 0;
  bench ??= new Renderer(false);
  const look = resolveLook(s.v, VISUAL_MAP, s.tune, themes.current()?.palette);
  const move = resolveMove(s.m, MOTION_MAP, s.tune);
  const c = document.createElement('canvas');
  c.width = 640;
  c.height = 360;
  const cx = c.getContext('2d')!;
  const loop = themes.current()?.loop ?? 4;
  bench.render(cx, 640, 360, { subject: 'custom', look, move, tune: s.tune, time: 0 }); // 暖機
  const t0 = performance.now();
  for (let i = 0; i < 30; i++) bench.render(cx, 640, 360, { subject: 'custom', look, move, tune: s.tune, time: (i / 30) * loop });
  return (performance.now() - t0) / 30;
}
