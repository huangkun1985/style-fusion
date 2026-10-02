import type { Cue } from '../../audio/types';
import { luma } from '../color';
import { clamp, lerp } from '../util';
import { draw3D } from './voxel';
import type { Subject } from './types';

export const text3d: Subject = {
  id: 'text3d',
  name: '3D 文字',
  en: '3D Type',
  desc: '擠出的立體字母 MOTION：逐字落下、落地擠壓、波浪、翻轉與爆開。鉻金屬、黃金、玻璃、黏土的標題字都靠它示範。',
  loop: 3.4,
  key: 0.22,
  hero: 0.45,
  events: () => [
    { u: 0.22, x: -90, y: 38, k: 0.7 },
    { u: 0.3, x: 90, y: 38, k: 0.7 },
  ],
  cues(M) {
    const out: Cue[] = [{ u: 0.04, kind: 'whoosh', k: 0.5 }];
    if (M.mv.typeWriter > 0.5) for (let i = 0; i < 6; i++) out.push({ u: 0.06 + i * 0.055, kind: 'tick', k: 0.5 });
    else for (let i = 0; i < 6; i++) out.push({ u: 0.22 + M.stag(i) * 1.5, kind: i % 2 ? 'tick' : 'land', k: 0.55 + (i === 3 ? 0.2 : 0) });
    out.push({ u: 0.26, kind: 'pop', k: 0.4 }, { u: 0.8, kind: 'whoosh', k: 0.5 });
    return out;
  },
  track(M) {
    const p = M.tw(0.04 + M.stag(2) * 1.5, 0.22 + M.stag(2) * 1.5, 'o');
    return [-20, lerp(-200, 10, p)];
  },
  draw(S, M, env) {
    draw3D(S, env, 'text');
    // 中文副標用 2D 疊上去
    const sp = M.tw(0.26, 0.42, 'o');
    const so = M.tw(0.78, 0.9, 'i');
    if (sp > 0.01 && so < 1) {
      const a = S.alpha;
      S.alpha = a * clamp(sp) * (1 - so);
      S.push();
      S.translate(0, env.Hu * 0.36 + (1 - sp) * 26 - so * 20);
      S.jitter(19);
      S.text('動效風格', 0, 0, 34, luma(S.pal.bg) < 0.45 ? 'light' : 'ink', { font: S.look.font === 'pixel' || S.look.font === 'term' ? S.look.font : 'brush' });
      S.pop();
      S.alpha = a;
    }
  },
};
