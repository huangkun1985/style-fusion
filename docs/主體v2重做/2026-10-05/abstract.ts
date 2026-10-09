// 主體 v2：抽象流動（第三版，筆記見 docs/主體v2參考/abstract.md）。
// 第二版（平塗紙片緞帶＋硬邊同心圓＋散點）被評「完全不絲滑、像 20 年前的 Flash」。這版改學 Dribbble「fluid-gradient」裡現代的做法：
//  ‧ 藍本一：虹彩絲帶（形體是上百條細線組成，扭轉處細線聚攏自然變亮，顏色沿形體流動）；
//  ‧ 藍本二：顆粒漸層（深色底＋幾團巨大的柔焦色光＋細顆粒，沒有硬邊）。
// 做法：
//  ‧ 絲帶是一條在空間中扭轉的帶子，取約 90 條「緯線」（帶子寬度方向的每個位置一條）畫成細線，用光的疊加（lighter）——
//    扭到側面時線條擠在一起，亮度自然疊高，就是絲綢的高光；不需要任何折邊特效；
//  ‧ 顏色是畫面空間的漸層（p → a → s → p），所以色彩會隨形體移動「流過」；
//  ‧ 一道「流光」沿絲帶長度方向不停流過（亮色、較粗的光暈）；
//  ‧ 背景：由色板算出的深色底＋三團緩慢漂移的柔焦色光（徑向漸層）＋細顆粒。
// 動畫全部是 u 的整數週期函數（不再做快慢不均的時間扭曲），所以無縫、等速而絲滑。顏色只用色板角色。
import type { Cue } from '../../../audio/types';
import { darken, lighten, luma, mix, rgba } from '../../color';
import { TAU, clamp, hash } from '../../util';
import type { Subject } from '../types';

const CY = -6;

