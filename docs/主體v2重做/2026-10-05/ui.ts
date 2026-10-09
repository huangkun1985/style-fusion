// 主體 v2：手機 UI（第四版，Dribbble「Statistics／Class Detail」為藍本；色彩、形狀、構圖都重新收斂，筆記見 docs/主體v2參考/ui.md）。
// 整個螢幕用參考圖的實際座標（390×844 pt）畫，再縮放進手機。設計原則（第四版重點）：
//  ‧ 色彩克制：只有「一個強調色（p）＋中性色階（ink 的不同濃度）＋語意綠（q，正向變化與開關）」，不再四種原色亂用；
//  ‧ 所有卡片同一種語言：髮絲邊框＋極淡的下緣陰影、同一個圓角；兩側卡片也一樣；
//  ‧ 長條圖只有頂端圓角（底部平的）；愛心是真正的心形曲線；頭像用縮寫字母而不是剪影；檔案圖示是帶摺角的文件；
//  ‧ 手機邊框細；通知是動態島展開的膠囊，和標題之間留呼吸空間。
// 時間結構與 v1 相同：進場、長條長出、開關切換、點選長條（漣漪）、導覽切換、通知彈出、退場。寬畫面兩側多出環形儀表卡與收藏清單卡。顏色只用色板角色。
import type { Cue } from '../../../audio/types';
import { mix } from '../../color';
import { clamp, lerp, TAU } from '../../util';
import type { Subject } from '../types';

const SC = 0.41; // 1 pt = 0.41 設計單位（390 pt 寬的螢幕 → 約 160 單位；手機高約 350，上下留白）
const SW = 390;
const SH = 844;
const PW = SW * SC + 10;
const PH = SH * SC + 10;
const BARS = [0.55, 0.7, 0.42, 0.9, 0.62, 0.38, 0.88, 0.6];
const HI0 = 3; // 一開始強調的長條
const HI1 = 6; // 被點選後強調的長條
const barX = (i: number) => 56 + i * 40; // 螢幕座標（pt）
const BASE_Y = 496;
const MAX_H = 150;

/** 真正的心形曲線（經典參數式），以 (cx,cy) 為視覺中心、s 為縮放（寬約 32·s） */
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

