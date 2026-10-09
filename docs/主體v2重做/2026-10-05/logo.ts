// 主體：標誌顯現（新主體，沒有 v1／v2 之分；筆記見 docs/主體v2參考/logo.md）。
// 第四版：標誌是相機光圈（Lumen＝光）。第三版讓葉片從四面飛來組合，使用者指出「哪有快門一開始是分散的」——動畫要符合主題的常理。
// 所以光圈的動作完全照真實光圈：鏡筒外框先畫出、裡面的葉片一開始是「關閉」的 → 轉動張開、透出光 →
// 「喀嚓」快速關閉再張開＋閃光（拍照的那一刻）→ 標誌左移、文字從分隔線後用遮罩逐字升起 → 光澤掃過鏡面、待機時孔徑微微呼吸 →
// 文字沉回遮罩、光圈轉動關上、外框收回（剛好接回下一圈的關閉狀態）。
// 遮罩是直接對 canvas 裁切（點用 S.tp 換到畫布座標）。全部是時間的純函數；顏色只用色板角色。
import type { Cue } from '../../audio/types';
import { darken, lighten, mix } from '../color';
import { TAU, clamp, lerp } from '../util';
import type { Subject } from './types';

const R = 58; // 葉片外半徑
const RB = 66; // 鏡筒外框半徑
const N = 6;
const OPEN = 22; // 張開時的孔徑
const GAP = 40;
const WORD = 'LUMEN';
const SIZE = 44;
const TRACK = 12;
const kOf = (Wu: number) => Math.min(1.45, (Wu * 0.8) / 450);
const D2R = Math.PI / 180;

/** 一片葉片（未旋轉）：外緣圓弧 0°→72°，內緣落在半徑 rh 的六邊形孔上；rh=0 時六片在中心相會＝光圈關閉 */
function bladeLocal(rh: number): number[] {
  const pts: number[] = [];
  for (let i = 0; i <= 12; i++) {
    const a = (i / 12) * 72 * D2R;
    pts.push(Math.cos(a) * R, Math.sin(a) * R);
  }
  pts.push(Math.cos(132 * D2R) * rh, Math.sin(132 * D2R) * rh, Math.cos(72 * D2R) * rh, Math.sin(72 * D2R) * rh);
  return pts;
}
function rot(pts: number[], ang: number): number[] {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const out = new Array(pts.length);
  for (let i = 0; i < pts.length; i += 2) {
    out[i] = pts[i] * c - pts[i + 1] * s;
    out[i + 1] = pts[i] * s + pts[i + 1] * c;
  }
  return out;
}

