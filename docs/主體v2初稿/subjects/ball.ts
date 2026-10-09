// 主體 v2：彈跳球。把「動畫入門練習」做成一張好看的間距圖：整條彈跳軌跡用小圓點標出（間距一目了然），
// 球是三色風車紋，會隨位移滾動；下落時拖出殘影、觸地擠壓並濺起水花與衝擊環，球體上有固定的高光。
import type { Cue } from '../../../audio/types';
import { clamp } from '../../util';
import type { MotionCtx } from '../../motion';
import { ACTIVE, G, H0, R, SEGS, height, xpos } from '../ball';
import { contactShadow, ground, type Subject } from '../types';

const K = 1.22;

export const ball2: Subject = {
  id: 'ball',
  name: '彈跳球',
  en: 'Bouncing Ball',
  desc: '動畫入門經典：逐次衰減的彈跳弧線與間距圖、觸地擠壓、下落拉伸殘影與滾動，最能看出緩動與間距。',
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
    const det = S.look.detail;
    ground(S, env, G);

    S.push();
    S.translate(0, G);
    S.scale(K);
    S.translate(0, -G);

    // ── 間距圖：整條軌跡用小圓點標出；已經走過的淡化，前方的清楚（像動畫師的 spacing chart）
    if (det > 0.35) {
      const step = 0.011;
      for (let t = 0; t <= ACTIVE; t += step) {
        const px = xpos(M, t, env);
        const py = G - R - height(M, t);
        const past = t < u;
        S.circle(px, py, past ? 1.8 : 2.4, 'ink', { alpha: past ? 0.12 : 0.38, stroke: false, shadow: false, hl: false, flat: true, drawOn: false });
      }
      // 每次落點的刻度
      for (const sg of SEGS) {
        const px = xpos(M, sg.b, env);
        S.line([px, G + 8, px, G + 16], 'ink', { w: 2, alpha: 0.35, cap: 'round', drawOn: false });
      }
    }

    // ── 位置與速度
    const x = M.snap(xpos(M, u, env));
    const y = M.snap(height(M, u));
    const e = 0.004;
    const vx = (xpos(M, u, env) - xpos(M, Math.max(0, u - e), env)) / e;
    const vy = (height(M, u) - height(M, Math.max(0, u - e))) / e;
    const hk = clamp(y / H0);
    contactShadow(S, x, G + 1, R * (1.4 - 0.7 * hk), 6 * (1 - 0.5 * hk), 1 - 0.6 * hk);

    // ── 觸地：擠壓量、衝擊環、水花
    let squash = 0;
    let since = 9;
    let lastK = 0;
    let hitX = 0;
    for (const sg of SEGS) {
      const d = Math.abs(u - sg.b);
      const w = 0.03;
      const kk = Math.sqrt(sg.h / H0) * (sg.half ? 1 : 0.9);
      if (d < w) squash = Math.max(squash, (1 - d / w) * kk);
      const sp = u - sg.b;
      if (sp >= 0 && sp < 0.09) {
        since = sp / 0.09;
        lastK = kk;
        hitX = xpos(M, sg.b, env);
      }
    }
    if (since < 1 && det > 0.3) {
      const a = (1 - since) * (1 - since);
      S.ellipse(hitX, G + 2, (28 + since * 52) * (0.5 + lastK), (5 + since * 9) * (0.5 + lastK), null, { stroke: 'ink', outline: true, lw: 0.9, alpha: 0.55 * a, drawOn: false });
      for (let i = 0; i < 6; i++) {
        const dir = i < 3 ? -1 : 1;
        const k = (i % 3) + 1;
        const px = hitX + dir * (10 + since * 34 * k);
        const py = G - Math.sin(Math.PI * since) * 26 * k * 0.5 * (0.5 + lastK);
        S.circle(px, py, (3.2 - since * 1.5) * (0.6 + lastK), i % 2 ? 's' : 'a', { alpha: 0.9 * a, stroke: false, shadow: false, hl: false, flat: true, drawOn: false });
      }
    }

    // ── 殘影：下落與上升時留下逐漸淡出的球影
    const speed = Math.hypot(vx, vy);
    if (speed > 260 && det > 0.4) {
      for (let k = 4; k >= 1; k--) {
        const tp = Math.max(0, u - k * 0.014);
        S.circle(M.snap(xpos(M, tp, env)), G - R - M.snap(height(M, tp)), R * (1 - k * 0.07), 'p', { alpha: 0.16 * (1 - k / 5) * clamp(speed / 900), stroke: false, shadow: false, hl: false, flat: true, drawOn: false });
      }
    }

    // ── 球
    const ex = 1 + mv.exag * 0.7;
    const sq = mv.squash * ex;
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
    S.push();
    S.rotate((x / R) * (1 - mv.rigid * 0.5));
    S.circle(0, 0, R, 'p');
    // 三片風車紋（跟著球滾動）
    for (let i = 0; i < 3; i++) {
      const a0 = (i * 2 * Math.PI) / 3;
      const pts: number[] = [0, 0];
      for (let k = 0; k <= 10; k++) {
        const a = a0 + (k / 10) * (Math.PI / 3);
        pts.push(Math.cos(a) * R * 0.97, Math.sin(a) * R * 0.97);
      }
      S.poly(pts, i === 0 ? 's' : i === 1 ? 'a' : 'light', { hl: false, shadow: false, stroke: false, flat: true });
    }
    S.circle(0, 0, R * 0.2, 'ink', { hl: false, shadow: false, stroke: false, flat: true });
    S.pop();
    // 固定在左上的高光（不跟著滾動）
    if (det > 0.4) S.ellipse(-R * 0.38, -R * 0.42, R * 0.3, R * 0.17, 'light', { alpha: 0.6, stroke: false, shadow: false, hl: false, flat: true, drawOn: false });
    S.pop();
    S.pop();
  },
};
