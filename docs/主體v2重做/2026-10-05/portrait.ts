// 主體：人像插畫（新主體，沒有 v1／v2 之分；筆記見 docs/主體v2參考/portrait.md）。
// 人物藍本：Dribbble「portrait-illustration」裡的側臉扁平人像（黑色鮑伯頭、眼上的星形妝）；座標在藍本的 1200×803 畫面上量出來，
//         皮膚、耳朵、星形妝、嘴唇用藍本那種柔和漸層。只學造型語言與質感，人物是原創插畫，不畫任何真人。
// 構圖（第三版，學 Malika Favre 的大膽裁切與負空間、Rokas Aleliunas 的光影）：橫式人物放大偏左、頭頂被畫框切掉，
//         臉朝右邊的留白；留白處是紅牆上一道拱窗的光，她的側臉影子與窗外的葉影落在光裡。直式／方形改成拱窗置中框住頭部（壁龕）。
// 配色：紅牆、窗光的暖橘、墨色頭髮、桃色皮膚、紅白條紋上衣，克制。剪影風格用風格自己的夕陽色當牆與光、人物是純黑剪影。
// 動態（照真人與真實光影）：呼吸讓胸口與頭微微起伏；眨眼兩次；中段微微抬頭、眼睛睜大一點；影子跟著頭與呼吸動；
//       頭髮與耳環慢半拍；葉影被風吹得輕輕搖。全部是時間的純函數（整數圈數），無縫循環；顏色只用色板角色。
import type { Cue } from '../../audio/types';
import { darken, luma, mix, rgba } from '../color';
import type { Env } from '../env';
import { TAU, lerp, smooth } from '../util';
import type { Subject } from './types';

/** Catmull-Rom：通過 pts 的平滑開放曲線（per：每段取樣數） */
function spline(pts: number[], per = 6): number[] {
  const n = pts.length / 2;
  const out: number[] = [];
  const P = (i: number) => {
    const k = Math.max(0, Math.min(n - 1, i));
    return [pts[k * 2], pts[k * 2 + 1]];
  };
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = P(i - 1);
    const [x1, y1] = P(i);
    const [x2, y2] = P(i + 1);
    const [x3, y3] = P(i + 2);
    for (let s = 0; s < per; s++) {
      const t = s / per;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push(
        0.5 * (2 * x1 + (-x0 + x2) * t + (2 * x0 - 5 * x1 + 4 * x2 - x3) * t2 + (-x0 + 3 * x1 - 3 * x2 + x3) * t3),
        0.5 * (2 * y1 + (-y0 + y2) * t + (2 * y0 - 5 * y1 + 4 * y2 - y3) * t2 + (-y0 + 3 * y1 - 3 * y2 + y3) * t3),
      );
    }
  }
  out.push(pts[pts.length - 2], pts[pts.length - 1]);
  return out;
}
/** 把幾段曲線接起來（每段各自平滑；段與段的接點是銳角，用來做髮尾尖角、瀏海切口） */
const chain = (...runs: number[][]) => runs.flatMap((r) => spline(r));

// ════ 形狀（藍本畫面座標：1200×803，y 向下；人臉朝右）

// 皮膚：額頭（壓在頭髮底下）→ 側臉線（眉骨、鼻、唇、下巴）→ 下顎 → 脖子前緣 → 往前的胸口 → 畫面外 → 背部 → 頭後
const SKIN = chain(
  [700, 262, 790, 250, 842, 282, 857, 330, 850, 370, 846, 380, 841, 395, 840, 411, 843, 427, 849, 442, 857, 461, 866, 477, 873, 489, 877, 497], // 額 → 眉骨 → 鼻樑 → 鼻尖
  [877, 497, 876, 503, 869, 508, 860, 511, 853, 514], // 鼻底（鼻尖銳角）
  [853, 514, 856, 522, 860, 530], // 人中 → 唇峰
  [860, 530, 864, 537, 861, 544, 857, 550], // 上唇
  [857, 550, 857, 560, 852, 568, 843, 579], // 下唇
  [843, 579, 837, 591, 836, 604, 837, 616, 832, 629, 820, 637, 805, 638, 784, 632, 762, 627, 746, 623], // 唇下凹 → 下巴 → 下顎底
  [746, 623, 734, 636, 723, 664, 718, 700, 722, 740, 745, 770, 800, 786, 880, 806, 980, 842, 1080, 905, 1150, 1100, 1170, 1500], // 脖子前緣 → 胸口
  [1170, 1500, 690, 1500], // 畫面外
  [690, 1500, 662, 1100, 632, 880, 612, 780, 600, 690, 598, 620, 610, 540, 640, 420, 700, 262], // 背 → 脖子後緣 → 頭後（被頭髮蓋住）
);
// 下巴在脖子上的投影（柔和的楔形）
const JAW_SHADOW = spline([702, 590, 735, 610, 763, 625, 742, 636, 718, 650, 704, 628, 702, 590]);

