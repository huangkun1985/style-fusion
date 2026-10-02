// 主體：風景視差。遠山、中景丘陵、近景樹木以不同速度平移（可無縫循環），太陽、雲、飛鳥。
import type { Cue } from '../../audio/types';
import { darken, mix } from '../color';
import { TAU, clamp, hash, wrap } from '../util';
import type { Subject } from './types';

const PF = 240;
const PM = 480;
const PN = 960;
type Amp = [number, number, number];
const FAR: Amp[] = [
  [1, 34, 0.4],
  [2, 18, 1.9],
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

export const landscape: Subject = {
  id: 'landscape',
  name: '風景視差',
  en: 'Parallax Landscape',
  desc: '多層視差風景：遠山、丘陵、樹林以不同速度移動，太陽升落、雲朵飄移、飛鳥振翅。',
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

    // 太陽
    const sunY = -env.Hu * 0.22 + 18 * Math.cos(TAU * u);
    const sunX = env.Wu * 0.24;
    if (det > 0.6) {
      S.push();
      S.translate(sunX, sunY);
      S.rotate(TAU * u * 0.25);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU;
        S.line([Math.cos(a) * 46, Math.sin(a) * 46, Math.cos(a) * 58, Math.sin(a) * 58], 'a', { w: 3.5, alpha: 0.7 });
      }
      S.pop();
    }
    S.circle(sunX, sunY, 34, 'a');

    // 雲
    for (let i = 0; i < 3; i++) {
      const span = env.Wu + 300;
      const x = wrap(hash(i, 81) * span - u * span * (i === 1 ? 2 : 1), span) - span / 2;
      const y = -env.Hu * 0.32 + hash(i, 82) * 60;
      S.push();
      S.translate(x, y);
      S.scale(0.8 + hash(i, 83) * 0.5);
      S.blob([-46, 10, -30, -8, -10, -18, 14, -20, 34, -8, 48, 10, 20, 16, -20, 16], 'light', { hl: false, alpha: 0.95 });
      S.pop();
    }

    const poly = (P0: number, base: number, amps: Amp[], shift: number) => {
      const pts: number[] = [-hw, bottom];
      for (let x = -hw; x <= hw; x += 10) pts.push(x, ridge(x + shift, P0, base, amps));
      pts.push(hw, bottom);
      return pts;
    };
    // 遠山
    const sf = u * PF * k;
    S.poly(poly(PF, -10, FAR, sf), mix(P.r, P.bg, 0.45), { hl: false, shadow: false });
    // 中景
    const sm = u * PM * k;
    S.poly(poly(PM, 58, MID, sm), darken(P.q, 0.12), { hl: false, shadow: false });
    // 小屋（中景）
    for (let t = -2; t <= 2; t++) {
      const wx = 150 + t * PM;
      const x = wx - sm;
      if (x < -hw - 40 || x > hw + 40) continue;
      const y = ridge(wx, PM, 58, MID);
      S.push();
      S.translate(x, y);
      S.rect(0, -12, 34, 26, 2, 'light');
      S.poly([-22, -24, 0, -44, 22, -24], 'p');
      S.rect(0, -6, 8, 14, 1, 'r', { hl: false });
      S.pop();
    }
    // 近景
    const sn = u * PN * k;
    S.poly(poly(PN, 112, NEAR, sn), P.q, { hl: false, shadow: false });
    for (let t = -1; t <= 2; t++) {
      for (let i = 0; i < 7; i++) {
        const wx = i * (PN / 7) + 40 + t * PN;
        const x = wx - sn;
        if (x < -hw - 40 || x > hw + 40) continue;
        const y = ridge(wx, PN, 112, NEAR) + 4;
        const sway = mv.wind * 7 * Math.sin(TAU * (u * 3 + i * 0.17)) + M.fl(i + 40, 3);
        const s = 0.75 + hash(i, 91) * 0.5;
        S.push();
        S.translate(x, y);
        S.jitter(50 + i);
        S.scale(s);
        S.rect(0, -14, 8, 30, 2, 'r', { hl: false });
        if (i % 2) S.poly([sway, -86, 26 + sway * 0.5, -22, -26 + sway * 0.5, -22], darken(P.q, 0.22));
        else S.circle(sway, -46, 24, darken(P.q, 0.16));
        S.pop();
      }
    }

    // 飛鳥
    for (let i = 0; i < 3; i++) {
      const span = env.Wu + 200;
      const x = wrap(hash(i, 71) * span - u * span, span) - span / 2 + i * 24;
      const y = -70 + Math.sin(TAU * u * 2 + i) * 10 + i * 14;
      const f = Math.sin(TAU * (u * 12 + i * 0.3));
      S.line([x - 11, y - 6 * f, x, y + 2, x + 11, y - 6 * f], 'ink', { w: 2.4 });
    }
  },
};
