// 3D 主體 v2：3D 幾何。跳躍／動作與提示點沿用 v1。
import { shapes3d } from '../shapes3d';
import { draw3D } from '../voxel';
import type { Subject } from '../types';

export const shapes3d2: Subject = {
  ...shapes3d,
  desc: '站在圓形展示台上的 3D 幾何構成：彈跳的主球與圓環、三層方塊塔、雙層錐體、環結與繞行小球。最適合比較各種 3D 材質（黏土、玻璃、鉻金屬、卡通描邊…）。',
  draw(S, _M, env) {
    draw3D(S, env, 'shapes2');
  },
};