// 頭髮：一整塊墨色的鮑伯頭；前額一綹直垂、和主髮之間露出一道額頭；髮尾是參差的尖角；後面的頭髮塞在耳後
const HAIR = chain(
  [420, 470, 421, 420, 427, 370, 437, 320, 452, 280, 475, 248, 510, 224, 560, 212, 620, 209, 680, 210, 740, 216, 790, 228, 825, 248, 848, 275, 860, 305, 864, 340, 857, 362, 848, 377],
  [848, 377, 818, 376], // 前額那綹的齊剪切口
  [818, 376, 820, 340, 816, 302, 805, 277, 791, 265], // 那綹的內緣 → 分線
  [791, 265, 780, 277, 784, 314, 787, 350, 782, 372, 765, 388, 746, 401, 731, 412], // 主髮前緣（露出的額頭左側）
  [731, 412, 742, 405], // 太陽穴上一小撮尖角
  [742, 405, 724, 426, 720, 455, 717, 486, 711, 512, 703, 535, 697, 552], // 臉頰旁往下
  [697, 552, 689, 569], // 髮尾尖角們（從前到後）
  [689, 569, 683, 541],
  [683, 541, 673, 557],
  [673, 557, 665, 535, 648, 548, 630, 560, 612, 572, 601, 580],
  [601, 580, 593, 604],
  [593, 604, 583, 587],
  [583, 587, 566, 603],
  [566, 603, 558, 590, 540, 592, 522, 588],
  [522, 588, 506, 595],
  [506, 595, 500, 580, 480, 572, 463, 561],
  [463, 561, 450, 569],
  [450, 569, 446, 551, 432, 534, 424, 512, 420, 470],
);
// 耳朵（畫在頭髮上：頭髮塞在耳後）與耳內的兩層明暗
const EAR = spline([583, 452, 598, 444, 612, 445, 624, 454, 632, 472, 638, 495, 642, 518, 644, 535, 638, 544, 628, 540, 612, 528, 594, 512, 578, 495, 568, 478, 570, 462, 583, 452]);
const EAR_HELIX = spline([590, 457, 605, 452, 618, 461, 627, 482, 631, 506, 626, 524, 613, 514, 606, 496, 599, 477, 590, 466, 590, 457]);
const EAR_BOWL = spline([603, 481, 614, 487, 620, 505, 617, 522, 607, 515, 602, 499, 603, 481]);
// 眉：粗、尾端往後漸細，眉頭近側臉線
const BROW = spline([781, 412, 794, 399, 811, 390, 828, 386, 838, 388, 839, 397, 827, 397, 811, 401, 795, 406, 781, 412]);
// 嘴唇
const LIP_UP = spline([851, 521, 857, 527, 863, 536, 860, 544, 848, 549, 822, 566, 838, 552, 847, 541, 851, 521]);
const LIP_LO = spline([860, 545, 857, 553, 856, 561, 850, 569, 838, 572, 822, 567, 846, 552, 860, 545]);
// 眼上的星形妝：五個尖角（藍本量出來的位置，偏斜的五角星）
const STAR_OUT = [813, 376, 838, 426, 817, 497, 767, 491, 742, 418];
const STAR_C = [801, 440];

