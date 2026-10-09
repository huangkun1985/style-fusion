// 主體：天氣（新主體，沒有 v1／v2 之分；筆記見 docs/主體v2參考/weather.md）。
// 第二版：第一版（卡通立體雲＋橘色太陽球＋彩虹條紋＋粗體數字）被評「像玩具、不夠高級」。
// 這版改用高級天氣 App 的視覺語言：整個畫面就是天空（電影感的漸層天色隨天氣變化）、半透明柔焦有景深的雲層、
// 三層細長的雨絲（遠的細而慢、近的長而快）、雲層深處的閃電把雲從內部照亮、放晴時穿過雲隙的光束、遠山與霧；
// 文字是左上角極細的大字溫度（Outfit 200）＋城市與天氣名稱＋高低溫，克制。
// 動作照天氣的常理，一圈是一次完整的變化：晴 → 雲層聚攏遮住太陽 → 轉陰下雨 → 雷雨 → 雲層散開、光束穿出 → 回到晴天。
// 全部是時間的純函數（雲與雨都用整數圈數的週期位移，所以無縫）；顏色只用色板角色；畫面直接畫 canvas（座標用 S.tp）。
import type { Cue } from '../../audio/types';
import { darken, lighten, luma, mix, rgba } from '../color';
import { TAU, clamp, hash, lerp, smooth } from '../util';
import type { Subject } from './types';

const LOOP = 9;
const BOLTS = [0.45, 0.52];
const PHASES: { u: number; temp: number; label: string; hi: number; lo: number }[] = [
  { u: 0.0, temp: 26, label: 'Sunny', hi: 28, lo: 19 },
  { u: 0.18, temp: 24, label: 'Mostly Cloudy', hi: 27, lo: 19 },
  { u: 0.32, temp: 20, label: 'Rain', hi: 24, lo: 18 },
  { u: 0.43, temp: 18, label: 'Thunderstorms', hi: 22, lo: 17 },
  { u: 0.62, temp: 21, label: 'Clearing', hi: 24, lo: 18 },
  { u: 0.86, temp: 26, label: 'Sunny', hi: 28, lo: 19 },
];
/** 雲量 0..1 */
const cover = (u: number) => smooth(0.08, 0.3, u) * (1 - 0.75 * smooth(0.58, 0.72, u)) * (1 - smooth(0.82, 0.97, u));
/** 暴雨程度 0..1 */
const storm = (u: number) => smooth(0.28, 0.42, u) * (1 - smooth(0.56, 0.68, u));
/** 雨量 0..1 */
const rainAmt = (u: number) => smooth(0.3, 0.36, u) * (1 - smooth(0.56, 0.62, u));
/** 放晴的光束 0..1 */
const rays = (u: number) => smooth(0.6, 0.68, u) * (1 - smooth(0.8, 0.9, u));

let fontAsked = false;

