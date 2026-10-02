// 主體：幾何構成（包浩斯式）。圓形滾入、方塊分段旋轉、三角滑落、半圓翻轉、線條描繪、圓點彈出。
import type { Cue } from '../../audio/types';
import { clamp, lerp } from '../util';
import type { Subject } from './types';

export const geo: Subject = {
  id: 'geo',
  name: '幾何構成',
  en: 'Geometric',
  desc: '包浩斯式構成：滾動、分段旋轉、滑落、翻轉與錯峰彈出，最能看出緩動曲線的性格。',
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
    return [lerp(-env.Wu / 2 - 100, -100, p) - ex * 40, 10];
  },
  draw(S, M, env) {
    const mv = M.mv;
    const u = M.u;
    const hw = env.Wu / 2;
    const exit = (i: number) => 1 - M.tw(0.86 + M.stag(i) * 0.6, 0.98, 'i');

    // 底線
    const lp = M.tw(0.25, 0.47, 'io');
    if (lp > 0.005) {
      const e = exit(6);
      const x0 = -Math.min(hw - 20, 230);
      const x1 = x0 + (Math.min(hw - 20, 230) * 2) * lp;
      S.line([x0, 152, lerp(x0, x1, e), 152], 'ink', { w: 6, cap: 'round' });
    }

    // 大圓滾入
    const cp = M.tw(0.02, 0.24, 'o');
    const cx = lerp(-hw - 100, -100, cp);
    const ce = exit(0);
    if (ce > 0.01) {
      S.push();
      S.translate(cx, 10);
      S.jitter(1);
      S.scale(ce);
      S.rotate((cx + 100) / 78);
      S.circle(0, 0, 78, 'p');
      const half: number[] = [];
      for (let k = 0; k <= 20; k++) {
        const a = Math.PI + (k / 20) * Math.PI;
        half.push(Math.cos(a) * 78, Math.sin(a) * 78);
      }
      S.poly(half, 'a', { hl: false });
      S.pop();
    }

    // 方塊：先彈出，再三段旋轉
    const sp = M.tw(0.1, 0.24, 'o');
    const se = exit(1);
    if (sp > 0.01 && se > 0.01) {
      let rot = 0;
      for (const t0 of [0.3, 0.45, 0.6]) rot += M.tw(t0, t0 + 0.08, mv.holds > 0.4 ? 'o' : 'io') * (Math.PI / 2);
      S.push();
      S.translate(85, 40);
      S.jitter(2);
      S.scale(clamp(sp * 1.05) * se);
      S.rotate(rot);
      S.rect(0, 0, 110, 110, 10, 's');
      S.pop();
    }

    // 三角滑落
    const tp = M.tw(0.14, 0.32, 'o');
    const te = exit(2);
    if (te > 0.01) {
      S.push();
      S.translate(60, lerp(-env.Hu / 2 - 120, -96, tp));
      S.jitter(3);
      S.scale(te);
      S.poly([0, -52, 56, 44, -56, 44], 'a');
      S.pop();
    }

    // 半圓翻轉
    const hp = M.tw(0.2, 0.32, 'o');
    const flip = M.tw(0.5, 0.6, 'io');
    const he = exit(3);
    if (hp > 0.01 && he > 0.01) {
      S.push();
      S.translate(-150, 132);
      S.jitter(4);
      S.scale(clamp(hp) * he, (1 - 2 * flip) * clamp(hp) * he);
      const pts: number[] = [];
      for (let k = 0; k <= 18; k++) {
        const a = Math.PI + (k / 18) * Math.PI;
        pts.push(Math.cos(a) * 46, Math.sin(a) * 46 + 12);
      }
      S.poly(pts, 'q');
      S.pop();
    }

    // 圓環呼吸
    const rp = M.tw(0.28, 0.4, 'o');
    if (rp > 0.01) {
      S.push();
      S.translate(Math.min(hw - 50, 200), -120);
      S.scale(clamp(rp) * exit(4) * (1 + 0.08 * Math.sin(u * Math.PI * 8)));
      S.circle(0, 0, 26, null, { stroke: 'ink', lw: 1.6, outline: true });
      S.pop();
    }

    // 圓點錯峰彈出
    for (let i = 0; i < 5; i++) {
      const dp = M.tw(0.35 + M.stag(i) * 1.6, 0.47 + M.stag(i) * 1.6, 'o');
      if (dp <= 0.01) continue;
      S.push();
      S.translate(-Math.min(hw - 40, 215) + i * 24, -140);
      S.jitter(10 + i);
      S.scale(dp * exit(5));
      S.circle(0, 0, 8, 'r', { hl: false });
      S.pop();
    }
  },
};