// 條紋一字領上衣：領口沿著胸口斜下（藍本座標），往下延伸到畫面外
const SHIRT = chain(
  [594, 742, 660, 768, 740, 790, 830, 808, 930, 834, 1030, 872, 1108, 926],
  [1108, 926, 1152, 1100, 1172, 1500],
  [1172, 1500, 688, 1500],
  [688, 1500, 660, 1100, 630, 880, 610, 780, 594, 742],
);
/** 葉子：尖頭的柳葉形（沿 +x 長 L、寬 W） */
function leaf(L: number, W: number): number[] {
  const pts: number[] = [];
  const n = 10;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push(t * L, -W * Math.pow(Math.sin(Math.PI * t), 0.9) * (1 - 0.25 * t));
  }
  for (let i = n - 1; i > 0; i--) {
    const t = i / n;
    pts.push(t * L, W * 0.55 * Math.pow(Math.sin(Math.PI * t), 0.9) * (1 - 0.25 * t));
  }
  return pts;
}
const LEAF = leaf(1, 0.2);

const LOOP = 6;
/** 抬頭的程度 0..1：中段微微抬頭再回來 */
const lift = (u: number) => smooth(0.34, 0.5, u) * (1 - smooth(0.74, 0.9, u));
/** 眨眼：0 = 正常、1 = 全閉（兩次，各約 0.15 秒） */
const blink = (u: number) => Math.max(0, 1 - Math.abs(u - 0.22) / 0.013, 1 - Math.abs(u - 0.66) / 0.013);

/** 依舞台比例決定縮放與取景中心（藍本座標）。
 *  構圖（學 Malika Favre）：人物放大、偏左三分之一、頭頂被畫框切掉一點；臉朝右邊的留白，留白處是窗光與她的影子。 */
function frame(env: Env) {
  const r = env.Wu / env.Hu;
  if (r >= 1.2) {
    const s = env.Hu / 600;
    return { s, cx: 650 + (0.2 * env.Wu) / s, cy: 528 };
  }
  if (r >= 0.9) {
    const s = env.Hu / 740;
    return { s, cx: 680, cy: 480 };
  }
  const s = env.Wu / 620;
  return { s, cx: 690, cy: 540 };
}

