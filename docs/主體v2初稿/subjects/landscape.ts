// 主體 v2：風景視差。五層景深——帶光暈的太陽與分層的雲、遠山（有雪頂與稜線亮面）、
// 中景丘陵（松林與冒著炊煙的小屋）、薄霧、近景山丘（大樹、松樹與野花）——以不同速度後退並可無縫循環；
// 空氣透視：越遠越接近背景色、越淡；飛鳥排成人字隊形振翅。
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

    // ── 太陽：光暈三圈、旋轉的光芒、圓盤
    const sunY = -env.Hu * 0.2 + 18 * Math.cos(TAU * u);
    const sunX = env.Wu * 0.24;
    if (det > 0.4) {
      for (let i = 3; i >= 1; i--) S.circle(sunX, sunY, 34 + i * 20, 'a', { alpha: 0.1, stroke: false, shadow: false, hl: false, flat: true, drawOn: false });
    }
    if (det > 0.6) {
      S.push();
      S.translate(sunX, sunY);
      S.rotate(TAU * u * 0.25);
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * TAU;
        const r1 = 46;
        const r2 = i % 2 ? 56 : 66;
        S.line([Math.cos(a) * r1, Math.sin(a) * r1, Math.cos(a) * r2, Math.sin(a) * r2], 'a', { w: 3.2, alpha: 0.75, cap: 'round', drawOn: false });
      }
      S.pop();
    }
    S.circle(sunX, sunY, 34, 'a');

    // ── 雲：兩層（前後速度不同，後面的較淡）
    for (let i = 0; i < 4; i++) {
      const span = env.Wu + 320;
      const front = i % 2 === 0;
      const x = wrap(hash(i, 81) * span - u * span * (front ? 1 : 2), span) - span / 2;
      const y = -env.Hu * 0.34 + hash(i, 82) * 66;
      S.push();
      S.translate(x, y);
      S.scale((front ? 1 : 0.7) * (0.8 + hash(i, 83) * 0.5));
      S.blob([-50, 10, -34, -10, -12, -20, 14, -22, 36, -10, 52, 10, 22, 17, -22, 17], 'light', { hl: false, alpha: front ? 0.95 : 0.6, stroke: false, shadow: false, flat: true, drawOn: false });
      S.blob([-24, 14, -14, 2, 4, -4, 22, 4, 34, 14, 8, 18], mix(P.light, P.bg2, 0.4), { hl: false, alpha: front ? 0.5 : 0.3, stroke: false, shadow: false, flat: true, drawOn: false });
      S.pop();
    }

    const poly = (P0: number, base: number, amps: Amp[], shift: number) => {
      const pts: number[] = [-hw, bottom];
      for (let x = -hw; x <= hw; x += 10) pts.push(x, ridge(x + shift, P0, base, amps));
      pts.push(hw, bottom);
      return pts;
    };
    const farC = mix(P.r, P.bg, 0.55);
    const midC = mix(darken(P.q, 0.06), P.bg, 0.25);

    // ── 遠山：空氣透視色、稜線亮面與雪頂
    const sf = u * PF * k;
    S.poly(poly(PF, -8, FAR, sf), farC, { hl: false, shadow: false });
    if (det > 0.5) {
      for (let x = -hw; x <= hw; x += 10) {
        const y0 = ridge(x + sf, PF, -8, FAR);
        const yl = ridge(x - 8 + sf, PF, -8, FAR);
        const yr = ridge(x + 8 + sf, PF, -8, FAR);
        if (y0 < yl - 0.5 && y0 < yr - 0.5 && y0 < -34) {
          const c = [x - 20, ridge(x - 20 + sf, PF, -8, FAR), x, y0, x + 20, ridge(x + 20 + sf, PF, -8, FAR), x + 10, y0 + 11, x, y0 + 7, x - 11, y0 + 13];
          S.poly(c, 'light', { hl: false, shadow: false, alpha: 0.9, stroke: false, flat: true, drawOn: false });
        }
      }
    }

    // ── 薄霧
    if (det > 0.4) {
      const mx = wrap(u * 360, 720) - 360;
      S.ellipse(mx, 46, 300, 16, 'light', { alpha: 0.22, stroke: false, shadow: false, hl: false, flat: true, drawOn: false });
      S.ellipse(mx + 720, 46, 300, 16, 'light', { alpha: 0.22, stroke: false, shadow: false, hl: false, flat: true, drawOn: false });
    }

    // ── 中景：丘陵、松林、小屋與炊煙
    const sm = u * PM * k;
    S.poly(poly(PM, 60, MID, sm), midC, { hl: false, shadow: false });
    for (let t = -2; t <= 3; t++) {
      for (let i = 0; i < 6; i++) {
        const wx = (i + hash(i, 61 + 0) * 0.4) * (PM / 6) + t * PM;
        const x = wx - sm;
        if (x < -hw - 30 || x > hw + 30) continue;
        const y = ridge(wx, PM, 60, MID) + 2;
        const s = 0.6 + hash(i, 62) * 0.35;
        S.push();
        S.translate(x, y);
        S.scale(s);
        S.poly([0, -40, 12, -16, -12, -16], darken(P.q, 0.28), { hl: false, shadow: false, stroke: false, flat: true });
        S.poly([0, -28, 15, -4, -15, -4], darken(P.q, 0.28), { hl: false, shadow: false, stroke: false, flat: true });
        S.pop();
      }
    }
    for (let t = -2; t <= 2; t++) {
      const wx = 150 + t * PM;
      const x = wx - sm;
      if (x < -hw - 40 || x > hw + 40) continue;
      const y = ridge(wx, PM, 60, MID);
      S.push();
      S.translate(x, y);
      S.rect(0, -12, 34, 26, 2, 'light');
      S.poly([-23, -24, 0, -46, 23, -24], 'p');
      S.rect(0, -6, 8, 14, 1, 'r', { hl: false });
      S.rect(12, -42, 6, 14, 1, 'r', { hl: false, shadow: false });
      if (det > 0.5) {
        for (let q = 0; q < 3; q++) {
          const w = (u * 3 + q / 3) % 1;
          S.circle(15 + w * 10 + Math.sin(w * 6) * 3, -50 - w * 30, 3 + w * 5, 'light', { alpha: 0.7 * (1 - w), stroke: false, shadow: false, hl: false, flat: true, drawOn: false });
        }
      }
      S.pop();
    }

    // ── 近景：山丘、大樹與松樹、野花
    const sn = u * PN * k;
    S.poly(poly(PN, 116, NEAR, sn), P.q, { hl: false, shadow: false });
    for (let t = -1; t <= 2; t++) {
      for (let i = 0; i < 8; i++) {
        const wx = i * (PN / 8) + 40 + t * PN;
        const x = wx - sn;
        if (x < -hw - 40 || x > hw + 40) continue;
        const y = ridge(wx, PN, 116, NEAR) + 4;
        const sway = mv.wind * 7 * Math.sin(TAU * (u * 3 + i * 0.17)) + M.fl(i + 40, 3);
        const s = 0.8 + hash(i, 91) * 0.5;
        S.push();
        S.translate(x, y);
        S.jitter(50 + i);
        S.scale(s);
        S.rect(0, -14, 9, 32, 2, 'r', { hl: false });
        if (i % 2) {
          S.poly([sway, -96, 22 + sway * 0.4, -52, -22 + sway * 0.4, -52], darken(P.q, 0.24));
          S.poly([sway, -76, 28 + sway * 0.5, -30, -28 + sway * 0.5, -30], darken(P.q, 0.2));
        } else {
          S.circle(sway, -50, 26, darken(P.q, 0.18));
          S.circle(sway - 14, -38, 17, darken(P.q, 0.14), { hl: false });
          S.circle(sway + 15, -40, 15, darken(P.q, 0.22), { hl: false });
        }
        S.pop();
      }
      if (det > 0.5) {
        for (let i = 0; i < 18; i++) {
          const wx = (i + hash(i, 95) * 0.8) * (PN / 18) + t * PN;
          const x = wx - sn;
          if (x < -hw - 20 || x > hw + 20) continue;
          const y = ridge(wx, PN, 116, NEAR) + 12 + hash(i, 96) * 10;
          S.circle(x, y, 2.6, i % 3 === 0 ? 'p' : i % 3 === 1 ? 'a' : 'light', { stroke: false, shadow: false, hl: false, flat: true, drawOn: false });
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
      S.line([x - 11, y - 6 * f, x, y + 2, x + 11, y - 6 * f], 'ink', { w: 2.3, cap: 'round', drawOn: false });
    }
  },
};
