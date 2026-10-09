// 主體 v2：走路循環（第二版，藍本是 Dribbble 的「扛長桿的男子」與「遛狗的女子」側面走路插畫，筆記見 docs/主體v2參考/walk.md）。
// 參考圖共通的好看原因：風格化比例（頭小、腿長、上衣是一大塊有份量的輪廓）；褲子是錐形色塊（大腿寬、腳踝窄、外側一條縫線）而不是等寬粗線；
// 鞋子有厚底與細節；每個色塊有明暗兩階；背景只是中性的低對比色條。
// 動畫上最重要的是「腳釘在地上」：用雙骨 IK，踩地的腳在身體座標系裡等速後退、速度剛好等於地面捲動（沒有滑步）；
// 腳趾離地時腳跟抬起、腳尖朝下，落地時腳尖朝上；髖部在雙腳著地時最低、經過時最高；對側擺臂；頭、背包、圍巾、帽球慢半拍跟隨。
// 時間結構與 v1 相同（loop 2.2、每圈四步、落腳在 0.125／0.375／0.625／0.875），所以動效風格、音效與導出照舊。
import type { Cue } from '../../../audio/types';
import { darken, lighten, mix } from '../../color';
import type { MotionCtx } from '../../motion';
import { TAU, clamp, hash, lerp, smooth, wrap } from '../../util';
import type { Subject } from '../types';

const G = 152; // 地面線
const K = 1.14; // 角色放大倍率（以地面為中心）
const L1 = 63; // 大腿
const L2 = 63; // 小腿
const H0 = 128; // 站立髖高（約為腿＋腳總長的 95%：支撐腿在中段幾乎伸直，才不會像蹲著走）
const ANK = 9; // 踝離地面的高度（鞋厚）
const STANCE = 0.6; // 一個步態週期中腳著地的比例
const TORSO = 74; // 髖到肩
const UA = 34; // 上臂
const FA = 31; // 前臂

interface Foot {
  x: number; // 相對髖的水平位置（向右為前）
  up: number; // 踝離「著地踝高」的抬高量
  ang: number; // 腳的俯仰（正＝腳尖朝上）
}

/** 一隻腳在週期 p（0..1，0 是腳跟著地）的位置：著地段等速後退，離地段以餘弦緩動向前、中途抬高 */
function footAt(p: number, half: number, lift: number): Foot {
  if (p < STANCE) {
    const q = p / STANCE;
    const heel = smooth(0.8, 1, q); // 腳趾離地前腳跟先抬起
    return { x: half - 2 * half * q, up: 11 * heel * heel, ang: 0.3 * (1 - smooth(0, 0.22, q)) - 0.65 * smooth(0.72, 1, q) };
  }
  const t = (p - STANCE) / (1 - STANCE);
  const e = 0.5 - 0.5 * Math.cos(Math.PI * t);
  return { x: -half + 2 * half * e, up: 11 * (1 - t) * (1 - t) + lift * Math.sin(Math.PI * Math.pow(t, 0.8)), ang: lerp(-0.65, 0.3, smooth(0.08, 0.92, t)) };
}

/** 雙骨 IK：髖 → 踝，回傳膝（膝永遠朝前） */
function ik(hx: number, hy: number, ax: number, ay: number, l1: number, l2: number): [number, number] {
  const dx = ax - hx;
  const dy = ay - hy;
  const d = clamp(Math.hypot(dx, dy), 8, l1 + l2 - 0.01);
  const a = Math.atan2(dy, dx);
  const al = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
  const t = a - al;
  return [hx + Math.cos(t) * l1, hy + Math.sin(t) * l1];
}

