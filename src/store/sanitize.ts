// 外來資料的消毒：配方碼、分享連結、本機存檔、收藏。只留下認得的風格與主體、把數值夾回介面允許的範圍。
// 用 Object.hasOwn 判斷，不用 `in` 或 `MAP[id]`：`constructor`、`toString` 這類名稱會從原型鏈上「找得到」，
// 一旦混進狀態，畫面每次開都會出錯（還會被存進本機）。
import type { Sel } from '../data/schema';
import { TUNE_DEFAULT } from '../engine/resolve';
import { SUBJECT_ORDER } from '../engine/subjects';
import type { Palette, SubjectId, Tune } from '../engine/types';

const num = (x: unknown, lo: number, hi: number, d: number) => (typeof x === 'number' && Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d);

/** 混合裡的風格清單：只留下風格庫認得的 id、權重夾在 5%～150%，重複的只留第一個 */
export function sanitizeSels(raw: unknown, lib: Record<string, unknown>): Sel[] {
  if (!Array.isArray(raw)) return [];
  const out: Sel[] = [];
  for (const x of raw) {
    const id = (x as Sel | null)?.id;
    if (typeof id !== 'string' || !Object.hasOwn(lib, id) || out.some((o) => o.id === id)) continue;
    out.push({ id, w: num((x as Sel).w, 0.05, 1.5, 1) });
  }
  return out;
}

export function isSubjectId(x: unknown): x is SubjectId {
  return typeof x === 'string' && (SUBJECT_ORDER as string[]).includes(x);
}

const PAL_KEYS: (keyof Palette)[] = ['bg', 'bg2', 'ink', 'light', 'card', 'p', 's', 'a', 'q', 'r'];
const COLOR = /^(#[0-9a-fA-F]{3,8}|(rgb|hsl)a?\([^()]{1,60}\))$/;

/** 微調參數：範圍與介面上的滑桿一致；不認得的欄位丟掉 */
export function sanitizeTune(raw: unknown): Tune {
  const t = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof Tune, unknown>>;
  const custom: Partial<Palette> = {};
  if (t.custom && typeof t.custom === 'object') {
    for (const k of PAL_KEYS) {
      const v = (t.custom as Record<string, unknown>)[k];
      if (typeof v === 'string' && COLOR.test(v.trim())) custom[k] = v.trim();
    }
  }
  return {
    speed: num(t.speed, 0.25, 2.5, TUNE_DEFAULT.speed),
    fps: Math.round(num(t.fps, 0, 60, TUNE_DEFAULT.fps)),
    paletteMode: t.paletteMode === 'dominant' || t.paletteMode === 'blend' || t.paletteMode === 'interleave' ? t.paletteMode : TUNE_DEFAULT.paletteMode,
    seed: Math.round(num(t.seed, 0, 99999, TUNE_DEFAULT.seed)),
    strokeMul: num(t.strokeMul, 0, 3, TUNE_DEFAULT.strokeMul),
    fxMul: num(t.fxMul, 0, 1.5, TUNE_DEFAULT.fxMul),
    loopMul: num(t.loopMul, 0.5, 2.5, TUNE_DEFAULT.loopMul),
    custom,
    keepColors: t.keepColors !== false,
  };
}
