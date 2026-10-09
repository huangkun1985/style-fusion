// 主體 v2：幾何構成（包浩斯海報）。依康丁斯基的色形理論——紅圓、藍方、黃三角——放在不對稱的網格上：
// 大圓滾入並露出半圓配色、方塊彈出後分三段旋轉、三角滑落壓在方塊角上、半圓翻轉、同心圓環呼吸、
// 長條與點陣錯峰彈出，細線描出結構，角落一行小字；最後逐件收合。時間結構與 v1 相同。
import type { Cue } from '../../../audio/types';
import { clamp, lerp } from '../../util';
import type { Subject } from '../types';

export const geo2: Subject = {
  id: 'geo',
  name: '幾何構成',
  en: 'Geometric',
  desc: '包浩斯海報式構成：紅圓、藍方、黃三角在不對稱網格上滾動、分段旋轉、滑落、翻轉與錯峰彈出，細線描出結構，最能看出緩動曲線的性格。',
  loop: 4,
  key: 0.24,
  hero: 0.72,
  events: () => [
    { u: 0.24, x: -100, y: 88, k: 0.9 },
    { u: 0.38, x: 85, y: 95, k: 0.5 },
    { u: 0.53, x: 85, y: 95, k: 0.5 },
  ],
  cues(M) {
    const out: Cue[] = [
      { u: 0.02, kind: 'whoosh', k: 0.45 },
      { u: 0.12, kind: 'pop', k: 0.5 },
      { u: 0.24, kind: 'land', k: 0.9 },
      { u: 0.32, kind: 'land', k: 0.4 },
      { u: 0.55, kind: 'flip', k: 0.6 },
    ];
    for (const t0 of [0.3, 0.45, 0.6]) out.push({ u: t0 + 0.08, kind: 'tick', k: 0.7 });
    for (let i = 0; i < 5; i++) out.push({ u: 0.41 + M.stag(i) * 1.6, kind: 'blip', k: 0.4 });
    out.push({ u: 0.88, kind: 'whoosh', k: 0.5 });
    return out;
  },
  track(M, env) {
    const p = M.tw(0.02, 0.24, 'o');
    const ex = M.tw(0.86, 0.98, 'i');
    return [lerp(-env.Wu / 2 - 100, -150, p) - ex * 40, 6];
  },
  draw(S, M, env) {
    const mv = M.mv;
    const u = M.u;
    const hw = env.Wu / 2;
    const A = Math.min(1, hw / 320);
    const det = S.look.detail;
    const exit = (i: number) => 1 - M.tw(0.86 + M.stag(i) * 0.6, 0.98, 'i');
    const baseA = S.alpha;

    // ── 結構細線：地平線、垂直線、一條斜線
    const lp = M.tw(0.25, 0.47, 'io');
    if (lp > 0.005) {
      const e = exit(8);
      const x0 = -Math.min(hw - 16, 330);
      const x1 = x0 + Math.min(hw - 16, 330) * 2 * lp;
      S.line([x0, 164, lerp(x0, x1, e), 164], 'ink', { w: 5, cap: 'round' });
      const vp = M.tw(0.3, 0.5, 'io');
      S.line([-62 * A, 164, -62 * A, lerp(164, -150, vp * e)], 'ink', { w: 1.6, alpha: 0.7, drawOn: false });
      if (det > 0.5) S.line([x0 + 20, 140, lerp(x0 + 20, x0 + 20 + 360 * A, vp * e), lerp(140, -130, vp * e)], 'ink', { w: 1.2, alpha: 0.35, drawOn: false });
    }

    S.push();
    S.scale(A);

    // ── 紅圓滾入（下半圓是另一個顏色）
    const cp = M.tw(0.02, 0.24, 'o');
    const cx = lerp(-hw / A - 120, -150, cp);
    const ce = exit(0);
    if (ce > 0.01) {
      S.push();
      S.translate(cx, 6);
      S.jitter(1);
      S.scale(ce);
      S.rotate((cx + 150) / 92);
      S.circle(0, 0, 92, 'p');
      const half: number[] = [];
      for (let k = 0; k <= 22; k++) {
        const a = Math.PI + (k / 22) * Math.PI;
        half.push(Math.cos(a) * 92, Math.sin(a) * 92);
      }
      S.poly(half, 'a', { hl: false });
      S.circle(0, 0, 54, null, { stroke: 'ink', outline: true, lw: 0.8, alpha: 0.55, drawOn: false });
      S.circle(0, 0, 10, 'ink', { flat: true, stroke: false, shadow: false, hl: false, drawOn: false });
      S.pop();
    }

    // ── 藍色方塊：先彈出，再三段 90° 旋轉
    const sp = M.tw(0.1, 0.24, 'o');
    const se = exit(1);
    if (sp > 0.01 && se > 0.01) {
      let rot = 0;
      for (const t0 of [0.3, 0.45, 0.6]) rot += M.tw(t0, t0 + 0.08, mv.holds > 0.4 ? 'o' : 'io') * (Math.PI / 2);
      S.push();
      S.translate(62, 42);
      S.jitter(2);
      S.scale(clamp(sp * 1.05) * se);
      S.rotate(rot);
      S.rect(0, 0, 124, 124, 8, 's');
      S.circle(-30, -30, 14, 'light', { hl: false, shadow: false, flat: true });
      S.rect(24, 24, 40, 6, 3, 'light', { alpha: 0.7, stroke: false, flat: true, shadow: false, hl: false, drawOn: false });
      S.pop();
    }

    // ── 黃色三角形：從上方滑落，壓在方塊的右上角
    const tp = M.tw(0.14, 0.32, 'o');
    const te = exit(2);
    if (te > 0.01) {
      S.push();
      S.translate(150, lerp(-env.Hu / 2 / A - 130, -66, tp));
      S.jitter(3);
      S.scale(te);
      S.poly([0, -58, 62, 50, -62, 50], 'a', { alpha: 0.96 });
      S.pop();
    }

    // ── 半圓翻轉
    const hp = M.tw(0.2, 0.32, 'o');
    const flip = M.tw(0.5, 0.6, 'io');
    const he = exit(3);
    if (hp > 0.01 && he > 0.01) {
      S.push();
      S.translate(-62 - 62, 152);
      S.jitter(4);
      S.scale(clamp(hp) * he, (1 - 2 * flip) * clamp(hp) * he);
      const pts: number[] = [];
      for (let k = 0; k <= 20; k++) {
        const a = Math.PI + (k / 20) * Math.PI;
        pts.push(Math.cos(a) * 50, Math.sin(a) * 50 + 12);
      }
      S.poly(pts, 'q');
      S.pop();
    }

    // ── 同心圓環（呼吸）
    const rp = M.tw(0.28, 0.4, 'o');
    if (rp > 0.01) {
      const br = 1 + 0.06 * Math.sin(u * Math.PI * 8);
      S.push();
      S.translate(240, 96);
      S.scale(clamp(rp) * exit(4) * br);
      for (let k = 0; k < 3; k++) S.circle(0, 0, 14 + k * 11, null, { stroke: 'ink', outline: true, lw: 1.3, alpha: 0.9 - k * 0.2, drawOn: false });
      S.circle(0, 0, 5, 'ink', { flat: true, stroke: false, shadow: false, hl: false, drawOn: false });
      S.pop();
    }

    // ── 長條：三條由長到短，錯峰從右側滑入
    for (let i = 0; i < 3; i++) {
      const bp = M.tw(0.3 + i * 0.03, 0.42 + i * 0.03, 'o');
      if (bp <= 0.01) continue;
      const w = [120, 84, 48][i];
      S.rect(236 - (1 - bp) * 120 + (120 - w) / 2 * 0, -118 + i * 16, w * bp, 8, 2, i === 0 ? 'p' : 'ink', { shadow: false, stroke: false, alpha: exit(5), drawOn: false });
    }

    // ── 圓點：3×2 點陣錯峰彈出
    for (let i = 0; i < 6; i++) {
      const dp = M.tw(0.35 + M.stag(i) * 1.6, 0.47 + M.stag(i) * 1.6, 'o');
      if (dp <= 0.01) continue;
      S.push();
      S.translate(-262 + (i % 3) * 22, -128 + Math.floor(i / 3) * 22);
      S.jitter(10 + i);
      S.scale(dp * exit(6));
      S.circle(0, 0, 7, i === 4 ? 'p' : 'r', { hl: false });
      S.pop();
    }

    // ── 角落小字
    const tpx = M.tw(0.34, 0.5, 'o');
    if (tpx > 0.01 && det > 0.4) {
      S.alpha = baseA * clamp(tpx) * exit(7);
      S.text('FORM FOLLOWS', 188, 128, 10, 'ink', { flat: true, shadow: false, font: 'mono', alpha: 0.75 });
      S.text('FUNCTION  1919', 188, 142, 10, 'ink', { flat: true, shadow: false, font: 'mono', alpha: 0.75 });
      S.alpha = baseA;
    }
    S.pop();
  },
};