/** 沿中心線的錐形肢體輪廓（寬度隨長度漸變），膝／肘的轉角用二次曲線倒圓 */
function taper(a: [number, number], b: [number, number], c: [number, number], w0: number, w1: number, w2: number): number[] {
  const mid: [number, number][] = [];
  const n = 7;
  const q = (p0: [number, number], p1: [number, number], p2: [number, number], t: number): [number, number] => [(1 - t) * (1 - t) * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0], (1 - t) * (1 - t) * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]];
  const k0: [number, number] = [lerp(a[0], b[0], 0.82), lerp(a[1], b[1], 0.82)];
  const k1: [number, number] = [lerp(b[0], c[0], 0.18), lerp(b[1], c[1], 0.18)];
  const pts: [number, number][] = [a, k0];
  for (let i = 1; i < n; i++) mid.push(q(k0, b, k1, i / n));
  pts.push(...mid, k1, c);
  const wAt = (i: number) => {
    const t = i / (pts.length - 1);
    return t < 0.5 ? lerp(w0, w1, t / 0.5) : lerp(w1, w2, (t - 0.5) / 0.5);
  };
  const L: number[] = [];
  const R: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[Math.min(pts.length - 1, i + 1)];
    let dx = p1[0] - p0[0];
    let dy = p1[1] - p0[1];
    const l = Math.hypot(dx, dy) || 1;
    dx /= l;
    dy /= l;
    const w = wAt(i) / 2;
    L.push(pts[i][0] - dy * w, pts[i][1] + dx * w);
    R.push(pts[i][0] + dy * w, pts[i][1] - dx * w);
  }
  const out = [...L];
  for (let i = R.length - 2; i >= 0; i -= 2) out.push(R[i], R[i + 1]);
  return out;
}

