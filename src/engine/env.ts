import type { Scene3DId } from './three/types';
import type { Look } from './types';

/** 3D 舞台的最小介面（three.js 延遲載入） */
export interface ThreeLike {
  render(look: Look, M: import('./motion').MotionCtx, w: number, h: number, time: number, scene: Scene3DId): HTMLCanvasElement;
  dispose?(): void;
}

export interface Env {
  /** 畫面寬高（設計單位，短邊固定 400） */
  Wu: number;
  Hu: number;
  /** 每設計單位的像素 */
  u: number;
  look: Look;
  detail: number;
  thumb: boolean;
  three?: ThreeLike | null;
  requestThree?: () => void;
  /** 畫布像素尺寸 */
  W: number;
  H: number;
}