export const portrait: Subject = {
  id: 'portrait',
  name: '人像插畫',
  en: 'Portrait',
  desc: '精細的側臉扁平人像：墨色鮑伯頭、眼上的星形妝、柔和漸層的皮膚與紅唇、條紋一字領上衣；人物偏左放大，右邊紅牆上一道拱窗的光，她的側臉影子與搖曳的葉影落在光裡；呼吸、眨眼、微微抬頭，影子跟著動，頭髮與耳環慢半拍。',
  loop: LOOP,
  key: 0.4,
  hero: 0.55,
  events: (env) => {
    const f = frame(env);
    return [{ u: 0.4, x: (838 - f.cx) * f.s, y: (426 - f.cy) * f.s, k: 0.3 }];
  },
  cues: () => [{ u: 0.4, kind: 'sparkle', k: 0.3 }, { u: 0.22, kind: 'tick', k: 0.12 }, { u: 0.66, kind: 'tick', k: 0.12 }] as Cue[],
  track(M, env) {
    const f = frame(env);
    return [(800 - f.cx) * f.s, (450 - f.cy) * f.s - 3 * lift(M.u)];
  },
  draw(S, M, env) {
    const u = M.u;
    const pal = S.pal;
    const det = S.look.detail;
    const ctx = S.ctx;
    const FL = { stroke: false, shadow: false, hl: false, flat: true, drawOn: false } as const;
    const SOFT = { shadow: false, hl: false } as const;
    const lineMode = S.look.fill === 'line' || S.look.fill === 'none';
    const gradOK = !lineMode && S.look.fill !== 'silhouette' && det > 0.3;

    // ── 顏色：一個暖色家族（p 與 a 調出）＋墨色
    // 暗底風格（霓虹、賽博朋克…）：背景色塊往背景色壓暗，保留那個風格的夜色；頭髮用色板中較暗的那個（有些風格的 ink 是亮色）
    const darkBg = luma(pal.bg) < 0.35;
        const warm = mix(pal.p, pal.a, 0.5);
    // 剪影風格：色板只有背景（夕陽）有顏色、其餘全是墨色——牆與窗光用背景的兩個顏色，人物是黑色剪影
    const sil = S.look.fill === 'silhouette';
    // 牆：一面飽和的紅牆；窗光照在紅牆上變成暖橘；光裡的影子＝沒被照到的牆色。暗底風格是夜裡的牆。
    const wall = sil ? pal.bg2 : darkBg ? mix(pal.bg, pal.p, 0.14) : darken(pal.p, 0.12);
    const sun = sil ? pal.bg : darkBg ? mix(pal.bg, warm, 0.42) : mix(mix(pal.p, pal.a, 0.42), pal.light, 0.1);
    const sunHi = sil ? pal.bg : mix(sun, pal.light, darkBg ? 0.12 : 0.28);
    const shade = sil ? pal.bg2 : mix(wall, sun, 0.1);
    const cream = mix(pal.light, pal.a, 0.08);
    // 少色數的量化風格（8-bit 等）：色票裡沒有膚色，桃色會被量化成灰色，所以皮膚改用接近白色
    const quant = S.look.post.some((q) => q.fx === 'quantize');
    const skin = mix(pal.light, warm, quant ? 0.08 : 0.33); // 脖子、下半臉：桃色
    const skinTan = quant ? skin : darken(mix(pal.light, warm, 0.5), 0.04); // 額頭、上半臉：暖一點（量化風格會變灰，不畫）
    const skinShade = mix(skinTan, pal.p, 0.14);
    const lip = darken(pal.p, 0.06);
    const lipLo = mix(pal.p, pal.light, 0.22);
    const hair = sil ? pal.ink : darken(mix(luma(pal.ink) < luma(pal.bg) ? pal.ink : pal.bg, pal.p, 0.04), 0.4);
    // 五官線條：線稿類風格（黑板粉筆、線框）是在深色底上畫亮線，用 ink；否則和頭髮同色
    const feat = lineMode ? pal.ink : hair;

    // ── 取景：藍本座標 → 舞台
    const f = frame(env);
    S.push();
    S.scale(f.s);
    S.translate(-f.cx, -f.cy);
    const lw = (w: number) => w * f.s; // 線寬是舞台單位，不跟著 scale

    // 直接用 canvas 做漸層（只在填色類風格；線稿類不畫）
    const [o0x, o0y] = S.tp(0, 0);
    const [o1x, o1y] = S.tp(1, 0);
    const sc = Math.hypot(o1x - o0x, o1y - o0y);
    const path = (pts: number[]) => {
      ctx.beginPath();
      for (let i = 0; i < pts.length; i += 2) {
        const [x, y] = S.tp(pts[i], pts[i + 1]);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
    };
    /** 在 pts 形狀裡畫一道線性漸層（stops：[位置, 顏色, 不透明度]） */
    const lin = (pts: number[], x0: number, y0: number, x1: number, y1: number, stops: [number, string, number][]) => {
      if (!gradOK) return;
      const [ax, ay] = S.tp(x0, y0);
      const [bx, by] = S.tp(x1, y1);
      const g = ctx.createLinearGradient(ax, ay, bx, by);
      for (const [p, c, a] of stops) g.addColorStop(p, rgba(c, a));
      ctx.save();
      ctx.globalAlpha = S.alpha;
      path(pts);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.restore();
    };
    /** 在 clip 形狀裡畫一團柔光（徑向漸層） */
    const glow = (clip: number[], x: number, y: number, r: number, c: string, a: number) => {
      if (!gradOK || a < 0.003) return;
      const [cx, cy] = S.tp(x, y);
      const R = r * sc;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
      g.addColorStop(0, rgba(c, a));
      g.addColorStop(1, rgba(c, 0));
      ctx.save();
      ctx.globalAlpha = S.alpha;
      path(clip);
      ctx.clip();
      ctx.fillStyle = g;
      ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
      ctx.restore();
    };

    // ════ 人
    const breath = Math.sin(TAU * u * 2); // 一圈呼吸兩次
    const lf = lift(u);
    const lfLag = lift((u - 0.045 + 1) % 1);
    const headA = ((-2.2 * lf + 0.35 * Math.sin(TAU * u)) * Math.PI) / 180; // 微微抬頭（以脖子為支點）
    const PX = 705;
    const PY = 640;

    // 皮膚：頭部隨抬頭轉、胸口不轉，中間（脖子）漸變過去，所以是同一個形狀、沒有接縫
    const skinPts: number[] = new Array(SKIN.length);
    for (let i = 0; i < SKIN.length; i += 2) {
      const x = SKIN[i];
      const y = SKIN[i + 1];
      const w = 1 - smooth(600, 740, y);
      const a = headA * w;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      skinPts[i] = PX + (x - PX) * ca - (y - PY) * sa;
      skinPts[i + 1] = PY + (x - PX) * sa + (y - PY) * ca + (y > 700 ? -1.5 * breath * smooth(700, 900, y) : 0);
    }
    // ════ 背景：紅牆＋拱窗投進來的光；她的側臉影子與葉影落在光裡（光只照到拱窗那一塊，影子也只在那裡看得見）
    const vl = f.cx - env.Wu / 2 / f.s;
    const vr = f.cx + env.Wu / 2 / f.s;
    const vt = f.cy - env.Hu / 2 / f.s;
    const vb = f.cy + env.Hu / 2 / f.s;
    const vw = vr - vl;
    // 直式與方形：拱窗置中框住頭部（像壁龕），影子只往右偏一點；橫式：拱窗在右邊的留白裡
    const tall = env.Wu / env.Hu < 1.2;
    const ax0 = tall ? vl + 0.12 * vw : vr - 0.37 * vw;
    const ax1 = tall ? vr - 0.12 * vw : vr - 0.09 * vw;
    const aw = ax1 - ax0;
    const ar = aw / 2;
    const apex = vt + (tall ? 0.09 : 0.12) * (vb - vt);
    const spring = apex + ar;
    const arch: number[] = [];
    for (let i = 0; i <= 24; i++) {
      const a = Math.PI + (i / 24) * Math.PI;
      arch.push(ax0 + ar + Math.cos(a) * ar, spring + Math.sin(a) * ar);
    }
    arch.push(ax1, vb + 60, ax0, vb + 60);
    // 影子的裁切範圍比光斑大一點：不然光斑邊緣的反鋸齒會在影子外圍留下一圈細亮線
    const archClip: number[] = [];
    for (let i = 0; i <= 24; i++) {
      const a = Math.PI + (i / 24) * Math.PI;
      archClip.push(ax0 + ar + Math.cos(a) * (ar + 3), spring + Math.sin(a) * (ar + 3));
    }
    archClip.push(ax1 + 3, vb + 60, ax0 - 3, vb + 60);
    const BGF = { ...FL, mode: 'flat' as const };
    if (!lineMode) S.rect(f.cx, f.cy, vw + 200, vb - vt + 200, 0, wall, BGF);
    if (lineMode) S.line(arch, pal.ink, { closed: true, w: lw(1.6), alpha: 0.5, drawOn: false });
    else {
      // 窗光在牆上的漫射：靠近光的牆面微微亮起來（牆才有深度，不是一張平的色紙）
      if (gradOK) {
        const [gx, gy] = S.tp(ax0 + ar, spring + ar * 0.6);
        const R = aw * 1.6 * sc;
        const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, R);
        g.addColorStop(0, rgba(sun, darkBg ? 0.12 : 0.22));
        g.addColorStop(1, rgba(sun, 0));
        ctx.save();
        ctx.globalAlpha = S.alpha;
        ctx.fillStyle = g;
        ctx.fillRect(gx - R, gy - R, R * 2, R * 2);
        ctx.restore();
      }
      S.poly(arch, sun, BGF);
      lin(arch, 0, apex, 0, vb, [
        [0, sunHi, 0.9],
        [0.6, sunHi, 0],
      ]);
    }
    // 光裡的影子：她的側臉（跟著抬頭、呼吸）＋窗外一枝葉子（風吹輕輕搖）
    if (!lineMode) {
      ctx.save();
      path(archClip);
      ctx.clip();
      const k = tall ? 0.97 : 0.66;
      const SX = tall ? 690 : ax1 - 0.36 * aw - (877 - 650) * k;
      const SY = tall ? 470 : spring + 0.12 * ar;
      S.push();
      S.translate(SX, SY - 2.5 * breath * k);
      S.scale(k);
      S.translate(-650, -450);
      S.poly(skinPts, shade, BGF);
      S.poly(SHIRT, shade, BGF);
      S.push();
      S.translate(PX, PY);
      S.rotate(headA);
      S.translate(-PX, -PY);
      S.poly(HAIR, shade, BGF);
      S.pop();
      S.pop();
      if (det > 0.35) {
        const q = (aw / 336) * 1.15;
        const bx = ax1 + 30 * q;
        const by = apex + 20 * q;
        const sway = ((3 * Math.sin(TAU * u) + 1.2 * Math.sin(TAU * u * 2 + 1)) * Math.PI) / 180;
        S.push();
        S.translate(bx, by);
        S.rotate(sway);
        const SP = [0, 0, -60 * q, 30 * q, -105 * q, 85 * q, -125 * q, 160 * q];
        const stem = spline(SP, 6);
        S.curve(SP, shade, { w: lw(3 * q), cap: 'round', drawOn: false });
        const LV: [number, number, number][] = [
          [0.2, 1, 70],
          [0.34, -1, 64],
          [0.5, 1, 62],
          [0.64, -1, 56],
          [0.8, 1, 50],
          [0.92, -1, 44],
          [1, 0, 46],
        ];
        LV.forEach(([t, side, L], i) => {
          const j = Math.min(stem.length / 2 - 2, Math.round(t * (stem.length / 2 - 1)));
          const x = stem[j * 2];
          const y = stem[j * 2 + 1];
          const dir = Math.atan2(stem[j * 2 + 3] - y, stem[j * 2 + 2] - x);
          const flutter = ((5 * Math.sin(TAU * u * 2 + i * 1.3)) * Math.PI) / 180;
          S.push();
          S.translate(x, y);
          S.rotate(dir + side * 0.75 + flutter);
          S.scale(L * q);
          S.poly(LEAF, shade, BGF);
          S.pop();
        });
        S.pop();
      }
      ctx.restore();
    }

    // ════ 人
    S.push();
    S.translate(0, -2.5 * breath);
    S.poly(skinPts, skin, SOFT);
    // 上半臉往下漸淡的暖色（藍本的皮膚：額頭暖、脖子淡）
    lin(skinPts, 0, 300, 0, 600, [
      [0, skinTan, 1],
      [0.45, skinTan, 0.55],
      [1, skinTan, 0],
    ]);
    // 條紋一字領上衣（隨呼吸起伏；條紋沿著領口的斜度）
    {
      S.push();
      S.translate(0, -1.5 * breath);
      if (lineMode) {
        S.line(SHIRT, pal.ink, { closed: true, w: lw(2), drawOn: false });
      } else {
        S.poly(SHIRT, cream, SOFT);
        ctx.save();
        path(SHIRT);
        ctx.clip();
        for (let i = 0; i < 26; i++) {
          const y0 = 775 + i * 30;
          S.poly([560, y0 - 6, 1200, y0 + 102, 1200, y0 + 117, 560, y0 + 9], pal.p, FL);
        }
        ctx.restore();
      }
      S.pop();
    }

    // ── 頭部（隨抬頭轉）
    S.push();
    S.translate(PX, PY);
    S.rotate(headA);
    S.translate(-PX, -PY);

    // 五官與妝（剪影風格不畫：剪影是一整塊純色）
    if (!sil) {
      if (det > 0.35) {
        // 下巴在脖子上的投影
        if (gradOK) lin(JAW_SHADOW, 752, 622, 708, 626, [[0, skinShade, 0.75], [1, skinShade, 0]]);
        else S.poly(JAW_SHADOW, skinShade, { ...FL, alpha: 0.6 });
        // 鼻翼與唇邊的暖色柔光
        glow(skinPts, 830, 512, 16, warm, 0.45);
        glow(skinPts, 846, 566, 14, pal.p, 0.25);
      }

      // 星形妝：五個尖角，每個尖角分兩面（亮面、暗面），像有光照的立體星；抬頭時光掃過去
      {
        const [cx, cy] = STAR_C;
        const inner: number[] = [];
        for (let i = 0; i < 5; i++) {
          const j = (i + 1) % 5;
          const mx = (STAR_OUT[i * 2] + STAR_OUT[j * 2]) / 2;
          const my = (STAR_OUT[i * 2 + 1] + STAR_OUT[j * 2 + 1]) / 2;
          inner.push(lerp(cx, mx, 0.42), lerp(cy, my, 0.42));
        }
        const starPts: number[] = [];
        for (let i = 0; i < 5; i++) starPts.push(STAR_OUT[i * 2], STAR_OUT[i * 2 + 1], inner[i * 2], inner[i * 2 + 1]);
        const sRed = mix(pal.p, mix(pal.p, pal.a, 0.38), 0.15);
        if (lineMode) S.line(starPts, pal.a, { closed: true, w: lw(2), drawOn: false });
        S.poly(starPts, sRed, FL);
        if (det > 0.4) {
          const lite = mix(pal.p, pal.a, 0.36);
          for (let i = 0; i < 5; i++) {
            const k = (i + 4) % 5; // 前一個內角
            // 每個尖角左側（逆時針那半）是亮面
            S.poly([cx, cy, inner[k * 2], inner[k * 2 + 1], STAR_OUT[i * 2], STAR_OUT[i * 2 + 1]], i % 2 ? lite : mix(lite, sRed, 0.45), { ...FL, alpha: 0.75 });
          }
          // 抬頭時的一道光：沿著星形由後往前掃
          const sweep = smooth(0.34, 0.48, u) * (1 - smooth(0.48, 0.6, u));
          if (gradOK && sweep > 0.01) {
            const sx = lerp(740, 850, smooth(0.34, 0.6, u));
            lin(starPts, sx - 30, 0, sx + 30, 0, [
              [0, pal.light, 0],
              [0.5, pal.light, 0.45 * sweep],
              [1, pal.light, 0],
            ]);
          }
        }
        // 臉頰上的小星
        if (det > 0.4) {
          const st: number[] = [];
          for (let i = 0; i < 10; i++) {
            const a = -Math.PI / 2 + 0.2 + (i / 10) * TAU;
            const r = i % 2 ? 6 : 15;
            st.push(742 + Math.cos(a) * r, 454 + Math.sin(a) * r);
          }
          S.poly(st, mix(pal.p, pal.a, 0.12), FL);
        }
      }

      // 眼睛：藍本那種半垂的眼瞼；抬頭時睜大一點；眨眼時上眼瞼蓋下來
      {
        const open = (0.62 + 0.25 * lf) * (1 - blink(u));
        const X0 = 781;
        const X1 = 827;
        const base = (t: number) => lerp(447, 430, t); // 眼縫往前上斜
        const N = 12;
        const up: number[] = [];
        const lo: number[] = [];
        for (let i = 0; i <= N; i++) {
          const t = i / N;
          const x = lerp(X0, X1, t);
          up.push(x, base(t) - 16 * open * Math.sin(Math.PI * Math.pow(t, 0.85)));
          lo.push(x, base(t) + 3.5 * Math.sin(Math.PI * t));
        }
        if (open > 0.04) {
          const eye = [...up];
          for (let i = N; i >= 0; i--) eye.push(lo[i * 2], lo[i * 2 + 1]);
          S.poly(eye, mix(pal.light, skin, 0.35), { ...FL, mode: 'flat' });
          // 瞳孔：裁在眼瞼之間，往前看（抬頭時往上一點）
          const ix = 805 + 2 * lf;
          const iy = 437 - 3 * lf;
          ctx.save();
          path(eye);
          ctx.clip();
          S.circle(ix, iy, 10.5, feat, { ...FL, mode: 'flat' });
          if (det > 0.5) S.circle(ix + 3, iy - 4, 1.8, pal.light, { ...FL, mode: 'flat' });
          ctx.restore();
        }
        // 上眼線：從眼尾到眼頭漸粗、最後是往上挑的眼線尾巴（填色形狀，不是等寬線）
        const liner: number[] = [];
        for (let i = 0; i <= N; i++) {
          const t = i / N;
          liner.push(up[i * 2], up[i * 2 + 1] + 0.5);
        }
        liner.push(X1 + 11, base(1) - 12 - 2 * open); // 眼線尾巴（往前上挑）
        for (let i = N; i >= 0; i--) {
          const t = i / N;
          liner.push(up[i * 2], up[i * 2 + 1] - lerp(1.5, 5.5, t));
        }
        S.poly(liner, feat, { ...FL, mode: 'flat' });
        // 睫毛：幾根往前上翹的短弧
        if (det > 0.4) {
          for (let k = 0; k < 4; k++) {
            const t = 0.5 + k * 0.13;
            const i = Math.round(t * N);
            const x = up[i * 2];
            const y = up[i * 2 + 1] - 2;
            const len = 6 + k * 1.5;
            S.curve([x, y, x + len * 0.35, y - len * 0.65, x + len * 0.85, y - len * 0.8], feat, { w: lw(1.6), cap: 'round', drawOn: false });
          }
        }
      }
      // 眉
      S.poly(BROW, feat, { ...FL, mode: 'flat' });
      if (det > 0.45) {
        // 眉頭幾根往上的毛
        for (let k = 0; k < 3; k++) {
          const x = 827 + k * 4;
          S.line([x, 387, x + 2, 379 - k], feat, { w: lw(1.8), cap: 'round', drawOn: false });
        }
      }
      // 鼻孔與嘴唇
      S.curve([842, 508, 850, 503, 860, 506], feat, { w: lw(2.4), cap: 'round', drawOn: false });
      if (lineMode) {
        S.line(LIP_UP, pal.a, { closed: true, w: lw(1.8), drawOn: false });
        S.line(LIP_LO, pal.a, { closed: true, w: lw(1.8), drawOn: false });
      }
      S.poly(LIP_UP, lip, FL);
      S.poly(LIP_LO, lipLo, FL);
      lin(LIP_LO, 0, 548, 0, 572, [
        [0, lip, 0.8],
        [0.6, lipLo, 0],
        [1, pal.light, 0.35],
      ]);
      if (det > 0.45) S.curve([822, 566, 840, 552, 857, 549], darken(lip, 0.3), { w: lw(1.6), cap: 'round', drawOn: false });
    }

    // 頭髮（慢半拍：以頭頂為支點，比頭多轉一點點、再追上）
    S.push();
    S.translate(640, 230);
    S.rotate(((lfLag - lf) * 1.6 * Math.PI) / 180 + 0.004 * Math.sin(TAU * u * 2 - 0.8));
    S.translate(-640, -230);
    S.poly(HAIR, hair, SOFT);
    S.pop();

    // 耳朵（在頭髮上）
    S.poly(EAR, skin, SOFT);
    lin(EAR, 600, 450, 630, 540, [
      [0, skinTan, 0.9],
      [1, skinTan, 0.2],
    ]);
    if (det > 0.4 && !sil) {
      S.poly(EAR_HELIX, skinShade, { ...FL, alpha: 0.85 });
      S.poly(EAR_BOWL, mix(skinShade, pal.p, 0.18), FL);
    }
    // 耳環：細圓圈，像鐘擺一樣慢半拍擺動
    {
      const sw = (lfLag - lf) * 28 + 5 * Math.sin(TAU * u * 2 + 0.6);
      S.push();
      S.translate(633, 541);
      S.rotate((sw * Math.PI) / 180);
      S.arc(0, 16, 15, 0, TAU, lineMode ? pal.ink : mix(pal.light, cream, 0.4), { w: lw(1.6), drawOn: false });
      S.pop();
    }
    S.pop(); // 頭
    S.pop(); // 人
    S.pop(); // 取景
  },
};
