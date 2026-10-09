// 主體 v2：風景視差（第二版，藍本是 Dribbble 的「粉紅沙漠剪影」與「青綠山景」——同一色相的層層遞進，筆記見 docs/主體v2參考/landscape.md）。
// 參考圖共通的好看原因：天空一個大太陽（帶兩圈半透明光暈）；層層景深全部是「同一個色相從淺到深」（空氣透視），越近越深、對比越強；
// 最近一層是接近黑色的剪影（仙人掌、松樹、草叢）；遠處有方頂的岩山；整幅只有 3–4 個色相。層以不同速度後退並可無縫循環。
// 顏色全部由色板角色算出：天空取背景色，景深色由「暖色（p 混 a）→ 冷色（s）→ ink」逐層混合。
import type { Cue } from '../../../audio/types';
import { darken, mix } from '../../color';
import { TAU, clamp, hash, wrap } from '../../util';
import type { Subject } from '../types';

const PF = 240;
const PM = 480;
const PN = 960;
type Amp = [number, number, number];
const FAR: Amp[] = [
  [1, 36, 0.4],
  [2, 20, 1.9],
  [3, 9, 0.2],
];
const MID: Amp[] = [
  [1, 22, 2.1],
  [2, 12, 0.7],
  [3, 5, 1.3],
];
const NEAR: Amp[] = [
  [1, 18, 1.1],
  [2, 10, 2.6],
  [4, 4, 0.5],
];
function ridge(x: number, P: number, base: number, amps: Amp[]) {
  let y = base;
  for (const [j, a, ph] of amps) y += a * Math.sin((TAU * j * x) / P + ph);
  return y;
}

