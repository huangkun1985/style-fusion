import type { Cue } from '../../audio/types';
import { HOPS, mascotPose } from './mascot';
import { draw3D } from './voxel';
import type { Subject } from './types';

export const shapes3d: Subject = {
  id: 'shapes3d',
  name: '3D 幾何',
  en: '3D Shapes',
  desc: '真 3D 幾何體：彈跳的主球、環繞的圓環、分段旋轉的方塊、錐體與環結。最適合比較各種 3D 材質（黏土、玻璃、鉻金屬、卡通描邊…）。',
  loop: 4.2,
  key: 0.27,
  hero: 0.55,
  events: () => HOPS.map((h) => ({ u: h.h0 + 0.72 * (h.h1 - h.h0), x: h.x1 * 0.9, y: 62, k: 0.8 })),
  cues(M) {
    const out = HOPS.flatMap<Cue>((h) => [
      { u: h.h0 + (h.h1 - h.h0) * 0.2, kind: 'jump', k: 0.6 },
      { u: h.h0 + (h.h1 - h.h0) * 0.72, kind: 'bounce', k: 0.9 },
    ]);
    for (let i = 1; i < 5; i++) out.push({ u: 0.14 + M.stag(i) * 1.4, kind: 'pop', k: 0.5 });
    for (const t0 of [0.3, 0.45, 0.6]) out.push({ u: t0 + 0.08, kind: 'tick', k: 0.6 });
    return out;
  },
  track(M) {
    const s = mascotPose(M, M.u);
    return [s.x * 0.9, 50 - s.y * 0.7];
  },
  draw(S, _M, env) {
    draw3D(S, env, 'shapes');
  },
};
