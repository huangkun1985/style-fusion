// 主體：小怪獸跳躍。展示預備動作、擠壓拉伸、弧線、跟隨動作（觸角）、次要動作（手臂）、眨眼。
import type { Cue } from '../../audio/types';
import type { MotionCtx } from '../motion';
import { TAU, bump, clamp, fract, lerp } from '../util';
import { contactShadow, ground, type Subject } from './types';

export const MASCOT_RX = 62;
export const MASCOT_RY = 56;
const G = 105;
const RX = MASCOT_RX;
const RY = MASCOT_RY;
export const HOPS = [
  { h0: 0.06, h1: 0.48, x0: -70, x1: 70 },
  { h0: 0.54, h1: 0.96, x0: 70, x1: -70 },
];

export interface St {
  x: number;
  y: number;
  sy: number;
  lean: number;
  air: number;
  land: number;
  face: number;
}

function hopState(M: MotionCtx, v: number, x0: number, x1: number): St {
  const mv = M.mv;
  const dir = Math.sign(x1 - x0);
  const ex = 1 + mv.exag * 0.8;
  const H = (112 + 34 * mv.exag) * (1 - 0.38 * mv.heavy);
  const crouchEnd = 0.2 + 0.08 * mv.heavy;
  const airEnd = 0.72;
  if (v < crouchEnd) {
    const c = M.io(v / crouchEnd);
    return { x: x0, y: 0, sy: 1 - (0.08 + 0.3 * mv.antic) * c * ex * (0.35 + 0.65 * Math.min(1, mv.squash + 0.2)), lean: -0.14 * mv.antic * c * dir, air: 0, land: 0, face: dir };
  }
  if (v < airEnd) {
    const w = (v - crouchEnd) / (airEnd - crouchEnd);
    const xp = lerp(M.io(w), w, clamp(mv.arc));
    const par = 4 * w * (1 - w);
    const eased = w < 0.5 ? M.out(w * 2) : M.out(2 - w * 2);
    const y = H * lerp(par, eased, mv.easeW);
    const spd = Math.abs(1 - 2 * w);
    return {
      x: x0 + (x1 - x0) * xp,
      y: Math.max(0, y),
      sy: 1 + 0.34 * mv.squash * ex * Math.pow(spd, 1.6),
      lean: 0.16 * dir * (0.5 - w) * 2 * ex,
      air: Math.sin(Math.PI * w),
      land: 0,
      face: dir,
    };
  }
  const w = (v - airEnd) / (1 - airEnd);
  const ov = mv.over;
  const imp = Math.exp(-w * (7 - 3 * Math.min(1, ov))) * Math.cos(w * Math.PI * (1.3 + 2.4 * Math.min(1, ov)));
  return { x: x1, y: 0, sy: 1 - 0.34 * mv.squash * ex * imp * (1 + mv.heavy * 0.5), lean: 0.06 * dir * imp, air: 0, land: Math.exp(-w * 4), face: dir };
}

/** 角色的跳躍姿態（設計單位）；2D 與 3D 角色共用 */
export function mascotPose(M: MotionCtx, u: number): St {
  for (const h of HOPS) {
    if (u >= h.h0 && u <= h.h1) return hopState(M, (u - h.h0) / (h.h1 - h.h0), h.x0, h.x1);
  }
  const x = u < HOPS[0].h0 || u > HOPS[1].h1 ? -70 : 70;
  const face = u < HOPS[0].h0 || u > HOPS[1].h1 ? 1 : -1;
  return { x, y: 0, sy: 1 + 0.018 * Math.sin(TAU * u * 4), lean: 0, air: 0, land: 0, face };
}

