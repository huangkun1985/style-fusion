// 主體：煙火（新主體，沒有 v1／v2 之分；筆記見 docs/主體v2參考/fireworks.md）。
// 第二版：第一版被評「好醜、背景怎麼是白的」。煙火是夜裡的事——這個主體自帶夜空（由色板算出的深色漸層，不管風格背景多亮）。
// 藍本：Dribbble「Happy New Year 夜景城市」與「艾菲爾鐵塔煙火」：深色夜空、天際線剪影與亮窗、水面倒影；
// 煙火是細密的放射拖尾（頭粗亮、尾細淡）、中心白熱、發光、雙色（外圈一色、內芯另一色）。
// 物理照真實過程：升空越升越慢 → 頂點爆開、天空以徑向漸層亮起 → 火花受阻力減速、受重力下垂 → 末段閃爍熄滅、煙霧被照亮。
// 火花數量多（每顆約百顆），為了效能與「光的疊加」直接用 canvas（座標用 S.tp 換算、globalCompositeOperation='lighter'）；
// 天際線、星星等形狀仍經過 Brush。每顆彈的時間對循環取模，所以無縫循環。全部是時間的純函數；顏色只用色板角色。
import type { Cue } from '../../audio/types';
import { darken, luma, mix, rgba } from '../color';
import { TAU, clamp, hash, lerp, smooth } from '../util';
import type { Subject } from './types';

type Kind = 'chrys' | 'peony' | 'willow' | 'ring';
type Col = 'p' | 's' | 'a' | 'gold' | 'pl';
interface Shell {
  t0: number; // 發射時刻（循環內 0..1）
  x: number; // 發射位置（畫面寬的比例）
  ya: number; // 爆點高度（設計單位）
  kind: Kind;
  col: Col;
  core?: Col; // 內芯顏色
  n: number;
  v: number;
  k: number; // 空氣阻力
  g: number; // 重力
  life: number;
  trail: number; // 拖尾秒數
  w: number; // 火花粗細
}
const LOOP = 4.8;
const UP = 0.85;
const HZ = 112; // 地平線（水面）
const SHELLS: Shell[] = [
  { t0: 0.0, x: -0.2, ya: -70, kind: 'chrys', col: 'p', core: 'gold', n: 110, v: 330, k: 2.5, g: 40, life: 1.9, trail: 0.34, w: 1.7 },
  { t0: 0.13, x: 0.28, ya: -108, kind: 'peony', col: 's', core: 'pl', n: 90, v: 290, k: 2.7, g: 34, life: 1.6, trail: 0.12, w: 2 },
  { t0: 0.27, x: -0.38, ya: -40, kind: 'ring', col: 'pl', n: 44, v: 200, k: 2.8, g: 22, life: 1.3, trail: 0.12, w: 1.6 },
  { t0: 0.38, x: 0.04, ya: -122, kind: 'willow', col: 'gold', n: 100, v: 260, k: 1.8, g: 85, life: 2.7, trail: 0.75, w: 1.3 },
  { t0: 0.56, x: 0.36, ya: -64, kind: 'chrys', col: 's', core: 'p', n: 100, v: 300, k: 2.5, g: 40, life: 1.8, trail: 0.32, w: 1.6 },
  { t0: 0.69, x: -0.25, ya: -112, kind: 'peony', col: 'p', core: 'gold', n: 90, v: 280, k: 2.7, g: 34, life: 1.6, trail: 0.12, w: 2 },
  { t0: 0.84, x: 0.17, ya: -44, kind: 'chrys', col: 'gold', n: 70, v: 240, k: 2.6, g: 40, life: 1.5, trail: 0.28, w: 1.4 },
];
const burstU = (s: Shell) => (s.t0 + UP / LOOP) % 1;
const ageOf = (u: number, t0: number) => ((((u - t0) % 1) + 1) % 1) * LOOP;

