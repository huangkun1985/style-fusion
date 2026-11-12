// 內建模板的內容欄位（2.0 α3，F9）：選到內建模板時可以直接換字。
// 只開放 v2 與單一版本的主體（v1 是原設計，要保持原樣給使用者比較）。沒有改過的欄位用預設值，畫面和以前逐像素相同。
// 目前場景的內容放在模組內（和主體版本 setSubjectVersion 一樣是全域的一份），store 換場景、復原時同步過來。
import type { SubjectId } from './types';

export interface ContentField {
  key: string;
  label: string;
  def: string;
  max: number;
  /** 給使用者看的提示：做什麼、什麼時候改 */
  tip: string;
  /** 只能填數字 */
  num?: boolean;
}

export const CONTENT_FIELDS: Partial<Record<SubjectId, ContentField[]>> = {
  type: [
    { key: 'word', label: '標題', def: 'MOTION', max: 10, tip: '巨大的主標題（逐字落下）。建議 4～8 個字母或 2～4 個中文字' },
    { key: 'sub', label: '副標', def: '動效風格', max: 14, tip: '標題下面的小字副標' },
    { key: 'marquee', label: '跑馬燈', def: 'STYLE FUSION  ✦  MOTION DESIGN  ✦  EASE & TIMING  ✦  ', max: 60, tip: '底部循環捲動的一行小字' },
  ],
  logo: [{ key: 'word', label: '品牌名', def: 'LUMEN', max: 10, tip: '標誌下面的字標（逐字顯現）。建議 3～8 個字' }],
  // 2.0 β：UI 介面（v2）的頁面文字
  ui: [
    { key: 'title', label: '頁面標題', def: 'Statistics', max: 16, tip: '手機畫面最上面的大標題。換成你的 App 頁面名稱' },
    { key: 'course', label: '卡片標題', def: 'Computer Architecture ...', max: 28, tip: '第一張卡片的標題（太長會被截掉，建議 20 字以內）' },
    { key: 'metric', label: '數據名稱', def: 'Overall Presence', max: 20, tip: '大數字上面的小標' },
    { key: 'task1', label: '任務 1', def: 'Final Project Presentation', max: 28, tip: '下面清單的第一個任務' },
    { key: 'task2', label: '任務 2', def: 'Create a website template', max: 28, tip: '下面清單的第二個任務' },
    { key: 'toast', label: '通知文字', def: 'Style applied', max: 18, tip: '最後跳出來的通知' },
  ],
  // 2.0 β：數據圖表（v2）的標題與數字（數字會從 0 數上去）
  chart: [
    { key: 'title', label: '標題', def: 'Portfolio Performance', max: 24, tip: '左上角的小標題' },
    { key: 'total', label: '總額（千）', def: '128.4', max: 7, tip: '大數字（單位是千，畫面顯示 $128.4K）。只填數字', num: true },
    { key: 'change', label: '漲跌', def: '▲ 14.6%', max: 10, tip: '總額旁邊的漲跌標籤' },
    { key: 'score', label: '圓環百分比', def: '75.8', max: 5, tip: '圓環中間的百分比（0～100）。只填數字', num: true },
    { key: 'scoreLabel', label: '圓環名稱', def: 'Health Score', max: 16, tip: '圓環中間百分比下面的小字' },
  ],
};

/** 數字欄位：讀成數字，壞掉或超出範圍就用預設 */
export function contentNum(subject: SubjectId, key: string, def: number, lo = 0, hi = 99999): number {
  const v = parseFloat(content(subject, key, String(def)));
  return Number.isFinite(v) && v >= lo && v <= hi ? v : def;
}

/** 哪些主體的哪個版本有內容欄位（v1 一律沒有，除了本來就只有一個版本的主體） */
const SINGLE_VERSION: SubjectId[] = ['logo'];
export function fieldsFor(subject: SubjectId, ver: 'v1' | 'v2'): ContentField[] {
  if (ver === 'v1' && !SINGLE_VERSION.includes(subject)) return [];
  return CONTENT_FIELDS[subject] ?? [];
}

let current: Record<string, string> = {};
let rev = 0;
export const contentRev = () => rev;

/** store 同步過來（鍵是「主體.欄位」） */
export function setContent(c: Record<string, string>) {
  current = c;
  rev++;
}

/** 2.0 β：畫別的場景（整支片子、場景帶縮圖、風格包）時，暫時換成那一場的內容欄位；畫完放回（見 renderer 的 FrameSpec.scope） */
let scoped: Record<string, string> | null = null;
export function withContent<T>(c: Record<string, string> | undefined, fn: () => T): T {
  if (!c) return fn();
  const prev = scoped;
  scoped = c;
  try {
    return fn();
  } finally {
    scoped = prev;
  }
}

/** 主體畫圖時讀內容：沒有改過就是預設值 */
export function content(subject: SubjectId, key: string, def: string): string {
  const v = (scoped ?? current)[`${subject}.${key}`];
  return typeof v === 'string' && v.length ? v : def;
}

/** 外來資料的內容欄位：只留認得的鍵、截到上限 */
export function sanitizeContent(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [sid, fields] of Object.entries(CONTENT_FIELDS)) {
    for (const f of fields ?? []) {
      const k = `${sid}.${f.key}`;
      const v = (raw as Record<string, unknown>)[k];
      if (typeof v === 'string' && v.trim() && v !== f.def) out[k] = Array.from(v).slice(0, f.max).join('');
    }
  }
  return out;
}
