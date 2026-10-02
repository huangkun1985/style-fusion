import type { Cue } from '../../audio/types';
import { HOPS, mascotPose } from './mascot';
import { draw3D } from './voxel';
import type { Subject } from './types';

export const char3d: Subject = {
  id: 'char3d',
  name: '3D 角色',
  en: '3D Character',
  desc: '2D 小怪獸的立體版：預備、拉伸、落地擠壓、觸角跟隨與眨眼，用真 3D 材質呈現（黏土、塑膠、卡通描邊、低多邊形…）。',
  loop: 2.8,
  key: 0.27,
  hero: 0.25,
  events: () => HOPS.map((h) => ({ u: h.h0 + 0.72 * (h.h1 - h.h0), x: h.x1 * 1.15, y: 78, k: 1 })),
  cues(M) {
    const t = 0.2 + 0.08 * M.mv.heavy;
    return HOPS.flatMap<Cue>((h) => [
      { u: h.h0 + (h.h1 - h.h0) * t, kind: 'jump', k: 0.7 },
      { u: h.h0 + (h.h1 - h.h0) * 0.72, kind: 'land', k: 0.9 },
    ]);
  },
  track(M) {
    const s = mascotPose(M, M.u);
    return [s.x * 1.15, 30 - s.y * 0.8];
  },
  draw(S, _M, env) {
    draw3D(S, env, 'character');
  },
};
