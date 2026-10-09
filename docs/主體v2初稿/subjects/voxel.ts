// 3D 主體 v2：3D 體素。場景改為有小木屋、炊煙、營火、水面的體素小島與戴帽子的體素小人（見 three/scenes/v2/island.ts）。跳躍／動作與提示點沿用 v1。
import { draw3D, voxel } from '../voxel';
import type { Subject } from '../types';

export const voxel2: Subject = {
  ...voxel,
  desc: '3D 體素：方塊小島上有小木屋與炊煙、營火、松樹與圓冠樹，水面環繞、碎石漂浮；戴帽子的體素小人跳躍，鏡頭緩慢環繞，材質、燈光、描邊都隨圖像風格改變。',
  draw(S, _M, env) {
    draw3D(S, env, 'island2');
  },
};