export const weather: Subject = {
  id: 'weather',
  name: '天氣',
  en: 'Weather',
  desc: '電影感的天氣變化：晴空、雲層聚攏、下雨、雲層深處的雷雨閃電、雲隙光束放晴；半透明有景深的雲、三層雨絲、極細的大字溫度。',
  loop: LOOP,
  key: BOLTS[0],
  hero: 0.66,
  events: (env) => BOLTS.map((b, i) => ({ u: b, x: env.Wu * (i ? 0.12 : -0.05), y: -90, k: 1 })),
  cues: () => {
    const out: Cue[] = [{ u: 0.1, kind: 'whoosh', k: 0.3 }];
    for (let i = 0; i < 12; i++) out.push({ u: 0.33 + i * 0.022, kind: 'tick', k: 0.2 });
    out.push({ u: BOLTS[0], kind: 'impact', k: 0.85 }, { u: BOLTS[1], kind: 'impact', k: 1 }, { u: 0.64, kind: 'sparkle', k: 0.4 });
    return out.sort((a, b) => a.u - b.u);
  },
  track(_M, env) {
    return [env.Wu * 0.22, -100];
  },
  draw(S, M, env) {
    const u = M.u;
    const pal = S.pal;
    const det = S.look.detail;
    const ctx = S.ctx;
    const baseA = S.alpha;
    const W2 = env.Wu / 2 + 60;
    const H2 = env.Hu / 2 + 60;
    const P = (x: number, y: number) => S.tp(x, y);
    const [o0x, o0y] = P(0, 0);
    const [o1x, o1y] = P(1, 0);
    const sc = Math.hypot(o1x - o0x, o1y - o0y);
    const wide = env.Wu > 560;
    const cv = cover(u);
    const st = storm(u);
    const rn = rainAmt(u);
    const ry = rays(u);
    if (!fontAsked && typeof document !== 'undefined' && document.fonts) {
      fontAsked = true;
      document.fonts.load('200 64px Outfit', '0123456789°').catch(() => undefined);
      document.fonts.load('300 64px Outfit', 'Sunny').catch(() => undefined);
    }

    // ── 顏色（全由色板算出）
    const dk = luma(pal.ink) < luma(pal.bg) ? pal.ink : darken(pal.bg, 0.6); // 色板中較暗的那個
    let sky = mix(pal.s, pal.p, 0.08);
    if (luma(sky) > 0.6) sky = darken(sky, 0.3);
    const clearTop = darken(sky, 0.38);
    const clearLow = lighten(mix(sky, pal.light, 0.4), 0.04);
    const stormTop = darken(mix(sky, dk, 0.6), 0.5);
    const stormLow = mix(darken(mix(sky, dk, 0.45), 0.25), pal.light, 0.18);
    const warm = mix(pal.a, pal.light, 0.35); // 放晴時地平線的暖光
    const top = mix(clearTop, stormTop, Math.max(st, cv * 0.35));
    const low = mix(mix(clearLow, stormLow, Math.max(st, cv * 0.3)), warm, 0.28 * ry);
    const cloudLit = mix(pal.light, sky, 0.08);
    const cloudDark = mix(stormTop, pal.light, 0.22);
    const cloudC = mix(cloudLit, cloudDark, st);

    // 閃電亮度
    let flash = 0;
    let flashX = 0;
    let flashI = 0;
    BOLTS.forEach((b, i) => {
      const d = (u - b) * LOOP;
      if (d >= 0 && d < 0.6) {
        const f = (d < 0.06 ? 1 : Math.exp(-(d - 0.06) * 8)) * (0.7 + 0.3 * i) * (d > 0.1 && d < 0.14 ? 0.4 : 1); // 一閃、暗一下、再閃
        if (f > flash) {
          flash = f;
          flashX = env.Wu * (i ? 0.12 : -0.05);
          flashI = i;
        }
      }
    });

    const radial = (x: number, y: number, r: number, c: string, a: number, mid = 0.4) => {
      if (a < 0.003) return;
      const [cx, cy] = P(x, y);
      const R = r * sc;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
      g.addColorStop(0, rgba(c, a));
      g.addColorStop(mid, rgba(c, a * 0.4));
      g.addColorStop(1, rgba(c, 0));
      ctx.fillStyle = g;
      ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
    };

    ctx.save();
    ctx.globalAlpha = baseA;
    // ════ 天空
    const [x0, y0] = P(-W2, -H2);
    const [x1, y1] = P(W2, H2);
    {
      const [, hy] = P(0, 120);
      const g = ctx.createLinearGradient(0, y0, 0, hy);
      g.addColorStop(0, top);
      g.addColorStop(0.62, mix(top, low, 0.55));
      g.addColorStop(1, low);
      ctx.fillStyle = g;
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    }

    // ════ 太陽：柔和的光暈＋小而亮的核心（雲量越多越弱）
    const sunX = env.Wu * (wide ? 0.24 : 0.15);
    const sunY = -112 + 10 * Math.sin(TAU * u);
    const sunVis = (1 - cv * 0.9) * (1 - st);
    ctx.globalCompositeOperation = 'lighter';
    radial(sunX, sunY, 260, mix(warm, pal.light, 0.3), 0.28 * sunVis + 0.1 * ry, 0.3);
    radial(sunX, sunY, 70, pal.light, 0.55 * sunVis, 0.35);
    radial(sunX, sunY, 18, pal.light, 0.95 * sunVis, 0.7);
    // 閃電：雲層深處的大範圍亮光（在雲的後面）
    if (flash > 0.01) radial(flashX, -110, 260, mix(pal.light, pal.s, 0.15), 0.5 * flash, 0.35);
    ctx.globalCompositeOperation = 'source-over';

    // ════ 遠山與霧（景深）
    {
      const hill = (yb: number, amp: number, f: number, ph: number, c: string, a: number) => {
        ctx.beginPath();
        let k = 0;
        for (let x = -W2; x <= W2; x += 12) {
          const y = yb - amp * (0.5 * Math.sin(x * f + ph) + 0.3 * Math.sin(x * f * 2.71 + ph * 1.7) + 0.2 * Math.sin(x * f * 6.13 + ph * 0.6) + 0.08 * Math.sin(x * f * 13.7 + ph * 2.9));
          const [qx, qy] = P(x, y);
          if (k++ === 0) ctx.moveTo(qx, qy);
          else ctx.lineTo(qx, qy);
        }
        const [ex, ey] = P(W2, H2);
        const [sx] = P(-W2, H2);
        ctx.lineTo(ex, ey);
        ctx.lineTo(sx, ey);
        ctx.closePath();
        ctx.globalAlpha = baseA * a;
        ctx.fillStyle = c;
        ctx.fill();
      };
      hill(150, 30, 0.0042, 1.2, mix(low, top, 0.3), 0.7);
      hill(176, 14, 0.0065, 4.1, mix(low, top, 0.55), 0.9);
      ctx.globalAlpha = baseA;
      const [, my0] = P(0, 110);
      const [, my1] = P(0, 200);
      const mg = ctx.createLinearGradient(0, my0, 0, my1);
      mg.addColorStop(0, rgba(low, 0));
      mg.addColorStop(1, rgba(low, 0.45 + 0.25 * st));
      ctx.fillStyle = mg;
      ctx.fillRect(x0, my0, x1 - x0, y1 - my0);
    }

    // ════ 雲層：三層景深，每層幾團由柔焦小雲朵組成的雲，水平漂移（整數圈數，無縫）
    const layers = [
      { y: -150, s: 0.7, n: 6, speed: 1, a: 0.55, shade: 0.12 },
      { y: -105, s: 1.0, n: 5, speed: 2, a: 0.75, shade: 0.2 },
      { y: -60, s: 1.35, n: 4, speed: 3, a: 0.85, shade: 0.28 },
    ];
    const span = env.Wu + 520;
    // 陰天時頂上一層整片的雲幕
    if (cv > 0.01) {
      const [, ty] = P(0, -H2);
      const [, by] = P(0, -20);
      const g = ctx.createLinearGradient(0, ty, 0, by);
      g.addColorStop(0, rgba(mix(cloudC, top, 0.5), 0.85 * cv * (0.4 + 0.6 * st)));
      g.addColorStop(1, rgba(mix(cloudC, top, 0.5), 0));
      ctx.globalAlpha = baseA;
      ctx.fillStyle = g;
      ctx.fillRect(x0, ty, x1 - x0, by - ty);
    }
    layers.forEach((L, li) => {
      if (det < 0.4 && li === 0) return;
      for (let j = 0; j < L.n; j++) {
        const thr = hash(j, li, 61) * 0.85; // 雲量超過這個門檻才出現
        const vis = clamp((cv - thr) * 3.5);
        if (vis < 0.01) continue;
        const base = hash(j, li, 62);
        const cx = ((base + u * L.speed * 0.25) % 1) * span - span / 2;
        const cy = L.y + (hash(j, li, 63) - 0.5) * 40;
        const sz = L.s * (0.8 + hash(j, li, 64) * 0.5);
        const puffs = det > 0.6 ? 12 : 6;
        for (let q = 0; q < puffs; q++) {
          const px = cx + (hash(j * 13 + q, li, 65) - 0.5) * 170 * sz;
          const py = cy + (hash(j * 13 + q, li, 66) - 0.6) * 46 * sz;
          const r = (30 + Math.pow(hash(j * 13 + q, li, 67), 1.5) * 70) * sz;
          const [qx, qy] = P(px, py);
          const R = r * sc;
          // 每朵小雲：壓扁的柔焦橢圓，上方受光、下方帶陰影（真實的雲是扁的、有層次，不是一顆顆棉花球）
          const flat = 0.5 + hash(j * 13 + q, li, 68) * 0.2;
          const g = ctx.createRadialGradient(0, -R * 0.35, R * 0.08, 0, 0, R);
          const lit = mix(cloudC, pal.light, 0.18 * (1 - st));
          const shadow = mix(cloudC, top, L.shade + 0.25 * st);
          g.addColorStop(0, rgba(lit, L.a * vis * 0.9));
          g.addColorStop(0.5, rgba(mix(lit, shadow, 0.55), L.a * vis * 0.55));
          g.addColorStop(1, rgba(shadow, 0));
          ctx.save();
          ctx.translate(qx, qy);
          ctx.scale(1, flat);
          ctx.globalAlpha = baseA;
          ctx.fillStyle = g;
          ctx.fillRect(-R, -R, R * 2, R * 2);
          ctx.restore();
        }
        // 雲底：一層較暗、較平的長橢圓
        {
          const [bx, by] = P(cx, cy + 22 * sz);
          const R = 130 * sz * sc;
          const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
          const base2 = mix(cloudC, top, L.shade + 0.15 + 0.25 * st);
          g.addColorStop(0, rgba(base2, L.a * vis * 0.55));
          g.addColorStop(1, rgba(base2, 0));
          ctx.save();
          ctx.translate(bx, by);
          ctx.scale(1, 0.22);
          ctx.globalAlpha = baseA;
          ctx.fillStyle = g;
          ctx.fillRect(-R, -R, R * 2, R * 2);
          ctx.restore();
        }
      }
      // 閃電從內部照亮雲（疊在每一層上）
      if (flash > 0.01) {
        ctx.globalCompositeOperation = 'lighter';
        radial(flashX, L.y + 10, 200 * L.s, mix(pal.light, pal.s, 0.1), 0.25 * flash, 0.4);
        ctx.globalCompositeOperation = 'source-over';
      }
    });

    // ════ 閃電本體：細的分叉線，從雲層深處劈下（只在最亮的瞬間）
    if (flash > 0.35 && det > 0.4) {
      const seed = 70 + flashI;
      const pts: [number, number][] = [];
      let x = flashX;
      let y = -95;
      pts.push([x, y]);
      for (let k = 0; k < 9; k++) {
        x += (hash(k, seed, 1) - 0.5) * 34;
        y += 22 + hash(k, seed, 2) * 10;
        pts.push([x, y]);
      }
      const stroke = (path: [number, number][], w: number, a: number) => {
        ctx.beginPath();
        path.forEach(([px, py], k) => {
          const [qx, qy] = P(px, py);
          if (k) ctx.lineTo(qx, qy);
          else ctx.moveTo(qx, qy);
        });
        ctx.lineWidth = w;
        ctx.globalAlpha = baseA * a;
        ctx.stroke();
      };
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = mix(pal.light, pal.s, 0.12);
      ctx.lineJoin = 'round';
      ctx.shadowColor = mix(pal.light, pal.s, 0.3);
      ctx.shadowBlur = 18 * S.px;
      stroke(pts, 1.6, flash);
      // 分叉
      const b0 = pts[3];
      const br: [number, number][] = [b0];
      let bx = b0[0];
      let by = b0[1];
      for (let k = 0; k < 4; k++) {
        bx += 14 + hash(k, seed, 3) * 12;
        by += 18;
        br.push([bx, by]);
      }
      stroke(br, 0.9, flash * 0.7);
      ctx.restore();
    }

    // ════ 放晴的光束：從太陽放射、穿過雲隙
    if (ry > 0.01 && det > 0.4) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const [sx, sy] = P(sunX, sunY);
      // 少量、不等距、柔邊（每道光由寬到窄疊三層，邊緣自然淡出），很淡
      const angs = [0.58, 0.66, 0.71, 0.8];
      angs.forEach((a0, k) => {
        const ang = Math.PI * a0 + 0.02 * Math.sin(TAU * (u + k * 0.21));
        const len = (380 + hash(k, 81) * 200) * sc;
        for (let q = 0; q < 3; q++) {
          const wd = (0.018 + hash(k, 82) * 0.02) * (1 + q * 0.9);
          const g = ctx.createLinearGradient(sx, sy, sx + Math.cos(ang) * len, sy + Math.sin(ang) * len);
          g.addColorStop(0, rgba(warm, 0));
          g.addColorStop(0.15, rgba(warm, 0.05 * ry));
          g.addColorStop(1, rgba(warm, 0));
          ctx.fillStyle = g;
          ctx.globalAlpha = baseA;
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(sx + Math.cos(ang - wd) * len, sy + Math.sin(ang - wd) * len);
          ctx.lineTo(sx + Math.cos(ang + wd) * len, sy + Math.sin(ang + wd) * len);
          ctx.closePath();
          ctx.fill();
        }
      });
      ctx.restore();
    }

    // ════ 雨：三層細長斜線（遠的細而慢、近的長而快），整數圈數的週期位移
    if (rn > 0.01) {
      const rainC = mix(pal.light, top, 0.25);
      const lay = [
        { n: det > 0.6 ? 70 : 30, len: 10, w: 0.6, cyc: 9, a: 0.28 },
        { n: det > 0.6 ? 45 : 20, len: 18, w: 0.9, cyc: 12, a: 0.4 },
        { n: det > 0.6 ? 22 : 10, len: 30, w: 1.3, cyc: 16, a: 0.55 },
      ];
      const slant = 0.18;
      const Hh = env.Hu + 120;
      ctx.strokeStyle = rainC;
      ctx.lineCap = 'round';
      lay.forEach((L, li) => {
        ctx.lineWidth = L.w;
        ctx.globalAlpha = baseA * L.a * rn;
        ctx.beginPath();
        for (let i = 0; i < L.n; i++) {
          const fy = (hash(i, li, 91) + u * L.cyc) % 1;
          const y = -env.Hu / 2 - 60 + fy * Hh;
          const x = (hash(i, li, 92) - 0.5) * (env.Wu + 120) - (y + env.Hu / 2) * slant;
          const [ax, ay] = P(x, y);
          const [bx, by] = P(x - L.len * slant, y + L.len);
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
        }
        ctx.stroke();
      });
    }

    // 閃電時整個畫面一亮
    if (flash > 0.01) {
      ctx.globalAlpha = baseA;
      ctx.fillStyle = rgba(pal.light, 0.16 * flash);
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    }

    // ════ 文字（左上；極細大數字）
    let i0 = 0;
    for (let i = 0; i < PHASES.length; i++) if (u >= PHASES[i].u) i0 = i;
    const ph = PHASES[i0];
    const prev = PHASES[Math.max(0, i0 - 1)];
    const roll = i0 === 0 ? 1 : smooth(0, 0.07, u - ph.u);
    const temp = Math.round(lerp(prev.temp, ph.temp, roll));
    const TX = wide ? -env.Wu / 2 + 64 : -env.Wu / 2 + 28;
    const TY = -env.Hu / 2 + 64;
    const txt = mix(pal.light, top, 0.03);
    const cell = (S.look.post.find((q) => q.fx === 'pixelate')?.p.size ?? 0) * 400;
    const font = (w: number, size: number) => `${w} ${size * sc}px "Outfit", "Noto Sans TC", sans-serif`;
    const say = (str: string, x: number, y: number, size: number, w: number, a: number) => {
      if (a < 0.01) return;
      if (cell > 1.2 && size < cell * 6.5) {
        ctx.font = font(w, size);
        const tw = ctx.measureText(str).width / sc;
        S.rect(x + tw / 2, y - size * 0.35, tw, size * 0.45, size * 0.2, txt, { stroke: false, shadow: false, hl: false, flat: true, drawOn: false, alpha: a * 0.6 });
        return;
      }
      const [qx, qy] = P(x, y);
      ctx.font = font(w, size);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.globalAlpha = baseA * a;
      ctx.fillStyle = txt;
      ctx.fillText(str, qx, qy);
    };
    ctx.shadowColor = rgba(darken(top, 0.4), 0.25);
    ctx.shadowBlur = 12 * S.px;
    say('Taipei', TX + 4, TY, 17, 400, 0.95);
    say(`${temp}°`, TX - 4, TY + 100, 104, 200, 1);
    const out1 = clamp(roll * 2);
    const in1 = clamp(roll * 2 - 1);
    if (i0 > 0 && roll < 0.5) say(prev.label, TX + 4, TY + 132 - 6 * out1, 19, 300, 1 - out1);
    say(ph.label, TX + 4, TY + 132 + 6 * (1 - in1), 19, 300, i0 === 0 ? 1 : in1);
    say(`H:${ph.hi}°  L:${ph.lo}°`, TX + 4, TY + 158, 15, 400, 0.75);
    ctx.restore();
  },
};
