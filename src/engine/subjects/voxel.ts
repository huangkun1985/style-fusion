// 3D 主體：由 three.js 渲染的場景。共用的繪製流程：先畫 3D 影像，再疊 2D 細節。
import type { Cue } from '../../audio/types';
import type { Brush } from '../brush';
import type { Env } from '../env';
import type { MotionCtx } from '../motion';
import type { Scene3DId } from '../three/types';
import { TAU } from '../util';
import type { Subject } from './types';

/** 把 3D 場景畫進 2D 畫布；尚未載入時顯示占位 */
export function draw3D(S: Brush, env: Env, scene: Scene3DId): boolean {
  if (!env.three) {
    env.requestThree?.();
    S.rect(0, 20, 240, 110, 18, 'card', { alpha: 0.85 });
    S.text('載入 3D 場景…', 0, 20, 18, 'ink', { flat: true, shadow: false });
    return false;
  }
  const M: MotionCtx = S.M;
  const cv = env.three.render(S.look, M, env.W, env.H, S.time, scene);
  const ctx = S.ctx;
  ctx.save();
  ctx.globalAlpha = S.alpha;
  ctx.drawImage(cv, -env.Wu / 2, -env.Hu / 2, env.Wu, env.Hu);
  ctx.restore();
  return true;
}

export const voxel: Subject = {
  id: 'voxel',
  name: '3D 體素',
  en: 'Voxel 3D',
  desc: 'three.js 即時 3D：方塊小島上的角色跳躍，鏡頭緩慢環繞；材質、燈光、描邊都隨圖像風格改變。',
  loop: 4,
  key: 0.3,
  hero: 0.25,
  events: () => [
    { u: 0.4, x: 0, y: 70, k: 0.8 },
    { u: 0.9, x: 0, y: 70, k: 0.8 },
  ],
  cues() {
    return [0.1, 0.6].flatMap<Cue>((a) => [
      { u: a + 0.32 * 0.22, kind: 'jump', k: 0.7 },
      { u: a + 0.32 * 0.72, kind: 'land', k: 0.9 },
    ]);
  },
  track(M) {
    const a = TAU * M.u;
    return [Math.sin(a) * 40, -20 - Math.abs(Math.sin(a * 2)) * 50];
  },
  draw(S, _M, env) {
    draw3D(S, env, 'island');
  },
};

export type { Brush };