export const ui2: Subject = {
  id: 'ui',
  name: 'UI 介面',
  en: 'App UI',
  desc: '一支 App 統計頁的整套微交互：進場、長條圖長出、交錯列表、開關、點選長條、導覽切換、通知彈出與退場。',
  loop: 4.2,
  key: 0.58,
  hero: 0.78,
  events: (env) => {
    const ev = [
      { u: 0.44, x: (332 - SW / 2) * SC, y: (726 - SH / 2) * SC, k: 0.5 },
      { u: 0.6, x: (barX(HI1) - SW / 2) * SC, y: (BASE_Y - MAX_H * BARS[HI1] - SH / 2) * SC, k: 0.8 },
    ];
    if (env.Wu > 600) ev.push({ u: 0.52, x: env.Wu * 0.34 - 40, y: -30, k: 0.6 });
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
    // 追蹤點跟著「展開的動態島」：從島的位置（螢幕 y≈30 pt）展開到通知（y≈42 pt）再縮回
    const e = M.tw(0.66, 0.74, 'o') * (1 - M.tw(0.86, 0.92, 'i'));
    return [0, (lerp(30, 42, e) - SH / 2) * SC];
  },
  draw(S, M, env) {
    const mv = M.mv;
    const pal = S.pal;
    const det = S.look.detail;
    const exitP = M.tw(0.92, 1.0, 'i');
    const inP = M.tw(0.0, 0.16, 'o');
    const baseA = S.alpha;
    const wide = env.Wu > 600;

    // ── 色彩：一個強調色（p）＋ink 的不同濃度＋語意綠（q）；全部由色板角色算出
    const screen = mix(pal.bg, pal.card, 0.72);
    const hair = mix(pal.card, pal.ink, 0.085); // 髮絲邊框
    const gray = mix(pal.card, pal.ink, 0.09); // 長條圖（非強調）
    const soft = mix(pal.card, pal.ink, 0.05); // 淡灰底（按鈕、晶片）
    const mute = mix(pal.card, pal.ink, 0.5); // 次要文字與未啟用圖示
    const tint = mix(pal.p, pal.card, 0.87); // 強調色的淡色底
    const tint2 = mix(pal.p, pal.card, 0.66);
    const slateD = mix(pal.ink, pal.card, 0.14); // 環形圖的深色段
    const slateL = mix(pal.ink, pal.card, 0.72); // 環形圖的淺色段
    const amber = mix(pal.a, pal.ink, 0.38); // 提醒色：和白底有足夠對比
    const FL = { stroke: false, shadow: false, hl: false, flat: true, drawOn: false } as const;
    // 卡片：髮絲邊框＋極淡的下緣陰影（一道偏移 1.6 的淡色矩形，不用風格的模糊陰影）；k 是座標系倍率（pt 座標 1，單位座標 0.45）
    const card = (x: number, y: number, w: number, h: number, r: number, k = 1, fill = 'card') => {
      S.rect(x, y + 1.7 * k, w - 1.5 * k, h, r, 'ink', { alpha: 0.05, ...FL });
      S.rect(x, y, w, h, r, fill, { shadow: false, hl: false, stroke: hair, outline: true, lw: 0.32, drawOn: false });
    };
    /** 只有頂端圓角的長條（參考圖的長條底部是平的） */
    const barRect = (x: number, baseY: number, w: number, h: number, r: number, fill: string, o: { alpha?: number } = {}) => {
      const rr = Math.min(r, h, w / 2);
      const pts: number[] = [x - w / 2, baseY];
      for (let q = 0; q <= 6; q++) {
        const a = Math.PI + (q / 6) * (Math.PI / 2);
        pts.push(x - w / 2 + rr + Math.cos(a) * rr, baseY - h + rr + Math.sin(a) * rr);
      }
      for (let q = 0; q <= 6; q++) {
        const a = Math.PI * 1.5 + (q / 6) * (Math.PI / 2);
        pts.push(x + w / 2 - rr + Math.cos(a) * rr, baseY - h + rr + Math.sin(a) * rr);
      }
      pts.push(x + w / 2, baseY);
      S.poly(pts, fill, { shadow: false, hl: false, flat: true, stroke: false, drawOn: false, alpha: o.alpha ?? 1 });
    };

    // 像素風格（像素化後期）一格像素有幾個設計單位：字小於約 3.6 格高就讀不出來，改畫成色條（像線框稿）
    const cell = (S.look.post.find((q) => q.fx === 'pixelate')?.p.size ?? 0) * 400;
    /** 文字：k 是座標系對設計單位的倍率（手機內是 SC，卡片是 1）；小於 13 單位的字不描邊（粗描邊風格會把小字糊成一團） */
    const mkT =
      (k: number) =>
      (str: string, x: number, y: number, size: number, c: string, o: { a?: number; align?: CanvasTextAlign; font?: 'mono' } = {}) => {
        const al = o.align ?? 'left';
        const u = size * k;
        if (cell > 1.2 && u < cell * 3.6) {
          const w = Math.max((cell * 2) / k, S.measure(str, size));
          const h = Math.max((cell * 0.9) / k, size * 0.5);
          const cx = al === 'left' ? x + w / 2 : al === 'right' ? x - w / 2 : x;
          S.rect(cx, y, w, h, h / 2, c, { alpha: (o.a ?? 1) * 0.55, ...FL });
          return;
        }
        S.text(str, x, y, size, c, { flat: true, shadow: false, alpha: o.a ?? 1, align: al, ...(u < 13 ? { stroke: false as const } : {}), ...(o.font ? { font: o.font } : {}) });
      };
    const T = mkT(SC); // 手機內（pt 座標）
    const U = mkT(1); // 兩側卡片（單位座標）
    const line = (pts: number[], c: string, w: number, a = 1) => S.line(pts, c, { w, cap: 'round', alpha: a, drawOn: false });
    /** 讓一組元素依時間進場：淡入＋由下往上滑 */
    const group = (p: number, rise: number, draw: () => void, extraA = 1) => {
      S.alpha = baseA * clamp(p) * (1 - exitP) * extraA;
      if (S.alpha < 0.004) return;
      S.push();
      S.translate(0, (1 - p) * rise);
      draw();
      S.pop();
    };
    const arrowD = (x: number, y: number, s: number, c: string, a = 1) => line([x - s, y - s * 0.4, x, y + s * 0.6, x + s, y - s * 0.4], c, 1.6, a);
    /** 圓形縮寫頭像 */
    const avatar = (x: number, y: number, r: number, fill: string, ch: string, fg: string) => {
      S.circle(x, y, r, fill, { stroke: 'card', outline: true, lw: 0.5, hl: false, shadow: false, flat: true, drawOn: false });
      T(ch, x, y + 0.5, 10, fg, { align: 'center' });
    };

    // 線條圖示（參考圖的導覽是線條圖示，啟用的那個是實心）
    const icon = (kind: 'home' | 'folder' | 'pie' | 'user', x: number, y: number, c: string, fillK: number) => {
      const w = 1.8;
      if (kind === 'home') {
        if (fillK > 0.5) S.poly([x - 11, y - 1, x, y - 11, x + 11, y - 1, x + 8, y - 1, x + 8, y + 9, x - 8, y + 9, x - 8, y - 1], c, FL);
        else {
          line([x - 11, y - 1, x, y - 11, x + 11, y - 1], c, w);
          line([x - 8, y - 3, x - 8, y + 9, x + 8, y + 9, x + 8, y - 3], c, w);
        }
      } else if (kind === 'folder') {
        if (fillK > 0.5) {
          S.rect(x, y + 2, 22, 15, 3.5, c, FL);
          S.rect(x - 6, y - 6, 10, 6, 2.5, c, FL);
        } else {
          S.rect(x, y + 2, 21, 14, 3.5, null, { stroke: c, outline: true, lw: 0.8, drawOn: false });
          line([x - 10, y - 5.5, x - 3, y - 5.5, x, y - 2.5], c, w);
        }
      } else if (kind === 'pie') {
        if (fillK > 0.5) {
          S.circle(x, y, 10, c, { ...FL, alpha: 0.35 });
          const wd: number[] = [x, y];
          for (let q = 0; q <= 8; q++) wd.push(x + Math.cos(-Math.PI / 2 + (q / 8) * 1.9) * 10, y + Math.sin(-Math.PI / 2 + (q / 8) * 1.9) * 10);
          S.poly(wd, c, FL);
        } else {
          S.arc(x, y, 9.5, 0, TAU, c, { w, drawOn: false });
          line([x, y, x, y - 9.5], c, w);
          line([x, y, x + 8.2, y + 4.7], c, w);
        }
      } else {
        S.arc(x, y - 4.5, 4.8, 0, TAU, c, { w, drawOn: false });
        S.arc(x, y + 11, 10, Math.PI * 1.1, Math.PI * 1.9, c, { w, cap: 'round', drawOn: false });
      }
    };
    /** 帶摺角的文件圖示（檔案列用） */
    const doc = (x: number, y: number, c: string, a = 1) => {
      S.poly([x - 7, y - 9, x + 2, y - 9, x + 7, y - 4, x + 7, y + 9, x - 7, y + 9], null, { stroke: c, outline: true, lw: 0.6, alpha: a, drawOn: false });
      line([x + 2, y - 9, x + 2, y - 4, x + 7, y - 4], c, 1.3, a);
      line([x - 3.5, y + 1, x + 3.5, y + 1], c, 1.3, a * 0.8);
      line([x - 3.5, y + 5, x + 1.5, y + 5], c, 1.3, a * 0.8);
    };

    // ═══ 兩側卡片（寬畫面）：左＝環形儀表，右＝收藏數與清單；和手機同一種語言（髮絲邊框、克制配色）═══
    if (wide) {
      const sx = env.Wu * 0.34;
      const lp = M.tw(0.08, 0.26, 'o');
      S.alpha = baseA * clamp(lp * 1.3) * (1 - exitP);
      S.push();
      S.translate(-sx, -6 + (1 - lp) * 40 + exitP * 30);
      S.jitter(21);
      card(0, 0, 150, 150, 12, 0.45);
      U('Spending', -60, -58, 8, 'ink', { a: 0.5 });
      const ring = M.tw(0.14, 0.46, 'io');
      const segs: [number, string][] = [
        [0.5, pal.p],
        [0.28, slateD],
        [0.22, slateL],
      ];
      let a0 = -Math.PI / 2;
      S.arc(0, -6, 37, 0, TAU, soft, { w: 8, drawOn: false });
      for (const [f, c] of segs) {
        const a1 = a0 + TAU * f * ring;
        if (ring > 0.01) S.arc(0, -6, 37, a0 + 0.07, Math.max(a0 + 0.07, a1 - 0.07), c, { w: 8, cap: 'round' });
        a0 += TAU * f;
      }
      U(`$${Math.round(3430 * ring).toLocaleString('en-US')}`, 0, -9, 12.5, 'ink', { align: 'center' });
      if (det > 0.5) U('TOTAL', 0, 4, 5.5, 'ink', { align: 'center', a: 0.45 });
      if (det > 0.45) {
        ['50%', '28%', '22%'].forEach((t, i) => {
          S.circle(-46 + i * 46, 52, 3.2, segs[i][1], FL);
          U(t, -40 + i * 46, 52, 7.5, 'ink', { a: 0.65 });
        });
      }
      S.pop();

      const rp = M.tw(0.14, 0.32, 'o');
      S.alpha = baseA * clamp(rp * 1.3) * (1 - exitP);
      S.push();
      S.translate(sx, 16 + (1 - rp) * 40 + exitP * 30);
      S.jitter(22);
      card(0, 0, 150, 150, 12, 0.45);
      // 收藏鈕：圓形髮絲邊框，裡面是真正的心形；點到時彈起並填色
      const pop = M.tw(0.48, 0.58, 'o');
      const on = pop > 0.05;
      S.circle(-46, -44, 15, soft, FL);
      S.push();
      S.translate(-46, -44);
      S.scale(0.72 + 0.28 * pop + 0.3 * Math.sin(clamp(pop) * Math.PI) * (0.5 + mv.exag));
      S.blob(heartPts(0, 0, 0.55), on ? 'p' : null, { shadow: false, hl: false, ...(on ? { stroke: false } : { stroke: mute, outline: true, lw: 0.6 }), drawOn: false });
      S.pop();
      U(on ? `+${(1.2 * clamp(pop)).toFixed(1)}k` : '+0.0k', -24, -44, 17, 'ink');
      S.rect(0, -20, 126, 0.8, 0, hair, FL);
      const rows: [string, string, string][] = [
        ['Dining', '$240.90', '40%'],
        ['Shopping', '$390.00', '32%'],
        ['Travel', '$587.80', '89%'],
      ];
      rows.forEach(([n, v, pc], i) => {
        const g = M.tw(0.2 + M.stag(i), 0.36 + M.stag(i), 'o');
        S.push();
        S.translate((1 - g) * 30, 0 + i * 27);
        S.alpha = baseA * clamp(g) * (1 - exitP);
        S.circle(-52, 4, 9, i === 0 ? tint : soft, FL);
        S.circle(-52, 4, 2.8, i === 0 ? 'p' : mute, FL);
        U(n, -38, -1, 7.5, 'ink', { a: 0.5 });
        U(v, -38, 9, 9, 'ink');
        U(pc, 58, 4, 8, 'ink', { align: 'right', a: 0.55 });
        S.pop();
      });
      S.pop();
    }

    // ═══ 手機 ═══
    S.alpha = baseA * clamp(inP * 1.2) * (1 - exitP);
    S.push();
    S.translate(0, (1 - inP) * 90 + exitP * 60);
    S.scale(lerp(0.92, 1, inP));
    S.jitter(20);
    S.rect(0, 0, PW, PH, 30, 'ink');
    S.rect(0, 0, PW - 7, PH - 7, 26.5, screen, { shadow: false });
    // 之後都用參考圖的螢幕座標（pt）：原點移到螢幕左上角
    S.push();
    S.scale(SC);
    S.translate(-SW / 2, -SH / 2);

    // ── 狀態列：時間、動態島、訊號與電量
    const tin = M.tw(0.66, 0.74, 'o');
    const tout = M.tw(0.86, 0.92, 'i');
    const e = tin * (1 - tout); // 通知展開程度（0＝收著，動態島原樣；>0 時由展開的膠囊取代島）
    if (e <= 0.01) S.rect(195, 30, 112, 32, 16, 'ink', { shadow: false, stroke: false, flat: true });
    T('10:00', 42, 30, 15, 'ink', { font: 'mono' });
    for (let i = 0; i < 4; i++) S.rect(292 + i * 5.5, 33 - i * 1.6, 3.4, 5 + i * 3, 1, 'ink', { ...FL, alpha: 0.85 });
    S.rect(344, 30, 24, 12, 3.5, null, { stroke: 'ink', outline: true, lw: 0.5, alpha: 0.7, drawOn: false });
    S.rect(342.6, 30, 15, 8, 1.8, 'ink', { ...FL, alpha: 0.85 });

    // ── 標題列：大標題＋圓形加號鈕
    group(M.tw(0.04 + M.stag(0), 0.2 + M.stag(0), 'o'), 40, () => {
      T('Statistics', 20, 90, 26, 'ink');
      S.circle(352, 90, 19, soft, FL);
      line([344, 90, 360, 90], 'ink', 1.9);
      line([352, 82, 352, 98], 'ink', 1.9);
    });

    // ── 選單卡：縮寫頭像＋標題＋說明＋箭頭
    group(M.tw(0.06 + M.stag(1), 0.24 + M.stag(1), 'o'), 40, () => {
      card(195, 155, 350, 58, 12);
      S.rect(52, 155, 38, 38, 9, 'p', { shadow: false, hl: false });
      T('CA', 52, 155, 14, 'light', { align: 'center' });
      T('Computer Architecture ...', 80, 147, 14.5, 'ink');
      T('CLASS A', 80, 167, 10, 'ink', { a: 0.5 });
      arrowD(346, 155, 5.5, 'ink', 0.7);
    });

    // ── 主視覺卡
    const cp = M.tw(0.08 + M.stag(2), 0.26 + M.stag(2), 'o');
    group(cp, 50, () => {
      S.translate(195, 360);
      S.scale(lerp(0.94, 1, cp));
      S.translate(-195, -360);
      card(195, 362, 350, 318, 12);
      // 頂部標題條：圓餅圖示＋「Overall Presence」，下方一條分隔線
      S.circle(41, 220, 7, 'p', { ...FL, alpha: 0.3 });
      const wd: number[] = [41, 220];
      for (let q = 0; q <= 8; q++) wd.push(41 + Math.cos(-Math.PI / 2 + (q / 8) * 2.1) * 7, 220 + Math.sin(-Math.PI / 2 + (q / 8) * 2.1) * 7);
      S.poly(wd, 'p', FL);
      T('Overall Presence', 56, 220, 11.5, 'p');
      S.rect(195, 238, 350, 0.9, 0, hair, FL);
      const n = (85 * M.tw(0.14, 0.4, 'io')).toFixed(0);
      T(`${n}%`, 36, 272, 30, 'ink');
      // 變化量膠囊：淡綠底、綠字
      S.rect(150, 274, 78, 22, 11, mix(pal.q, pal.card, 0.86), FL);
      T('▲ 4.12%', 150, 274, 11, 'q', { align: 'center' });
      if (det > 0.5) T('STUDENT PRESENCE', 36, 300, 9.5, 'ink', { a: 0.5 });
      // 描邊按鈕「View All」
      card(318, 286, 88, 30, 9);
      T('View All', 304, 286, 11, 'ink', { align: 'center', a: 0.8 });
      line([336, 291, 344, 283], 'ink', 1.4, 0.6);
      line([337, 283, 344, 283, 344, 290], 'ink', 1.4, 0.6);
      S.rect(195, 320, 350, 0.9, 0, hair, FL);
      // 長條圖：虛線平均線、8 根淺灰長條（只有頂端圓角）、一根強調色＋深色數值氣泡
      const tap = M.tw(0.56, 0.64, 'o');
      const sq = Math.sin(clamp(tap) * Math.PI) * mv.squash * 0.35;
      if (det > 0.5) S.line([34, BASE_Y - MAX_H * 0.62, 356, BASE_Y - MAX_H * 0.62], 'ink', { w: 0.9, alpha: 0.18, dash: [4, 4], drawOn: false });
      BARS.forEach((v, i) => {
        const g = M.tw(0.16 + M.stag(i) * 0.5, 0.4 + M.stag(i) * 0.5, 'o');
        const h = Math.max(1.5, v * MAX_H * g);
        const x = barX(i);
        const hi = i === HI0 ? 1 - tap : i === HI1 ? tap : 0;
        const bump = i === HI1 ? 1 + sq : 1;
        barRect(x, BASE_Y, 30, h, 7, gray);
        if (hi > 0.01) barRect(x, BASE_Y, 30, h * bump, 7, 'p', { alpha: hi });
        if (det > 0.6) T(`W${i + 1}`, x, BASE_Y + 14, 9.5, 'ink', { align: 'center', a: (i === HI0 && tap < 0.5) || (i === HI1 && tap >= 0.5) ? 0.95 : 0.35 });
      });
      const tt = M.tw(0.36, 0.42, 'o');
      if (tt > 0.01) {
        const k = M.tw(0.56, 0.64, 'io');
        const ix = lerp(barX(HI0), barX(HI1), k);
        const top = BASE_Y - lerp(BARS[HI0], BARS[HI1], k) * MAX_H * M.tw(0.16, 0.4, 'o');
        const hop = -16 * Math.sin(clamp(k) * Math.PI);
        S.alpha *= clamp(tt);
        S.rect(ix, top - 18 + hop, 62, 22, 8, 'ink', { shadow: false });
        S.poly([ix - 5, top - 8 + hop, ix + 5, top - 8 + hop, ix, top - 3 + hop], 'ink', FL);
        T(`▲ ${tap < 0.5 ? 90 : 88}%`, ix, top - 18 + hop, 11, 'light', { align: 'center' });
      }
      const rip = M.seg(0.56, 0.72);
      if (rip > 0 && rip < 1) {
        S.alpha = baseA * (1 - rip) * 0.7 * (1 - exitP);
        S.circle(barX(HI1), BASE_Y - MAX_H * BARS[HI1] * 0.5, 12 + rip * 46, null, { stroke: 'p', lw: 0.6, outline: true, drawOn: false });
      }
    });

    // ── 區段標題
    group(M.tw(0.14 + M.stag(3), 0.3 + M.stag(3), 'o'), 24, () => {
      T('Active Assignment', 20, 553, 15, 'ink');
      T('View All', 370, 553, 12, 'ink', { align: 'right', a: 0.45 });
    });

    // ── 三列清單：兩個作業列（文件圖示、狀態字、標題、頭像堆疊）＋一個開關列
    const out = (i: number) => M.tw(0.9 - M.stag(2 - i) * 0.5, 0.97, 'i');
    for (let i = 0; i < 3; i++) {
      const rp = M.tw(0.15 + M.stag(i + 3), 0.33 + M.stag(i + 3), 'o');
      S.alpha = baseA * clamp(rp) * (1 - exitP) * (1 - out(i) * 0.5);
      const y = 599 + i * 64;
      S.push();
      S.translate((1 - rp) * 150, y);
      S.jitter(30 + i, 0.6);
      card(195, 0, 350, 56, 11);
      S.rect(48, 0, 38, 38, 9, i === 0 ? tint : soft, FL);
      if (i < 2) {
        doc(48, 0, i === 0 ? pal.p : mute);
        T(i === 0 ? '85% submitted' : '65% submitted', 76, -10, 11, i === 0 ? 'q' : amber);
        T(i === 0 ? 'Final Project Presentation' : 'Create a website template', 76, 9, 13.5, 'ink');
        avatar(314, 0, 11, tint2, 'J', pal.p);
        avatar(330, 0, 11, i === 0 ? slateD : slateL, 'M', 'card');
        S.circle(352, 0, 11, soft, FL);
        T(i === 0 ? '+8' : '+6', 352, 0, 9.5, 'ink', { align: 'center', a: 0.65 });
      } else {
        // 鈴鐺圖示與開關列
        S.arc(48, -2, 7.5, Math.PI, TAU, 'ink', { w: 1.8, alpha: 0.75, drawOn: false });
        line([40.5, -2, 40.5, 6, 55.5, 6, 55.5, -2], 'ink', 1.8, 0.75);
        S.circle(48, 11, 2.4, 'ink', { ...FL, alpha: 0.75 });
        T('Weekly report', 76, -9, 13.5, 'ink');
        if (det > 0.5) T('Email me every Monday', 76, 10, 10, 'ink', { a: 0.5 });
        const tg = M.tw(0.4, 0.48, 'io');
        S.rect(332, 0, 48, 28, 14, 'ink', { alpha: 0.14 * (1 - clamp(tg)), ...FL });
        S.rect(332, 0, 48, 28, 14, 'q', { alpha: clamp(tg), shadow: false });
        const squash = Math.sin(clamp(tg) * Math.PI) * mv.squash * 0.5;
        S.push();
        S.translate(lerp(321, 343, tg), 0);
        S.scale(1 + squash, 1 - squash * 0.6);
        S.circle(0, 0, 11, 'light', { hl: false, shadow: false });
        S.pop();
      }
      S.pop();
    }

    // ── 底部導覽：線條圖示＋標籤；亮色指示條與選取色在 0.58 左右從「Home」滑到「Stats」
    const tb = M.tw(0.2 + M.stag(6), 0.36 + M.stag(6), 'o');
    S.alpha = baseA * clamp(tb) * (1 - exitP);
    const slide = M.tw(0.58, 0.7, 'io');
    S.push();
    S.translate(0, (1 - tb) * 60);
    // 導覽底板：底部兩角跟螢幕的圓角一致（不然方形底板會凸出手機）
    {
      const R = 60;
      const bp: number[] = [0, 770, SW, 770, SW, SH - R];
      for (let q = 1; q <= 8; q++) bp.push(SW - R + Math.cos((q / 8) * (Math.PI / 2)) * R, SH - R + Math.sin((q / 8) * (Math.PI / 2)) * R);
      for (let q = 1; q <= 8; q++) bp.push(R + Math.cos(Math.PI / 2 + (q / 8) * (Math.PI / 2)) * R, SH - R + Math.sin(Math.PI / 2 + (q / 8) * (Math.PI / 2)) * R);
      bp.push(0, SH - R);
      S.poly(bp, 'card', { shadow: false, hl: false, stroke: false, flat: true, drawOn: false });
    }
    S.rect(195, 770, SW, 0.9, 0, hair, FL);
    const navX = (i: number) => 48.75 + i * 97.5;
    const sx0 = lerp(navX(0), navX(2), slide);
    S.rect(sx0, 771, 34, 3.4, 1.7, 'p', { shadow: false, hl: false, stroke: false, flat: true });
    const labels = ['Home', 'Class', 'Stats', 'Profile'];
    const kinds: ('home' | 'folder' | 'pie' | 'user')[] = ['home', 'folder', 'pie', 'user'];
    kinds.forEach((k, i) => {
      const act = i === 0 ? 1 - slide : i === 2 ? slide : 0;
      const col = act > 0.5 ? 'p' : mute;
      icon(k, navX(i), 800, col, act);
      T(labels[i], navX(i), 826, 11, col, { align: 'center', a: act > 0.5 ? 1 : 0.9 });
    });
    S.rect(195, 836, 134, 5, 2.5, 'ink', { ...FL, alpha: 0.85 });
    S.pop();

    // ── 通知：動態島展開成一條深色膠囊（像 iOS 的即時動態），不會蓋住標題，和標題之間留空；展開 0.66、收回 0.86
    if (e > 0.01) {
      S.alpha = baseA * (1 - exitP);
      const w = lerp(112, 346, e);
      const h = lerp(32, 46, e);
      const cy = lerp(30, 42, e);
      S.rect(195, cy, w, h, h / 2, 'ink', { shadow: false });
      const ca = clamp((e - 0.55) / 0.45);
      if (ca > 0.01) {
        S.alpha = baseA * (1 - exitP) * ca;
        S.circle(45, cy, 14, 'q', { hl: false, shadow: false });
        line([38.5, cy, 43.5, cy + 5, 52, cy - 4.5], 'light', 2.6);
        T('Style applied', 68, cy - 6.5, 13.5, 'light');
        if (det > 0.5) T('Just now · Statistics', 68, cy + 8.5, 10, 'light', { a: 0.55 });
      }
    }
    S.pop(); // 螢幕座標
    S.pop(); // 手機
    S.alpha = baseA;
  },
};
