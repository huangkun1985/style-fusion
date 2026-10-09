// 主體 v2：跳跳豆。重新設計的角色跳躍——豆形身體（下寬上窄）、大眼睛加高光與眉毛（會隨動作變表情）、
// 肚皮與腮紅、小手小腳、發光的觸角；落地有塵土與衝擊環，騰空有星屑。動作沿用 v1 的跳躍姿態（預備、拉伸、落地擠壓、跟隨），
// 所以所有動效風格與音效提示點照舊可用。
import type { Cue } from '../../../audio/types';
import { bump, clamp, fract, TAU } from '../../util';
import { HOPS, MASCOT_RX, MASCOT_RY, mascotPose } from '../mascot';
import { contactShadow, ground, type Subject } from '../types';

const G = 118;
const K = 1.3; // 角色在畫面中的放大倍率（以地面接觸點為中心），讓主角佔畫面約 45% 高度
const RX = MASCOT_RX * 0.98;
const RY = MASCOT_RY * 1.08;

/** 豆形身體的輪廓：下半較寬、上半較窄，輕微不對稱讓它有「重量」 */
function beanPts(rx: number, ry: number, cy: number, squashK = 0): number[] {
  const pts: number[] = [];
  const n = 14;
  for (let i = 0; i < n; i++) {
    const th = (i / n) * TAU;
    const s = Math.sin(th);
    const c = Math.cos(th);
    const w = 1 + 0.085 * s - 0.03 * c * c * (1 - s) + squashK * 0.04 * s;
    const h = 1 - 0.035 * c * c * (1 + s);
    pts.push(c * rx * w, cy + s * ry * h);
  }
  return pts;
}

