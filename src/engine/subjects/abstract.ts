// 主體：抽象流動。變形中的核心液滴、旋轉點環、軌道衛星、底部波浪。
import type { Cue } from '../../audio/types';
import { TAU, hash } from '../util';
import type { Subject } from './types';

export const abstract: Subject = {
  id: 'abstract',
  name: '抽象流動',
  en: 'Abstract Flow',
  desc: '生成式抽象構圖：呼吸變形的核心、旋轉點環、軌道衛星與波浪，適合看線條與節奏類風格。',
  loop: 5,
  key: 0.5,
  hero: 0.3,
  events: () => [
    { u: 0.0, x: 0, y: -10, k: 0.7 },
    { u: 0.5, x: 0, y: -10, k: 0.7 },
  ],
  cues() {
    return [
      { u: 0.0, kind: 'ping', k: 0.5 },
      { u: 0.5, kind: 'ping', k: 0.5 },
    ] as Cue[];
  },
  track(M) {
    const a = TAU * (M.u * 2 + 0.1);
    return [Math.cos(a) * 128, -10 + Math.sin(a) * 128 * 0.5];
  },
  draw(S, M, env) {
    const u = M.u;
    const hw = env.Wu / 2;

    // 波浪
    const cols = ['q', 's', 'a'];
    for (let k = 0; k < 3; k++) {
      const pts: number[] = [];
      for (let x = -hw - 10; x <= hw + 10; x += 10) pts.push(x, 128 + k * 18 + 11 * Math.sin(x * 0.024 + TAU * u * (k + 1) + k * 1.3));
      S.line(pts, cols[k], { w: 5 });
    }

    // 點環
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * TAU + TAU * u * (1 / 28) * 4;
      const r = 3 + 3.5 * (0.5 + 0.5 * Math.sin(a * 3 - TAU * u * 2));
      S.circle(Math.cos(a) * 160, -10 + Math.sin(a) * 160 * 0.62, r, i % 4 === 0 ? 'a' : 'ink', { hl: false, shadow: false, lw: 0.6 });
    }

    // 核心液滴
    const pts: number[] = [];
    const n = 12;
    for (let i = 0; i < n; i++) {
      const th = (i / n) * TAU;
      const r = 66 + 11 * Math.sin(3 * th + TAU * u) + 7 * Math.sin(5 * th - TAU * u * 2) + M.mv.beat * 12 * M.beat();
      pts.push(Math.cos(th) * r, -10 + Math.sin(th) * r);
    }
    S.push();
    S.jitter(1);
    S.blob(pts, 'p');
    S.circle(Math.cos(TAU * u) * 22 - 6, -26 + Math.sin(TAU * u) * 10, 15, 'light', { alpha: 0.85, hl: false });
    S.pop();

    // 衛星
    const sat: [number, number, string, number][] = [
      [128, 9, 's', 2],
      [100, 7, 'a', 3],
      [190, 6, 'q', 1],
    ];
    sat.forEach(([R, r, c, cyc], i) => {
      const a = TAU * (u * cyc + 0.1 + i * 0.33);
      S.push();
      S.translate(Math.cos(a) * R, -10 + Math.sin(a) * R * 0.5);
      S.jitter(10 + i);
      S.circle(0, 0, r * 1.6, c);
      S.pop();
    });

    // 十字星點
    for (let i = 0; i < 7; i++) {
      const x = (hash(i, 7) * 2 - 1) * hw * 0.9;
      const y = (hash(i, 8) * 2 - 1) * env.Hu * 0.4 - 30;
      if (Math.abs(x) < 210 && Math.abs(y) < 120) continue;
      const s = 5 + 3 * Math.sin(TAU * (u * 2 + hash(i, 9)));
      S.line([x - s, y, x + s, y], 'ink', { w: 2.2, alpha: 0.6 });
      S.line([x, y - s, x, y + s], 'ink', { w: 2.2, alpha: 0.6 });
    }
  },
};
