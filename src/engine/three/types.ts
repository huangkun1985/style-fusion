import type * as THREE from 'three';
import type { MotionCtx } from '../motion';
import type { Look } from '../types';
import type { MatKit } from './materials';

export type Scene3DId = 'island' | 'shapes' | 'text' | 'character' | 'terrain' | 'island2' | 'shapes2' | 'text2' | 'character2' | 'terrain2' | 'product';

/** 預設鏡頭：以目標點為中心的球座標 */
export interface CamBase {
  az: number;
  el: number;
  dist: number;
  target: [number, number, number];
  fov: number;
}
/** 場景每幀可以覆寫的鏡頭（例如地形飛行） */
export interface CamOverride {
  pos?: [number, number, number];
  target?: [number, number, number];
  fov?: number;
}

export interface SceneInst {
  root: THREE.Object3D;
  base: CamBase;
  /** 遠景霧（地形用）；沒有就不設 */
  fog?: { color: string; near: number; far: number } | null;
  update(M: MotionCtx): CamOverride | void;
}

export interface BuildCtx {
  look: Look;
  kit: MatKit;
  /** 縮圖尺寸：用較小的陰影貼圖 */
  small: boolean;
}

/** 3D 動效參數的共用計算（所有場景一致） */
export interface Motion3D {
  /** 整體旋轉（轉盤） */
  spinY: number;
  /** 整體懸浮位移 */
  levY: number;
  levRotY: number;
  /** 爆開係數 0..1 */
  explode: number;
  /** 滾落係數（弧度） */
  tumble: number;
  look: Look;
}
