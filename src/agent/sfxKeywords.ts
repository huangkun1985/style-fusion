// Agent 建議音效關鍵字（2.0 正式；設計提案 3.7 節第 2 點）：依這一場的內容（主體、生成的主題、內容欄位、Agent 的主題一行）
// 請 Claude 想幾組英文的 Freesound 搜尋關鍵字。只在連上 Claude 時能用；用「快」的力度，通常 5～15 秒。
// 純函數（組提示詞、讀回答）放這裡，scripts/agent-test.ts 有測。
import { runAgent } from './bridge';

export interface SfxKeywordContext {
  /** 音效種類的 id 與中文名（例如 land／落地） */
  kind: string;
  kindName: string;
  /** 主體名稱（例如「角色跳躍」「咖啡杯」） */
  subject: string;
  /** 生成的主題的名字與說明（內建模板沒有） */
  theme?: { name: string; desc: string };
  /** 內容欄位（標題、品牌名…） */
  content?: Record<string, string>;
  /** Agent 面板的主題一行 */
  topic?: string;
  /** 現在的關鍵字 */
  current: string;
}

export const MAX_SUGGEST = 5;

export function buildSfxKeywordPrompt(c: SfxKeywordContext): string {
  const content = Object.entries(c.content ?? {})
    .filter(([, v]) => v && v.trim())
    .slice(0, 6)
    .map(([k, v]) => `${k}=${v.slice(0, 60)}`)
    .join('；');
  return `你是動態設計的音效師。下面這段動畫要把「${c.kindName}」（${c.kind}）這個動作音效換成真實錄音，要到 Freesound 用英文搜尋。

【這段動畫】
- 主體：${c.subject}${c.theme ? `\n- 生成的內容：${c.theme.name}——${c.theme.desc.slice(0, 200)}` : ''}${content ? `\n- 畫面上的文字：${content}` : ''}${c.topic ? `\n- 主題：${c.topic.slice(0, 120)}` : ''}
- 現在用的關鍵字：${c.current}

【要你做的】
想 ${MAX_SUGGEST} 組英文搜尋關鍵字，讓搜到的錄音符合畫面上「真的在發出這個聲音的東西」（材質、大小、動作），例如落地的是陶瓷杯就寫 ceramic cup set down，不要只寫 landing。
- 每組 2～5 個英文單字，只用小寫字母與空白，不要標點、引號、編號。
- 由最貼切排到最保險（最後一組可以比較通用，確定搜得到）。
- 只輸出一個 JSON 陣列，例如 ["ceramic cup set down","mug on wooden table","soft thud"]，不要其他文字。`;
}

/** 從回答讀出關鍵字：先找 JSON 陣列，找不到就一行一行讀；只留合格的（小寫英文、2～6 個字、48 字以內），去重複 */
export function parseSfxKeywords(text: string): string[] {
  let raw: unknown[] = [];
  const m = text.match(/\[[\s\S]*?\]/);
  if (m) {
    try {
      const v = JSON.parse(m[0]) as unknown;
      if (Array.isArray(v)) raw = v;
    } catch {
      /* 不是 JSON，改一行一行讀 */
    }
  }
  if (!raw.length) raw = text.split(/\r?\n/).map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)、])\s*/, ''));
  const out: string[] = [];
  for (const x of raw) {
    if (typeof x !== 'string') continue;
    const q = x
      .toLowerCase()
      .replace(/["'`“”‘’]/g, '')
      .replace(/[^a-z0-9 -]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const words = q.split(' ').filter(Boolean);
    if (words.length < 1 || words.length > 6 || q.length > 48 || !/[a-z]/.test(q)) continue;
    if (!out.includes(q)) out.push(q);
    if (out.length >= MAX_SUGGEST) break;
  }
  return out;
}

/** 請 Claude 建議關鍵字（要連上 Claude；signal 可以取消） */
export async function suggestSfxKeywords(c: SfxKeywordContext, signal?: AbortSignal): Promise<string[]> {
  const r = await runAgent(buildSfxKeywordPrompt(c), { effort: 'low', signal });
  const list = parseSfxKeywords(r.text);
  if (!list.length) throw new Error('Agent 的回答裡沒有讀到關鍵字，再試一次');
  return list;
}
