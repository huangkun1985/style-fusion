// 主體 v2：手機 UI。一支完整的 App 首頁——狀態列與動態島、問候列與頭像、主視覺進度卡（環形進度與光斑）、
// 三顆數據小卡、帶圖示的列表（含開關）、底部分頁列（指示膠囊會滑動）、主按鈕與通知橫幅；
// 全部元素依錯峰時間進場，按鈕有按壓與漣漪，結尾整體收合。寬畫面兩側多出圖表卡與收藏卡。時間結構與 v1 相同。
import type { Cue } from '../../../audio/types';
import { clamp, lerp } from '../../util';
import type { Subject } from '../types';

const PW = 198;
const PH = 372;

export const ui2: Subject = {
  id: 'ui',
  name: 'UI 介面',
  en: 'App UI',
  desc: '一支 App 首頁的整套微交互：進場、交錯列表、進度環、開關、分頁指示滑動、按鈕回饋、通知彈出與退場。',
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
    const exitP = M.tw(0.92, 1.0, 'i');
    const inP = M.tw(0.0, 0.16, 'o');
    const baseA = S.alpha;
    const wide = env.Wu > 600;
    const det = S.look.detail;
    const bar = (x: number, y: number, w: number, h: number, a: number, role: 'ink' | 'light' = 'ink') =>
      S.rect(x, y, w, h, h / 2, role, { alpha: a, stroke: false, flat: true, shadow: false, hl: false, drawOn: false });

    // ── 兩側小卡（寬畫面）
    if (wide) {
      const sx = env.Wu * 0.34;
      const lp = M.tw(0.08, 0.26, 'o');
      S.alpha = baseA * clamp(lp * 1.3) * (1 - exitP);
      S.push();
      S.translate(-sx, -20 + (1 - lp) * 40 + exitP * 30);
      S.jitter(21);
      S.rect(0, 0, 158, 132, 20, 'card');
      S.text('本週進度', -36, -44, 12, 'ink', { flat: true, shadow: false, alpha: 0.7, align: 'center' });
      bar(24, -44, 34, 6, 0.18);
      const hs = [34, 56, 44, 74, 52, 66];
      hs.forEach((h, i) => {
        const g = M.tw(0.16 + M.stag(i), 0.4 + M.stag(i), 'o');
        const hh = Math.max(1, h * g);
        S.rect(-52 + i * 20.5, 52 - hh / 2, 13, hh, 5, i === 3 ? 'a' : i % 2 ? 's' : 'p', { shadow: false });
      });
      S.pop();
      const rp = M.tw(0.14, 0.32, 'o');
      S.alpha = baseA * clamp(rp * 1.3) * (1 - exitP);
      S.push();
      S.translate(sx, 44 + (1 - rp) * 40 + exitP * 30);
      S.jitter(22);
      S.rect(0, 0, 158, 118, 20, 'card');
      const pop = M.tw(0.48, 0.58, 'o');
      S.push();
      S.translate(-42, -10);
      S.scale(0.6 + 0.4 * pop + 0.25 * Math.sin(clamp(pop) * Math.PI) * mv.exag);
      S.blob([0, 16, -18, -2, -12, -16, 0, -8, 12, -16, 18, -2], pop > 0.05 ? 'p' : 'bg');
      S.pop();
      S.text(pop > 0.05 ? `+${(1.2 * clamp(pop)).toFixed(1)}k` : '+0.0k', 22, -10, 20, 'ink', { flat: true });
      bar(0, 26, 112, 8, 0.2);
      bar(-14, 42, 84, 8, 0.14);
      S.pop();
    }

    // ── 手機外殼與螢幕
    S.alpha = baseA * clamp(inP * 1.2) * (1 - exitP);
    S.push();
    S.translate(0, (1 - inP) * 90 + exitP * 60);
    S.scale(lerp(0.92, 1, inP));
    S.jitter(20);
    S.rect(0, 0, PW, PH, 32, 'ink');
    S.rect(0, 0, PW - 12, PH - 12, 26, 'card', { shadow: false });
    // 動態島與狀態列
    S.rect(0, -PH / 2 + 17, 48, 14, 7, 'ink', { shadow: false, stroke: false, flat: true });
    S.text('9:41', -64, -PH / 2 + 17, 11, 'ink', { flat: true, shadow: false, font: 'mono' });
    S.rect(66, -PH / 2 + 17, 20, 9, 3.5, 'ink', { flat: true, stroke: false, shadow: false, alpha: 0.75 });
    S.rect(62, -PH / 2 + 17, 10, 5, 2, 'q', { flat: true, stroke: false, shadow: false });

    // ── 問候列
    const hp = M.tw(0.06 + M.stag(0), 0.22 + M.stag(0), 'o');
    S.alpha = baseA * clamp(hp) * (1 - exitP);
    S.push();
    S.translate(0, (1 - hp) * 18);
    S.circle(-64, -128, 16, 'p');
    S.circle(-64, -131, 5.5, 'light', { hl: false, shadow: false, stroke: false, flat: true });
    S.ellipse(-64, -121, 9, 5.5, 'light', { hl: false, shadow: false, stroke: false, flat: true });
    S.text('早安，小森', 6, -133, 14, 'ink', { flat: true, shadow: false, align: 'center' });
    bar(-18, -117, 52, 6, 0.3);
    S.circle(70, -128, 12, null, { stroke: 'ink', outline: true, lw: 1, drawOn: false });
    S.circle(75, -135, 3.6, 'a', { hl: false, shadow: false, flat: true });
    S.pop();

    // ── 主視覺卡：進度環＋光斑
    const cp = M.tw(0.08 + M.stag(1), 0.26 + M.stag(1), 'o');
    S.alpha = baseA * clamp(cp) * (1 - exitP);
    S.push();
    S.translate(0, -62 + (1 - cp) * 26);
    S.scale(lerp(0.88, 1, cp));
    S.rect(0, 0, 168, 90, 20, 'p');
    if (det > 0.4) {
      S.circle(62, -32, 28, 'light', { alpha: 0.16, stroke: false, flat: true, shadow: false, hl: false, drawOn: false });
      S.circle(78, 8, 17, 'a', { alpha: 0.35, stroke: false, flat: true, shadow: false, hl: false, drawOn: false });
    }
    const prog = 0.86 * M.tw(0.22, 0.52, 'io');
    S.arc(-46, 0, 26, 0, Math.PI * 2, 'light', { w: 8, alpha: 0.3, drawOn: false });
    if (prog > 0.005) S.arc(-46, 0, 26, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * prog, 'light', { w: 8, cap: 'round' });
    S.text(`${Math.round(prog * 100)}%`, 32, -10, 28, 'light', { flat: true, shadow: false });
    bar(32, 18, 62, 6, 0.65, 'light');
    S.pop();

    // ── 三顆數據小卡
    for (let i = 0; i < 3; i++) {
      const sp = M.tw(0.12 + M.stag(i + 1), 0.28 + M.stag(i + 1), 'o');
      S.alpha = baseA * clamp(sp) * (1 - exitP);
      S.push();
      S.translate(-54 + i * 54, 6 + (1 - sp) * 22);
      S.rect(0, 0, 48, 34, 12, 'bg', { shadow: false });
      S.circle(-12, -6, 5, ['s', 'a', 'q'][i], { hl: false, shadow: false, flat: true });
      bar(7, -6, 20, 5, 0.5);
      bar(-1, 7, 30, 6, 0.8);
      S.pop();
    }

    // ── 列表（含開關）
    const icons = ['s', 'a', 'q'];
    for (let i = 0; i < 2; i++) {
      const rp = M.tw(0.14 + M.stag(i + 2), 0.32 + M.stag(i + 2), 'o');
      const out = M.tw(0.9 - M.stag(2 - i) * 0.5, 0.97, 'i');
      S.alpha = baseA * clamp(rp) * (1 - exitP) * (1 - out * 0.5);
      const y = 46 + i * 37;
      S.push();
      S.translate((1 - rp) * 70, y);
      S.jitter(30 + i, 0.6);
      S.rect(0, 0, 168, 33, 12, 'bg', { shadow: false });
      S.rect(-62, 0, 20, 20, 7, icons[i], { hl: false, shadow: false });
      bar(-16, -5, 62, 6, 0.8);
      bar(-24, 6, 44, 5, 0.28);
      if (i === 0) {
        const tg = M.tw(0.4, 0.48, 'io');
        S.rect(60, 0, 34, 19, 9.5, 'ink', { alpha: 0.22 * (1 - clamp(tg)), stroke: false, shadow: false, flat: true });
        S.rect(60, 0, 34, 19, 9.5, 'q', { alpha: clamp(tg), shadow: false });
        const kx = lerp(51, 69, tg);
        const squash = Math.sin(clamp(tg) * Math.PI) * mv.squash * 0.5;
        S.push();
        S.translate(kx, 0);
        S.scale(1 + squash, 1 - squash * 0.6);
        S.circle(0, 0, 7.2, 'light', { hl: false });
        S.pop();
      } else {
        S.line([62, -3, 66, 0, 62, 3], 'ink', { w: 2, alpha: 0.4, cap: 'round', drawOn: false });
      }
      S.pop();
    }

    // ── 底部分頁列：指示膠囊在 0.58 左右從「首頁」滑到「統計」
    const tb = M.tw(0.2 + M.stag(5), 0.36 + M.stag(5), 'o');
    S.alpha = baseA * clamp(tb) * (1 - exitP);
    const slide = M.tw(0.58, 0.7, 'io');
    S.push();
    S.translate(0, PH / 2 - 29 + (1 - tb) * 30);
    S.rect(0, 0, 168, 32, 16, 'bg', { shadow: false });
    S.rect(lerp(-60, -20, slide), 0, 38, 26, 13, 'p', { shadow: false });
    for (let i = 0; i < 4; i++) {
      const on = Math.abs(lerp(-60, -20, slide) - (-60 + i * 40)) < 14;
      S.circle(-60 + i * 40, 0, 5.2, on ? 'light' : 'ink', { alpha: on ? 1 : 0.45, stroke: false, flat: true, shadow: false, hl: false, drawOn: false });
    }
    S.pop();

    // ── 主按鈕（按壓與漣漪）
    const bp = M.tw(0.22 + M.stag(5), 0.38 + M.stag(5), 'o');
    S.alpha = baseA * clamp(bp) * (1 - exitP);
    const down = M.seg(0.56, 0.6);
    const up = M.tw(0.6, 0.72, 'o');
    const press = down >= 1 ? 1 - up : M.io(down);
    S.push();
    S.translate(0, 120 + (1 - bp) * 30);
    S.scale(1 - 0.09 * press);
    S.rect(0, 0, 152, 34, 17, 'a');
    S.text('開始創作', 0, 1, 15, 'ink', { flat: true, shadow: false });
    S.pop();
    const rip = M.seg(0.6, 0.78);
    if (rip > 0 && rip < 1) {
      S.alpha = baseA * (1 - rip) * 0.8 * (1 - exitP);
      S.rect(0, 120, 152 + rip * 40, 34 + rip * 40, 17 + rip * 20, null, { stroke: 'a', lw: 1.2, drawOn: false, outline: true });
    }

    // ── 通知橫幅
    const tin = M.tw(0.66, 0.74, 'o');
    const tout = M.tw(0.86, 0.92, 'i');
    if (tin > 0 && tout < 1) {
      S.alpha = baseA * clamp(tin * 1.5) * (1 - tout);
      S.push();
      S.translate(0, lerp(-250, -140, tin) - tout * 110);
      S.rect(0, 0, 172, 42, 15, 'ink');
      S.circle(-64, 0, 10, 'q', { hl: false });
      S.text('已套用風格 ✓', 12, 1, 13, 'light', { flat: true, shadow: false });
      S.pop();
    }
    S.pop();
    S.alpha = baseA;
  },
};
