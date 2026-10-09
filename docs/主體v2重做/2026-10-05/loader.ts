// 主體：載入與微互動（新主體，沒有 v1／v2 之分；筆記見 docs/主體v2參考/loader.md）。
// 藍本：Dribbble「Download 藥丸按鈕」（淺色藥丸＋一顆飽和圓＋大字標籤，整張只有一個強調色）與「Payment Successful」（實心強調色圓＋白色勾）。
// 一個完整的微互動故事：游標移來 → 按下 → 藥丸縮成圓 → 進度環繞行（不是等速，中間會卡一下）→ 環合攏、圓膨脹成實心 → 勾勾畫出 → 漣漪、放射線、彩粒迸開 → 「Downloaded」。
// 寬畫面兩側各有一個小微互動（開關、愛心），在故事中途各自動一次，但降到極淡，不搶主角。
// 全部是時間的純函數；顏色只用色板角色（強調色 p ＋ 中性色階），彩粒才用 p／s／a 三色。
import type { Cue } from '../../audio/types';
import { darken, lighten, mix, readableOn } from '../color';
import { TAU, clamp, hash, lerp } from '../util';
import type { Subject } from './types';

const PW = 260; // 藥丸寬
const PH = 72; // 藥丸高（縮成圓時的直徑）
const KR = 27; // 強調色圓的半徑
const RR = 44; // 進度環半徑
const YO = -8; // 整組略往上（下方留給文字）
const kOf = (Wu: number) => Math.min(1.5, (Wu * 0.82) / PW);

// 進度不是等速：快、卡、衝刺（折線補間再平滑）
const PROG: [number, number][] = [
  [0, 0],
  [0.3, 0.34],
  [0.46, 0.4],
  [0.74, 0.88],
  [0.86, 0.92],
  [1, 1],
];
function progress(x: number): number {
  for (let i = 1; i < PROG.length; i++) {
    if (x <= PROG[i][0]) {
      const [x0, y0] = PROG[i - 1];
      const [x1, y1] = PROG[i];
      const t = (x - x0) / (x1 - x0);
      return lerp(y0, y1, t * t * (3 - 2 * t) * 0.6 + t * 0.4);
    }
  }
  return 1;
}

/** 折線走到比例 t 為止的點（畫勾用） */
function partial(pts: number[], t: number): number[] {
  const n = pts.length / 2;
  let total = 0;
  for (let i = 1; i < n; i++) total += Math.hypot(pts[i * 2] - pts[i * 2 - 2], pts[i * 2 + 1] - pts[i * 2 - 1]);
  let left = total * clamp(t);
  const out = [pts[0], pts[1]];
  for (let i = 1; i < n; i++) {
    const dx = pts[i * 2] - pts[i * 2 - 2];
    const dy = pts[i * 2 + 1] - pts[i * 2 - 1];
    const d = Math.hypot(dx, dy);
    if (left >= d) {
      out.push(pts[i * 2], pts[i * 2 + 1]);
      left -= d;
    } else {
      const f = left / d;
      out.push(pts[i * 2 - 2] + dx * f, pts[i * 2 - 1] + dy * f);
      break;
    }
  }
  return out;
}

function heartPts(cx: number, cy: number, s: number): number[] {
  const out: number[] = [];
  const n = 30;
  for (let i = 0; i < n; i++) {
    const t = (i / n) * TAU;
    const hx = 16 * Math.pow(Math.sin(t), 3);
    const hy = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    out.push(cx + hx * s, cy + 2.2 * s - hy * s);
  }
  return out;
}

const T_PRESS = 0.28;
const T_DONE = 0.8;
const T_TOGGLE = 0.52;
const T_HEART = 0.62;

