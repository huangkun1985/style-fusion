// 3D 主體 v2：3D 角色。場景見 three/scenes/v2/character.ts（第三版：2D 狐貓的立體版）；跳躍與提示點沿用 v1。
// 背景與 2D 狐貓相同：風格背景＋角色後方中性的白色柔光（強度跟著背景亮度），不用和角色同色的大色塊。
import { luma, rgba } from '../../color';
import { char3d } from '../char3d';
import { draw3D } from '../voxel';
import type { Subject } from '../types';

export const char3d2: Subject = {
  ...char3d,
  desc: '2D 狐貓的立體版：紅色頭罩與奶油色的臉、臉頰的鋸齒毛、大三角耳、圓亮的大眼與頭芽；預備、拉伸、落地擠壓，跳起時笑眼吐舌，用真 3D 材質呈現（黏土、塑膠、卡通描邊、低多邊形…）。',
  draw(S, _M, env) {
    if (S.look.detail > 0.45) {
      const ctx = S.ctx;
      const [cx, cy] = S.tp(0, -30);
      const [ex] = S.tp(170, 0);
      const r = Math.abs(ex - cx);
      const a = 0.05 + 0.12 * luma(S.pal.bg);
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, rgba(S.pal.light, a));
      g.addColorStop(0.6, rgba(S.pal.light, a * 0.45));
      g.addColorStop(1, rgba(S.pal.light, 0));
      ctx.save();
      ctx.globalAlpha = S.alpha;
      ctx.fillStyle = g;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      ctx.restore();
    }
    draw3D(S, env, 'character2');
  },
};
