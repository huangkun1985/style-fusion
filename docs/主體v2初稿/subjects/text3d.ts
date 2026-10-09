// 3D 主體 v2：3D 文字。跳躍／動作與提示點沿用 v1。
import { text3d } from '../text3d';
import { draw3D } from '../voxel';
import type { Subject } from '../types';

export const text3d2: Subject = {
  ...text3d,
  desc: '擠出的立體字母 MOTION 逐字落下，站在長展示台上，背後有圓牆框住標題，周圍小幾何體慢慢旋轉。',
  draw(S, _M, env) {
    draw3D(S, env, 'text2');
  },
};
