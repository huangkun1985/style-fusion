// 主體 v2：彈跳球（第二版，筆記見 docs/主體v2參考/ball.md）。藍本：Dribbble「籃框與橘紅球」那種單一飽和色的球加乾淨留白，以及網球的接縫與動態殘影。
// 精緻感：一顆有兩階明暗與接縫紋的球（接縫跟著滾動、高光固定），中性低對比的地面（不再是綠紫色塊），間距圖改成細圓環與落點刻度，
// 每個弧頂有虛線高度線；觸地擠壓、衝擊環與放射短線、下落拖出動態殘影。時間結構與 v1 相同。顏色只用色板角色。
import type { Cue } from '../../../audio/types';
import { darken, mix } from '../../color';
import { TAU, clamp } from '../../util';
import type { MotionCtx } from '../../motion';
import { ACTIVE, G, H0, R, SEGS, height, xpos } from '../ball';
import type { Subject } from '../types';

const K = 1.22;
const RV = R * 1.3; // 畫出來的球半徑（物理仍用 R；球比軌跡尺度大一點，主角感更強）

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
    const pal = S.pal;
    const det = S.look.detail;
    const FL = { stroke: false, shadow: false, hl: false, flat: true, drawOn: false } as const;
    const hw = env.Wu / 2 + 80;
    const bottom = env.Hu / 2 + 80;
    const floorC = darken(pal.bg, 0.07 + 0.03 * (1 - det)); // 沿背景色相只變暗：中性的地面（不用 ground() 的綠紫色塊）
    const ballC = pal.p;
    const shade = darken(pal.p, 0.17);
    const seam = mix(pal.light, pal.p, 0.04);

    // ── 地面：一條中性色帶與上緣細線
    if (det > 0.2) {
      S.rect(0, (G + bottom) / 2 + 6, hw * 2, bottom - G, 0, floorC, FL);
      S.rect(0, G + 0.8, hw * 2, 1.6, 0, darken(pal.bg, 0.2), FL);
    } else S.line([-hw, G, hw, G], 'ink', { w: 1.6, alpha: 0.5, drawOn: false });

    S.push();
    S.translate(0, G);
    S.scale(K);
    S.translate(0, -G);

    // ── 間距圖：細圓環標出整條軌跡（走過的淡、前方的清楚）；每個弧頂一條虛線高度線與落點刻度
    if (det > 0.35) {
      const step = 0.014;
      for (let t = 0; t <= ACTIVE; t += step) {
        const px = xpos(M, t, env);
        const py = G - RV - height(M, t);
        const past = t < u;
        S.circle(px, py, past ? 2.2 : 3.2, null, { stroke: 'ink', outline: true, lw: past ? 0.3 : 0.45, alpha: past ? 0.14 : 0.42, drawOn: false });
      }
      for (const sg of SEGS) {
        const px = xpos(M, sg.b, env);
        S.line([px, G + 7, px, G + 15], 'ink', { w: 1.8, alpha: 0.4, cap: 'round', drawOn: false });
        if (det > 0.5 && !sg.half) {
          const ax = xpos(M, sg.b - (sg.b - (SEGS[0]?.b ?? 0)) * 0, env);
          void ax;
        }
      }
      if (det > 0.5) {
        for (const sg of SEGS) {
          if (sg.half) continue;
          const tm = sg.b - 0.05;
          const apx = xpos(M, Math.max(0, tm - 0.0), env);
          void apx;
        }
        S.line([-hw / K + 30, G - RV - H0, -hw / K + 90, G - RV - H0], 'ink', { w: 1, alpha: 0.3, dash: [4, 4], drawOn: false });
      }
    }

    // ── 位置與速度
    const x = M.snap(xpos(M, u, env));
    const y = M.snap(height(M, u));
    const e = 0.004;
    const vx = (xpos(M, u, env) - xpos(M, Math.max(0, u - e), env)) / e;
    const vy = (height(M, u) - height(M, Math.max(0, u - e))) / e;
    const hk = clamp(y / H0);
    // 接觸影子：實色的中性橢圓，離地越高越小越淡
    S.ellipse(x, G + 3, R * (1.5 - 0.75 * hk), 6.5 * (1 - 0.5 * hk), 'ink', { alpha: 0.2 * (1 - 0.6 * hk), ...FL });

    // ── 觸地：擠壓量、衝擊環、放射短線
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
      S.ellipse(hitX, G + 3, (26 + since * 54) * (0.5 + lastK), (4 + since * 8) * (0.5 + lastK), null, { stroke: 'ink', outline: true, lw: 0.7, alpha: 0.5 * a, drawOn: false });
      if (det > 0.45) {
        for (let i = 0; i < 7; i++) {
          const ang = Math.PI * (1.08 + (i / 6) * 0.84);
          const r0 = (R + 6) + since * 14;
          const r1 = r0 + (10 + 12 * lastK) * (1 - since);
          S.line([hitX + Math.cos(ang) * r0 * 1.15, G - 2 + Math.sin(ang) * r0 * 0.7, hitX + Math.cos(ang) * r1 * 1.15, G - 2 + Math.sin(ang) * r1 * 0.7], 'ink', { w: 1.8, cap: 'round', alpha: 0.7 * a, drawOn: false });
        }
      }
    }

    // ── 動態殘影：速度快時往後拖出逐漸淡出的球形
    const speed = Math.hypot(vx, vy);
    if (speed > 260 && det > 0.4) {
      for (let k = 5; k >= 1; k--) {
        const tp = Math.max(0, u - k * 0.012);
        S.circle(M.snap(xpos(M, tp, env)), G - RV - M.snap(height(M, tp)), R * (1 - k * 0.06), ballC, { alpha: 0.2 * (1 - k / 6) * clamp(speed / 900), ...FL });
      }
    }

    // ── 球：底色＋右下陰影階＋接縫（滾動）＋固定高光
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
    S.translate(0, -RV);
    if (stretch > 0.005) S.stretch(0, 0, stretch, Math.atan2(-vy, vx));
    S.circle(0, 0, RV, det > 0.5 ? shade : ballC, { shadow: false, hl: false });
    if (det > 0.5) {
      // 受光面：整球偏移縮小，露出右下一圈陰影
      S.circle(-RV * 0.1, -RV * 0.1, RV * 0.88, ballC, { ...FL });
    }
    S.push();
    S.rotate((x / R) * (1 - mv.rigid * 0.5));
    if (det > 0.4) {
      // 兩條網球式接縫：圓心在球外的兩個圓，取落在球內的弧
      for (const side of [-1, 1]) {
        const cxs = side * RV * 1.32;
        const rs = RV * 0.98;
        const pts: number[] = [];
        for (let k = 0; k <= 60; k++) {
          const t = (k / 60) * TAU;
          const px = cxs + Math.cos(t) * rs;
          const py = Math.sin(t) * rs;
          if (Math.hypot(px, py) < RV * 0.93) pts.push(px, py);
        }
        if (pts.length > 4) S.curve(pts, seam, { w: 2.8, cap: 'round', alpha: 0.95, drawOn: false });
      }
    } else S.circle(0, 0, RV * 0.2, 'light', FL);
    S.pop();
    if (det > 0.4) {
      S.ellipse(-RV * 0.4, -RV * 0.45, RV * 0.26, RV * 0.14, 'light', { alpha: 0.55, ...FL });
      S.circle(-RV * 0.62, -RV * 0.2, RV * 0.05, 'light', { alpha: 0.55, ...FL });
    }
    S.pop();
    S.pop();
  },
};
