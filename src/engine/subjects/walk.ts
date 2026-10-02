// 主體：走路循環。正向運動學腿部、對側擺臂、身體上下起伏、頭部延遲、圍巾跟隨；
// 橡皮管風格會變成無關節的麵條手腳，剪紙風格會變成帶鉚釘的剛性關節。
import type { Cue } from '../../audio/types';
import { darken } from '../color';
import type { MotionCtx } from '../motion';
import { TAU, clamp, wrap } from '../util';
import type { Subject } from './types';
import { contactShadow, ground } from './types';

const G = 122;
const TH = 46;
const SH = 46;
const UA = 34;
const FA = 30;
const STRIDE = 85;

function legAngles(ph: number, M: MotionCtx) {
  const ex = 1 + M.mv.exag * 0.6 + M.mv.noodle * 0.4;
  const th = 0.48 * ex * Math.sin(ph);
  const kn = 0.12 + 0.95 * ex * Math.max(0, Math.cos(ph));
  return { th, kn };
}
function ankleOff(a: { th: number; kn: number }): [number, number] {
  return [TH * Math.sin(a.th) + SH * Math.sin(a.th - a.kn), TH * Math.cos(a.th) + SH * Math.cos(a.th - a.kn)];
}
function phaseOf(M: MotionCtx, u: number) {
  return TAU * u * 2;
}
function hipY(M: MotionCtx, u: number) {
  const ph = phaseOf(M, u);
  const a = ankleOff(legAngles(ph, M));
  const b = ankleOff(legAngles(ph + Math.PI, M));
  return G - Math.max(a[1], b[1]) - 5;
}

