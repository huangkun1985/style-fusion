// Agent 的流程（2.0 α2）：一句話生成（F4）、對話修改（F5）、時間點（F6）。
// 只動「生成的內容」（自訂主題檔），不碰內建模板；回覆一律用 parseTheme 驗證，不合格自動帶著錯誤重問一次。
import { MOTION_MAP } from '../data/motion';
import { VISUAL_MAP } from '../data/visual';
import { Renderer } from '../engine/renderer';
import { resolveLook, resolveMove } from '../engine/resolve';
import { evalTrack, parseTheme, themes, type Layer, type Theme } from '../engine/themes';
import { COLOR_GUIDE, THEME_SPEC_SUMMARY } from '../engine/themeTemplates';
import { agentPrompt, extractThemeJson } from '../lib/agentPrompt';
import type { ChatMsg, Stamp } from '../store/project';
import { useStore } from '../store/store';
import { runAgent } from './bridge';

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

// ---------- 時間點 ----------
function flat(layers: Layer[], out: Layer[] = []): Layer[] {
  for (const L of layers) {
    out.push(L);
    flat(L.children, out);
  }
  return out;
}

/** 時間點的名字：最近的事件（有音效就用音效名）或最近的關鍵影格所在的圖層 */
export function stampLabel(theme: Theme | null, t: number): string {
  if (!theme) return '';
  const u = (((t / theme.loop) % 1) + 1) % 1;
  let best = '';
  let bd = 0.3 / theme.loop;
  for (const e of theme.events) {
    const d = Math.abs(e.u - u);
    if (d <= bd) {
      bd = d;
      best = e.sfx ? `事件 ${e.sfx}` : '事件';
    }
  }
  if (best) return best;
  bd = 0.3 / theme.loop;
  for (const L of flat(theme.layers)) {
    for (const tr of Object.values(L.tracks)) {
      if (!Array.isArray(tr)) continue;
      for (const k of tr) {
        const d = Math.abs(k[0] - u);
        if (d < bd) {
          bd = d;
          best = L.id;
        }
      }
    }
  }
  return best;
}

/** 給 Agent 的時間點資料：時間、循環比例、前後 0.3 秒的事件與關鍵影格、那一刻各圖層的狀態 */
export function stampContext(theme: Theme, s: Stamp): string {
  const u = (((s.t / theme.loop) % 1) + 1) % 1;
  const win = 0.3 / theme.loop;
  const L: string[] = [`@${s.t.toFixed(2)}s（循環的 ${Math.round(u * 100)}%，u=${u.toFixed(3)}）${s.label ? `　最近的是：${s.label}` : ''}`];
  const ev = theme.events.filter((e) => Math.abs(e.u - u) <= win).map((e) => `u=${e.u.toFixed(3)}${e.sfx ? ` 音效 ${e.sfx}` : ''}`);
  if (ev.length) L.push(`  前後 0.3 秒的事件：${ev.join('；')}`);
  const keys: string[] = [];
  const states: string[] = [];
  for (const ly of flat(theme.layers)) {
    const near: string[] = [];
    const st: string[] = [];
    for (const [p, tr] of Object.entries(ly.tracks)) {
      if (tr === undefined) continue;
      if (Array.isArray(tr)) for (const k of tr) if (Math.abs(k[0] - u) <= win) near.push(`${p}@${k[0].toFixed(3)}=${k[1]}`);
      const v = evalTrack(tr, u, null);
      st.push(`${p}=${Math.round(v * 100) / 100}`);
    }
    if (near.length) keys.push(`${ly.id}（${near.join('，')}）`);
    if (st.length) states.push(`${ly.id}：${st.join(' ')}`);
  }
  if (keys.length) L.push(`  前後 0.3 秒的關鍵影格：${keys.slice(0, 20).join('；')}`);
  if (states.length) L.push(`  這一刻的圖層狀態：${states.slice(0, 30).join('；')}`);
  return L.join('\n');
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

// ---------- 修改卡：改了什麼、動到哪段時間、每幀耗時 ----------
type J = unknown;
function countDiff(a: J, b: J): number {
  if (typeof a === 'number' && typeof b === 'number') return a === b ? 0 : 1;
  if (Array.isArray(a) && Array.isArray(b)) {
    let n = Math.abs(a.length - b.length);
    for (let i = 0; i < Math.min(a.length, b.length); i++) n += countDiff(a[i], b[i]);
    return n;
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a as object);
    const kb = Object.keys(b as object);
    let n = 0;
    for (const k of new Set([...ka, ...kb])) n += countDiff((a as Record<string, J>)[k], (b as Record<string, J>)[k]);
    return n;
  }
  return a === b ? 0 : 1;
}

function keyTimes(layers: Layer[], map = new Map<string, Map<string, string>>()) {
  for (const L of flat(layers)) {
    const m = new Map<string, string>();
    for (const [p, tr] of Object.entries(L.tracks)) m.set(p, JSON.stringify(tr));
    map.set(L.id, m);
  }
  return map;
}

/** 比較修改前後：改了幾個值、動到的時間範圍（秒）；沒有關鍵影格的改動（大小、顏色）回傳 null 範圍＝整段 */
export function diffThemes(beforeJson: string | null, after: Theme, afterJson: string): { changed: number; range: [number, number] | null } {
  if (!beforeJson) return { changed: 0, range: null };
  let changed = 0;
  try {
    changed = countDiff(JSON.parse(beforeJson), JSON.parse(afterJson));
  } catch {
    changed = 0;
  }
  let before: Theme;
  try {
    before = parseTheme(beforeJson);
  } catch {
    return { changed, range: null };
  }
  const a = keyTimes(before.layers);
  let lo = Infinity;
  let hi = -Infinity;
  for (const L of flat(after.layers)) {
    const old = a.get(L.id);
    for (const [p, tr] of Object.entries(L.tracks)) {
      const prev = old?.get(p);
      if (prev === JSON.stringify(tr)) continue;
      const us: number[] = [];
      if (Array.isArray(tr)) us.push(...tr.map((k) => k[0]));
      if (prev) {
        try {
          const pt = JSON.parse(prev);
          if (Array.isArray(pt)) us.push(...pt.map((k: [number]) => k[0]));
        } catch {
          /* ignore */
        }
      }
      for (const u of us) {
        if (u <= 0.001 || u >= 0.999) continue; // 首尾的鍵每條都有，不算
        lo = Math.min(lo, u);
        hi = Math.max(hi, u);
      }
    }
  }
  if (!Number.isFinite(lo)) return { changed, range: null };
  return { changed, range: [lo * after.loop, hi * after.loop] };
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
