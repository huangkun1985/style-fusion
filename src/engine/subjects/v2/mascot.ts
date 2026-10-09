// 主體 v2：跳跳豆（第四版，臉與身體照 Dribbble 吉祥物插畫的「色塊結構」重畫，筆記見 docs/主體v2參考/mascot.md）。
// 參考圖共通的好看原因：頭大身小的 chibi 比例；頭是「深色頭罩（頭頂與兩側）＋淺色臉一路到下緣當輪廓」的色塊分割，下緣有毛的缺口；
// 蝴蝶形淺色眼周、眼睛大而圓只有一顆高光；粗而帶色調的描邊；底色／陰影／受光三階平塗加弧形高光；爪子有形狀；腳下一個橢圓影子；背景單一飽和色塊。
// 動作沿用 v1 的跳躍姿態（預備、拉伸、落地擠壓、跟隨），所以所有動效風格與音效提示點照舊可用；
// 頭、耳朵、尾巴、頭芽取「稍早」的狀態做跟隨，落地時頭會壓扁，所以有「慢半拍」的重量感。
import type { Cue } from '../../../audio/types';
import { darken, lighten, luma, mix } from '../../color';
import { bump, clamp, fract, TAU } from '../../util';
import { HOPS, mascotPose } from '../mascot';
import type { Subject } from '../types';

const G = 168;
const K = 1.28; // 只放大角色本身
const YS = 0.82; // 跳躍高度的倍率（角色變大後，頂點仍要留在畫面內）
const C0 = G - 140; // 襯景的視覺中心
const HY = -80; // 頭中心（腳底為 0，向上為負）
const NECK = -38; // 頭的轉動支點
const EYE = HY - 2;
const HRX = 62;
const HRY = 45;
const FLAT = { stroke: false, shadow: false, hl: false, flat: true, drawOn: false } as const;

/** 超橢圓（比橢圓方一點的「麻糬」形），n 越大越方；bottom 讓下半部略寬（有重量感） */
function mochi(rx: number, ry: number, cy: number, n = 2.5, bottom = 0.05): number[] {
  const pts: number[] = [];
  const m = 20;
  for (let i = 0; i < m; i++) {
    const th = (i / m) * TAU;
    const c = Math.cos(th);
    const s = Math.sin(th);
    pts.push(Math.sign(c) * Math.pow(Math.abs(c), 2 / n) * rx * (1 + bottom * s), cy + Math.sign(s) * Math.pow(Math.abs(s), 2 / n) * ry);
  }
  return pts;
}

/** 頭輪廓上角度 t 的點（y 向下；t = 3π/2 是頭頂）。下半部兩側有「毛」的缺口（鋸齒），臉頰比頭頂寬 */
function headAt(t: number): [number, number] {
  const c = Math.cos(t);
  const s = Math.sin(t);
  const n = 2.7;
  const phi = Math.atan2(s, Math.abs(c)); // -π/2..π/2；正值是下半部
  let f = 1;
  if (phi > 0.1 && phi < 0.92) {
    const q = (phi - 0.1) / 0.27;
    f += 0.07 * Math.sin((Math.PI * (phi - 0.1)) / 0.82) * (1 - (q - Math.floor(q)));
  }
  return [Math.sign(c) * Math.pow(Math.abs(c), 2 / n) * HRX * (1 + 0.06 * s) * f, HY + Math.sign(s) * Math.pow(Math.abs(s), 2 / n) * HRY * f];
}
function headArc(t0: number, t1: number, step: number): number[] {
  const out: number[] = [];
  for (let t = t0; t < t1 + 1e-6; t += step) out.push(...headAt(t));
  return out;
}
const HEAD = headArc(0, TAU - 0.0001, TAU / 72);
const HOOD_ARC = headArc(Math.PI - 0.5, TAU + 0.5, 0.09);

function pts(list: number[], sx = 1, ox = 0, oy = 0): number[] {
  return list.map((v, i) => (i % 2 === 0 ? v * sx + ox : v + oy));
}

