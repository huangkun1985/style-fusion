// 主體：動態文字標誌。逐字落下、落地擠壓、波浪／打字機／解碼模式、底線描繪、逐字退場。
import type { Cue } from '../../audio/types';
import { TAU, clamp, hash, lerp } from '../util';
import type { Subject } from './types';

const WORD = 'MOTION';
const SUB = '動效風格';
const GLYPHS = 'ABCDEFGHJKLMNPRSTUVXYZ#%&@$0123456789';
const SIZE = 92;

export const type: Subject = {
  id: 'type',
  name: '文字標誌',
  en: 'Kinetic Type',
  desc: '動態排版：逐字錯峰進場、落地回彈、波浪律動，可切換打字機與字符解碼模式。',
  loop: 3.4,
  key: 0.22,
  hero: 0.6,
  events: () => [
    { u: 0.2, x: -120, y: 20, k: 0.6 },
    { u: 0.3, x: 120, y: 20, k: 0.6 },
  ],
  cues(M) {
    const out: Cue[] = [{ u: 0.04, kind: 'whoosh', k: 0.5 }];
    if (M.mv.typeWriter > 0.5) for (let i = 0; i < 6; i++) out.push({ u: 0.06 + i * 0.055, kind: 'tick', k: 0.5 });
    else for (let i = 0; i < 6; i++) out.push({ u: 0.22 + M.stag(i) * 1.5, kind: i % 2 ? 'tick' : 'land', k: 0.55 + (i === 3 ? 0.2 : 0) });
    out.push({ u: 0.26, kind: 'pop', k: 0.4 }, { u: 0.8, kind: 'whoosh', k: 0.5 });
    return out;
  },
  track(M) {
    const i = 2;
    const p = M.tw(0.04 + M.stag(i) * 1.5, 0.22 + M.stag(i) * 1.5, 'o');
    const out = M.tw(0.8 + M.stag(i), 0.95 + M.stag(i), 'i');
    return [-30, lerp(-230, -20, p) - out * 260];
  },
  draw(S, M, env) {
    const mv = M.mv;
    const u = M.u;
    const tw = mv.typeWriter > 0.5;
    const scr = mv.typeScramble;
    const widths = WORD.split('').map((c) => S.measure(c, SIZE));
    const gap = 6;
    const total = widths.reduce((s, w) => s + w, 0) + gap * (WORD.length - 1);
    const fit = Math.min(1, (env.Wu * 0.86) / total);
    const baseA = S.alpha;
    let x = -total / 2;
    const xs: number[] = [];
    widths.forEach((w) => {
      xs.push(x + w / 2);
      x += w + gap;
    });

    S.push();
    S.scale(fit);
    let lastVisible = -1;
    for (let i = 0; i < WORD.length; i++) {
      const st = M.stag(i) * 1.5;
      let p: number;
      let out: number;
      let alpha = 1;
      if (tw) {
        p = u > 0.06 + i * 0.055 ? 1 : 0;
        out = u > 0.8 + (WORD.length - 1 - i) * 0.025 ? 1 : 0;
        alpha = p * (1 - out);
        if (alpha > 0) lastVisible = i;
      } else {
        p = M.tw(0.04 + st, 0.22 + st, 'o');
        out = M.tw(0.8 + M.stag(i), 0.95 + M.stag(i), 'i');
        alpha = clamp(p * 3) * (1 - clamp(out * 1.2));
      }
      if (alpha <= 0.01) continue;
      let y = tw ? -20 : lerp(-230, -20, p) - out * 260;
      let rot = tw ? 0 : (1 - clamp(p)) * (i % 2 ? -0.6 : 0.6) + out * (i % 2 ? 0.5 : -0.5);
      y += mv.typeWave * 12 * Math.sin(TAU * (u * 2 - i * 0.12));
      y += M.fl(i + 3, 6);
      const beat = mv.beat > 0.01 ? mv.beat * 0.14 * M.beat() * (i % 2 ? 1 : 0.6) : 0;
      // 落地擠壓
      const land = tw ? 0 : Math.max(0, 1 - Math.abs(u - (0.22 + st)) / 0.04);
      const sq = land * mv.squash * 0.35;
      S.alpha = baseA * alpha;
      S.push();
      S.translate(xs[i], y + SIZE * 0.32);
      S.jitter(10 + i);
      S.rotate(rot + (mv.rigid > 0.5 ? 0 : 0));
      S.scale((1 + sq + beat) * (tw ? 1 : lerp(0.5, 1, clamp(p))), (1 - sq * 0.8 + beat) * (tw ? 1 : lerp(0.5, 1, clamp(p))));
      let ch = WORD[i];
      const settle = 0.3 + i * 0.035;
      if (scr > 0.25 && u < settle) ch = GLYPHS[Math.floor(hash(Math.floor(M.tReal * 15), i, 3) * GLYPHS.length)];
      const role = i === 3 ? 'a' : i % 2 ? 's' : 'p';
      S.text(ch, 0, -SIZE * 0.32, SIZE, role);
      S.pop();
      void rot;
    }
    // 打字機游標
    if (tw && u < 0.95) {
      const on = Math.floor(M.tReal * 2.5) % 2 === 0;
      if (on) {
        const cx = lastVisible >= 0 ? xs[lastVisible] + widths[lastVisible] / 2 + 10 : xs[0] - widths[0] / 2;
        S.alpha = baseA;
        S.rect(cx, -20, 8, SIZE * 0.8, 1, 'ink', { stroke: false, shadow: false, flat: true });
      }
    }
    S.pop();

    // 底線
    const lp = M.tw(0.2, 0.42, 'io');
    const lo = M.tw(0.82, 0.92, 'i');
    if (lp > 0.01 && lo < 1) {
      S.alpha = baseA;
      const half = (total * fit) / 2;
      const x0 = -half + lo * half * 2;
      const x1 = -half + lp * half * 2;
      if (x1 - x0 > 1) S.rect((x0 + x1) / 2, 34, x1 - x0, 7, 3.5, 'ink', { shadow: false });
      const dot = M.tw(0.36, 0.46, 'o');
      if (dot > 0.01 && lo < 0.5) S.circle(half + 16, 34, 9 * clamp(dot) * (1 - lo * 2), 'a');
    }
    // 副標
    const sp = M.tw(0.26, 0.42, 'o');
    const so = M.tw(0.78, 0.9, 'i');
    if (sp > 0.01 && so < 1) {
      S.alpha = baseA * clamp(sp) * (1 - so);
      S.push();
      S.translate(0, 82 + (1 - sp) * 26 - so * 20);
      S.jitter(19);
      S.text(SUB, 0, 0, 34, 'ink', { font: S.look.font === 'pixel' || S.look.font === 'term' ? S.look.font : 'brush' });
      S.pop();
    }
    S.alpha = baseA;
  },
};