export const walk: Subject = {
  id: 'walk',
  name: '走路循環',
  en: 'Walk Cycle',
  desc: '經典走路循環：接觸、下壓、經過、上升四個姿勢，對側擺臂、頭部延遲與圍巾跟隨。',
  loop: 2.2,
  key: 0.125,
  hero: 0.06,
  events: () => [
    { u: 0.125, x: 40, y: G, k: 0.5 },
    { u: 0.375, x: 40, y: G, k: 0.5 },
    { u: 0.625, x: 40, y: G, k: 0.5 },
    { u: 0.875, x: 40, y: G, k: 0.5 },
  ],
  cues() {
    return [0.125, 0.375, 0.625, 0.875].map<Cue>((u, i) => ({ u, kind: 'step', k: i % 2 ? 0.5 : 0.65 }));
  },
  track(M) {
    const hy = hipY(M, M.u);
    return [6, hy - 70 - 30];
  },
  draw(S, M, env) {
    const mv = M.mv;
    const u = M.u;
    const ph = phaseOf(M, u);
    ground(S, env, G);
    // 地面刻度向後捲動
    const span = env.Wu + STRIDE * 4;
    const shift = u * STRIDE * 4;
    for (let i = 0; i < Math.ceil(span / STRIDE) + 1; i++) {
      const x = wrap(i * STRIDE - shift, Math.ceil(span / STRIDE) * STRIDE) - span / 2;
      S.line([x, G + 26, x + 26, G + 26], 'ink', { w: 3, alpha: 0.35, drawOn: false });
    }
    contactShadow(S, 4, G + 1, 52, 7, 0.9);

    const hy = hipY(M, u);
    const lag = 0.03 + 0.05 * mv.follow;
    const hy2 = hipY(M, wrap(u - lag, 1));
    const lean = 0.07 + 0.05 * mv.exag;
    const hip: [number, number] = [0, hy];
    const neck: [number, number] = [hip[0] + Math.sin(lean) * 72, hip[1] - Math.cos(lean) * 72];
    const noodle = mv.noodle > 0.3;
    const rigid = mv.rigid > 0.4;

    const limb = (a: [number, number], b: [number, number], c: [number, number], col: string, w: number, far: boolean, id: number) => {
      const color = far ? darken(S.col(col), 0.14) : col;
      if (noodle) {
        const mx = (a[0] + c[0]) / 2 + (b[0] - (a[0] + c[0]) / 2) * 1.6;
        const my = (a[1] + c[1]) / 2 + (b[1] - (a[1] + c[1]) / 2) * 1.6;
        S.curve([a[0], a[1], mx, my, c[0], c[1]], color, { w: w * 0.8, outlined: true });
      } else if (rigid) {
        S.line([a[0], a[1], b[0], b[1]], color, { w, cap: 'round', outlined: true });
        S.line([b[0], b[1], c[0], c[1]], color, { w: w * 0.92, cap: 'round', outlined: true });
        S.circle(a[0], a[1], 3, 'ink', { mode: 'flat', stroke: false, hl: false });
        S.circle(b[0], b[1], 3, 'ink', { mode: 'flat', stroke: false, hl: false });
      } else {
        S.line([a[0], a[1], b[0], b[1], c[0], c[1]], color, { w, cap: 'round', outlined: true });
      }
      void id;
    };
    const leg = (p: number, far: boolean, id: number) => {
      const a = legAngles(p, M);
      const knee: [number, number] = [hip[0] + TH * Math.sin(a.th), hip[1] + TH * Math.cos(a.th)];
      const ank: [number, number] = [knee[0] + SH * Math.sin(a.th - a.kn), knee[1] + SH * Math.cos(a.th - a.kn)];
      limb(hip, knee, ank, 's', 15, far, id);
      const toe = Math.max(0, -Math.sin(p)) * 0.5 * Math.max(0, Math.cos(p - Math.PI));
      S.push();
      S.translate(ank[0], Math.min(G - 3, ank[1] + 4));
      S.rotate(-toe * 0.6);
      S.ellipse(8, 0, 16, 7, far ? darken(S.pal.ink, -0.08) : 'ink', { hl: false });
      S.pop();
    };
    const arm = (p: number, far: boolean, id: number) => {
      const ex = 1 + mv.exag * 0.6 + mv.noodle * 0.5;
      const al = -0.55 * ex * Math.sin(p);
      const be = -(0.35 + 0.35 * Math.max(0, Math.sin(p))) * ex;
      const sh: [number, number] = [neck[0], neck[1] + 8];
      const el: [number, number] = [sh[0] + UA * Math.sin(al), sh[1] + UA * Math.cos(al)];
      const ha: [number, number] = [el[0] + FA * Math.sin(al - be), el[1] + FA * Math.cos(al - be)];
      limb(sh, el, ha, 'p', 12, far, id);
      S.circle(ha[0], ha[1], 7, far ? darken(S.pal.a, 0.12) : 'a', { hl: false });
    };

    S.push();
    S.jitter(1);
    // 遠側
    arm(ph, true, 1);
    leg(ph + Math.PI, true, 2);
    // 軀幹
    S.line([hip[0], hip[1], neck[0], neck[1]], 'p', { w: 32, cap: 'round', outlined: true });
    // 圍巾（跟隨 + 風）
    const sc: number[] = [];
    for (let k = 0; k < 6; k++) {
      const wave = Math.sin(TAU * (u * 4) - k * 0.9) * (1.5 + k * 2.6) * (0.4 + mv.follow) + mv.wind * k * 3;
      sc.push(neck[0] - 4 - k * 13, neck[1] + 6 + wave + k * 2 - mv.wind * k * 2);
    }
    S.curve(sc, 'a', { w: 9, outlined: true });
    // 近側
    leg(ph, false, 3);
    arm(ph + Math.PI, false, 4);
    // 頭（延遲跟隨）
    const hd = (hy2 - hy) * 0.6 * clamp(mv.follow + 0.2);
    const hx = neck[0] + 6;
    const hyy = neck[1] - 30 + hd;
    S.circle(hx, hyy, 25, 'a');
    S.circle(hx + 10, hyy - 3, 3.2, 'ink', { mode: 'flat', stroke: false, hl: false });
    S.curve([hx + 4, hyy + 9, hx + 11, hyy + 12, hx + 17, hyy + 8], 'ink', { w: 2.4 });
    S.pop();
  },
};
