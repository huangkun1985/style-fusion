// 3D 主體 v2：3D 地形。跳躍／動作與提示點沿用 v1。
import { terrain3d } from '../terrain3d';
import { draw3D } from '../voxel';
import type { Subject } from '../types';

export const terrain3d2: Subject = {
  ...terrain3d,
  desc: '日落時分飛越低多邊形山谷：五段高度配色與雪頂、松樹林、遠霧與帶光暈的落日。',
  draw(S, _M, env) {
    draw3D(S, env, 'terrain2');
  },
};
