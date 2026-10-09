// 主體 v2：動態文字標誌。像一張動態海報：上方小標與細線、巨大的 MOTION 逐字落下回彈（每個字的色彩與落點節奏不同）、
// 底線描繪並以圓點收尾、副標升起，右上角一枚旋轉的圓形徽章；仍支援波浪、打字機與字符解碼模式。
import type { Cue } from '../../../audio/types';
import { TAU, clamp, hash, lerp } from '../../util';
import type { Subject } from '../types';

const WORD = 'MOTION';
const SUB = '動效風格';
const KICKER = 'STYLE · FUSION · 2025';
const BADGE = 'MOTION DESIGN • EASE & TIMING • ';
const GLYPHS = 'ABCDEFGHJKLMNPRSTUVXYZ#%&@$0123456789';
const SIZE = 98;

export const type2: Subject = {
  id: 'type',
  name: '文字標誌',
  en: 'Kinetic Type',
  desc: '動態海報式排版：小標與細線、逐字落下回彈的巨大標題、底線與圓點、副標與旋轉徽章；可切換波浪、打字機與字符解碼模式。',
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
    const det = S.look.detail;
    const baseA = S.alpha;
    const widths = WORD.split('').map((c) => S.measure(c, SIZE));
    const gap = 5;
    const total = widths.reduce((s, w) => s + w, 0) + gap * (WORD.length - 1);
    const fit = Math.min(1, (env.Wu * 0.84) / total);
    let x = -total / 2;
    const xs: number[] = [];
    widths.forEach((w) => {
      xs.push(x + w / 2);
      x += w + gap;
    });
    const half = (total * fit) / 2;

    // ── 上方小標與兩段細線
    const kp = M.tw(0.04, 0.2, 'o');
    const ko = M.tw(0.78, 0.9, 'i');
    if (kp > 0.01 && ko < 1) {
      S.alpha = baseA * clamp(kp) * (1 - ko);
      S.push();
      S.translate(0, -108 + (1 - kp) * 16);
      S.jitter(18, 0.6);
      S.text(KICKER, 0, 0, 13, 'ink', { flat: true, shadow: false, font: 'mono', alpha: 0.75 });
      const w = (S.measure(KICKER, 13, 'mono') * 1) / 2 + 14;
      S.line([-w - 46 * kp, 0, -w, 0], 'ink', { w: 2, cap: 'round', alpha: 0.6, drawOn: false });
      S.line([w, 0, w + 46 * kp, 0], 'ink', { w: 2, cap: 'round', alpha: 0.6, drawOn: false });
      S.pop();
    }

    // ── 旋轉徽章（右上）：圓環文字
    const bp = M.tw(0.18, 0.4, 'o');
    const bo = M.tw(0.8, 0.92, 'i');
    if (bp > 0.01 && bo < 1 && env.Wu > 480 && det > 0.35) {
      S.alpha = baseA * clamp(bp) * (1 - bo);
      S.push();
      S.translate(half + 6 - 14, -92 - 8);
      S.scale(clamp(bp) * (1 - bo));
      S.rotate(TAU * u * 1 + 0.4);
      S.circle(0, 0, 34, 'a');
      const n = BADGE.length;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU;
        S.push();
        S.rotate(a);
        S.text(BADGE[i], 0, -25, 8.5, 'ink', { flat: true, shadow: false, font: 'mono', stroke: false });
        S.pop();
      }
      S.circle(0, 0, 9, 'ink', { flat: true, shadow: false, stroke: false });
      S.pop();
    }

    // ── 標題逐字
    S.alpha = baseA;
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
      const rot = tw ? 0 : (1 - clamp(p)) * (i % 2 ? -0.6 : 0.6) + out * (i % 2 ? 0.5 : -0.5);
      y += mv.typeWave * 12 * Math.sin(TAU * (u * 2 - i * 0.12));
      y += M.fl(i + 3, 6);
      const beat = mv.beat > 0.01 ? mv.beat * 0.14 * M.beat() * (i % 2 ? 1 : 0.6) : 0;
      const land = tw ? 0 : Math.max(0, 1 - Math.abs(u - (0.22 + st)) / 0.04);
      const sq = land * mv.squash * 0.35;
      S.alpha = baseA * alpha;
      S.push();
      S.translate(xs[i], y + SIZE * 0.32);
      S.jitter(10 + i);
      S.rotate(rot);
      S.scale((1 + sq + beat) * (tw ? 1 : lerp(0.5, 1, clamp(p))), (1 - sq * 0.8 + beat) * (tw ? 1 : lerp(0.5, 1, clamp(p))));
      let ch = WORD[i];
      const settle = 0.3 + i * 0.035;
      if (scr > 0.25 && u < settle) ch = GLYPHS[Math.floor(hash(Math.floor(M.tReal * 15), i, 3) * GLYPHS.length)];
      // 落地時從字下方迸出的小塵點
      if (!tw && land > 0.05 && det > 0.4) {
        for (const side of [-1, 1]) S.circle(side * (widths[i] * 0.5 + 6 * land), SIZE * 0.34, 4.5 * land, 'ink', { alpha: 0.5 * land, stroke: false, flat: true, shadow: false, hl: false, drawOn: false });
      }
      S.text(ch, 0, -SIZE * 0.32, SIZE, i === 3 ? 'a' : i % 2 ? 's' : 'p');
      S.pop();
    }
    if (tw && u < 0.95) {
      const on = Math.floor(M.tReal * 2.5) % 2 === 0;
      if (on) {
        const cx = lastVisible >= 0 ? xs[lastVisible] + widths[lastVisible] / 2 + 10 : xs[0] - widths[0] / 2;
        S.alpha = baseA;
        S.rect(cx, -20, 8, SIZE * 0.8, 1, 'ink', { stroke: false, shadow: false, flat: true });
      }
    }
    S.pop();

    // ── 底線（描繪）與圓點
    const lp = M.tw(0.2, 0.42, 'io');
    const lo = M.tw(0.82, 0.92, 'i');
    if (lp > 0.01 && lo < 1) {
      S.alpha = baseA;
      const x0 = -half + lo * half * 2;
      const x1 = -half + lp * half * 2;
      if (x1 - x0 > 1) S.rect((x0 + x1) / 2, 44, x1 - x0, 7, 3.5, 'ink', { shadow: false });
      const dot = M.tw(0.36, 0.46, 'o');
      if (dot > 0.01 && lo < 0.5) S.circle(half + 16, 44, 9 * clamp(dot) * (1 - lo * 2), 'a');
    }

    // ── 副標與三個小標籤
    const sp = M.tw(0.26, 0.42, 'o');
    const so = M.tw(0.78, 0.9, 'i');
    if (sp > 0.01 && so < 1) {
      S.alpha = baseA * clamp(sp) * (1 - so);
      S.push();
      S.translate(0, 90 + (1 - sp) * 26 - so * 20);
      S.jitter(19);
      S.text(SUB, 0, 0, 34, 'ink', { font: S.look.font === 'pixel' || S.look.font === 'term' ? S.look.font : 'brush' });
      S.pop();
      const tags = ['EASE', 'TIMING', 'STYLE'];
      tags.forEach((t, i) => {
        const tp = M.tw(0.3 + i * 0.03, 0.44 + i * 0.03, 'o');
        S.alpha = baseA * clamp(tp) * (1 - so);
        S.push();
        S.translate((i - 1) * 78, 132 + (1 - tp) * 14);
        S.rect(0, 0, 66, 22, 11, i === 1 ? 'p' : 'card', { shadow: false });
        S.text(t, 0, 1, 11, i === 1 ? 'light' : 'ink', { flat: true, shadow: false, font: 'mono' });
        S.pop();
      });
    }
    S.alpha = baseA;
  },
};