export const logo: Subject = {
  id: 'logo',
  name: '標誌顯現',
  en: 'Logo Reveal',
  desc: '品牌片頭：鏡筒外框畫出、關閉的光圈轉動張開透出光、「喀嚓」一下快門與閃光，文字從遮罩後逐字升起；退場時文字沉回、光圈關上。',
  loop: 4.0,
  key: 0.34,
  hero: 0.7,
  events: () => [{ u: 0.34, x: 0, y: 0, k: 0.9 }],
  cues: () =>
    [
      { u: 0.02, kind: 'rise', k: 0.3 },
      { u: 0.15, kind: 'flip', k: 0.4 },
      { u: 0.31, kind: 'click', k: 0.9 },
      { u: 0.34, kind: 'ping', k: 0.6 },
      { u: 0.46, kind: 'whoosh', k: 0.45 },
      { u: 0.64, kind: 'sparkle', k: 0.45 },
      { u: 0.86, kind: 'flip', k: 0.4 },
    ] as Cue[],
  track(M, env) {
    return [lerp(0, -150, M.tw(0.44, 0.56, 'io') * (1 - M.tw(0.86, 0.94, 'io'))) * kOf(env.Wu), 0];
  },
  draw(S, M, env) {
    const pal = S.pal;
    const det = S.look.detail;
    const baseA = S.alpha;
    const K = kOf(env.Wu);
    const FL = { stroke: false, shadow: false, hl: false, flat: true, drawOn: false } as const;
    const mute = mix(pal.bg, pal.ink, 0.55);
    const cell = (S.look.post.find((q) => q.fx === 'pixelate')?.p.size ?? 0) * 400;
    const tones = Array.from({ length: N }, (_, i) => mix(darken(pal.p, 0.16), lighten(pal.p, 0.16), i / (N - 1)));
    const seam = mix(pal.bg, pal.p, 0.15);
    const barrel = darken(mix(pal.p, pal.ink, 0.55), 0.05); // 鏡筒

    const ctx = S.ctx;
    const clip = (polys: number[][], draw: () => void) => {
      ctx.save();
      ctx.beginPath();
      for (const p of polys) {
        for (let i = 0; i < p.length; i += 2) {
          const [x, y] = S.tp(p[i], p[i + 1]);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
      }
      ctx.clip();
      draw();
      ctx.restore();
    };

    // 版面
    const charW = Array.from(WORD).map((c) => S.measure(c, SIZE));
    const wordW = charW.reduce((a, b) => a + b, 0) + TRACK * (N - 2);
    const total = RB * 2 + GAP * 2 + wordW;
    const markX = -total / 2 + RB;
    const divX = markX + RB + GAP;
    const wordX = divX + GAP;

    // ── 時間
    const frame = M.tw(0.0, 0.14, 'io'); // 鏡筒畫出
    const unframe = M.tw(0.92, 0.995, 'io'); // 鏡筒收回
    const open1 = M.tw(0.13, 0.28, 'o'); // 第一次張開
    const snapC = M.tw(0.3, 0.325, 'i'); // 快門：關
    const snapO = M.tw(0.33, 0.42, 'o'); // 快門：開
    const shut = M.tw(0.88, 0.95, 'io'); // 退場：關上
    const breathe = 1 + 0.07 * Math.sin(TAU * 2 * M.seg(0.46, 0.84));
    let ap = open1; // 0 = 關閉、1 = 張開
    if (M.u >= 0.3) ap = (1 - snapC) + snapO * snapC;
    ap *= 1 - shut;
    const rh = OPEN * clamp(ap, 0, 1.05) * (M.u > 0.46 && M.u < 0.88 ? breathe : 1);
    const ringRot = -ap * 0.55 + 0.1 * M.seg(0.46, 0.84); // 光圈環跟著孔徑轉動
    const slide = M.tw(0.44, 0.56, 'io') * (1 - M.tw(0.86, 0.94, 'io'));

    S.push();
    S.scale(K);
    const mx = lerp(0, markX, slide);
    const presence = frame * (1 - unframe);

    // ════ 鏡頭
    S.push();
    S.translate(mx, 0);
    S.alpha = baseA;
    // 鏡筒：外框圓環沿圓周畫出，底盤淡入
    if (presence > 0.002) {
      S.alpha = baseA * clamp(presence * 1.6);
      S.circle(0, 0, RB, barrel, { shadow: false, hl: false });
      S.alpha = baseA;
      if (det > 0.35) S.arc(0, 0, RB + 5, -Math.PI / 2, -Math.PI / 2 + TAU * presence, mix(pal.bg, pal.ink, 0.4), { w: 1, cap: 'butt', drawOn: false });
    }
    // 光圈後面的光（只有孔裡看得到）
    const bladeA = clamp(presence * 1.8);
    if (bladeA > 0.002) {
      S.push();
      S.rotate(ringRot);
      const local = bladeLocal(rh);
      const blades: number[][] = [];
      if (rh > 0.3) {
        S.alpha = baseA * bladeA;
        S.circle(0, 0, rh * 1.05, pal.light, { shadow: false, hl: false });
        S.circle(0, 0, rh * 0.42, lighten(pal.p, 0.35), { ...FL, alpha: 0.7 });
      }
      for (let i = 0; i < N; i++) {
        const pts = rot(local, i * 60 * D2R);
        blades.push(pts);
        S.alpha = baseA * bladeA;
        S.poly(pts, tones[i], { stroke: seam, outline: det > 0.4, lw: 0.6, shadow: false, hl: false, drawOn: false });
      }
      // 光澤掃過鏡面（裁切在葉片內）
      const sw = M.seg(0.6, 0.72);
      if (sw > 0 && sw < 1 && det > 0.4) {
        S.alpha = baseA;
        clip(blades, () => {
          const x = lerp(-R * 1.6, R * 1.6, sw);
          S.push();
          S.rotate(-ringRot);
          S.poly([x - 16, -R - 10, x + 6, -R - 10, x + 30, R + 10, x + 8, R + 10], pal.light, { ...FL, alpha: 0.4 });
          S.pop();
        });
      }
      S.pop();
    }
    // 快門閃光：喀嚓重新張開的瞬間，一圈光從孔擴散、畫面一亮
    const fl = M.seg(0.33, 0.5);
    if (fl > 0 && fl < 1) {
      S.alpha = baseA;
      if (det > 0.4) S.circle(0, 0, RB + fl * 70, null, { stroke: pal.p, outline: true, lw: 0.7, alpha: (1 - fl) * 0.6, shadow: false, hl: false, drawOn: false });
      S.circle(0, 0, OPEN + fl * 30, pal.light, { ...FL, alpha: 0.5 * (1 - fl) * (1 - fl) });
    }
    S.pop();

    // ════ 分隔線
    const dv = M.tw(0.48, 0.58, 'io') * (1 - M.tw(0.8, 0.86, 'io'));
    if (dv > 0.002) {
      S.alpha = baseA;
      S.line([divX, -34 * dv, divX, 34 * dv], mute, { w: 0.9, cap: 'butt', alpha: 0.7, drawOn: false });
    }

    // ════ 文字標：遮罩後逐字升起；副標從遮罩下滑出
    const top = -SIZE * 0.78;
    const base = SIZE * 0.42;
    if (M.u > 0.5 && M.u < 0.94) {
      S.alpha = baseA;
      const pix = cell > 1.2 && SIZE * K < cell * 10;
      clip([[divX + 4, top, divX + 4 + GAP + wordW + 40, top, divX + 4 + GAP + wordW + 40, base, divX + 4, base]], () => {
        let x = wordX;
        Array.from(WORD).forEach((c, i) => {
          const pin = M.tw(0.5 + i * 0.022 + M.stag(i), 0.62 + i * 0.022 + M.stag(i), 'o');
          const pout = M.tw(0.76 + i * 0.01, 0.82 + i * 0.01, 'i');
          const dy = (1 - pin) * SIZE * 1.3 + pout * SIZE * 1.3;
          if (pix) S.rect(x + charW[i] / 2, -6 + dy, charW[i], SIZE * 0.55, 1, pal.ink, { ...FL, alpha: 0.8 });
          else S.text(c, x + charW[i] / 2, -6 + dy, SIZE, pal.ink, { shadow: false, glow: false });
          x += charW[i] + TRACK;
        });
      });
      const sp = M.tw(0.6, 0.72, 'o');
      const so = M.tw(0.74, 0.8, 'i');
      clip([[wordX - 2, base + 2, wordX + wordW + 20, base + 2, wordX + wordW + 20, base + 22, wordX - 2, base + 22]], () => {
        const y = base + 13 - (1 - sp) * 18 - so * 18;
        if (cell > 1.2) S.rect(wordX + wordW / 2, y, wordW, 4, 2, mute, { ...FL, alpha: 0.6 });
        else S.text('L I G H T   &   M O T I O N', wordX, y, 10.5, mute, { align: 'left', stroke: false, shadow: false, flat: true, glow: false });
      });
    }
    S.pop();
    S.alpha = baseA;
  },
};
