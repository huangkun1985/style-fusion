// 3D 主體 v2：3D 角色。場景改為「跳跳豆」（見 three/scenes/v2/character.ts），跳躍與提示點沿用 v1。
import { char3d } from '../char3d';
import { draw3D } from '../voxel';
import type { Subject } from '../types';

export const char3d2: Subject = {
  ...char3d,
  desc: '跳跳豆的立體版：豆形身體、大眼睛與眉毛、小耳朵、發光觸角，站在圓形展示台上；預備、拉伸、落地擠壓揚起塵土，用真 3D 材質呈現（黏土、塑膠、卡通描邊、低多邊形…）。',
  draw(S, _M, env) {
    draw3D(S, env, 'character2');
  },
};
