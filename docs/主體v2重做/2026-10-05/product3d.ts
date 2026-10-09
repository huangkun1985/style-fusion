// 3D 主體：產品展示（無線耳機充電盒）。新主體，沒有 v1／v2 之分；場景在 three/scenes/v2/product.ts。
import type { Cue } from '../../audio/types';
import { darken, mix, rgba } from '../color';
import { TAU } from '../util';
import { PRODUCT_T, budLift } from './productTiming';
import { draw3D } from './voxel';
import type { Subject } from './types';

const T = PRODUCT_T;

export const product3d: Subject = {
  id: 'product3d',
  name: '3D 產品展示',
  en: '3D Product',
  desc: '轉盤上的無線耳機充電盒：轉到正面時蓋子磁吸彈開、指示燈亮、耳機升起懸浮，再吸回盒內、蓋子闔上。最適合比較各種 3D 材質（霧面、黏土、玻璃、鉻金屬…）。',
  loop: 5.0,
  key: T.open + 0.03,
  hero: 0.5,
  events: () => [
    { u: T.open + 0.03, x: 0, y: -10, k: 0.6 },
    { u: T.close + 0.07, x: 0, y: -10, k: 0.7 },
  ],
  cues: () =>
    [
      { u: T.open, kind: 'flip', k: 0.6 },
      { u: T.open + 0.04, kind: 'ping', k: 0.45 },
      { u: T.rise, kind: 'rise', k: 0.4 },
      { u: T.back + 0.05, kind: 'tick', k: 0.6 },
      { u: T.close + 0.07, kind: 'click', k: 0.9 },
    ] as Cue[],
  track(M) {
    return [0, -20 - budLift(M) * 60];
  },
  draw(S, M, env) {
    // 攝影棚背景（照參考圖的配色邏輯：整個畫面只有一個色相）：p 的深色徑向漸層＋幾道淡淡的光弧。
    // 產品照本來就在自己的布景裡拍，所以這個主體自帶背景、不吃風格的背景色
    const pal = S.pal;
    const ctx = S.ctx;
    // 線框風格是畫在淺色紙上的線稿（面用背景色填），不蓋深色布景
    const L = S.look;
    if (L.mat3d === 'wire' || (L.mat3d === 'auto' && (L.fill === 'none' || L.fill === 'line'))) {
      draw3D(S, env, 'product');
      return;
    }
    const W2 = env.Wu / 2 + 60;
    const H2 = env.Hu / 2 + 60;
    const deep = darken(mix(pal.p, pal.ink, 0.82), 0.55);
    const mid = darken(mix(pal.p, pal.ink, 0.55), 0.25);
    const [x0, y0] = S.tp(-W2, -H2);
    const [x1, y1] = S.tp(W2, H2);
    const [cx, cy] = S.tp(0, -10);
    const [ex] = S.tp(env.Wu * 0.62, 0);
    ctx.save();
    ctx.globalAlpha = S.alpha;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.abs(ex - cx));
    g.addColorStop(0, mid);
    g.addColorStop(1, deep);
    ctx.fillStyle = g;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    // 光弧：幾道傾斜的橢圓弧，緩慢轉動（一圈的整數倍，無縫）
    if (S.look.detail > 0.4) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      for (let i = 0; i < 4; i++) {
        const [ax, ay] = S.tp(0, -20 + i * 6);
        const [rx] = S.tp(150 + i * 38, 0);
        const rr = Math.abs(rx - ax);
        const a0 = TAU * (M.u + i * 0.21);
        ctx.strokeStyle = rgba(mix(pal.p, pal.light, 0.3), 0.16 - i * 0.025);
        ctx.lineWidth = Math.max(1, rr * 0.006);
        ctx.beginPath();
        ctx.ellipse(ax, ay, rr, rr * 0.3, -0.12 + i * 0.05, a0, a0 + Math.PI * 0.9);
        ctx.stroke();
      }
    }
    ctx.restore();
    draw3D(S, env, 'product');
  },
};