export const mascot: Subject = {
  id: 'mascot',
  name: '角色跳躍',
  en: 'Mascot Hop',
  desc: '小怪獸左右跳躍：預備蹲下、拉伸起跳、弧線騰空、落地擠壓與觸角跟隨。',
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
    ground(S, env, G);
    const hk = clamp(s.y / 140);
    const fl = M.fl(1, 6);
    contactShadow(S, M.snap(s.x), G + 1, RX * (1 - 0.45 * hk), 8.5 * (1 - 0.4 * hk), 1 - 0.55 * hk);

    // 跟隨動作：觸角取「稍早」的身體狀態
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

    const det = S.look.detail;
    const noodle = mv.noodle;
    // 腳
    const fd = 7 * airLag;
    S.ellipse(-24, -5 + fd, 15, 9, 's', { hl: false });
    S.ellipse(24, -5 + fd, 15, 9, 's', { hl: false });

    // 手臂（次要動作）
    const armUp = clamp(s.air * 1.2 + airLag * 0.4);
    for (const side of [-1, 1]) {
      if (noodle > 0.3) {
        const sw = Math.sin(TAU * (u * 4 + (side > 0 ? 0.5 : 0))) * 18 * noodle;
        const bx = side * (RX - 6);
        const by = -RY * 1.02;
        const ex = side * (RX + 26);
        const ey = by + 24 - armUp * 60 + sw;
        S.curve([bx, by, side * (RX + 22) + sw * 0.4, by - 10 - armUp * 10, ex, ey], 'ink', { w: 5 });
        S.circle(ex, ey, 8.5, 'light', { hl: false });
      } else {
        S.push();
        S.translate(side * (RX * 0.9), -RY * 0.98);
        S.rotate(side * (0.35 + 1.7 * armUp) + side * Math.sin(TAU * u * 6) * 0.08 * fo);
        S.ellipse(0, 14, 9, 17, 'p', { hl: false });
        S.pop();
      }
    }

    // 觸角
    const bx = 0;
    const by = -RY * 2 + 6;
    const len = 34;
    const tipx = bx + Math.sin(th) * len;
    const tipy = by - Math.cos(th) * len;
    const midx = bx + Math.sin(th * 0.45) * len * 0.55;
    const midy = by - Math.cos(th * 0.45) * len * 0.55;
    S.curve([bx, by + 6, midx, midy, tipx, tipy], 'ink', { w: 3.6 });
    S.circle(tipx, tipy, 7.5, 'a');

    // 身體
    S.ellipse(0, -RY, RX, RY, 'p');
    if (det > 0.75) S.ellipse(0, -RY * 0.55, RX * 0.58, RY * 0.36, 'light', { alpha: 0.28, stroke: false, shadow: false, hl: false, mode: 'flat' });

    // 臉
    const blink = Math.max(bump(0.01, 0.055, u), bump(0.49, 0.535, u));
    const look = s.face * 3.5;
    const ey = -RY - 8;
    if (det < 0.45) {
      S.circle(-17 + look, ey, 5, 'ink', { stroke: false, hl: false });
      S.circle(17 + look, ey, 5, 'ink', { stroke: false, hl: false });
    } else {
      for (const side of [-1, 1]) {
        S.ellipse(side * 18 + look * 0.4, ey, 11, 13 * (1 - 0.9 * blink), 'light', { hl: false, shadow: false, lw: 0.7 });
        if (blink < 0.6) {
          S.circle(side * 18 + look, ey + 1.5, 6.2, 'ink', { stroke: false, hl: false, shadow: false });
          S.circle(side * 18 + look - 2, ey - 2, 2.1, 'light', { stroke: false, hl: false, shadow: false, mode: 'flat' });
        }
      }
      S.ellipse(-33, -RY + 8, 9, 5.5, 'a', { alpha: 0.55, stroke: false, shadow: false, hl: false, mode: 'flat' });
      S.ellipse(33, -RY + 8, 9, 5.5, 'a', { alpha: 0.55, stroke: false, shadow: false, hl: false, mode: 'flat' });
    }
    const open = clamp(s.air * 1.4) * (1 + mv.exag);
    if (open > 0.15) S.ellipse(look * 0.5, -RY + 15, 6 + 2 * open, 4 + 4.5 * open, 'ink', { stroke: false, hl: false, shadow: false, mode: 'flat' });
    else S.curve([-10 + look * 0.4, -RY + 12, look * 0.4, -RY + 19, 10 + look * 0.4, -RY + 12], 'ink', { w: 3 });
    S.pop();
  },
};