export const loader: Subject = {
  id: 'loader',
  name: '載入與微互動',
  en: 'Micro-interaction',
  desc: '一個按鈕的完整微互動：游標點下、藥丸縮成圓、進度環繞行、環合攏、勾勾畫出、彩粒迸開；寬畫面兩側另有開關與愛心。最能看出風格套在「小東西」上的質感。',
  loop: 3.6,
  key: 0.8,
  hero: 0.88,
  events: (env) => {
    const k = kOf(env.Wu);
    const ev = [
      { u: T_PRESS, x: -40 * k, y: YO * k, k: 0.5 },
      { u: T_DONE + 0.02, x: 0, y: YO * k, k: 1 },
    ];
    if (env.Wu > 600) {
      const sx = env.Wu / 2 - 70;
      ev.push({ u: T_TOGGLE, x: -sx, y: YO * k, k: 0.4 }, { u: T_HEART, x: sx, y: YO * k, k: 0.5 });
    }
    return ev;
  },
  cues(M, env) {
    const out: Cue[] = [
      { u: 0.02, kind: 'pop', k: 0.5 },
      { u: T_PRESS, kind: 'click', k: 0.8 },
      { u: 0.44, kind: 'rise', k: 0.3 },
      { u: T_DONE, kind: 'ping', k: 0.7 },
      { u: T_DONE + 0.02, kind: 'sparkle', k: 0.8 },
      { u: 0.95, kind: 'whoosh', k: 0.4 },
    ];
    if (env.Wu > 600) out.push({ u: T_TOGGLE, kind: 'toggle', k: 0.6 }, { u: T_HEART, kind: 'pop', k: 0.6 });
    return out.sort((a, b) => a.u - b.u);
  },
  track(M, env) {
    const k = kOf(env.Wu);
    const w = lerp(PW, PH, M.tw(0.3, 0.44, 'io'));
    return [(-w / 2 + PH / 2) * k, YO * k];
  },
  draw(S, M, env) {
    const mv = M.mv;
    const pal = S.pal;
    const det = S.look.detail;
    const baseA = S.alpha;
    const K = kOf(env.Wu);
    const wide = env.Wu > 600 && det > 0.45;
    const FL = { stroke: false, shadow: false, hl: false, flat: true, drawOn: false } as const;

    // ── 顏色：一個強調色＋中性色階
    const hair = mix(pal.card, pal.ink, 0.1);
    const track = mix(pal.card, pal.ink, 0.1);
    const mute = mix(pal.card, pal.ink, 0.5);
    const accent = pal.p;
    const onAcc = readableOn(accent, darken(pal.bg, 0.85), pal.light); // 強調色上的圖示：深色（由背景算出）或 light，挑對比高的
    const confetti = [pal.p, pal.s, pal.a, lighten(pal.p, 0.25)];

    // ── 時間
    const inP = M.tw(0, 0.1, 'o');
    const exitP = M.tw(0.94, 1.0, 'i');
    const master = clamp(inP) * (1 - exitP);
    const press = M.seg(T_PRESS - 0.01, T_PRESS + 0.02) * (1 - M.seg(T_PRESS + 0.02, T_PRESS + 0.08));
    const morph = M.tw(0.3, 0.44, 'io');
    const prog = progress(M.seg(0.44, 0.76));
    const ringIn = M.tw(0.42, 0.47, 'o');
    const grow = M.tw(0.76, 0.82, 'o');
    const checkP = M.tw(0.8, 0.88, 'o');
    const bump = Math.sin(Math.PI * M.seg(0.77, 0.88)) * (0.07 + 0.05 * mv.squash);

    // 像素風格：小字讀不出來，改畫色條（同 UI 主體的做法）
    const cell = (S.look.post.find((q) => q.fx === 'pixelate')?.p.size ?? 0) * 400;
    const T = (str: string, x: number, y: number, size: number, c: string, o: { a?: number; align?: CanvasTextAlign; plain?: boolean } = {}) => {
      const al = o.align ?? 'center';
      const u = size * K;
      if (cell > 1.2 && u < cell * (o.plain ? 6.5 : 10)) {
        const w = Math.max(cell * 2, S.measure(str, size));
        const h = Math.max(cell * 0.9, size * 0.5);
        const cx = al === 'left' ? x + w / 2 : al === 'right' ? x - w / 2 : x;
        S.rect(cx, y, w, h, h / 2, c, { alpha: (o.a ?? 1) * 0.55, ...FL });
        return;
      }
      S.text(str, x, y, size, c, { flat: true, shadow: false, alpha: o.a ?? 1, align: al, ...(u < 13 || o.plain ? { stroke: false as const } : {}) });
    };
    const ln = (pts: number[], c: string, w: number, a = 1) => S.line(pts, c, { w, cap: 'round', alpha: a, drawOn: false });

    // ════ 兩側的小微互動（寬畫面）
    if (wide) {
      const sx = env.Wu / 2 - 70;
      const sk = Math.min(1.25, K * 0.9);
      const sIn = (i: number) => clamp(M.tw(0.04 + i * 0.03, 0.14 + i * 0.03, 'o'));
      // 開關：在 T_TOGGLE 翻到開
      {
        const p = sIn(0);
        S.alpha = baseA * p * (1 - exitP) * 0.9;
        S.push();
        S.translate(-sx, YO * K + (1 - p) * 10);
        S.scale(sk);
        const on = M.tw(T_TOGGLE - 0.02, T_TOGGLE + 0.04, 'o');
        S.rect(0, 1.4, 62, 34, 17, 'ink', { alpha: 0.05, ...FL });
        S.rect(0, 0, 62, 34, 17, mix(mix(pal.card, pal.ink, 0.14), accent, on), { shadow: false, hl: false, stroke: hair, outline: true, lw: 0.32, drawOn: false });
        S.circle(lerp(-14, 14, on), 0, 13, 'card', { shadow: false, hl: false, stroke: hair, outline: true, lw: 0.3, drawOn: false });
        S.pop();
      }
      // 愛心：在 T_HEART 彈出並填色，放射小線
      {
        const p = sIn(1);
        S.alpha = baseA * p * (1 - exitP) * 0.9;
        S.push();
        S.translate(sx, YO * K + (1 - p) * 10);
        S.scale(sk);
        const hp = M.tw(T_HEART - 0.01, T_HEART + 0.04, 'o');
        const pop = 1 + Math.sin(Math.PI * M.seg(T_HEART - 0.01, T_HEART + 0.09)) * 0.22;
        S.circle(0, 1.4, 27, 'ink', { alpha: 0.05, ...FL });
        S.circle(0, 0, 27, 'card', { shadow: false, hl: false, stroke: hair, outline: true, lw: 0.32, drawOn: false });
        S.push();
        S.scale(pop);
        S.poly(heartPts(0, -1, 0.82), hp > 0.5 ? accent : mix(pal.card, pal.ink, 0.04), { stroke: hp > 0.5 ? false : mute, outline: hp <= 0.5, lw: 0.9, shadow: false, hl: false, flat: true, drawOn: false });
        S.pop();
        const rp = M.seg(T_HEART, T_HEART + 0.12);
        if (rp > 0 && rp < 1) {
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * TAU + 0.2;
            const r0 = 32 + rp * 6;
            ln([Math.cos(a) * r0, Math.sin(a) * r0, Math.cos(a) * (r0 + 8 * (1 - rp)), Math.sin(a) * (r0 + 8 * (1 - rp))], accent, 2, 1 - rp);
          }
        }
        S.pop();
      }
    }

    // ════ 主角
    S.alpha = baseA * master;
    if (S.alpha < 0.004) return;
    S.push();
    S.translate(0, YO * K);
    S.scale(K * lerp(0.72, 1, inP) * (1 - 0.05 * exitP));

    const w = lerp(PW, PH, morph);
    const left = -w / 2;
    const knobX = left + PH / 2;
    const ps = 1 - (0.05 + 0.05 * mv.squash) * press;
    S.push();
    S.scale(ps, 1 / Math.pow(ps, 0.5));

    // 藥丸的面：極淡的下緣影子＋髮絲邊框
    if (det > 0.3) S.rect(0, 3, w - 2, PH, PH / 2, 'ink', { alpha: 0.06, ...FL });
    S.rect(0, 0, w, PH, PH / 2, 'card', { shadow: false, hl: false, stroke: hair, outline: true, lw: 0.4, drawOn: false });

    // 標籤：藥丸縮小前淡出
    const labA = 1 - M.seg(0.29, 0.35);
    if (labA > 0.01) {
      const x0 = left + PH + 2;
      const x1 = w / 2 - 16;
      T('Download', (x0 + x1) / 2, 1, 27, pal.ink, { a: labA });
    }

    // 進度環：底軌＋強調色弧（從 12 點鐘順時針）
    if (ringIn > 0.01) {
      S.alpha = baseA * master * ringIn;
      S.circle(0, 0, RR, null, { stroke: track, outline: true, lw: 2.2, shadow: false, hl: false, drawOn: false });
      if (prog > 0.002) S.arc(0, 0, RR, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(prog), accent, { w: 5, cap: 'round', drawOn: false });
      S.alpha = baseA * master;
    }

    // 強調色圓：藥丸裡的箭頭鈕 → 中心 → 完成時膨脹成實心
    const kr = lerp(KR, RR + 2.5, grow) * (1 + bump);
    S.circle(knobX, 0, kr, accent, { shadow: false, hl: false });
    // 箭頭（會輕輕上下點頭，按下前）→ 淡出
    const arrA = 1 - M.seg(0.3, 0.4);
    if (arrA > 0.01) {
      const bob = Math.sin(M.u * TAU * 4) * 1.6 * (1 - M.seg(0.2, 0.28));
      const ay = bob - 1;
      ln([knobX, ay - 9, knobX, ay + 9], onAcc, 3.2, arrA);
      ln([knobX - 7, ay + 2, knobX, ay + 9.5, knobX + 7, ay + 2], onAcc, 3.2, arrA);
    }
    // 百分比（進度中）
    const pctA = M.seg(0.44, 0.49) * (1 - M.seg(0.76, 0.79));
    if (pctA > 0.01) T(`${Math.round(prog * 100)}%`, knobX, 1, 16, onAcc, { a: pctA, plain: true });
    // 勾
    if (checkP > 0.005) {
      const ck = partial([-14, 1, -4.5, 10.5, 15, -10], checkP);
      ln(ck, onAcc, 6.2);
    }
    S.pop();

    // ════ 迸開：漣漪、放射線、彩粒
    const bp = M.seg(T_DONE, 0.97);
    if (bp > 0 && bp < 1 && det > 0.3) {
      for (let r = 0; r < 2; r++) {
        const rp = clamp((bp - r * 0.08) / (1 - r * 0.08));
        if (rp <= 0) continue;
        S.circle(0, 0, RR + 3 + rp * (38 + r * 18), null, { stroke: accent, outline: true, lw: 1.6 * (1 - rp) + 0.4, alpha: (1 - rp) * (1 - rp) * 0.55, shadow: false, hl: false, drawOn: false });
      }
      if (det > 0.45) {
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * TAU + 0.15;
          const r0 = RR + 8 + bp * 18;
          const len = 13 * (1 - bp);
          ln([Math.cos(a) * r0, Math.sin(a) * r0, Math.cos(a) * (r0 + len), Math.sin(a) * (r0 + len)], accent, 2.4, 1 - bp);
        }
      }
    }
    const ts = Math.max(0, (M.u - T_DONE - 0.005) * M.L); // 秒
    if (ts > 0 && M.u < 0.98 && det > 0.4) {
      const n = det > 0.7 ? 22 : 10;
      const fade = 1 - M.seg(0.9, 0.975);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + (hash(i, 7) - 0.5) * 0.5;
        const v = 95 + hash(i, 3) * 120;
        const drag = (1 - Math.exp(-ts * 3.6)) / 3.6; // 阻力：先衝後緩
        const x = Math.cos(a) * v * drag;
        const y = Math.sin(a) * v * drag * 0.9 + 0.5 * 150 * ts * ts - 6;
        const rot = ts * (3 + hash(i, 5) * 6) * (i % 2 ? 1 : -1);
        const sz = 3 + hash(i, 9) * 3.2;
        const c = confetti[i % confetti.length];
        S.push();
        S.translate(x, y);
        S.rotate(rot);
        if (i % 3 === 0) S.circle(0, 0, sz * 0.62, c, { alpha: fade, ...FL });
        else S.rect(0, 0, sz * 1.9, sz * 0.8, 0.6, c, { alpha: fade, ...FL });
        S.pop();
      }
    }

    // ════ 文字：完成後出現「Downloaded」
    const dn = M.tw(0.85, 0.91, 'o');
    if (dn > 0.01) T('Downloaded', 0, RR + 46 + (1 - dn) * 8, 21, pal.ink, { a: dn * 0.8, plain: true });

    // ════ 游標：移來 → 按下 → 離開
    const cIn = M.tw(0.06, 0.25, 'io');
    const cOut = M.tw(0.33, 0.42, 'i');
    if (cIn > 0.01 && cOut < 0.99) {
      const tx = -34;
      const ty = 4;
      const cx = lerp(tx + 120, tx, cIn) + cOut * 24;
      const cy = lerp(ty + 90, ty, cIn) + cOut * 30;
      const cp = (1 - cOut) * clamp(cIn * 2);
      const pr = 1 - 0.1 * press;
      S.alpha = baseA * master * cp;
      S.push();
      S.translate(cx, cy);
      S.scale(pr);
      S.poly([0, 0, 0, 20, 5.2, 15.4, 8.8, 23.4, 12.4, 21.8, 8.8, 14, 15.4, 14], 'ink', { stroke: 'light', outline: true, lw: 0.55, shadow: false, hl: false, flat: true, drawOn: false });
      S.pop();
      // 按下的漣漪
      const rp = M.seg(T_PRESS, T_PRESS + 0.07);
      if (rp > 0 && rp < 1) {
        S.alpha = baseA * master;
        S.circle(tx, ty, 5 + rp * 24, null, { stroke: 'ink', outline: true, lw: 0.9, alpha: (1 - rp) * 0.4, shadow: false, hl: false, drawOn: false });
      }
    }
    S.pop();
    S.alpha = baseA;
  },
};