/** 耳朵（原點在耳根）、耳內 */
const EAR = [-21, 6, -17, -20, -4, -45, 10, -46, 19, -23, 22, 6];
const EAR_IN = [-11, 3, -9, -17, -2, -34, 6, -34, 12, -17, 13, 3];
/** 尾巴（面向 +x，原點在尾根）：胖胖的 C 形捲曲，尖端是淺色 */
const TAIL = [0, 8, 20, 2, 36, -14, 40, -36, 32, -52, 18, -52, 12, -41, 19, -31, 12, -19, -2, -10];
const TAIL_TIP = [32, -52, 18, -52, 12, -41, 19, -33, 31, -34, 40, -40];

export const mascot2: Subject = {
  id: 'mascot',
  name: '角色跳躍',
  en: 'Mascot Hop',
  desc: '跳跳豆左右跳躍：預備蹲下、拉伸起跳、落地擠壓揚起塵土；騰空時瞇眼開心張嘴，頭慢半拍、落地壓扁，耳朵、尾巴與頭頂小芽跟隨擺動。',
  loop: 2.8,
  key: 0.27,
  hero: 0.25,
  events: () => HOPS.map((h) => ({ u: h.h0 + 0.72 * (h.h1 - h.h0), x: h.x1, y: G, k: 1 })),
  cues(M) {
    const t = 0.2 + 0.08 * M.mv.heavy;
    return HOPS.flatMap<Cue>((h) => [
      { u: h.h0 + (h.h1 - h.h0) * t, kind: 'jump', k: 0.7 },
      { u: h.h0 + (h.h1 - h.h0) * 0.72, kind: 'land', k: 0.9 },
    ]);
  },
  track(M) {
    const s = mascotPose(M, M.u);
    return [M.snap(s.x), G - M.snap(s.y) * YS - 62 * s.sy * K];
  },
  draw(S, M) {
    const mv = M.mv;
    const u = M.u;
    const s = mascotPose(M, u);
    const fo = mv.follow;
    const det = S.look.detail;
    const pal = S.pal;

    // ── 色彩：全部由色板角色算出。描邊用「帶身體色調的深色」（參考圖的描邊是深棕／深藍，不是純黑）
    const ol = mix(pal.ink, pal.p, 0.22);
    const OL = { outline: true, lw: 1.9, stroke: ol } as const;
    const hood = pal.p;
    const hoodShade = darken(mix(pal.p, pal.s, 0.12), 0.17); // 陰影階：略偏冷、較暗
    const hoodLit = lighten(pal.p, 0.07); // 頭頂的亮邊
    const cream = mix(pal.light, pal.p, 0.06); // 淺色部位帶一點身體色，不是死白
    const creamShade = darken(mix(cream, pal.s, 0.14), 0.035); // 淺色的陰影階偏冷（像參考圖的淡紫灰）
    const pink = mix(pal.p, pal.light, 0.5);
    const disc = pal.light; // 角色後面的柔和光暈：白色半透明、不大——只會讓底色變亮，不會像有色圓盤在某些風格裡混出髒色

    // ── 襯景：參考圖的背景是單一飽和色塊——一個大圓盤，加一圈淡的同心圓、小星與圓點
    if (det > 0.3) {
      // 由外到內漸強的幾層柔邊光暈（沒有一圈硬邊）；強度依背景亮度：亮底稍明顯，暗底只剩一點點，避免在深色風格裡變成一塊灰圓
      const ga = 0.03 + 0.1 * luma(pal.bg);
      for (let i = 0; i < 4; i++) S.circle(0, C0 + 6, 132 - i * 20, disc, { alpha: ga, ...FLAT });
      if (det > 0.5) {
        const fl2 = (i: number) => Math.sin(TAU * (u * (1 + (i % 2)) + i * 0.27));
        const star = (x: number, y: number, r: number, c: string) =>
          S.poly([x, y - r, x + r * 0.28, y - r * 0.28, x + r, y, x + r * 0.28, y + r * 0.28, x, y + r, x - r * 0.28, y + r * 0.28, x - r, y, x - r * 0.28, y - r * 0.28], c, { ...FLAT });
        star(-206 + fl2(0) * 4, C0 - 66 + fl2(1) * 6, 15, pal.light);
        star(198 + fl2(2) * 4, C0 - 10 + fl2(3) * 6, 10, pal.a);
        star(-156 + fl2(4) * 3, C0 + 96 + fl2(5) * 4, 7, pal.light);
        S.circle(170 + fl2(1) * 5, C0 - 100 + fl2(4) * 6, 6, null, { stroke: pal.light, outline: true, lw: 1.3, drawOn: false });
        S.circle(-122, C0 - 122 + fl2(2) * 5, 5, pal.a, { ...FLAT });
        S.circle(124, C0 + 104 + fl2(3) * 4, 4, pal.light, { ...FLAT });
      }
    }

    const hk = clamp(s.y / 140);
    const fl = M.fl(1, 6);
    // 腳下的橢圓影子：離地越高越小越淡
    if (det > 0.3) {
      // 腳下的影子用中性的 ink 半透明（不帶色相），在任何背景上都自然
      S.ellipse(M.snap(s.x), G + 4, 84 * (1 - 0.4 * hk), 11 * (1 - 0.35 * hk), 'ink', { alpha: 0.22 * (1 - 0.35 * hk), ...FLAT });
    } else S.ellipse(M.snap(s.x), G + 4, 74 * (1 - 0.4 * hk), 9, 'ink', { alpha: 0.2, ...FLAT });

    // ── 落地塵土與衝擊環
    const hit = HOPS.map((h) => {
      const t = h.h0 + 0.72 * (h.h1 - h.h0);
      return { x: h.x1, d: fract(u - t + 1) / 0.2 };
    }).find((e) => e.d >= 0 && e.d < 1);
    if (hit && det > 0.3) {
      const k = hit.d;
      const a = (1 - k) * (1 - k);
      for (const side of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          const r = (6 + i * 3.4) * (0.6 + k * 1.1);
          S.circle(hit.x + side * (40 + k * (30 + i * 16) + i * 4), G - 2 - k * (8 + i * 5), r, cream, { alpha: 0.95 * a, outline: true, stroke: ol, lw: 0.8, shadow: false, hl: false, flat: true, drawOn: false });
        }
      }
      S.ellipse(hit.x, G + 4, 52 + k * 72, 7 + k * 9, null, { stroke: pal.light, outline: true, lw: 1, alpha: 0.7 * a, drawOn: false });
    }

    // ── 跟隨：頭、耳朵、尾巴、頭芽取「稍早」的身體狀態
    const lag = 0.03 + 0.05 * fo;
    const s2 = mascotPose(M, fract(u - lag + 1));
    let th = (s2.x - s.x) * 0.012 * fo - s.lean * 0.9 * fo;
    th += s.land * 0.5 * fo * Math.sin(s.land * 9);
    th += mv.wind * 0.3 * Math.sin(TAU * u * 3);
    th += mv.float * 0.08 * Math.sin(TAU * u * 2);
    const airLag = s2.air;
    const sy = s.sy;
    const crouch = clamp(1 - sy) * 3;
    const wag = Math.sin(TAU * u * 6) * 0.2 * fo + th * 0.8;
    const px0 = M.snap(s.x);
    const py0 = G - M.snap(s.y) * YS;

    // ── 騰空時身後的星屑（沿軌跡落下、淡出；畫在角色後面）
    if (s.air > 0.08 && det > 0.45) {
      for (let i = 0; i < 4; i++) {
        const w = fract(u * 6 + i * 0.25);
        const px = px0 - s.face * (50 + i * 28) + Math.sin(i * 2.1) * 8;
        const py = py0 - 62 * K + w * 36;
        const r = (3.6 + (i % 2) * 2) * (1 - w) * s.air;
        S.poly([px, py - r * 1.6, px + r * 0.5, py - r * 0.5, px + r * 1.6, py, px + r * 0.5, py + r * 0.5, px, py + r * 1.6, px - r * 0.5, py + r * 0.5, px - r * 1.6, py, px - r * 0.5, py - r * 0.5], i % 2 ? pal.a : pal.light, { ...FLAT, alpha: 0.9 * (1 - w) });
      }
    }

    S.push();
    S.translate(px0, py0 + fl);
    S.jitter(1);
    S.rotate(s.lean);
    S.scale(K * Math.min(1.45, 1 / Math.pow(Math.max(0.3, sy), 0.8)), K * sy); // 擠壓時橫向變寬有上限，避免誇張動效下被壓成一張餅

    // ── 尾巴（在身後，與前進方向相反）：胖胖的 C 形，尖端淺色，上緣一道高光
    {
      const tw = -s.face;
      S.push();
      S.translate(tw * 28, -22);
      S.rotate(tw * (wag * 0.9 - airLag * 0.25));
      S.blob(pts(TAIL, tw), hood, { ...OL, shadow: false });
      if (det > 0.5) S.curve(pts([6, -2, 22, -8, 31, -22, 33, -38], tw), hoodLit, { w: 3.2, cap: 'round', alpha: 0.75, shadow: false, hl: false, flat: true, drawOn: false });
      S.blob(pts(TAIL_TIP, tw), cream, { ...OL, hl: false, shadow: false });
      S.pop();
    }

    // ── 身體：比上一版大，只有最外面一條輪廓（不再畫內側的大腿線，會像第二條輪廓）；弧形高光；肚子一塊淺色
    S.blob(mochi(43, 31, -28, 2.4, 0.07), det > 0.5 ? hoodShade : hood, { ...OL, shadow: false });
    if (det > 0.5) {
      S.blob(pts(mochi(39, 27, -31, 2.4, 0.05), 1, -3), hood, { stroke: false, shadow: false, hl: false });
      S.blob(mochi(21, 14, -17, 2.2, 0), cream, { stroke: false, shadow: false, hl: false, flat: true });
    }
    if (det > 0.55) {
      for (const side of [-1, 1]) {
        S.curve([side * 33, -38, side * 35.5, -30, side * 33, -22], hoodLit, { w: 3, cap: 'round', alpha: 0.7, shadow: false, hl: false, flat: true, drawOn: false });
      }
    }

    // ── 腳：奶油色小橢圓，兩條趾線；騰空時往下伸直
    const fd = 5 * airLag;
    for (const side of [-1, 1]) {
      S.ellipse(side * 25, -7 + fd, 16.5, 10, cream, { ...OL, hl: false, shadow: false });
      if (det > 0.55) S.ellipse(side * 25 + side * 2, -3 + fd, 12, 4.5, creamShade, { alpha: 0.5, ...FLAT });
      if (det > 0.6) {
        S.line([side * 25 - 3.5, -2 + fd, side * 25 - 3.5, -6.5 + fd], ol, { w: 1.5, cap: 'round', drawOn: false });
        S.line([side * 25 + 3.5, -2 + fd, side * 25 + 3.5, -6.5 + fd], ol, { w: 1.5, cap: 'round', drawOn: false });
      }
    }

    // ══ 頭（以脖子為支點：慢半拍轉動、落地時壓扁）
    S.push();
    S.translate(0, NECK);
    S.rotate(-th * 0.55 + s.face * 0.035 - s.land * 0.05 * s.face);
    S.scale(1 + 0.06 * s.land + 0.03 * crouch, 1 - 0.08 * s.land - 0.03 * crouch);
    S.translate(0, -NECK);

    // 耳朵（頭後面，根部藏在頭裡）：輕微外張，騰空時往後甩、落地時彈動
    for (const side of [-1, 1]) {
      S.push();
      S.translate(side * 41, HY - 27);
      S.rotate(side * (0.32 + 0.16 * airLag) + th * 1.3 + s.land * Math.sin(s.land * 10) * 0.25 * side);
      S.blob(EAR, hood, { ...OL, shadow: false });
      if (det > 0.45) {
        S.blob(EAR_IN, pink, { stroke: false, shadow: false, hl: false, mode: 'flat' });
        if (det > 0.6) S.blob(EAR_IN.map((v, i) => (i % 2 ? v + 6 : v * 0.6)), darken(pink, 0.09), { stroke: false, shadow: false, hl: false, mode: 'flat', alpha: 0.75 });
      }
      S.pop();
    }

    // 頭頂小芽（身分標記）：偏一側，兩片葉子，跟隨擺動
    {
      const sx = 12;
      const sbase = HY - 41;
      const sw = th * 26 + wag * 4;
      const tipx = sx + sw;
      const tipy = sbase - 24;
      S.curve([sx, sbase + 4, sx + sw * 0.3, sbase - 14, tipx, tipy], ol, { w: 6.4, cap: 'round', shadow: false });
      S.curve([sx, sbase + 4, sx + sw * 0.3, sbase - 14, tipx, tipy], 's', { w: 3, cap: 'round', shadow: false, hl: false });
      for (const side of [-1, 1]) {
        S.push();
        S.translate(tipx, tipy + 2);
        S.rotate(side * (0.95 + 0.25 * airLag) + th * 0.8);
        S.ellipse(side * 3, -8, 7.5, 12.5, 's', { ...OL, lw: 1.3, hl: false, shadow: false });
        S.pop();
      }
    }

    // 色塊一：整個頭輪廓先填淺色（陰影階→受光階），這是下半臉與輪廓的顏色
    S.blob(HEAD, det > 0.5 ? creamShade : cream, { stroke: false, shadow: false, hl: false, flat: det < 0.5 });
    if (det > 0.5) S.blob(pts(HEAD.map((v, i) => (i % 2 ? HY + (v - HY) * 0.9 : v * 0.94)), 1, -2.5, -4.5), cream, { stroke: false, shadow: false, hl: false, flat: true });
    // 色塊二：深色頭罩——沿輪廓的頭頂弧，收口在眼睛高度；其餘部分被淺色眼周與口鼻蓋回去，只剩額頭中央一條與兩側
    const close = [48, HY + 8, 22, HY + 5, 0, HY + 3, -22, HY + 5, -48, HY + 8];
    S.blob([...HOOD_ARC, ...close], hood, { stroke: false, shadow: false, hl: false });
    if (det > 0.5) {
      // 頭頂的亮邊（參考圖頭頂有一道較淺的帶）與右側陰影
      S.curve(headArc(Math.PI + 0.55, Math.PI + 1.55, 0.25).map((v, i) => (i % 2 ? v + 4.5 : v * 0.93)), hoodLit, { w: 4, cap: 'round', alpha: 0.85, shadow: false, hl: false, flat: true, drawOn: false });
      S.curve(headArc(TAU - 0.95, TAU + 0.2, 0.25).map((v, i) => (i % 2 ? v + (i > 0 ? 1.5 : 0) : v * 0.93)), hoodShade, { w: 5, cap: 'round', alpha: 0.9, shadow: false, hl: false, flat: true, drawOn: false });
    }
    // 淺色眼周（兩個大圓）與口鼻區：蝴蝶形
    for (const side of [-1, 1]) S.blob(mochi(24, 22, EYE + 4, 2.2, 0).map((v, i) => (i % 2 ? v : v + side * 30)), cream, { stroke: false, shadow: false, hl: false, flat: det < 0.5 });
    S.blob(mochi(40, 24, HY + 17, 2.3, 0.05), cream, { stroke: false, shadow: false, hl: false, flat: det < 0.5 });
    // 下巴下緣的陰影階（讓淺色區有厚度，參考圖在這裡有一道淡紫灰）
    if (det > 0.55) S.curve([-38, HY + 36, -16, HY + 40.5, 16, HY + 40.5, 38, HY + 36], creamShade, { w: 3.6, cap: 'round', alpha: 0.6, shadow: false, hl: false, flat: true, drawOn: false });
    // 輪廓線最後畫：把所有色塊的邊收乾淨
    S.blob(HEAD, null, { ...OL, shadow: false });

    // 臉：眼睛（黑橢圓＋高光）、淡粉腮紅、鼻子、嘴
    const blink = Math.max(bump(0.01, 0.055, u), bump(0.49, 0.535, u));
    const look = s.face * 3.5;
    const happy = clamp(s.air * 1.6);
    const squint = clamp(s.land * 1.8 + crouch * 0.6);
    for (const side of [-1, 1]) {
      const ex = side * 29 + look;
      if (det < 0.45) {
        S.ellipse(ex, EYE, 5.5, 7.5, 'ink', { stroke: false, hl: false, shadow: false });
      } else if (happy > 0.45) {
        S.curve([ex - 9.5, EYE + 4, ex, EYE - 7, ex + 9.5, EYE + 4], ol, { w: 4.2, cap: 'round' });
      } else if (squint > 0.55 || blink > 0.6) {
        S.curve([ex - 8.5, EYE - 1, ex, EYE + 4.5, ex + 8.5, EYE - 1], ol, { w: 3.8, cap: 'round' });
      } else {
        S.ellipse(ex, EYE, 8.8, 10.4, pal.ink, { stroke: false, hl: false, shadow: false, mode: 'flat' });
        S.circle(ex - 2.9, EYE - 3.7, 3.4, 'light', { ...FLAT });
        if (det > 0.6) S.circle(ex + 3, EYE + 4.2, 1.5, 'light', { ...FLAT, alpha: 0.85 });
      }
    }
    if (det > 0.45) {
      S.ellipse(-50 + look * 0.4, HY + 12, 9, 5.5, pink, { alpha: 0.95, ...FLAT });
      S.ellipse(50 + look * 0.4, HY + 12, 9, 5.5, pink, { alpha: 0.95, ...FLAT });
    }
    const nx = look * 0.7;
    const ny = HY + 9;
    if (det > 0.55) S.ellipse(nx + 1, ny + 3.2, 6.2, 3, creamShade, { alpha: 0.8, ...FLAT });
    S.blob([nx - 6.5, ny - 3, nx, ny - 4.5, nx + 6.5, ny - 3, nx + 4, ny + 2.5, nx, ny + 4.5, nx - 4, ny + 2.5], ol, { stroke: false, hl: false, shadow: false, mode: 'flat' });
    const open = clamp(s.air * 1.5 + s.land * 0.5) * (1 + mv.exag * 0.5);
    if (open > 0.2) {
      const W = 13 + 5 * open;
      const H = 8 + 9 * open;
      const my = ny + 8;
      // 張開的嘴：上緣平、兩端微微上翹，下緣圓（參考圖的笑嘴），舌頭在下緣
      S.blob([nx - W - 2, my - 3, nx - W * 0.55, my + 0.5, nx, my + 1, nx + W * 0.55, my + 0.5, nx + W + 2, my - 3, nx + W * 0.85, my + H * 0.6, nx, my + H, nx - W * 0.85, my + H * 0.6], ol, { stroke: false, hl: false, shadow: false, mode: 'flat' });
      if (det > 0.5) {
        S.ellipse(nx, my + H * 0.82, W * 0.5, H * 0.34, mix(pink, pal.a, 0.35), { ...FLAT });
        if (det > 0.65) S.line([nx, my + H * 0.6, nx, my + H * 0.95], darken(pink, 0.2), { w: 1.4, cap: 'round', drawOn: false });
      }
    } else {
      S.line([nx, ny + 4.5, nx, ny + 8], ol, { w: 2.4, cap: 'round', drawOn: false });
      S.curve([nx - 11, ny + 7, nx - 5.5, ny + 14, nx, ny + 8], ol, { w: 2.7, cap: 'round' });
      S.curve([nx, ny + 8, nx + 5.5, ny + 14, nx + 11, ny + 7], ol, { w: 2.7, cap: 'round' });
    }
    S.pop(); // 頭

    // ── 前爪：奶油色小橢圓（有陰影階與趾線），平時收在胸前、起跳時舉高到身側、落地甩動
    const armUp = clamp(s.air * 1.2 + airLag * 0.4);
    for (const side of [-1, 1]) {
      S.push();
      S.translate(side * (27 + 22 * armUp), -26 - 14 * armUp);
      S.rotate(side * (0.12 - 1.5 * armUp) + side * Math.sin(TAU * u * 6) * 0.07 * fo + side * s.land * Math.sin(s.land * 11) * 0.3);
      S.ellipse(0, 8, 10.5, 13, cream, { ...OL, hl: false, shadow: false });
      if (det > 0.55) S.ellipse(side * 2.5, 11.5, 7.5, 6.5, creamShade, { alpha: 0.55, ...FLAT });
      if (det > 0.6) {
        S.line([-2.7, 13, -2.7, 18.5], ol, { w: 1.5, cap: 'round', drawOn: false });
        S.line([2.7, 13, 2.7, 18.5], ol, { w: 1.5, cap: 'round', drawOn: false });
      }
      S.pop();
    }
    S.pop();
  },
};