export const mascot2: Subject = {
  id: 'mascot',
  name: '角色跳躍',
  en: 'Mascot Hop',
  desc: '跳跳豆左右跳躍：預備蹲下、拉伸起跳、落地擠壓揚起塵土；大眼睛與眉毛隨動作變表情，觸角與手臂跟隨擺動。',
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
    return [M.snap(s.x), G - M.snap(s.y) - RY * s.sy];
  },
  draw(S, M, env) {
    const mv = M.mv;
    const u = M.u;
    const s = mascotPose(M, u);
    const fo = mv.follow;
    const det = S.look.detail;
    ground(S, env, G);

    // ── 背景襯景：後方一個大圓盤與幾個緩慢漂浮的小圖形，讓畫面有層次（顏色全部取自色板角色）
    if (det > 0.3) {
      S.circle(0, G - 118, 128, 'bg2', { alpha: 0.38, stroke: false, shadow: false, hl: false, flat: true, drawOn: false });
      const fl2 = (i: number) => Math.sin(TAU * (u * (1 + (i % 2)) + i * 0.27));
      S.circle(-165 + fl2(0) * 6, G - 150 + fl2(1) * 9, 9, null, { stroke: 's', outline: true, lw: 1.3, drawOn: false });
      S.circle(158 + fl2(2) * 7, G - 118 + fl2(3) * 8, 6, 'a', { stroke: false, shadow: false, hl: false, flat: true, drawOn: false });
      const px = -118 + fl2(4) * 5;
      const py = G - 205 + fl2(5) * 7;
      S.line([px - 7, py, px + 7, py], 'p', { w: 3, cap: 'round', alpha: 0.9, drawOn: false });
      S.line([px, py - 7, px, py + 7], 'p', { w: 3, cap: 'round', alpha: 0.9, drawOn: false });
      S.poly([140, G - 192, 147, G - 182, 140, G - 172, 133, G - 182], 'q', { stroke: false, shadow: false, hl: false, flat: true, alpha: 0.9, drawOn: false });
    }

    S.push();
    S.translate(0, G);
    S.scale(K);
    S.translate(0, -G);
    const hk = clamp(s.y / 140);
    const fl = M.fl(1, 6);
    contactShadow(S, M.snap(s.x), G + 1, RX * (1.02 - 0.42 * hk), 9 * (1 - 0.4 * hk), 1 - 0.55 * hk);

    // ── 落地的塵土與衝擊環（畫在角色後面）
    const hit = HOPS.map((h) => {
      const t = h.h0 + 0.72 * (h.h1 - h.h0);
      const d = fract(u - t + 1);
      return { x: h.x1, d: d / 0.2, dir: Math.sign(h.x1 - h.x0) };
    }).find((e) => e.d >= 0 && e.d < 1);
    if (hit && det > 0.3) {
      const k = hit.d;
      const a = (1 - k) * (1 - k);
      S.alpha *= 1;
      for (const side of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          const r = (6 + i * 3.4) * (0.6 + k * 1.1);
          const x = hit.x + side * (22 + k * (30 + i * 16)) + side * i * 4;
          const y = G - 4 - k * (8 + i * 5);
          S.circle(x, y, r, 'light', { alpha: 0.85 * a, stroke: false, shadow: false, hl: false, flat: true, drawOn: false });
        }
      }
      S.ellipse(hit.x, G + 2, 40 + k * 64, 7 + k * 9, null, { stroke: 'ink', outline: true, lw: 0.9, alpha: 0.5 * a, drawOn: false });
    }

    // ── 跟隨：觸角與手臂取「稍早」的身體狀態
    const lag = 0.03 + 0.05 * fo;
    const s2 = mascotPose(M, fract(u - lag + 1));
    let th = (s2.x - s.x) * 0.012 * fo - s.lean * 0.9 * fo;
    th += s.land * 0.5 * fo * Math.sin(s.land * 9);
    th += mv.wind * 0.3 * Math.sin(TAU * u * 3);
    th += mv.float * 0.08 * Math.sin(TAU * u * 2);
    const airLag = s2.air;

    S.push();
    S.translate(M.snap(s.x), G - M.snap(s.y) + fl);
    S.jitter(1);
    S.rotate(s.lean);
    const sy = s.sy;
    S.scale(1 / Math.pow(Math.max(0.3, sy), 0.8), sy);

    // ── 腳
    const fd = 7 * airLag;
    for (const side of [-1, 1]) {
      S.ellipse(side * 25, -6 + fd, 17, 10, 's', { hl: false });
      if (det > 0.6) S.ellipse(side * 25 + side * 4, -9 + fd, 7, 3, 'light', { alpha: 0.5, stroke: false, shadow: false, hl: false, flat: true });
    }

    // ── 手臂（次要動作：起跳舉高、落地甩動）
    const armUp = clamp(s.air * 1.2 + airLag * 0.4);
    for (const side of [-1, 1]) {
      S.push();
      S.translate(side * (RX * 0.93), -RY * 1.0);
      S.rotate(side * (0.55 + 1.55 * armUp) + side * Math.sin(TAU * u * 6) * 0.07 * fo + side * s.land * Math.sin(s.land * 11) * 0.3);
      S.ellipse(0, 13, 10, 18, 'p', { hl: false });
      S.circle(0, 28, 7.5, 'light', { hl: false, shadow: false });
      S.pop();
    }

    // ── 觸角：兩節弧線加發光燈泡
    const bx = 0;
    const by = -RY * 2 + 10;
    const len = 38;
    const tipx = bx + Math.sin(th) * len;
    const tipy = by - Math.cos(th) * len;
    const midx = bx + Math.sin(th * 0.45) * len * 0.55;
    const midy = by - Math.cos(th * 0.45) * len * 0.55;
    S.curve([bx, by + 8, midx, midy, tipx, tipy], 'ink', { w: 3.4 });
    const pulse = 1 + 0.08 * Math.sin(TAU * u * 4) + s.land * 0.25;
    if (det > 0.5) S.circle(tipx, tipy, 12 * pulse, 'a', { alpha: 0.25, stroke: false, shadow: false, hl: false, flat: true });
    S.circle(tipx, tipy, 7.8 * pulse, 'a');
    if (det > 0.6) S.circle(tipx - 2.4, tipy - 2.6, 2.4, 'light', { stroke: false, shadow: false, hl: false, flat: true });

    // ── 身體
    S.blob(beanPts(RX, RY, -RY, clamp(1 - sy)), 'p');
    if (det > 0.55) {
      S.ellipse(0, -RY * 0.42, RX * 0.56, RY * 0.4, 'light', { alpha: 0.42, stroke: false, shadow: false, hl: false, mode: 'flat' });
      S.ellipse(-RX * 0.42, -RY * 1.56, RX * 0.2, RY * 0.12, 'light', { alpha: 0.55, stroke: false, shadow: false, hl: false, mode: 'flat' });
    }

    // ── 臉：大眼睛、眉毛、腮紅、嘴
    const blink = Math.max(bump(0.01, 0.055, u), bump(0.49, 0.535, u));
    const look = s.face * 4;
    const ey = -RY * 1.24;
    const crouch = clamp(1 - sy) * 3;
    if (det < 0.45) {
      S.circle(-18 + look, ey, 5.5, 'ink', { stroke: false, hl: false });
      S.circle(18 + look, ey, 5.5, 'ink', { stroke: false, hl: false });
    } else {
      for (const side of [-1, 1]) {
        const ex = side * 21;
        S.ellipse(ex + look * 0.4, ey, 13.5, 16.5 * (1 - 0.92 * blink), 'light', { hl: false, shadow: false, lw: 0.75 });
        if (blink < 0.6) {
          S.ellipse(ex + look, ey + 2, 8.4, 10.4, 'ink', { stroke: false, hl: false, shadow: false });
          S.circle(ex + look - 3, ey - 3, 3.1, 'light', { stroke: false, hl: false, shadow: false, mode: 'flat' });
          S.circle(ex + look + 3, ey + 5, 1.5, 'light', { stroke: false, hl: false, shadow: false, mode: 'flat', alpha: 0.9 });
        }
        // 眉毛：騰空上揚、預備與落地時壓低
        const brow = -(s.air * 8) + crouch * 1.2 + s.land * 3;
        const tilt = side * (-0.1 + 0.28 * clamp(s.land + (1 - sy) * 2));
        S.curve([ex - 10, ey - 24 + brow + tilt * 14, ex, ey - 27 + brow, ex + 10, ey - 24 + brow - tilt * 14], 'ink', { w: 3 });
      }
      S.ellipse(-RX * 0.56, -RY * 1.0, 10, 6, 'a', { alpha: 0.6, stroke: false, shadow: false, hl: false, mode: 'flat' });
      S.ellipse(RX * 0.56, -RY * 1.0, 10, 6, 'a', { alpha: 0.6, stroke: false, shadow: false, hl: false, mode: 'flat' });
    }
    const open = clamp(s.air * 1.4 + s.land * 0.6) * (1 + mv.exag);
    const my = -RY * 0.88;
    if (open > 0.15) {
      S.ellipse(look * 0.5, my + 2, 7 + 2.6 * open, 5 + 5 * open, 'ink', { stroke: false, hl: false, shadow: false, mode: 'flat' });
      if (det > 0.6) S.ellipse(look * 0.5, my + 6 + 3 * open, 4 + open, 2 + open, 'p', { stroke: false, hl: false, shadow: false, mode: 'flat', alpha: 0.9 });
    } else S.curve([-11 + look * 0.4, my - 1, look * 0.4, my + 7, 11 + look * 0.4, my - 1], 'ink', { w: 3.2 });
    S.pop();

    // ── 騰空時身後的星屑（沿軌跡落下、淡出）
    if (s.air > 0.08 && det > 0.45) {
      for (let i = 0; i < 4; i++) {
        const w = fract(u * 6 + i * 0.25);
        const px = M.snap(s.x) - s.face * (28 + i * 20) + Math.sin(i * 2.1) * 8;
        const py = G - M.snap(s.y) - RY * 1.1 + w * 34;
        const r = (3.2 + (i % 2) * 1.8) * (1 - w) * s.air;
        S.poly([px, py - r * 1.6, px + r * 0.5, py - r * 0.5, px + r * 1.6, py, px + r * 0.5, py + r * 0.5, px, py + r * 1.6, px - r * 0.5, py + r * 0.5, px - r * 1.6, py, px - r * 0.5, py - r * 0.5], i % 2 ? 'a' : 'light', { alpha: 0.9 * (1 - w), stroke: false, shadow: false, hl: false, flat: true, drawOn: false });
      }
    }
    S.pop();
  },
};