// 細顆粒：一張固定的雜訊小圖（只建一次），用 overlay 疊上去
let grainCanvas: HTMLCanvasElement | null = null;
function grain(): HTMLCanvasElement | null {
  if (grainCanvas) return grainCanvas;
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 160;
  const g = c.getContext('2d');
  if (!g) return null;
  const img = g.createImageData(160, 160);
  for (let i = 0; i < 160 * 160; i++) {
    const v = Math.floor(hash(i, 7, 3) * 255);
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  grainCanvas = c;
  return c;
}

export const abstract2: Subject = {
  id: 'abstract',
  name: '抽象流動',
  en: 'Abstract Flow',
  desc: '流光溢彩的生成式抽象：由近百條細線組成的虹彩絲帶在空間中扭轉流動，扭轉處自然聚光，一道流光沿著絲帶流過；背後是緩慢漂移的柔焦色光與細顆粒。適合看漸層、發光與節奏類風格。',
  loop: 5,
  key: 0.5,
  hero: 0.3,
  events: () => [
    { u: 0.0, x: 0, y: CY, k: 0.7 },
    { u: 0.5, x: 0, y: CY, k: 0.7 },
  ],
  cues() {
    return [
      { u: 0.0, kind: 'ping', k: 0.5 },
      { u: 0.5, kind: 'ping', k: 0.5 },
    ] as Cue[];
  },
  track(M) {
    return [0, CY + 40 * Math.sin(TAU * (0.5 - M.u))];
  },
  draw(S, M, env) {
    const u = M.u;
    const pal = S.pal;
    const det = S.look.detail;
    const ctx = S.ctx;
    const baseA = S.alpha;
    const W2 = env.Wu / 2 + 60;
    const H2 = env.Hu / 2 + 60;
    const K = Math.min(1.25, env.Wu / 700);
    const beat = 1 + M.mv.beat * 0.18 * M.beat();
    const P = (x: number, y: number) => S.tp(x, y);

    // ── 顏色：深色底（色板中較暗者＋第二色的色相，壓到夠暗）
    let deep = mix(luma(pal.bg) < luma(pal.ink) ? pal.bg : pal.ink, pal.s, 0.3);
    for (let i = 0; i < 6 && luma(deep) > 0.09; i++) deep = darken(deep, 0.3);
    for (let i = 0; i < 6 && luma(deep) < 0.04; i++) deep = mix(deep, pal.s, 0.12);
    const glowA = mix(pal.p, pal.light, 0.1);
    const glowB = mix(pal.s, pal.light, 0.1);
    const glowC = mix(pal.a, pal.light, 0.1);

    ctx.save();
    ctx.globalAlpha = baseA;
    // ════ 背景：深色底＋三團緩慢漂移的柔焦色光
    {
      const [x0, y0] = P(-W2, -H2);
      const [x1, y1] = P(W2, H2);
      ctx.fillStyle = deep;
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      const blob = (bx: number, by: number, r: number, c: string, a: number) => {
        const [cx, cy] = P(bx, by);
        const [ex] = P(bx + r, by);
        const rr = Math.abs(ex - cx);
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rr);
        g.addColorStop(0, rgba(c, a));
        g.addColorStop(0.5, rgba(c, a * 0.45));
        g.addColorStop(1, rgba(c, 0));
        ctx.fillStyle = g;
        ctx.fillRect(cx - rr, cy - rr, rr * 2, rr * 2);
      };
      const hw = env.Wu / 2;
      blob(-hw * 0.55 + 40 * Math.sin(TAU * u), -120 + 30 * Math.cos(TAU * u), 330, glowB, 0.42);
      blob(hw * 0.6 + 50 * Math.cos(TAU * (u + 0.3)), 110 + 30 * Math.sin(TAU * (u + 0.3)), 360, glowA, 0.38);
      blob(hw * 0.1 + 60 * Math.sin(TAU * (u + 0.6)), -160 + 40 * Math.sin(TAU * (u * 2 + 0.1)), 220, glowC, 0.22);
    }

    // ════ 絲帶：一條在空間中扭轉的帶子，取 N 條緯線畫成細線
    const N = det > 0.6 ? 76 : det > 0.4 ? 48 : 24;
    const SEG = 64;
    const span = env.Wu * 0.46;
    const ribbon = (o: { amp: number; wid: number; ph: number; tw: number; yo: number; alpha: number; lw: number; flow: boolean }) => {
      // 中心線與扭轉角（全部是 u 的整數週期函數）
      const cx: number[] = [];
      const cy: number[] = [];
      const th: number[] = [];
      const wd: number[] = [];
      for (let k = 0; k <= SEG; k++) {
        const s = k / SEG;
        const x = (s * 2 - 1) * span;
        const y =
          o.yo +
          o.amp * K * (0.85 * Math.sin(TAU * (0.7 * s - u + o.ph)) + 0.22 * Math.sin(TAU * (1.3 * s + u + o.ph * 1.3)));
        cx.push(x);
        cy.push(y);
        th.push(TAU * (o.tw * s - u) + 0.6 * Math.sin(TAU * (0.5 * s + u + o.ph)));
        // 兩端收細（像參考圖的尖端），中段最寬
        wd.push(o.wid * K * Math.pow(Math.sin(Math.PI * s), 0.7) * beat);
      }
      // 法線
      const nx: number[] = [];
      const ny: number[] = [];
      for (let k = 0; k <= SEG; k++) {
        const a = Math.max(0, k - 1);
        const b = Math.min(SEG, k + 1);
        const tx = cx[b] - cx[a];
        const ty = cy[b] - cy[a];
        const l = Math.hypot(tx, ty) || 1;
        nx.push(-ty / l);
        ny.push(tx / l);
      }
      // 畫面空間的漸層：顏色沿形體流動
      const [gx0, gy0] = P(-span, -80);
      const [gx1, gy1] = P(span, 80);
      const grad = ctx.createLinearGradient(gx0, gy0, gx1, gy1);
      const sh = (u * 0.5) % 1; // 色帶緩慢平移
      const stops: [number, string][] = [
        [0, pal.p],
        [0.33, pal.a],
        [0.66, pal.s],
        [1, pal.p],
      ];
      for (const [o2, c] of stops) grad.addColorStop((o2 + sh) % 1, c);
      grad.addColorStop(sh < 0.001 ? 0.999 : Math.max(0, sh - 0.001), pal.p);
      ctx.strokeStyle = grad;
      ctx.lineWidth = o.lw;
      ctx.globalAlpha = baseA * o.alpha;
      for (let i = 0; i < N; i++) {
        const v = i / (N - 1) - 0.5; // 帶子寬度方向的位置
        ctx.beginPath();
        for (let k = 0; k <= SEG; k++) {
          const off = wd[k] * v * Math.cos(th[k]);
          const [px, py] = P(cx[k] + nx[k] * off, cy[k] + ny[k] * off);
          if (k === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
      // 流光：一段亮光沿長度方向流過（每圈兩次），中段最亮
      if (o.flow && det > 0.4) {
        for (let pass = 0; pass < 2; pass++) {
          const head = ((u * 2 + pass * 0.5) % 1) * 1.3 - 0.15;
          const k0 = Math.max(0, Math.floor((head - 0.16) * SEG));
          const k1 = Math.min(SEG, Math.ceil(head * SEG));
          if (k1 - k0 < 2) continue;
          for (let i = 0; i < N; i += 3) {
            const v = i / (N - 1) - 0.5;
            ctx.beginPath();
            for (let k = k0; k <= k1; k++) {
              const off = wd[k] * v * Math.cos(th[k]);
              const [px, py] = P(cx[k] + nx[k] * off, cy[k] + ny[k] * off);
              if (k === k0) ctx.moveTo(px, py);
              else ctx.lineTo(px, py);
            }
            ctx.strokeStyle = rgba(mix(pal.light, pal.a, 0.15), 0.5);
            ctx.lineWidth = o.lw * 1.6;
            ctx.globalAlpha = baseA * 0.35;
            ctx.stroke();
          }
        }
      }
    };

    ctx.globalCompositeOperation = 'lighter';
    // 後面一條較細、較淡的（景深），前面一條主絲帶
    ribbon({ amp: 60, wid: 50, ph: 0.37, tw: 0.6, yo: CY + 40, alpha: 0.16, lw: 0.6, flow: false });
    ribbon({ amp: 82, wid: 175, ph: 0, tw: 0.8, yo: CY, alpha: 0.3, lw: 0.9, flow: true });

    // 幾顆沿絲帶漂移的柔光粒子（很少、很淡）
    if (det > 0.5 && false) {
      for (let i = 0; i < 9; i++) {
        const s = (hash(i, 21) + u * (0.4 + hash(i, 22) * 0.4)) % 1;
        const x = (s * 2 - 1) * span;
        const y = CY + 96 * K * 0.75 * Math.sin(TAU * (0.85 * s - u)) + (hash(i, 23) - 0.5) * 140 * K;
        const tw = 0.5 + 0.5 * Math.sin(TAU * (u * 3 + hash(i, 24)));
        const [px, py] = P(x, y);
        const [ex] = P(x + 7, y);
        const rr = Math.abs(ex - px);
        const g = ctx.createRadialGradient(px, py, 0, px, py, rr);
        g.addColorStop(0, rgba(pal.light, 0.8 * tw));
        g.addColorStop(1, rgba(pal.light, 0));
        ctx.globalAlpha = baseA;
        ctx.fillStyle = g;
        ctx.fillRect(px - rr, py - rr, rr * 2, rr * 2);
      }
    }

    // ════ 細顆粒
    const gc = det > 0.4 ? grain() : null;
    if (gc) {
      const pat = ctx.createPattern(gc, 'repeat');
      if (pat) {
        const [x0, y0] = P(-W2, -H2);
        const [x1, y1] = P(W2, H2);
        ctx.globalCompositeOperation = 'overlay';
        ctx.globalAlpha = baseA * 0.1;
        ctx.fillStyle = pat;
        ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      }
    }
    ctx.restore();
    void clamp;
  },
};
