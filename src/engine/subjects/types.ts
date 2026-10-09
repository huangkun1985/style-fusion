import type { Cue } from '../../audio/types';
import type { Brush } from '../brush';
import type { Env } from '../env';
import type { MotionCtx } from '../motion';
import type { Ev } from '../overlays';
import type { SubjectId } from '../types';

export interface Subject {
  id: SubjectId;
  name: string;
  en: string;
  desc: string;
  /** 基礎循環秒數 */
  loop: number;
  /** 關鍵時刻（子彈時間的慢放中心） */
  key: number;
  /** 最具代表性的靜態幀（正規化時間），用於靜態縮圖 */
  hero: number;
  events(env: Env): Ev[];
  /** 動畫裡的音效提示點（循環內 0..1） */
  cues?(M: MotionCtx, env: Env): Cue[];
  draw(S: Brush, M: MotionCtx, env: Env): void;
  /** 主要元素位置（軌跡、速度線、環繞線用） */
  track(M: MotionCtx, env: Env): [number, number];
}

/** 這些背景自帶地面／空間，主體不再畫地面 */
export const FLOORLESS = new Set(['sunset', 'vapor', 'focus', 'burst', 'swirl', 'hud', 'matrix', 'stars', 'mondrian', 'rays', 'circuit', 'aurora', 'bokeh', 'decofan', 'blinds', 'auspicious', 'brick', 'cork', 'scraps']);

export function ground(S: Brush, env: Env, G: number) {
  const hw = env.Wu / 2 + 80;
  const bottom = env.Hu / 2 + 80;
  if (FLOORLESS.has(S.look.bg.type)) return;
  if (S.look.detail < 0.5) {
    S.line([-hw, G, hw, G], 'ink', { w: 1.6, alpha: 0.5, drawOn: false });
    return;
  }
  S.rect(0, (G + bottom) / 2 + 6, hw * 2, bottom - G, 0, 'r', { shadow: false, hl: false, boil: 0.25, drawOn: false });
  S.rect(0, G + 6, hw * 2, 14, 0, 'q', { shadow: false, hl: false, boil: 0.25, drawOn: false });
}

/** 接觸陰影（不受填色模式影響） */
export function contactShadow(S: Brush, x: number, y: number, rx: number, ry: number, k = 1) {
  S.ellipse(x, y, rx, ry, 'ink', { alpha: 0.16 * k, mode: 'flat', stroke: false, shadow: false, boil: 0, drawOn: false, hl: false });
}
