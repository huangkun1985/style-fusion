// 主體 v2：走路循環。一個有個性的角色：戴毛帽、背小背包、圍著飄動的圍巾，穿連帽衫與運動鞋；
// 動作用正向運動學（接觸、下壓、經過、上升四個姿勢），對側擺臂、頭部延遲、圍巾與帽球跟隨；
// 背景是三層（遠處雲、中景灌木、近景草叢與路面刻度）以不同速度後退，腳落地時揚起小塵土。
import type { Cue } from '../../../audio/types';
import { darken } from '../../color';
import type { MotionCtx } from '../../motion';
import { TAU, clamp, hash, wrap } from '../../util';
import { contactShadow, ground, type Subject } from '../types';

const G = 126;
const TH = 46;
const SH = 46;
const UA = 33;
const FA = 29;
const STRIDE = 85;
const K = 1.08;

function legAngles(ph: number, M: MotionCtx) {
  const ex = 1 + M.mv.exag * 0.6 + M.mv.noodle * 0.4;
  const th = 0.48 * ex * Math.sin(ph);
  const kn = 0.12 + 0.95 * ex * Math.max(0, Math.cos(ph));
  return { th, kn };
}
function ankleOff(a: { th: number; kn: number }): [number, number] {
  return [TH * Math.sin(a.th) + SH * Math.sin(a.th - a.kn), TH * Math.cos(a.th) + SH * Math.cos(a.th - a.kn)];
}
const phaseOf = (u: number) => TAU * u * 2;
function hipY(M: MotionCtx, u: number) {
  const ph = phaseOf(u);
  const a = ankleOff(legAngles(ph, M));
  const b = ankleOff(legAngles(ph + Math.PI, M));
  return G - Math.max(a[1], b[1]) - 5;
}