export const landscape2: Subject = {
  id: 'landscape',
  name: '風景視差',
  en: 'Parallax Landscape',
  desc: '五層景深的風景：帶光暈的太陽、雪頂遠山、松林與炊煙小屋、薄霧、近景大樹與野花，以不同速度後退並無縫循環，雲飄鳥飛。',
  loop: 8,
  key: 0.5,
  hero: 0.3,
  events: () => [],
  cues() {
    return [
      { u: 0.0, kind: 'whoosh', k: 0.18 },
      { u: 0.5, kind: 'sparkle', k: 0.3 },
    ] as Cue[];
  },
  track(M, env) {
    const span = env.Wu + 200;
    const x = wrap(hash(0, 71) * span - M.u * span, span) - span / 2;
    return [x, -70 + Math.sin(TAU * M.u * 2) * 10];
  },
  draw(S, M, env) {
    const mv = M.mv;
    const u = M.u;
    const P = S.pal;
    const hw = env.Wu / 2 + 30;
    const bottom = env.Hu / 2 + 60;
    const k = Math.round(clamp(mv.parallax, 0, 1.5) * 2);
    const det = S.look.detail;
    const FL = { stroke: false, shadow: false, hl: false, flat: true, drawOn: false } as const;
    const G0 = { shadow: false, hl: false } as const;
    const Hh = env.Hu / 2;

    // ── 景深色：天空 → 暖色霧 → 冷色 → 近黑；七層，一層比一層深、對比一層比一層強
    const warm = mix(P.p, P.a, 0.3);
    const cool = P.s;
    const dark = mix(P.ink, cool, 0.4);
    const layer = (t: number) => mix(mix(P.bg, warm, 0.36), dark, t);
    const sun = mix(P.light, P.a, 0.5);
    const sunY = -env.Hu * 0.2 + 10 * Math.cos(TAU * u);
    const sunX = env.Wu * 0.18;

    // ── 天空：地平線附近幾條暖色橫帶（漸層感）
    if (det > 0.3) {
      for (let i = 0; i < 4; i++) S.rect(0, 10 - i * 38, env.Wu + 80, 38, 0, warm, { ...FL, alpha: 0.05 + 0.02 * (3 - i) });
    }

    // ── 太陽：大圓盤、兩圈光暈、放射的光束（緩慢轉動）
    if (det > 0.3) {
      S.circle(sunX, sunY, 128, sun, { alpha: 0.1, ...FL });
      S.circle(sunX, sunY, 88, sun, { alpha: 0.16, ...FL });
    }
    if (det > 0.5) {
      S.push();
      S.translate(sunX, sunY);
      S.rotate(TAU * u * 0.125);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU;
        S.poly([Math.cos(a - 0.04) * 60, Math.sin(a - 0.04) * 60, Math.cos(a) * 190, Math.sin(a) * 190, Math.cos(a + 0.04) * 60, Math.sin(a + 0.04) * 60], sun, { alpha: 0.06, ...FL });
      }
      S.pop();
    }
    S.circle(sunX, sunY, 46, sun, G0);

    // ── 雲：前後兩種速度的細長色帶
    if (det > 0.3) {
      for (let i = 0; i < 5; i++) {
        const span = env.Wu + 320;
        const front = i % 2 === 0;
        const x = wrap(hash(i, 81) * span - u * span * (front ? 1 : 2), span) - span / 2;
        const y = -env.Hu * 0.3 + hash(i, 82) * 76;
        const w = (front ? 74 : 50) * (0.8 + hash(i, 83) * 0.5);
        S.blob([x - w, y + 6, x - w * 0.6, y - 4, x - 6, y - 7, x + w * 0.5, y - 4, x + w, y + 6, x + w * 0.4, y + 9, x - w * 0.5, y + 9], P.light, { alpha: front ? 0.55 : 0.32, ...FL });
      }
    }

    const poly = (P0: number, base: number, amps: Amp[], shift: number) => {
      const pts: number[] = [-hw, bottom];
      for (let x = -hw; x <= hw; x += 10) pts.push(x, ridge(x + shift, P0, base, amps));
      pts.push(hw, bottom);
      return pts;
    };
    /** 山脊的受光面：每個山頭朝太陽那一側畫一塊較亮的三角形（山有立體感） */
    const lit = (P0: number, base: number, amps: Amp[], shift: number, col: string, minH: number) => {
      if (det < 0.5) return;
      for (let x = -hw; x <= hw; x += 10) {
        const y0 = ridge(x + shift, P0, base, amps);
        const yl = ridge(x - 8 + shift, P0, base, amps);
        const yr = ridge(x + 8 + shift, P0, base, amps);
        if (y0 < yl - 0.4 && y0 < yr - 0.4 && y0 < minH) {
          const side = x < sunX ? 1 : -1;
          S.poly([x, y0, x + side * 26, ridge(x + side * 26 + shift, P0, base, amps), x + side * 8, y0 + 26], col, { alpha: 0.55, ...FL });
        }
      }
    };

    // ── 第 1 層：遠方的高山（有受光面）
    const s1 = u * PF * k * 0.5;
    const c1 = layer(0.1);
    S.poly(poly(PF, -36, FAR, s1), c1, G0);
    lit(PF, -36, FAR, s1, mix(c1, P.light, 0.5), -52);
    // ── 第 2 層：方頂岩山
    const sf = u * PF * k;
    const c2 = layer(0.2);
    if (det > 0.3) {
      for (let t = -2; t <= 4; t++) {
        for (let j = 0; j < 2; j++) {
          const cx0 = (j + 0.5) * (PF / 2) + t * PF - sf;
          if (cx0 < -hw - 90 || cx0 > hw + 90) continue;
          const w = 56 + hash(j, 31) * 34;
          const h = 38 + hash(j, 32) * 40;
          S.poly([cx0 - w / 2 - 14, 46, cx0 - w / 2, 4 - h * 0.6, cx0 - w / 2 + 8, 4 - h, cx0 + w / 2 - 10, 4 - h, cx0 + w / 2, 4 - h * 0.55, cx0 + w / 2 + 16, 46], c2, FL);
        }
      }
    }
    // ── 第 3 層：薄霧與山丘
    S.poly(poly(PF, 12, FAR, sf), layer(0.28), G0);
    if (det > 0.4) {
      const mx = wrap(u * 360, 720) - 360;
      S.ellipse(mx, 38, 300, 14, P.light, { alpha: 0.16, ...FL });
      S.ellipse(mx + 720, 38, 300, 14, P.light, { alpha: 0.16, ...FL });
    }
    // ── 第 4 層：遠林（一排小松樹的剪影）
    const sm0 = u * PM * k * 0.7;
    const c4 = layer(0.4);
    S.poly(poly(PM, 50, MID, sm0), c4, G0);
    if (det > 0.35) {
      for (let t = -2; t <= 3; t++) {
        for (let i = 0; i < 12; i++) {
          const wx = (i + hash(i, 63) * 0.5) * (PM / 12) + t * PM;
          const x = wx - sm0;
          if (x < -hw - 20 || x > hw + 20) continue;
          const y = ridge(wx, PM, 50, MID) + 2;
          const sc = 0.35 + hash(i, 64) * 0.2;
          S.poly([x, y - 40 * sc, x + 10 * sc, y - 12 * sc, x - 10 * sc, y - 12 * sc], darken(c4, 0.1), FL);
          S.poly([x, y - 26 * sc, x + 13 * sc, y, x - 13 * sc, y], darken(c4, 0.1), FL);
        }
      }
    }
    // ── 湖：一條平靜的水面，倒映太陽的幾道橫條
    const lakeY = 56;
    const lakeC = mix(layer(0.34), P.light, 0.12);
    S.rect(0, lakeY + 12, hw * 2, 24, 0, lakeC, FL);
    if (det > 0.4) {
      for (let i = 0; i < 5; i++) {
        const w = 70 - i * 10 + 10 * Math.sin(TAU * (u * 2 + i * 0.2));
        S.rect(sunX, lakeY + 3 + i * 5, w, 1.8, 1, sun, { alpha: 0.6 - i * 0.09, ...FL });
      }
    }
    // ── 第 5 層：中景丘陵與松樹
    const sm = u * PM * k;
    const midC = layer(0.5);
    S.poly(poly(PM, 98, MID, sm), midC, G0);
    const pine = darken(midC, 0.14);
    for (let t = -2; t <= 3; t++) {
      for (let i = 0; i < 6; i++) {
        const wx = (i + hash(i, 61) * 0.4) * (PM / 6) + t * PM;
        const x = wx - sm;
        if (x < -hw - 30 || x > hw + 30) continue;
        const y = ridge(wx, PM, 98, MID) + 2;
        const s2 = 0.7 + hash(i, 62) * 0.5;
        S.push();
        S.translate(x, y);
        S.scale(s2);
        S.poly([0, -44, 11, -22, -11, -22], pine, FL);
        S.poly([0, -32, 14, -8, -14, -8], pine, FL);
        S.poly([0, -20, 17, 4, -17, 4], pine, FL);
        S.pop();
      }
    }
    // ── 第 6 層：近景丘陵，仙人掌與圓頂樹
    const sn = u * PN * k;
    const nearC = layer(0.68);
    S.poly(poly(PN, 132, NEAR, sn), nearC, G0);
    const plant = darken(nearC, 0.12);
    for (let t = -1; t <= 2; t++) {
      for (let i = 0; i < 8; i++) {
        const wx = i * (PN / 8) + 40 + t * PN;
        const x = wx - sn;
        if (x < -hw - 40 || x > hw + 40) continue;
        const y = ridge(wx, PN, 132, NEAR) + 4;
        const sway = mv.wind * 5 * Math.sin(TAU * (u * 3 + i * 0.17)) + M.fl(i + 40, 3);
        const s2 = 0.9 + hash(i, 91) * 0.5;
        S.push();
        S.translate(x, y);
        S.jitter(50 + i);
        S.scale(s2);
        if (i % 2) {
          S.rect(sway * 0.3, -34, 12, 70, 6, plant, FL);
          S.rect(-15 + sway * 0.3, -26, 20, 9, 4.5, plant, FL);
          S.rect(-18 + sway * 0.3, -40, 9, 28, 4.5, plant, FL);
          S.rect(15 + sway * 0.3, -36, 20, 9, 4.5, plant, FL);
          S.rect(18 + sway * 0.3, -50, 9, 28, 4.5, plant, FL);
        } else {
          S.rect(0, -12, 7, 30, 2, plant, FL);
          S.circle(sway, -42, 24, plant, FL);
          S.circle(sway - 13, -33, 15, plant, FL);
          S.circle(sway + 14, -34, 14, plant, FL);
        }
        S.pop();
      }
    }
    // ── 螢火蟲與飄動的光點（一圈剛好循環）
    if (det > 0.5) {
      const FW = env.Wu + 60;
      for (let i = 0; i < 14; i++) {
        const fx = wrap(hash(i, 111) * FW + u * FW, FW) - FW / 2;
        const fy = 40 + hash(i, 112) * 90 + Math.sin(TAU * (u * 2 + hash(i, 113))) * 8;
        S.circle(fx, fy, 1.6 + hash(i, 114) * 1.4, sun, { alpha: 0.35 + 0.35 * (0.5 + 0.5 * Math.sin(TAU * (u * 3 + hash(i, 115)))), ...FL });
      }
    }
    // ── 第 7 層：最前面近黑的丘陵、草叢與兩側的大樹幹（最快）
    const sg = u * PN * 1.6 * k;
    const gC = mix(P.ink, cool, 0.18);
    const gp: Amp[] = [
      [1, 10, 0.4],
      [2, 6, 1.7],
      [5, 2.5, 0.9],
    ];
    S.poly(poly(PN, 176, gp, sg), gC, G0);
    if (det > 0.4) {
      for (let t = -1; t <= 2; t++) {
        for (let i = 0; i < 16; i++) {
          const wx = (i + hash(i, 97) * 0.7) * (PN / 16) + t * PN;
          const x = wx - sg;
          if (x < -hw - 20 || x > hw + 20) continue;
          const y = ridge(wx, PN, 176, gp);
          for (const o of [-4, 0, 4]) S.line([x + o, y + 3, x + o * 1.9 + Math.sin(u * TAU * 2 + i) * mv.wind * 3, y - 8 - (o === 0 ? 6 : 0)], gC, { w: 2, cap: 'round', drawOn: false });
        }
      }
      // 前景大蕨葉：每個週期三叢，從畫面底部長出的彎曲葉片（最快，帶輕微風擺）
      const sgt = u * PN * 2.4 * k;
      for (let t = -1; t <= 2; t++) {
        for (const wx0 of [0.12, 0.45, 0.8]) {
          const wx = wx0 * PN + t * PN;
          const x = wx - sgt;
          if (x < -hw - 80 || x > hw + 80) continue;
          const h0 = 70 + hash(Math.round(wx0 * 10), 120) * 40;
          for (let q = -2; q <= 2; q++) {
            const sw = Math.sin(TAU * (u * 2 + q * 0.13 + wx0)) * (3 + mv.wind * 6);
            const lean = q * 16;
            S.poly([x + q * 4 - 5, Hh + 10, x + lean * 0.5 + sw * 0.4, Hh - h0 * 0.5, x + lean + sw, Hh - h0 * (1 - Math.abs(q) * 0.12), x + lean * 0.5 + sw * 0.4 + 5, Hh - h0 * 0.5, x + q * 4 + 5, Hh + 10], gC, FL);
          }
        }
      }
    }

    // ── 飛鳥：人字隊形，振翅相位逐隻錯開
    for (let i = 0; i < 5; i++) {
      const span = env.Wu + 240;
      const lead = Math.abs(i - 2);
      const x = wrap(hash(0, 71) * span - u * span, span) - span / 2 - lead * 22;
      const y = -78 + Math.sin(TAU * u * 2) * 10 + (i - 2) * 11 * (i < 2 ? -1 : 1) + lead * 8;
      const f = Math.sin(TAU * (u * 12 + i * 0.22));
      S.line([x - 10, y - 5 * f, x, y + 2, x + 10, y - 5 * f], 'ink', { w: 2, cap: 'round', drawOn: false });
    }
  },
};
