import type { Cue } from '../../audio/types';
import { TAU } from '../util';
import { draw3D } from './voxel';
import type { Subject } from './types';

export const terrain3d: Subject = {
  id: 'terrain3d',
  name: '3D 地形',
  en: '3D Terrain Flight',
  desc: '低多邊形山谷的前進飛行，地平線有太陽。實心是「低多邊形世界」，線框＋霓虹就是合成波網格；鏡頭每個循環剛好前進一個地形週期，所以能無縫循環。',
  loop: 8,
  key: 0.5,
  hero: 0.2,
  events: () => [],
  cues() {
    return [
      { u: 0.0, kind: 'whoosh', k: 0.3 },
      { u: 0.5, kind: 'whoosh', k: 0.2 },
    ] as Cue[];
  },
  track(M) {
    return [Math.sin(TAU * M.u) * 30, -20];
  },
  draw(S, _M, env) {
    draw3D(S, env, 'terrain');
  },
};
