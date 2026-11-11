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
}

export const CONTENT_FIELDS: Partial<Record<SubjectId, ContentField[]>> = {
  type: [
    { key: 'word', label: '標題', def: 'MOTION', max: 10, tip: '巨大的主標題（逐字落下）。建議 4～8 個字母或 2～4 個中文字' },
    { key: 'sub', label: '副標', def: '動效風格', max: 14, tip: '標題下面的小字副標' },
    { key: 'marquee', label: '跑馬燈', def: 'STYLE FUSION  ✦  MOTION DESIGN  ✦  EASE & TIMING  ✦  ', max: 60, tip: '底部循環捲動的一行小字' },
  ],
  logo: [{ key: 'word', label: '品牌名', def: 'LUMEN', max: 10, tip: '標誌下面的字標（逐字顯現）。建議 3～8 個字' }],
};

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

/** 主體畫圖時讀內容：沒有改過就是預設值 */
export function content(subject: SubjectId, key: string, def: string): string {
  const v = current[`${subject}.${key}`];
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
