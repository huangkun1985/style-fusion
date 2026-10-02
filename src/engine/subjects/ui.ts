// 主體：手機 UI。卡片進場、列表交錯、進度環、開關切換、按鈕按壓、通知彈出、整體退場。
import type { Cue } from '../../audio/types';
import { clamp, lerp } from '../util';
import type { Subject } from './types';

const PW = 196;
const PH = 360;

export const ui: Subject = {
  id: 'ui',
  name: 'UI 介面',
  en: 'App UI',
  desc: '手機介面的一整套微交互：進場、交錯列表、進度環、開關、按鈕回饋、通知彈出與退場。',
  loop: 4.2,
  key: 0.58,
  hero: 0.78,
  events: (env) => {
    const ev = [
      { u: 0.44, x: 55, y: 8, k: 0.5 },
      { u: 0.6, x: 0, y: 146, k: 0.8 },
    ];
    if (env.Wu > 600) ev.push({ u: 0.52, x: env.Wu * 0.34, y: 22, k: 0.6 });
    return ev;
  },
  cues(M) {
    const out: Cue[] = [
      { u: 0.01, kind: 'whoosh', k: 0.55 },
      { u: 0.06 + M.stag(0), kind: 'tick', k: 0.5 },
      { u: 0.08 + M.stag(1), kind: 'pop', k: 0.7 },
    ];
    for (let i = 0; i < 3; i++) out.push({ u: 0.15 + M.stag(i + 2), kind: 'pop', k: 0.45 });
    out.push(
      { u: 0.22, kind: 'rise', k: 0.25 },
      { u: 0.43, kind: 'toggle', k: 0.7 },
      { u: 0.56, kind: 'click', k: 0.8 },
      { u: 0.62, kind: 'ping', k: 0.5 },
      { u: 0.67, kind: 'notify', k: 0.7 },
      { u: 0.9, kind: 'whoosh', k: 0.5 },
    );
    return out;
  },
  track(M) {
    const pin = M.tw(0.66, 0.74, 'o');
    const pout = M.tw(0.86, 0.92, 'i');
    return [0, lerp(-250, -140, pin) - pout * 110];
  },
  draw(S, M, env) {
    const mv = M.mv;
    const P = S.pal;
    const exitP = M.tw(0.92, 1.0, 'i');
    const inP = M.tw(0.0, 0.16, 'o');
    const baseA = S.alpha;
    const wide = env.Wu > 600;

    // 側邊小卡片（寬畫面才出現）
    if (wide) {
      const sx = env.Wu * 0.34;
      // 左：長條圖
      const lp = M.tw(0.08, 0.26, 'o');
      S.alpha = baseA * clamp(lp * 1.3) * (1 - exitP);
      S.push();
      S.translate(-sx, -30 + (1 - lp) * 40 + exitP * 30);
      S.jitter(21);
      S.rect(0, 0, 150, 124, 18, 'card');
      S.rect(-34, -42, 60, 8, 4, 'ink', { alpha: 0.75, stroke: false, flat: true, shadow: false });
      const hs = [34, 58, 44, 72, 52];
      hs.forEach((h, i) => {
        const g = M.tw(0.16 + M.stag(i), 0.4 + M.stag(i), 'o');
        const hh = Math.max(1, h * g);
        S.rect(-48 + i * 24, 46 - hh / 2, 14, hh, 4, i === 3 ? 'a' : i % 2 ? 's' : 'p', { shadow: false });
      });
      S.pop();
      // 右：按讚卡
      const rp = M.tw(0.14, 0.32, 'o');
      S.alpha = baseA * clamp(rp * 1.3) * (1 - exitP);
      S.push();
      S.translate(sx, 40 + (1 - rp) * 40 + exitP * 30);
      S.jitter(22);
      S.rect(0, 0, 150, 112, 18, 'card');
      const pop = M.tw(0.48, 0.58, 'o');
      S.push();
      S.translate(-38, -12);
      S.scale(0.6 + 0.4 * pop + 0.25 * Math.sin(clamp(pop) * Math.PI) * mv.exag);
      const hx = 0;
      const hy = 0;
      S.blob([hx, hy + 14, hx - 16, hy - 2, hx - 10, hy - 14, hx, hy - 7, hx + 10, hy - 14, hx + 16, hy - 2], pop > 0.05 ? 'p' : 'bg');
      S.pop();
      S.text(pop > 0.05 ? `+${(1.2 * clamp(pop)).toFixed(1)}k` : '+0.0k', 22, -12, 18, 'ink', { flat: true });
      S.rect(0, 22, 110, 8, 4, 'ink', { alpha: 0.25, stroke: false, flat: true, shadow: false });
      S.rect(-14, 38, 82, 8, 4, 'ink', { alpha: 0.18, stroke: false, flat: true, shadow: false });
      S.pop();
    }

    // 手機
    S.alpha = baseA * clamp(inP * 1.2) * (1 - exitP);
    S.push();
    S.translate(0, (1 - inP) * 90 + exitP * 60);
    S.scale(lerp(0.92, 1, inP));
    S.jitter(20);
    S.rect(0, 0, PW, PH, 30, 'ink');
    S.rect(0, 0, PW - 14, PH - 14, 24, 'card', { shadow: false });
    S.text('9:41', -60, -158, 11, 'ink', { flat: true, shadow: false, font: 'mono' });
    S.rect(66, -158, 18, 8, 3, 'ink', { flat: true, stroke: false, shadow: false, alpha: 0.7 });

    // 標題列
    const hp = M.tw(0.06 + M.stag(0), 0.22 + M.stag(0), 'o');
    S.alpha = baseA * clamp(hp) * (1 - exitP);
    S.push();
    S.translate(0, (1 - hp) * 18);
    S.circle(-62, -126, 14, 'p');
    S.rect(-8, -131, 72, 9, 4, 'ink', { alpha: 0.85, stroke: false, flat: true, shadow: false });
    S.rect(-20, -118, 48, 6, 3, 'ink', { alpha: 0.35, stroke: false, flat: true, shadow: false });
    S.pop();

    // 主卡片 + 進度環
    const cp = M.tw(0.08 + M.stag(1), 0.26 + M.stag(1), 'o');
    S.alpha = baseA * clamp(cp) * (1 - exitP);
    S.push();
    S.translate(0, -60 + (1 - cp) * 26);
    S.scale(lerp(0.88, 1, cp));
    S.rect(0, 0, 164, 94, 18, 'p');
    const prog = 0.86 * M.tw(0.22, 0.52, 'io');
    S.arc(-44, 0, 25, 0, Math.PI * 2, 'light', { w: 7, alpha: 0.3, drawOn: false });
    if (prog > 0.005) S.arc(-44, 0, 25, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * prog, 'light', { w: 7 });
    S.text(`${Math.round(prog * 100)}%`, 30, -8, 26, 'light', { flat: true, shadow: false });
    S.rect(30, 20, 60, 6, 3, 'light', { alpha: 0.6, stroke: false, flat: true, shadow: false });
    S.pop();

    // 列表
    const icons = ['s', 'a', 'q'];
    for (let i = 0; i < 3; i++) {
      const rp = M.tw(0.12 + M.stag(i + 2), 0.3 + M.stag(i + 2), 'o');
      const out = M.tw(0.9 - M.stag(2 - i) * 0.5, 0.97, 'i');
      S.alpha = baseA * clamp(rp) * (1 - exitP) * (1 - out * 0.5);
      const y = 8 + i * 44;
      S.push();
      S.translate((1 - rp) * 70, y);
      S.jitter(30 + i, 0.6);
      S.rect(0, 0, 164, 36, 12, 'bg', { shadow: false });
      S.circle(-60, 0, 11, icons[i]);
      S.rect(-12, -5, 66, 7, 3.5, 'ink', { alpha: 0.75, stroke: false, flat: true, shadow: false });
      S.rect(-22, 7, 46, 5, 2.5, 'ink', { alpha: 0.3, stroke: false, flat: true, shadow: false });
      if (i === 0) {
        const tg = M.tw(0.4, 0.48, 'io');
        S.rect(55, 0, 36, 20, 10, 'ink', { alpha: 0.22 * (1 - clamp(tg)), stroke: false, shadow: false, flat: true });
        S.rect(55, 0, 36, 20, 10, 'q', { alpha: clamp(tg), shadow: false });
        const kx = lerp(46, 64, tg);
        const squash = Math.sin(clamp(tg) * Math.PI) * mv.squash * 0.5;
        S.push();
        S.translate(kx, 0);
        S.scale(1 + squash, 1 - squash * 0.6);
        S.circle(0, 0, 7.5, 'light', { hl: false });
        S.pop();
      }
      S.pop();
    }

    // 按鈕
    const bp = M.tw(0.22 + M.stag(5), 0.38 + M.stag(5), 'o');
    S.alpha = baseA * clamp(bp) * (1 - exitP);
    const down = M.seg(0.56, 0.6);
    const up = M.tw(0.6, 0.72, 'o');
    const press = down >= 1 ? 1 - up : M.io(down);
    S.push();
    S.translate(0, 146 + (1 - bp) * 30);
    S.scale(1 - 0.09 * press);
    S.rect(0, 0, 150, 40, 20, 'a');
    S.text('開始創作', 0, 1, 15, 'ink', { flat: true, shadow: false });
    S.pop();
    const rip = M.seg(0.6, 0.78);
    if (rip > 0 && rip < 1) {
      S.alpha = baseA * (1 - rip) * 0.8 * (1 - exitP);
      S.rect(0, 146, 150 + rip * 40, 40 + rip * 40, 20 + rip * 20, null, { stroke: 'a', lw: 1.2, drawOn: false, outline: true });
    }

    // 通知
    const tin = M.tw(0.66, 0.74, 'o');
    const tout = M.tw(0.86, 0.92, 'i');
    if (tin > 0 && tout < 1) {
      S.alpha = baseA * clamp(tin * 1.5) * (1 - tout);
      S.push();
      S.translate(0, lerp(-250, -140, tin) - tout * 110);
      S.rect(0, 0, 168, 40, 14, 'ink');
      S.circle(-62, 0, 9, 'q', { hl: false });
      S.text('已套用風格 ✓', 10, 1, 13, 'light', { flat: true, shadow: false });
      S.pop();
    }
    S.pop();
    S.alpha = baseA;
    void P;
  },
};