export const walk2: Subject = {
  id: 'walk',
  name: '走路循環',
  en: 'Walk Cycle',
  desc: '戴毛帽、背背包的角色在三層景深前走路：接觸、下壓、經過、上升四個姿勢，對側擺臂、圍巾與帽球跟隨，落腳揚起塵土。',
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
    return [6, hipY(M, M.u) - 110];
  },
  draw(S, M, env) {
    const mv = M.mv;
    const u = M.u;
    const ph = phaseOf(u);
    const det = S.look.detail;
    const hw = env.Wu / 2 + 60;
    ground(S, env, G);

    // ── 遠景：緩慢飄過的雲（每圈剛好繞一整圈，所以可以無縫循環）
    if (det > 0.3) {
      const span = env.Wu + 320;
      for (let i = 0; i < 3; i++) {
        const x = wrap(hash(i, 5) * span - u * span, span) - span / 2;
        const y = -env.Hu * 0.3 + hash(i, 6) * 54;
        S.push();
        S.translate(x, y);
        S.scale(0.8 + hash(i, 7) * 0.5);
        S.blob([-44, 10, -28, -8, -8, -17, 14, -18, 32, -8, 46, 10, 20, 15, -20, 15], 'light', { hl: false, alpha: 0.9, stroke: false, shadow: false, flat: true, drawOn: false });
        S.pop();
      }
    }
    // ── 中景：灌木（半速後退，間距剛好等於一圈位移）
    const midP = STRIDE * 2;
    const midShift = u * midP;
    for (let i = -1; i < Math.ceil((hw * 2) / midP) + 2; i++) {
      const x = -hw + i * midP - midShift + hash(i % 7, 11) * 30;
      const s = 0.8 + hash(i % 5, 12) * 0.4;
      S.push();
      S.translate(x, G - 4);
      S.scale(s);
      S.blob([-34, 0, -30, -20, -12, -34, 8, -36, 28, -26, 36, -4, 30, 0], 'q', { hl: false, alpha: 0.55, stroke: false, shadow: false, flat: true, drawOn: false });
      S.pop();
    }
    // ── 近景：路面刻度與草叢（與腳底同速）
    const span = env.Wu + STRIDE * 4;
    const shift = u * STRIDE * 4;
    for (let i = 0; i < Math.ceil(span / STRIDE) + 1; i++) {
      const x = wrap(i * STRIDE - shift, Math.ceil(span / STRIDE) * STRIDE) - span / 2;
      S.line([x, G + 26, x + 26, G + 26], 'ink', { w: 3, alpha: 0.3, drawOn: false, cap: 'round' });
      if (i % 3 === 1 && det > 0.4) {
        for (const o of [-5, 0, 5]) S.line([x + o, G + 6, x + o * 1.7, G - 4 - (o === 0 ? 5 : 0)], 'q', { w: 3, alpha: 0.85, cap: 'round', drawOn: false });
      }
    }
    contactShadow(S, 4, G + 1, 54, 7, 0.9);

    S.push();
    S.translate(0, G);
    S.scale(K);
    S.translate(0, -G);

    const hy = hipY(M, u);
    const lag = 0.03 + 0.05 * mv.follow;
    const hy2 = hipY(M, wrap(u - lag, 1));
    const lean = 0.07 + 0.05 * mv.exag;
    const hip: [number, number] = [0, hy];
    const neck: [number, number] = [hip[0] + Math.sin(lean) * 70, hip[1] - Math.cos(lean) * 70];
    const noodle = mv.noodle > 0.3;
    const rigid = mv.rigid > 0.4;

    const limb = (a: [number, number], b: [number, number], c: [number, number], col: string, w: number, far: boolean) => {
      const color = far ? darken(S.col(col), 0.16) : col;
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
    };
    const leg = (p: number, far: boolean) => {
      const a = legAngles(p, M);
      const knee: [number, number] = [hip[0] + TH * Math.sin(a.th), hip[1] + TH * Math.cos(a.th)];
      const ank: [number, number] = [knee[0] + SH * Math.sin(a.th - a.kn), knee[1] + SH * Math.cos(a.th - a.kn)];
      limb(hip, knee, ank, 's', 16, far);
      const toe = Math.max(0, -Math.sin(p)) * 0.5 * Math.max(0, Math.cos(p - Math.PI));
      S.push();
      S.translate(ank[0], Math.min(G - 4, ank[1] + 3));
      S.rotate(-toe * 0.6);
      S.ellipse(8, 0, 17, 8.5, far ? darken(S.pal.ink, -0.08) : 'ink', { hl: false });
      if (det > 0.5) S.ellipse(10, 2.8, 15, 2.4, 'light', { alpha: far ? 0.5 : 0.8, stroke: false, shadow: false, hl: false, flat: true, drawOn: false });
      S.pop();
      // 落腳的塵土
      const c = Math.cos(p);
      if (c < -0.8 && det > 0.35 && !far) {
        const k = (-c - 0.8) / 0.2;
        S.circle(ank[0] - 8, G - 2 - k * 3, 4 * (1 - k * 0.3), 'light', { alpha: 0.55 * k, stroke: false, shadow: false, hl: false, flat: true, drawOn: false });
      }
    };
    const arm = (p: number, far: boolean) => {
      const ex = 1 + mv.exag * 0.6 + mv.noodle * 0.5;
      const al = -0.55 * ex * Math.sin(p);
      const be = -(0.35 + 0.35 * Math.max(0, Math.sin(p))) * ex;
      const sh: [number, number] = [neck[0] - 2, neck[1] + 10];
      const el: [number, number] = [sh[0] + UA * Math.sin(al), sh[1] + UA * Math.cos(al)];
      const ha: [number, number] = [el[0] + FA * Math.sin(al - be), el[1] + FA * Math.cos(al - be)];
      limb(sh, el, ha, 'p', 13, far);
      S.circle(ha[0], ha[1], 7.5, far ? darken(S.col('light'), 0.12) : 'light', { hl: false });
    };

    S.push();
    S.jitter(1);
    // 遠側的手與腿
    arm(ph + Math.PI, true);
    leg(ph + Math.PI, true);
    // 背包（在軀幹後面，隨身體起伏稍微延遲）
    const bk = (hy2 - hy) * 0.5;
    S.push();
    S.translate(hip[0] - 22, (hip[1] + neck[1]) / 2 - 2 + bk);
    S.rotate(-0.1);
    S.rect(0, 0, 26, 44, 9, 's');
    S.rect(-2, 6, 14, 14, 5, 'a', { hl: false, shadow: false });
    S.pop();
    // 軀幹（連帽衫）
    S.line([hip[0], hip[1], neck[0], neck[1]], 'p', { w: 36, cap: 'round', outlined: true });
    if (det > 0.5) {
      S.line([hip[0] + 1, hip[1] - 4, hip[0] + Math.sin(lean) * 8 + 1, hip[1] - Math.cos(lean) * 8], 'light', { w: 36, cap: 'butt', alpha: 0.55, drawOn: false });
      const px = hip[0] + Math.sin(lean) * 26 + 6;
      const py = hip[1] - Math.cos(lean) * 26;
      S.rect(px, py, 18, 12, 5, 'ink', { alpha: 0.18, stroke: false, shadow: false, hl: false, flat: true, drawOn: false });
    }
    // 圍巾（跟隨 + 風）
    const sc: number[] = [];
    for (let k = 0; k < 7; k++) {
      const wave = Math.sin(TAU * (u * 4) - k * 0.9) * (1.5 + k * 2.6) * (0.4 + mv.follow) + mv.wind * k * 3;
      sc.push(neck[0] - 4 - k * 12.5, neck[1] + 5 + wave + k * 2 - mv.wind * k * 2);
    }
    S.curve(sc, 'a', { w: 9.5, outlined: true });
    S.circle(neck[0] + 2, neck[1] + 3, 11, 'a', { hl: false });
    // 近側的腿與手
    leg(ph, false);
    arm(ph, false);

    // ── 頭（延遲跟隨）：圓臉、毛帽與帽球、大眼睛、腮紅
    const hd = (hy2 - hy) * 0.6 * clamp(mv.follow + 0.2);
    const hx = neck[0] + 6;
    const hyy = neck[1] - 30 + hd;
    S.circle(hx, hyy, 26, 'light');
    // 毛帽
    const cap: number[] = [];
    for (let k = 0; k <= 12; k++) {
      const a = Math.PI + (k / 12) * Math.PI;
      cap.push(hx + Math.cos(a) * 28, hyy - 4 + Math.sin(a) * 26);
    }
    S.poly(cap, 'a');
    S.rect(hx - 1, hyy - 3, 56, 9, 4, 'p', { hl: false });
    const swing = Math.sin(TAU * (u * 4 - 0.15)) * 3 + (hy2 - hy) * 0.5;
    S.circle(hx - 16 - swing, hyy - 36 + Math.abs(swing) * 0.6, 8, 'light');
    // 臉
    S.ellipse(hx + 11, hyy + 4, 5.4, 6.8, 'ink', { mode: 'flat', stroke: false, hl: false, shadow: false });
    S.circle(hx + 13, hyy + 1.4, 1.8, 'light', { mode: 'flat', stroke: false, hl: false, shadow: false });
    S.curve([hx + 5, hyy - 7, hx + 12, hyy - 10, hx + 19, hyy - 8], 'ink', { w: 2.4 });
    S.ellipse(hx + 17, hyy + 12, 6.5, 4, 'a', { alpha: 0.55, stroke: false, shadow: false, hl: false, mode: 'flat', drawOn: false });
    S.curve([hx + 6, hyy + 12, hx + 12, hyy + 17, hx + 19, hyy + 12], 'ink', { w: 2.4 });
    S.pop();
    S.pop();
  },
};
