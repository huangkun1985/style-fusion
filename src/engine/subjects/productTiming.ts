// 3D 產品展示的時間表與動作曲線。獨立成不依賴 three 的模組：2D 主體（提示點、追蹤點）與 3D 場景共用，
// 主體檔才不會把 three 拉進主程式包（3D 是第一次用到時才懶載入的）。
import type { MotionCtx } from '../motion';

/** 時間表（循環內 0..1）；轉盤一圈＝一個循環，正面在 u≈0.5 朝向鏡頭 */
export const PRODUCT_T = { open: 0.3, rise: 0.4, back: 0.62, close: 0.7 };
export const LID_MAX = 1.85; // 約 106°

/** 蓋子開啟角度：磁吸彈開（快、過衝一點再回穩），闔上時越闔越快 */
export function lidAngle(M: MotionCtx): number {
  const T = PRODUCT_T;
  const o = M.seg(T.open, T.open + 0.09);
  const openK = o <= 0 ? 0 : o >= 1 ? 1 : 1 - Math.pow(1 - o, 3) + Math.sin(Math.PI * o) * 0.08;
  const c = M.seg(T.close, T.close + 0.07);
  return LID_MAX * openK * (1 - c * c * c);
}
/** 耳機升起量 0..1 */
export function budLift(M: MotionCtx): number {
  const T = PRODUCT_T;
  return M.tw(T.rise, T.rise + 0.11, 'o') * (1 - M.tw(T.back, T.back + 0.06, 'i'));
}
