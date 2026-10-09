// 主體：彈跳球——動畫入門的經典練習。高度逐次衰減，觸地擠壓、下落拉伸、滾動旋轉。
import type { Cue } from '../../audio/types';
import type { MotionCtx } from '../motion';
import type { Env } from '../env';
import { clamp, lerp } from '../util';
import { contactShadow, ground, type Subject } from './types';

export const G = 112;
export const R = 26;
export const H0 = 205;
const HS = [140, 88, 50, 24, 9];
export const ACTIVE = 0.88;

export interface Seg {
  a: number;
  b: number;
  h: number;
  half: boolean;
}
export const SEGS: Seg[] = (() => {
  const dur = [Math.sqrt(H0), ...HS.map((h) => 2 * Math.sqrt(h))];
  const total = dur.reduce((s, d) => s + d, 0);
  const out: Seg[] = [];
  let acc = 0;
  dur.forEach((d, i) => {
    const a = (acc / total) * ACTIVE;
    acc += d;
    out.push({ a, b: (acc / total) * ACTIVE, h: i === 0 ? H0 : HS[i - 1], half: i === 0 });
  });
  return out;
})();

export function height(M: MotionCtx, u: number): number {
  for (const s of SEGS) {
    if (u >= s.a && u <= s.b) {
      const w = (u - s.a) / (s.b - s.a);
      if (s.half) return s.h * (1 - lerp(w * w, M.in(w), M.mv.easeW));
      const par = 4 * w * (1 - w);
      const e = w < 0.5 ? M.out(w * 2) : M.out(2 - w * 2);
      return s.h * Math.max(0, lerp(par, e, M.mv.easeW));
    }
  }
  return 0;
}
export function xpos(M: MotionCtx, u: number, env: Env): number {
  const X = env.Wu / 2 + 40;
  const p = lerp(u, M.io(u), 0.25 * (1 - clamp(M.mv.arc)));
  return -X + 2 * X * p;
}

export const ball: Subject = {
  id: 'ball',
  name: '彈跳球',
  en: 'Bouncing Ball',
  desc: '動畫入門經典：逐次衰減的彈跳弧線、觸地擠壓、下落拉伸與滾動，最能看出緩動與間距。',
  loop: 2.4,
  key: 0.2,
  hero: 0.12,
  events: (env) => {
    const fakeM = { mv: { arc: 1 }, io: (x: number) => x } as unknown as MotionCtx;
    return SEGS.map((s) => ({ u: s.b, x: xpos(fakeM, s.b, env), y: G, k: clamp(Math.sqrt((s.half ? H0 : s.h) / H0) * 1.2) }));
  },
  cues(M, env) {
    return this.events(env).map<Cue>((e) => ({ u: e.u, kind: 'bounce', k: e.k ?? 0.6 }));
  },
  track(M, env) {
    return [M.snap(xpos(M, M.u, env)), G - R - M.snap(height(M, M.u))];
  },
  draw(S, M, env) {
    const mv = M.mv;
    const u = M.u;
    ground(S, env, G);
    const x = M.snap(xpos(M, u, env));
    const y = M.snap(height(M, u));
    const e = 0.004;
    const vx = (xpos(M, u, env) - xpos(M, Math.max(0, u - e), env)) / e;
    const vy = (height(M, u) - height(M, Math.max(0, u - e))) / e;
    const hk = clamp(y / H0);
    contactShadow(S, x, G + 1, R * (1.4 - 0.7 * hk), 6 * (1 - 0.5 * hk), 1 - 0.6 * hk);

    // 觸地擠壓
    let squash = 0;
    for (const s of SEGS) {
      const d = Math.abs(u - s.b);
      const w = 0.03;
      if (d < w) squash = Math.max(squash, (1 - d / w) * Math.sqrt(s.h / H0) * (s.half ? 1 : 0.9));
    }
    const ex = 1 + mv.exag * 0.7;
    const sq = mv.squash * ex;
    const speed = Math.hypot(vx, vy);
    const stretch = sq * 0.38 * clamp(speed / 900) * (1 - squash);

    S.push();
    S.translate(x, G - y);
    S.jitter(2);
    if (squash > 0.01) {
      const k = 1 - sq * 0.5 * squash;
      S.scale(1 / Math.pow(Math.max(0.3, k), 0.85), k);
    }
    S.translate(0, -R);
    if (stretch > 0.005) S.stretch(0, 0, stretch, Math.atan2(-vy, vx));
    const rot = (x / R) * (1 - mv.rigid * 0.5);
    S.rotate(rot);
    S.circle(0, 0, R, 'p');
    S.circle(R * 0.48, 0, R * 0.3, 'a', { hl: false, lw: 0.7 });
    S.circle(-R * 0.48, 0, R * 0.18, 'light', { hl: false, lw: 0.7 });
    S.pop();
  },
};