export const walk2: Subject = {
  id: 'walk',
  name: '走路循環',
  en: 'Walk Cycle',
  desc: '一個穿連帽夾克、背背包、戴毛帽圍圍巾的角色側面走路：腳釘在地上不滑步（雙骨 IK），接觸、下壓、經過、上升四個姿勢，對側擺臂，帽球、圍巾與背包慢半拍跟隨。',
  loop: 2.2,
  key: 0.125,
  hero: 0.06,
  events: () => [
    { u: 0.125, x: 56, y: G, k: 0.5 },
    { u: 0.375, x: 56, y: G, k: 0.5 },
    { u: 0.625, x: 56, y: G, k: 0.5 },
    { u: 0.875, x: 56, y: G, k: 0.5 },
  ],
  cues() {
    return [0.125, 0.375, 0.625, 0.875].map<Cue>((u, i) => ({ u, kind: 'step', k: i % 2 ? 0.5 : 0.65 }));
  },
  track(M) {
    const c = wrap(2 * (M.u - 0.125), 1);
    const bob = 3.5 * (1 + 0.6 * M.mv.exag);
    const hh = H0 - bob * Math.cos(2 * TAU * c);
    return [6, G - K * (hh + TORSO + 24)];
  },
  draw(S, M, env) {
    const mv = M.mv;
    const u = M.u;
    const pal = S.pal;
    const det = S.look.detail;
    const ex = 1 + mv.exag * 0.6 + mv.noodle * 0.4;
    const half = clamp(42 * (1 + mv.exag * 0.35 + mv.noodle * 0.15), 28, 54);
    const lift = 22 * (1 + mv.exag * 0.5);
    const bob = 3.5 * (1 + 0.6 * mv.exag);
    const noodle = mv.noodle > 0.3;
    const rigid = mv.rigid > 0.4;
    const FL = { stroke: false, shadow: false, hl: false, flat: true, drawOn: false } as const;

    // ── 色彩：一個強調色（p）＋深色中性（褲、帽）＋奶油（鞋、圍巾）＋一點冷色（背包）；全部由色板角色算出
    const jacket = pal.p;
    const jacketShade = darken(pal.p, 0.14);
    const jacketLit = lighten(pal.p, 0.06);
    const pants = mix(pal.ink, pal.s, 0.34);
    const pantsShade = darken(pants, 0.12);
    const pantsLit = lighten(pants, 0.09);
    const cream = mix(pal.light, pal.p, 0.05);
    const creamShade = darken(mix(cream, pal.s, 0.12), 0.07);
    const skin = mix(mix(pal.light, pal.a, 0.42), pal.p, 0.1);
    const skinShade = darken(skin, 0.1);
    const pack = mix(pal.s, pal.ink, 0.18);
    const packShade = darken(pack, 0.14);
    const bgNeutral = (k: number) => darken(pal.bg, k * 0.85); // 沿背景的色相只變暗（混 ink 會在黃底上變成髒橄欖色）
    const far = (c: string) => darken(c, 0.13);

    // ── 步態週期：每圈兩個週期（四步），落腳在 u = 0.125／0.375／0.625／0.875
    const c = wrap(2 * (u - 0.125), 1);
    const hipH = H0 - bob * Math.cos(2 * TAU * c);
    const pA = c;
    const pB = wrap(c + 0.5, 1);
    const fA = footAt(pA, half, lift);
    const fB = footAt(pB, half, lift);
    // 地面一圈的位移：踩地的腳在身體座標系等速後退 = 地面捲動速度（所以不滑步）
    const D = (4 * half * K) / STANCE; // 角色整個放大了 K 倍，所以腳在畫面上的速度也是 K 倍；地面要乘上去才不會滑步（驗證時抓到的：沒乘時腳比地面快約 14%）

    // ═══ 背景：中性、低對比（隨背景亮度而變），三層：遠景（靜止）、中景（半速）、近景地面（和腳同速）═══
    const hw = env.Wu / 2 + 80;
    const bottom = env.Hu / 2 + 80;
    // 遠景：靜止的柔和山形
    if (det > 0.3) {
      const pts: number[] = [-hw, G];
      for (let x = -hw; x <= hw; x += 24) pts.push(x, G - 40 - 26 * Math.sin(x * 0.011 + 1) - 16 * Math.sin(x * 0.027 + 2));
      pts.push(hw, G);
      S.poly(pts, bgNeutral(0.045), FL);
      const p2: number[] = [-hw, G];
      for (let x = -hw; x <= hw; x += 24) p2.push(x, G - 18 - 14 * Math.sin(x * 0.017 + 4) - 8 * Math.sin(x * 0.04));
      p2.push(hw, G);
      S.poly(p2, bgNeutral(0.075), FL);
    }
    // 中景：樹與灌木（半速）；一個單元寬 D/2，剛好一圈走一個單元，所以可以無縫循環
    if (det > 0.35) {
      const cellW = D * 0.5;
      const shift = u * cellW;
      const n = Math.ceil((hw * 2) / cellW) + 2;
      const tree = mix(mix(pal.bg, pal.q, 0.2), pal.ink, 0.05);
      for (let i = -1; i < n; i++) {
        const x0 = -hw + i * cellW - shift;
        // 樹：細樹幹加圓樹冠（兩層明暗）
        S.rect(x0 + cellW * 0.28, G - 22, 5, 44, 2, bgNeutral(0.14), FL);
        S.circle(x0 + cellW * 0.28, G - 52, 26, tree, FL);
        S.circle(x0 + cellW * 0.28 - 7, G - 58, 15, lighten(tree, 0.04), FL);
        // 灌木與石頭
        S.blob([x0 + cellW * 0.7 - 24, G, x0 + cellW * 0.7 - 20, G - 14, x0 + cellW * 0.7, G - 22, x0 + cellW * 0.7 + 20, G - 14, x0 + cellW * 0.7 + 24, G], darken(tree, 0.05), FL);
        S.ellipse(x0 + cellW * 0.52, G - 2, 8, 5, bgNeutral(0.16), FL);
      }
    }
    // 近景：地面（一條中性的色帶＋細的上緣線）、沿地面捲動的石子與草
    if (det > 0.2) {
      S.rect(0, (G + bottom) / 2, hw * 2, bottom - G, 0, bgNeutral(0.1), FL);
      S.rect(0, G + 0.6, hw * 2, 1.4, 0, bgNeutral(0.2), FL);
      const cellW = D / 4;
      const shift = u * D;
      const n = Math.ceil((hw * 2) / cellW) + 2;
      for (let i = -1; i < n; i++) {
        const x0 = -hw + i * cellW - shift;
        const h = hash(i % 4, 3);
        S.rect(x0, G + 22 + (i % 3) * 9, 14 + h * 14, 2.2, 1.1, bgNeutral(0.2), FL);
        if (i % 4 === 1 && det > 0.45) {
          for (const o of [-3.5, 0, 3.5]) S.line([x0 + o, G + 2, x0 + o * 1.8, G - 7 - (o === 0 ? 4 : 0)], mix(pal.q, pal.ink, 0.2), { w: 1.7, cap: 'round', alpha: 0.7, drawOn: false });
        }
      }
    }
    // 腳下的影子：隨髖高微微縮放
    S.ellipse(2, G + 2.5, 52 * K, 6.5, 'ink', { alpha: 0.16, ...FL });

    // ═══ 角色 ═══
    S.push();
    S.translate(0, G);
    S.scale(K);
    S.translate(0, -G);
    S.jitter(1);

    const lag = 0.03 + 0.05 * mv.follow;
    const cLag = wrap(2 * (u - lag - 0.125), 1);
    const hipHLag = H0 - bob * Math.cos(2 * TAU * cLag);
    const dyLag = hipHLag - hipH; // 慢半拍的差
    const lean = 0.04 + 0.04 * mv.exag;
    const hip: [number, number] = [0, G - hipH];
    const ux = Math.sin(lean);
    const uy = -Math.cos(lean);
    const neck: [number, number] = [hip[0] + ux * TORSO, hip[1] + uy * TORSO];
    const shoulder: [number, number] = [hip[0] + ux * (TORSO - 8), hip[1] + uy * (TORSO - 8)];

    // 肢體畫法：一般＝錐形色塊；橡皮管＝帶描邊的曲線麵條；剪紙＝剛性線段加鉚釘
    const limb = (a: [number, number], b: [number, number], cc: [number, number], w0: number, w1: number, w2: number, col: string, hi: string | null, isFar: boolean, seam = false) => {
      const color = isFar ? far(col) : col;
      if (noodle) {
        const mx = (a[0] + cc[0]) / 2 + (b[0] - (a[0] + cc[0]) / 2) * 1.6;
        const my = (a[1] + cc[1]) / 2 + (b[1] - (a[1] + cc[1]) / 2) * 1.6;
        S.curve([a[0], a[1], mx, my, cc[0], cc[1]], color, { w: (w0 + w2) * 0.4, outlined: true });
        return;
      }
      if (rigid) {
        S.line([a[0], a[1], b[0], b[1]], color, { w: (w0 + w1) / 2, cap: 'round', outlined: true });
        S.line([b[0], b[1], cc[0], cc[1]], color, { w: (w1 + w2) / 2, cap: 'round', outlined: true });
        S.circle(b[0], b[1], 2.6, 'ink', { mode: 'flat', stroke: false, hl: false });
        return;
      }
      S.poly(taper(a, b, cc, w0, w1, w2), color, { hl: false, shadow: false });
      if (hi && det > 0.5 && !isFar) S.poly(taper(a, b, cc, w0 * 0.34, w1 * 0.34, w2 * 0.34).map((v, i) => (i % 2 === 0 ? v - 3.2 : v - 0.6)), hi, { ...FL, alpha: 0.5 });
      if (seam && det > 0.55) S.line([lerp(a[0], b[0], 0.1) + 5, lerp(a[1], b[1], 0.1), b[0] + 4, b[1], cc[0] + 2.5, cc[1] - 3], darken(color, 0.22), { w: 1.2, alpha: 0.55, cap: 'round', drawOn: false });
    };

    /** 腿＋鞋；回傳踝位置（落地塵土用） */
    const leg = (f: Foot, isFar: boolean): [number, number] => {
      const ank: [number, number] = [hip[0] + f.x, G - ANK - f.up];
      const knee = ik(hip[0], hip[1], ank[0], ank[1], L1, L2);
      limb(hip, knee, ank, 32, 23, 16, pants, pantsLit, isFar, true);
      // 褲腳反摺
      if (!noodle && !rigid && det > 0.45) {
        const dx = ank[0] - knee[0];
        const dy = ank[1] - knee[1];
        const l = Math.hypot(dx, dy) || 1;
        S.push();
        S.translate(ank[0] - (dx / l) * 6, ank[1] - (dy / l) * 6);
        S.rotate(Math.atan2(dy, dx) - Math.PI / 2);
        S.rect(0, 0, 18, 6, 2, isFar ? far(darken(pants, 0.08)) : darken(pants, 0.1), FL);
        S.pop();
      }
      // 鞋：厚底方頭鞋，依腳的俯仰旋轉
      S.push();
      S.translate(ank[0], ank[1] + 1);
      S.rotate(-f.ang);
      const up = isFar ? far(cream) : cream;
      const sole = isFar ? far(pal.ink) : pal.ink;
      S.poly([-9, 9, -10, -3, -6, -9, 4, -9, 9, -3, 20, 1, 23, 6, 23, 9], up, { hl: false, shadow: false });
      S.poly([-10, 7, 23, 7, 24, 11.5, -10, 11.5], sole, { ...FL, alpha: 0.92 });
      if (det > 0.5) {
        S.poly([5, -6, 9, -3, 16, 0, 12, 1], isFar ? far(jacket) : jacket, { ...FL, alpha: 0.95 });
        S.line([-4, 1, 4, -1], creamShade, { w: 1.4, cap: 'round', drawOn: false });
      }
      S.pop();
      return ank;
    };
    /** 手臂＋袖口＋手 */
    const arm = (f: Foot, isFar: boolean) => {
      const a = -0.52 * ex * (f.x / half); // 反向擺臂：同側腳在前時手向後
      const flex = 0.28 + 0.5 * clamp((a / (0.52 * ex) + 1) / 2) * ex * 0.7;
      const el: [number, number] = [shoulder[0] + UA * Math.sin(a), shoulder[1] + UA * Math.cos(a)];
      const ha: [number, number] = [el[0] + FA * Math.sin(a + flex), el[1] + FA * Math.cos(a + flex)];
      if (!isFar && !noodle && !rigid) S.poly(taper([shoulder[0] + 2, shoulder[1] + 2], [el[0] + 2, el[1] + 2], [ha[0] + 2, ha[1] + 2], 19, 17, 14), jacketShade, { ...FL, alpha: 0.9 });
      limb(shoulder, el, ha, 19, 17, 14, isFar ? jacketShade : jacketLit, null, isFar);
      if (!noodle && !rigid && det > 0.45) {
        // 袖子上的兩條色帶（參考圖夾克袖上的條紋）
        const bx = lerp(shoulder[0], el[0], 0.42);
        const by = lerp(shoulder[1], el[1], 0.42);
        S.push();
        S.translate(bx, by);
        S.rotate(-a);
        S.rect(0, 0, 17, 3.4, 1, isFar ? far(cream) : cream, FL);
        S.rect(0, 5.5, 17, 3, 1, isFar ? far(pal.a) : pal.a, FL);
        S.pop();
      }
      S.circle(ha[0], ha[1], 7, isFar ? far(skin) : skin, { hl: false, shadow: false });
    };

    // ── 遠側：手、腿
    arm(fB, true);
    leg(fB, true);

    // ── 軀幹：連帽夾克（有份量的輪廓）
    S.push();
    S.translate(hip[0], hip[1]);
    S.rotate(lean);
    // 背包（在軀幹後面、慢半拍上下晃一點）：圓角方塊＋口袋＋蓋子線
    S.push();
    S.translate(0, dyLag * 0.6);
    S.rect(-38, -40, 24, 48, 10, pack, { hl: false, shadow: false });
    S.rect(-43, -28, 11, 22, 5, packShade, FL);
    S.rect(-38, -57, 22, 3, 1.5, packShade, { ...FL, alpha: 0.8 });
    if (det > 0.5) S.rect(-40, -44, 9, 2.4, 1.2, cream, { ...FL, alpha: 0.7 });
    S.pop();
    // 帽子的帽兜（在頸後，先畫）
    S.blob([-16, -70, -26, -82, -14, -95, 3, -89, 5, -74], jacketShade, { hl: false, shadow: false });
    S.blob([-27, 4, -31, -20, -30, -46, -24, -66, -12, -76, 12, -77, 25, -68, 30, -46, 29, -20, 26, 4], jacket, { hl: false, shadow: false });
    if (det > 0.5) {
      // 背側的陰影階與前胸的受光階
      S.blob([-27, 4, -31, -20, -30, -46, -24, -66, -14, -74, -19, -50, -21, -22, -18, 4], jacketShade, { ...FL, alpha: 0.7 });
      S.blob([12, -72, 24, -64, 28, -46, 27, -24, 23, -24, 22, -50, 18, -64], jacketLit, { ...FL, alpha: 0.5 });
      // 下擺束帶、拉鍊、羽絨夾克的橫向縫線
      // 色塊分割：肩線以上的肩部較亮、腰線以下較暗（羽絨夾克的拼色）
      S.blob([-28, -52, -24, -66, -12, -76, 12, -77, 25, -68, 29, -54, 14, -58, -8, -60], jacketLit, { ...FL, alpha: 0.5 });
      S.blob([-27, 4, -29, -14, -28, -24, 26, -24, 27, -14, 26, 4], darken(jacket, 0.1), { ...FL, alpha: 0.6 });
      S.rect(0, -1, 56, 9, 3.5, darken(jacket, 0.18), FL);
      S.line([21, -72, 22, -6], darken(jacket, 0.3), { w: 1.3, cap: 'round', alpha: 0.6, drawOn: false });
      S.curve([-26, -30, 0, -25, 27, -30], darken(jacket, 0.22), { w: 1.2, alpha: 0.3, cap: 'round' });
      S.curve([-27, -50, 0, -45, 28, -50], darken(jacket, 0.22), { w: 1.2, alpha: 0.3, cap: 'round' });
    }
    // 背帶：從肩上斜下到腋下
    S.poly([-9, -76, -1, -77, 8, -34, 0, -33], packShade, { ...FL, alpha: 0.9 });
    S.pop();

    // ── 圍巾：流動的兩色條紋飄帶（慢半拍加風；每圈 4 個波，所以無縫循環），尾端收尖
    {
      const N = 14;
      const sc: [number, number][] = [];
      for (let k = 0; k < N; k++) {
        const t = k / (N - 1);
        const wave = Math.sin(TAU * (u * 4) - k * 0.5) * (1.5 + k * 1.15) * (0.5 + mv.follow) + mv.wind * k * 2.5;
        sc.push([neck[0] - 4 - k * 7.4, neck[1] + 5 + wave + k * 0.7 + t * t * 6 - mv.wind * k * 1.4 + dyLag * 0.25 * t]);
      }
      const edge = (k: number, side: number) => {
        const p0 = sc[Math.max(0, k - 1)];
        const p1 = sc[Math.min(N - 1, k + 1)];
        let dx = p1[0] - p0[0];
        let dy = p1[1] - p0[1];
        const l = Math.hypot(dx, dy) || 1;
        dx /= l;
        dy /= l;
        const t = k / (N - 1);
        const w = lerp(9, 6.5, t) * (t > 0.82 ? 1 - (t - 0.82) / 0.18 * 0.85 : 1);
        return [sc[k][0] - side * dy * w, sc[k][1] + side * dx * w];
      };
      const pts: number[] = [];
      for (let k = 0; k < N; k++) pts.push(...edge(k, 1));
      for (let k = N - 1; k >= 0; k--) pts.push(...edge(k, -1));
      S.poly(pts, cream, { hl: false, shadow: false });
      if (det > 0.45) {
        for (const k of [3, 7]) S.poly([...edge(k, 1), ...edge(k + 1, 1), ...edge(k + 1, -1), ...edge(k, -1)], jacket, { ...FL, alpha: 0.95 });
      }
      // 圍在脖子上的一圈
      S.ellipse(neck[0] - 1, neck[1] + 4, 12.5, 8.5, cream, { hl: false, shadow: false });
      if (det > 0.45) S.rect(neck[0] - 1, neck[1] + 4, 4, 15, 2, jacket, { ...FL, alpha: 0.9 });
    }

    // ── 近側：腿與手臂
    const ankA = leg(fA, false);
    arm(fA, false);
    // 落腳的塵土（腳跟著地後的短暫時間）
    if (det > 0.35) {
      for (const [p, f] of [
        [pA, fA],
        [pB, fB],
      ] as const) {
        if (p < 0.14) {
          const k = p / 0.14;
          const bx = hip[0] + f.x - 14;
          for (let i = 0; i < 2; i++) S.circle(bx - i * 7 - k * 10, G - 3 - k * (3 + i * 3), (3.2 + i * 1.6) * (0.6 + k * 0.7), cream, { ...FL, alpha: 0.5 * (1 - k) });
        }
      }
    }
    void ankA;

    // ── 頭（慢半拍）：側臉、毛帽與帽球
    const hd = dyLag * 0.7 * clamp(mv.follow + 0.25);
    const hx = neck[0] + 7;
    const hy = neck[1] - 22 + hd;
    S.push();
    S.translate(hx, hy);
    S.rotate(lean * 0.4 + dyLag * 0.012);
    S.scale(1.06);
    // 脖子
    S.rect(-1, 22, 12, 14, 4, skinShade, { hl: false, shadow: false });
    // 側臉輪廓（鼻尖、嘴唇、下巴）
    S.blob([-17, 3, -15, -14, -4, -23, 11, -21, 18, -10, 19, -3, 25, 2, 19, 5, 19, 10, 15, 18, 5, 21, -8, 17], skin, { hl: false, shadow: false });
    // 髮尾與耳朵
    S.blob([-22, -5, -25, 5, -19, 13, -11, 10, -14, -1], pal.ink, { hl: false, shadow: false, flat: true });
    S.circle(-3, 5, 4.4, skinShade, { hl: false, shadow: false, flat: true });
    // 眼睛、眉毛、腮紅、嘴（都在帽緣下面）
    S.ellipse(10, 0, 2.4, 3.3, pal.ink, FL);
    S.circle(10.8, -1.2, 0.9, 'light', FL);
    S.line([6, -4.6, 14, -5.4], pal.ink, { w: 1.6, cap: 'round', alpha: 0.85, drawOn: false });
    if (det > 0.45) {
      S.ellipse(10, 10, 5, 3, 'p', { ...FL, alpha: 0.28 });
      S.curve([13, 13.5, 16, 14.5, 18.5, 13], skinShade, { w: 1.5, cap: 'round' });
    }
    // 毛帽：帽身（深色）、反摺帽緣（強調色）、帽球（奶油，慢半拍甩動）
    const swing = Math.sin(TAU * (u * 4 - 0.15)) * 3.5 * (0.4 + mv.follow) + dyLag * 0.6;
    S.blob([-22, -6, -24, -19, -14, -33, 3, -38, 17, -29, 22, -17, 22, -8], pants, { hl: false, shadow: false });
    if (det > 0.5) S.blob([-22, -6, -24, -19, -15, -31, -9, -14, -11, -6], pantsShade, { ...FL, alpha: 0.9 });
    S.blob([-23, -6, -24, -13, -8, -17, 10, -17, 23, -14, 24, -6, 10, -4, -8, -4], jacket, { hl: false, shadow: false });
    if (det > 0.5) S.line([-18, -10, 19, -11], jacketShade, { w: 1.3, alpha: 0.5, cap: 'round', drawOn: false });
    S.circle(-8 - swing, -43 + Math.abs(swing) * 0.5, 7.8, cream, { hl: false, shadow: false });
    S.pop();
    S.pop();
  },
};