export const fireworks: Subject = {
  id: 'fireworks',
  name: '煙火',
  en: 'Fireworks',
  desc: '城市夜空與水面倒影上的煙火：升空尾跡、在頂點爆開（菊花、牡丹、柳、圓環），火花發光、受阻力與重力下垂、閃爍熄滅，天空與煙霧被照亮。',
  loop: LOOP,
  key: burstU(SHELLS[0]),
  hero: (burstU(SHELLS[0]) + 0.07) % 1,
  events: (env) => SHELLS.map((s) => ({ u: burstU(s), x: s.x * env.Wu, y: s.ya, k: s.kind === 'ring' ? 0.5 : 0.9 })),
  cues: () => {
    const out: Cue[] = [];
    for (const s of SHELLS) {
      out.push({ u: s.t0, kind: 'rise', k: 0.3 });
      out.push({ u: burstU(s), kind: 'impact', k: s.kind === 'ring' ? 0.45 : 0.8 });
      if (s.kind !== 'ring') out.push({ u: (burstU(s) + (s.life * 0.55) / LOOP) % 1, kind: 'sparkle', k: 0.4 });
    }
    return out.sort((a, b) => a.u - b.u);
  },
  track(M, env) {
    let best = SHELLS[0];
    let bestAge = 99;
    for (const s of SHELLS) {
      const a = ageOf(M.u, burstU(s));
      if (a < bestAge) {
        bestAge = a;
        best = s;
      }
    }
    return [best.x * env.Wu, best.ya];
  },
  draw(S, M, env) {
    const pal = S.pal;
    const det = S.look.detail;
    const baseA = S.alpha;
    const ctx = S.ctx;
    const FL = { stroke: false, shadow: false, hl: false, flat: true, drawOn: false } as const;
    const W2 = env.Wu / 2 + 80;
    const H2 = env.Hu / 2 + 80;
    const sc = clamp(env.Wu / 700, 0.55, 1); // 窄畫面縮小爆炸

    // ── 夜空的顏色：取色板裡較暗的一個，帶一點第二色的色相，壓到足夠暗
    let night = mix(luma(pal.bg) < luma(pal.ink) ? pal.bg : pal.ink, pal.s, 0.22);
    for (let i = 0; i < 6 && luma(night) > 0.1; i++) night = darken(night, 0.3);
    // 太黑（例如 ink 是純黑的像素風）：剪影會跟天空分不開，往第二色的色相拉一點
    for (let i = 0; i < 6 && luma(night) < 0.07; i++) night = mix(night, pal.s, 0.12);
    const skyTop = darken(night, 0.25);
    const skyLow = mix(night, pal.p, 0.2); // 地平線附近的城市光暈
    const bld = darken(mix(night, pal.ink, 0.1), 0.35);
    const bldFar = mix(skyLow, bld, 0.55);
    const water = darken(night, 0.15);
    const C: Record<Col, string> = { p: pal.p, s: pal.s, a: pal.a, gold: mix(pal.a, pal.light, 0.35), pl: mix(pal.p, pal.light, 0.45) };
    const windowC = mix(pal.a, pal.light, 0.55);

    /** 直接用 canvas 畫（座標從設計單位換算） */
    const P = (x: number, y: number) => S.tp(x, y);
    const gradRect = (y0: number, y1: number, stops: [number, string][]) => {
      const [ax, ay] = P(-W2, y0);
      const [bx, by] = P(W2, y1);
      const g = ctx.createLinearGradient(0, ay, 0, by);
      for (const [o, c] of stops) g.addColorStop(o, c);
      ctx.fillStyle = g;
      ctx.fillRect(ax, ay, bx - ax, by - ay);
    };
    const glow = (x: number, y: number, r: number, c: string, a: number) => {
      const [cx, cy] = P(x, y);
      const [ex] = P(x + r, y);
      const rr = Math.abs(ex - cx);
      if (rr < 0.5 || a < 0.003) return;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rr);
      g.addColorStop(0, rgba(c, a));
      g.addColorStop(0.45, rgba(c, a * 0.35));
      g.addColorStop(1, rgba(c, 0));
      ctx.fillStyle = g;
      ctx.fillRect(cx - rr, cy - rr, rr * 2, rr * 2);
    };

    ctx.save();
    ctx.globalAlpha = baseA;
    // ════ 夜空（整個畫面，蓋過風格背景）
    gradRect(-H2, HZ, [
      [0, skyTop],
      [0.62, night],
      [1, skyLow],
    ]);
    ctx.restore();

    // 星星
    if (det > 0.4) {
      for (let i = 0; i < 70; i++) {
        const x = (hash(i, 11) - 0.5) * env.Wu;
        const y = -env.Hu / 2 + hash(i, 12) * (env.Hu / 2 + HZ - 60) * 0.85;
        const tw = 0.3 + 0.5 * (0.5 + 0.5 * Math.sin(TAU * (M.u * (1 + (i % 3)) + hash(i, 13))));
        S.circle(x, y, 0.5 + hash(i, 14) * 0.8, pal.light, { ...FL, alpha: tw * baseA * 0.8 });
      }
    }

    // ── 每顆彈的狀態
    const states = SHELLS.map((s) => {
      const tl = ageOf(M.u, s.t0);
      return { s, tl, a: tl - UP };
    });
    const ex = 1 + M.mv.exag * 0.3;
    const posOf = (s: Shell, i: number, n: number, t: number, layer: number): [number, number] => {
      const x0 = s.x * env.Wu;
      const jit = s.kind === 'ring' ? 0 : (hash(i, layer, 31) - 0.5) * 0.12;
      const th = (i / n) * TAU + jit + layer * 0.3;
      let v = s.v * sc * ex * (s.kind === 'ring' ? 1 : 0.88 + hash(i, layer, 32) * 0.24);
      if (layer === 1) v *= 0.48; // 內芯
      const d = (v * (1 - Math.exp(-s.k * t))) / s.k;
      const fall = 0.5 * s.g * t * t;
      const sy = s.kind === 'ring' ? 0.42 : 1;
      const ca = s.kind === 'ring' ? 0.5 : 0; // 圓環傾斜
      const dx = Math.cos(th) * d;
      const dy = Math.sin(th) * d * sy;
      return [x0 + dx * Math.cos(ca) - dy * Math.sin(ca), s.ya + dx * Math.sin(ca) + dy * Math.cos(ca) + fall];
    };

    // ════ 天空被照亮（徑向漸層、柔邊）＋被照亮的煙霧
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = baseA;
    for (const { s, a } of states) {
      if (a < 0 || a > 1.4) continue;
      glow(s.x * env.Wu, s.ya, 230 * sc, C[s.col], 0.16 * Math.exp(-a * 2.6));
    }
    ctx.restore();
    if (det > 0.5) {
      for (const { s, a } of states) {
        if (a < 0.25 || a > s.life + 0.9) continue;
        const sm = clamp((a - 0.25) / (s.life + 0.65));
        const lit = Math.exp(-a * 1.5);
        for (let q = 0; q < 3; q++) {
          const ox = (hash(q, s.t0 * 100, 51) - 0.5) * 60 * sc + sm * 14;
          const oy = (hash(q, s.t0 * 100, 52) - 0.5) * 30 + sm * 22;
          ctx.save();
          ctx.globalAlpha = 1;
          glow(s.x * env.Wu + ox, s.ya + oy, (50 + sm * 50) * sc, mix(night, C[s.col], 0.18 + 0.3 * lit), 0.13 * Math.sin(Math.PI * sm) * baseA); // 煙：柔邊漸層，不是硬邊圓片
          ctx.restore();
        }
      }
    }

    // ════ 火花（光的疊加）
    const sparks: { x: number; y: number; c: string; al: number }[] = []; // 給水面倒影用
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const { s, tl, a } of states) {
      const x0 = s.x * env.Wu;
      const col = C[s.col];
      const hot = mix(col, pal.light, 0.65);
      // 升空：越升越慢、漸細的尾跡、往下掉的火星
      if (tl < UP) {
        const yAt = (t: number) => lerp(HZ - 6, s.ya, 1 - Math.pow(1 - clamp(t / UP), 2.2));
        const xAt = (t: number) => x0 + Math.sin(t * 6 + s.t0 * 20) * 1.6;
        for (let q = 0; q < 6; q++) {
          const ta = Math.max(0, tl - (q + 1) * 0.035);
          const tb = Math.max(0, tl - q * 0.035);
          const [ax, ay] = P(xAt(ta), yAt(ta));
          const [bx, by] = P(xAt(tb), yAt(tb));
          ctx.globalAlpha = baseA * (1 - q / 6) * 0.8;
          ctx.strokeStyle = mix(hot, col, q / 6);
          ctx.lineWidth = 1.6 * (1 - q / 7);
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
          ctx.stroke();
        }
        glow(xAt(tl), yAt(tl), 7, hot, 0.5 * baseA);
        if (det > 0.45)
          for (let j = 0; j < 6; j++) {
            const st = tl - 0.03 - j * 0.04;
            if (st < 0) continue;
            const age = tl - st;
            const [px, py] = P(xAt(st) + (hash(j, Math.floor(st * 40), 61) - 0.5) * 6, yAt(st) + age * age * 90);
            ctx.globalAlpha = baseA * 0.8 * (1 - age / 0.28);
            ctx.fillStyle = hot;
            ctx.fillRect(px - 0.6, py - 0.6, 1.2, 1.2);
          }
        continue;
      }
      if (a > s.life + 0.4) continue;
      // 爆點的白熱閃光
      if (a < 0.2) glow(x0, s.ya, (10 + a * 90) * sc, mix(pal.light, col, 0.25), baseA * 0.55 * (1 - a / 0.2));
      const layers = s.core ? 2 : 1;
      for (let layer = 0; layer < layers; layer++) {
        const n0 = layer === 1 ? Math.round(s.n * 0.4) : s.n;
        const n = det > 0.6 ? n0 : Math.round(n0 * 0.5);
        const lc = layer === 1 ? C[s.core as Col] : col;
        const lifeL = s.life * (layer === 1 ? 0.7 : 1);
        for (let i = 0; i < n; i++) {
          const lifeI = lifeL * (0.82 + hash(i, layer, 33) * 0.3);
          if (a > lifeI) continue;
          const fadeStart = lifeI * 0.55;
          // 剛爆開時火花擠在中心，用光的疊加會過曝成一團白：最初 0.12 秒亮度漸入
          let al = (1 - smooth(fadeStart, lifeI, a)) * (0.25 + 0.75 * smooth(0, 0.12, a));
          if (a > fadeStart && s.kind !== 'ring') al *= hash(i, Math.floor(a * 24), 34 + layer) > 0.4 ? 1 : 0.15; // 劈啪閃爍
          if (al < 0.02) continue;
          const c = a < 0.3 ? mix(hot, lc, a / 0.3) : lc; // 剛爆開偏白熱
          const w = s.w * (layer === 1 ? 0.8 : 1) * (0.75 + hash(i, layer, 35) * 0.5);
          // 漸細拖尾：從尾到頭分段，越靠頭越粗越亮
          const seg = s.kind === 'peony' ? 2 : 5;
          const trail = s.trail * (layer === 1 ? 0.6 : 1);
          let prev = posOf(s, i, n, Math.max(0, a - trail), layer);
          for (let q = 1; q <= seg; q++) {
            const t = Math.max(0, a - trail + (trail * q) / seg);
            const cur = posOf(s, i, n, t, layer);
            const f = q / seg;
            const [ax, ay] = P(prev[0], prev[1]);
            const [bx, by] = P(cur[0], cur[1]);
            ctx.globalAlpha = baseA * al * Math.pow(f, 1.6) * (s.kind === 'willow' ? 0.7 : 1);
            ctx.strokeStyle = c;
            ctx.lineWidth = w * (0.25 + 0.75 * f);
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(bx, by);
            ctx.stroke();
            prev = cur;
          }
          // 頭：亮點
          const [hx, hy] = P(prev[0], prev[1]);
          ctx.globalAlpha = baseA * al;
          ctx.fillStyle = mix(c, pal.light, 0.5);
          ctx.beginPath();
          ctx.arc(hx, hy, w * 0.75, 0, TAU);
          ctx.fill();
          if ((i + layer) % 5 === 0) sparks.push({ x: prev[0], y: prev[1], c, al });
        }
      }
    }
    ctx.restore();

    // ════ 天際線：遠層、近層剪影（有天線、階梯頂），近層亮窗
    for (const [li, col, hMin, hMax] of [
      [0, bldFar, 40, 118],
      [1, bld, 18, 74],
    ] as const) {
      let x = -W2 - hash(li, 41) * 40;
      let i = 0;
      while (x < W2) {
        const w = 22 + hash(i, li, 42) * 42;
        const h = hMin + hash(i, li, 43) * (hMax - hMin);
        const top = HZ - h;
        S.rect(x + w / 2, HZ - h / 2 + 1, w, h + 2, 0, col, FL);
        const r = hash(i, li, 44);
        if (r > 0.82) S.rect(x + w / 2, top - 16, 2, 32, 0, col, FL); // 天線
        else if (r > 0.64) S.rect(x + w / 2, top - 7, w * 0.6, 14, 0, col, FL); // 階梯頂
        if (li === 1 && det > 0.5) {
          for (let rr = 0; rr < Math.floor(h / 9) - 1; rr++)
            for (let q = 0; q < Math.floor(w / 7) - 1; q++)
              if (hash(i, rr * 9 + q, 45) > 0.74) S.rect(x + 6 + q * 7, top + 7 + rr * 9, 2.2, 3, 0, windowC, { ...FL, alpha: 0.4 + 0.5 * hash(i, rr * 9 + q, 46) });
        }
        x += w + (li ? 0 : 3);
        i++;
      }
    }

    // ════ 水面：深色漸層、窗光與煙火的倒影（隨水波晃動）
    ctx.save();
    ctx.globalAlpha = baseA;
    gradRect(HZ, H2, [
      [0, mix(water, skyLow, 0.35)],
      [0.25, water],
      [1, darken(water, 0.3)],
    ]);
    ctx.globalCompositeOperation = 'lighter';
    for (const { s, a } of states) {
      if (a < 0 || a > 1.4) continue;
      glow(s.x * env.Wu, HZ + 14, 200 * sc, C[s.col], 0.12 * Math.exp(-a * 2.6));
    }
    // 火花倒影：鏡射到水面下、壓扁、橫向波動
    for (const sp of sparks) {
      const ry = HZ + (HZ - sp.y) * 0.55;
      if (ry < HZ + 2 || ry > env.Hu / 2 + 10) continue;
      const wob = Math.sin(ry * 0.35 + M.u * TAU * 3) * 2.5;
      const [px, py] = P(sp.x + wob, ry);
      ctx.globalAlpha = baseA * sp.al * 0.55;
      ctx.fillStyle = sp.c;
      ctx.fillRect(px - 3.5, py - 0.7, 7, 1.4);
    }
    // 窗光的長條倒影
    if (det > 0.5) {
      for (let i = 0; i < 26; i++) {
        const x = (hash(i, 71) - 0.5) * env.Wu;
        const len = 8 + hash(i, 72) * 22;
        for (let q = 0; q < 4; q++) {
          const y = HZ + 4 + q * (len / 4);
          const [px, py] = P(x + Math.sin(y * 0.4 + M.u * TAU * 2 + i) * 1.5, y);
          ctx.globalAlpha = baseA * 0.3 * (1 - q / 4);
          ctx.fillStyle = windowC;
          ctx.fillRect(px - 1.5, py, 3, 1);
        }
      }
    }
    ctx.restore();
    // 岸線：一道很細的亮線
    S.alpha = baseA;
    S.line([-W2, HZ + 0.5, W2, HZ + 0.5], mix(skyLow, pal.light, 0.15), { w: 0.6, alpha: 0.5, drawOn: false });
  },
};
