// 主體 v2：抽象流動。一個有層次的生成式構圖：呼吸變形的三層核心（外殼淡、內核實），
// 背後一圈緩慢旋轉的刻度環，三條傾斜的軌道與帶拖尾的衛星，兩條交錯穿過畫面的流動緞帶，
// 底部疊起來的三層實心波浪，以及節奏性散落的十字與圓點；節拍動效會讓核心脈動。
import type { Cue } from '../../../audio/types';
import { TAU, hash } from '../../util';
import type { Subject } from '../types';

const CY = -14;

export const abstract2: Subject = {
  id: 'abstract',
  name: '抽象流動',
  en: 'Abstract Flow',
  desc: '生成式抽象構圖：三層呼吸變形的核心、旋轉刻度環、傾斜軌道與帶拖尾的衛星、交錯的流動緞帶與疊層波浪，適合看線條與節奏類風格。',
  loop: 5,
  key: 0.5,
  hero: 0.3,
  events: () => [
    { u: 0.0, x: 0, y: CY, k: 0.7 },
    { u: 0.5, x: 0, y: CY, k: 0.7 },
  ],
  cues() {
    return [
      { u: 0.0, kind: 'ping', k: 0.5 },
      { u: 0.5, kind: 'ping', k: 0.5 },
    ] as Cue[];
  },
  track(M) {
    const a = TAU * (M.u * 2 + 0.1);
    return [Math.cos(a) * 132, CY + Math.sin(a) * 132 * 0.45];
  },
  draw(S, M, env) {
    const u = M.u;
    const hw = env.Wu / 2;
    const det = S.look.detail;
    const beat = M.mv.beat * 12 * M.beat();

    // ── 底部波浪：三層實心，由後到前
    const waves: [string, number, number][] = [
      ['a', 150, 0.55],
      ['s', 166, 0.75],
      ['q', 184, 1],
    ];
    waves.forEach(([role, y0, al], k) => {
      const pts: number[] = [-hw - 10, env.Hu / 2 + 20];
      for (let x = -hw - 10; x <= hw + 10; x += 10) pts.push(x, y0 + 10 * Math.sin(x * 0.02 + TAU * u * (k + 1) + k * 1.3));
      pts.push(hw + 10, env.Hu / 2 + 20);
      S.poly(pts, role, { alpha: al, hl: false, shadow: false, stroke: false, flat: true, drawOn: false });
    });

    // ── 刻度環：36 條放射短線，緩慢旋轉，每 9 條一條長的
    if (det > 0.4) {
      S.push();
      S.translate(0, CY);
      S.rotate(TAU * u * 0.25);
      for (let i = 0; i < 36; i++) {
        const a = (i / 36) * TAU;
        const r0 = 178;
        const r1 = r0 + (i % 9 === 0 ? 16 : 7);
        S.line([Math.cos(a) * r0, Math.sin(a) * r0 * 0.62, Math.cos(a) * r1, Math.sin(a) * r1 * 0.62], 'ink', { w: i % 9 === 0 ? 2.4 : 1.4, alpha: 0.45, cap: 'round', drawOn: false });
      }
      S.pop();
    }

    // ── 流動緞帶（兩條，從左穿到右）
    for (let k = 0; k < 2; k++) {
      const pts: number[] = [];
      for (let x = -hw - 10; x <= hw + 10; x += 14) {
        const t = x / hw;
        pts.push(x, CY - 30 + (k ? 62 : -62) * Math.sin(t * 2.2 + TAU * u * (k ? -1 : 1) + k * 2) * 0.55 - 30 * Math.cos(t * 3.4 - TAU * u * 2));
      }
      S.curve(pts, k ? 'q' : 'a', { w: 4.5, alpha: 0.75, cap: 'round', drawOn: false });
    }

    // ── 核心：三層偏移相位的液滴
    const shell = (rad: number, ph: number, amp: number) => {
      const pts: number[] = [];
      const n = 14;
      for (let i = 0; i < n; i++) {
        const th = (i / n) * TAU;
        const r = rad + amp * Math.sin(3 * th + TAU * u + ph) + amp * 0.65 * Math.sin(5 * th - TAU * u * 2 + ph * 2) + beat;
        pts.push(Math.cos(th) * r, CY + Math.sin(th) * r);
      }
      return pts;
    };
    S.push();
    S.jitter(1);
    S.blob(shell(96, 1.2, 9), 'p', { alpha: 0.28, stroke: false, shadow: false, hl: false, flat: true, drawOn: false });
    S.blob(shell(78, 0.6, 10), 's', { alpha: 0.7 });
    S.blob(shell(58, 0, 9), 'p');
    S.circle(Math.cos(TAU * u) * 20 - 8, CY - 16 + Math.sin(TAU * u) * 9, 14, 'light', { alpha: 0.85, hl: false });
    S.circle(Math.cos(TAU * u + 2.6) * 24 + 10, CY + 20 + Math.sin(TAU * u + 2.6) * 8, 6, 'a', { hl: false });
    S.pop();

    // ── 傾斜的軌道與帶拖尾的衛星
    const orbits: [number, number, number, string, number, number][] = [
      [136, 0.5, 0.3, 's', 2, 9],
      [108, 0.46, -0.5, 'a', 3, 7],
      [196, 0.4, 0.15, 'q', 1, 6],
    ];
    orbits.forEach(([R, sq, tilt, role, cyc, r], i) => {
      const pts: number[] = [];
      for (let k = 0; k <= 48; k++) {
        const a = (k / 48) * TAU;
        const x = Math.cos(a) * R;
        const y = Math.sin(a) * R * sq;
        pts.push(x * Math.cos(tilt) - y * Math.sin(tilt), CY + x * Math.sin(tilt) + y * Math.cos(tilt));
      }
      S.line(pts, 'ink', { w: 1.2, alpha: 0.22, drawOn: false });
      const at = (t: number): [number, number] => {
        const a = TAU * (t * cyc + 0.1 + i * 0.33);
        const x = Math.cos(a) * R;
        const y = Math.sin(a) * R * sq;
        return [x * Math.cos(tilt) - y * Math.sin(tilt), CY + x * Math.sin(tilt) + y * Math.cos(tilt)];
      };
      if (det > 0.4) {
        for (let k = 4; k >= 1; k--) {
          const [tx, ty] = at(u - k * 0.012);
          S.circle(tx, ty, r * 1.2 * (1 - k * 0.16), role, { alpha: 0.28 * (1 - k / 5), stroke: false, shadow: false, hl: false, flat: true, drawOn: false });
        }
      }
      const [x, y] = at(u);
      S.push();
      S.translate(x, y);
      S.jitter(10 + i);
      S.circle(0, 0, r * 1.5, role);
      S.pop();
    });

    // ── 散落的十字與圓點（避開中央）
    for (let i = 0; i < 9; i++) {
      const x = (hash(i, 7) * 2 - 1) * hw * 0.92;
      const y = (hash(i, 8) * 2 - 1) * env.Hu * 0.42 - 20;
      if (Math.abs(x) < 215 && Math.abs(y) < 125) continue;
      const s = 5 + 3 * Math.sin(TAU * (u * 2 + hash(i, 9)));
      if (i % 3 === 0) S.circle(x, y, s * 0.7, 'ink', { alpha: 0.5, stroke: false, flat: true, shadow: false, hl: false, drawOn: false });
      else {
        S.line([x - s, y, x + s, y], 'ink', { w: 2.2, alpha: 0.6, cap: 'round', drawOn: false });
        S.line([x, y - s, x, y + s], 'ink', { w: 2.2, alpha: 0.6, cap: 'round', drawOn: false });
      }
    }
  },
};
