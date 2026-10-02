// 動效疊加層：粒子、複雜線條系統、速度線、漣漪、流光、遮罩揭示。
// 全部是時間的純函數（粒子由事件時間 + 種子推算），所以可逐幀回放與導出。
import { lighten, rgba } from './color';
import type { Env } from './env';
import type { MotionCtx } from './motion';
import type { Look, LType, PType } from './types';
import { TAU, clamp, fract, hash, noise2, smooth, wrap } from './util';

export interface Ev {
  u: number;
  x: number;
  y: number;
  /** 衝擊強度 */
  k?: number;
}

const EVENT_TYPES: PType[] = ['dust', 'spark', 'confetti', 'pixel', 'ink', 'star'];

function drawP(ctx: CanvasRenderingContext2D, t: PType, x: number, y: number, s: number, rot: number, look: Look, i: number, a: number) {
  const P = look.pal;
  const cols = [P.p, P.s, P.a, P.q];
  ctx.globalAlpha = a;
  switch (t) {
    case 'dust':
      ctx.fillStyle = rgba(lighten(P.bg2, 0.05), 0.9);
      ctx.beginPath();
      ctx.arc(x, y, s * 1.2, 0, TAU);
      ctx.fill();
      break;
    case 'spark':
      ctx.strokeStyle = i % 2 ? P.a : P.light;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - Math.cos(rot) * s * 2.6, y - Math.sin(rot) * s * 2.6);
      ctx.stroke();
      break;
    case 'confetti':
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.fillStyle = cols[i % 4];
      ctx.fillRect(-s, -s * 0.45, s * 2, s * 0.9);
      ctx.restore();
      break;
    case 'pixel':
      ctx.fillStyle = cols[i % 4];
      ctx.fillRect(Math.round(x / 4) * 4, Math.round(y / 4) * 4, 5, 5);
      break;
    case 'ink':
      ctx.fillStyle = P.ink;
      ctx.beginPath();
      ctx.arc(x, y, s * 0.9, 0, TAU);
      ctx.fill();
      break;
    case 'star': {
      ctx.fillStyle = i % 2 ? P.a : P.light;
      const r = s * 1.6;
      ctx.beginPath();
      for (let k = 0; k < 10; k++) {
        const rr = k % 2 ? r * 0.45 : r;
        const ang = rot + (k / 10) * TAU;
        ctx.lineTo(x + Math.cos(ang) * rr, y + Math.sin(ang) * rr);
      }
      ctx.fill();
      break;
    }
    case 'bubble':
      ctx.strokeStyle = rgba(P.light, 0.85);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, s * 1.6, 0, TAU);
      ctx.stroke();
      break;
    case 'leaf':
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.fillStyle = i % 3 ? P.q : P.a;
      ctx.beginPath();
      ctx.ellipse(0, 0, s * 1.8, s * 0.8, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
      break;
    case 'heart':
      ctx.fillStyle = i % 2 ? P.p : P.a;
      ctx.beginPath();
      ctx.moveTo(x, y + s * 0.6);
      ctx.bezierCurveTo(x - s * 1.6, y - s * 0.6, x - s * 0.7, y - s * 1.7, x, y - s * 0.7);
      ctx.bezierCurveTo(x + s * 0.7, y - s * 1.7, x + s * 1.6, y - s * 0.6, x, y + s * 0.6);
      ctx.fill();
      break;
    case 'snow':
      ctx.fillStyle = rgba(P.light, 0.9);
      ctx.beginPath();
      ctx.arc(x, y, s * 0.8, 0, TAU);
      ctx.fill();
      break;
  }
  ctx.globalAlpha = 1;
}

export function drawParticles(ctx: CanvasRenderingContext2D, env: Env, look: Look, M: MotionCtx, evs: Ev[]) {
  const parts = M.mv.parts;
  if (!parts.length) return;
  const hw = env.Wu / 2;
  const hh = env.Hu / 2;
  const evList = evs.length ? evs : [{ u: 0.05, x: 0, y: 40 }, { u: 0.55, x: 0, y: 40 }];
  ctx.save();
  for (const { t, a } of parts) {
    if (a < 0.03) continue;
    if (EVENT_TYPES.includes(t)) {
      evList.forEach((e, ei) => {
        const since = M.since(e.u);
        const life = t === 'dust' ? 0.7 : t === 'ink' ? 0.9 : 1.1;
        if (since > life) return;
        const n = Math.round((6 + 16 * Math.min(1.2, a)) * (e.k ?? 1));
        for (let i = 0; i < n; i++) {
          const h1 = hash(i, ei, 101);
          const h2 = hash(i, ei, 102);
          const up = t === 'dust' ? -Math.PI * (0.15 + 0.7 * h1) + (h1 > 0.5 ? -0.2 : 0.2) : -Math.PI * h1 * 1.1 + 0.05;
          const sp = (t === 'dust' ? 60 : 150) * (0.4 + h2);
          const g = t === 'dust' ? 40 : t === 'confetti' ? 160 : 320;
          const x = e.x + Math.cos(up) * sp * since * (t === 'dust' ? 1.6 : 1);
          const y = e.y + Math.sin(up) * sp * since + 0.5 * g * since * since;
          const k = 1 - since / life;
          drawP(ctx, t, x, y, (t === 'dust' ? 5 + h2 * 6 : 2.5 + h2 * 3) * (t === 'dust' ? 0.6 + since * 1.6 : 1), up + since * 6 * (h1 - 0.5), look, i, clamp(k * 1.2) * Math.min(1, a));
        }
      });
    } else {
      // 環境粒子：漂浮循環
      const n = Math.round(8 + 22 * Math.min(1.2, a));
      for (let i = 0; i < n; i++) {
        const h1 = hash(i, 201);
        const h2 = hash(i, 202);
        const span = env.Hu + 60;
        const dir = t === 'bubble' || t === 'heart' ? -1 : 1;
        const cyc = 1 + Math.floor(h2 * 2);
        const y = wrap(h1 * span + dir * M.u * span * cyc, span) - span / 2;
        const x = (hash(i, 203) * 2 - 1) * hw + Math.sin(TAU * (M.u * 2 + h1)) * (t === 'leaf' ? 30 : 10) + (t === 'leaf' ? M.mv.wind * 40 * Math.sin(TAU * M.u) : 0);
        drawP(ctx, t, x, y, 2.5 + h2 * 3, TAU * (M.u * cyc + h1), look, i, 0.85 * Math.min(1, a));
      }
    }
  }
  ctx.restore();
  void hh;
}

// ---------- 線條系統 ----------
function flowField(ctx: CanvasRenderingContext2D, env: Env, look: Look, M: MotionCtx, a: number) {
  const hw = env.Wu / 2;
  const hh = env.Hu / 2;
  const n = env.thumb ? 26 : 54;
  const cols = [look.pal.p, look.pal.s, look.pal.a, look.pal.q];
  const tc = Math.cos(TAU * M.u) * 0.6;
  const ts = Math.sin(TAU * M.u) * 0.6;
  ctx.lineWidth = 1.4;
  ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    let x = (hash(i, 301) * 2 - 1) * hw;
    let y = (hash(i, 302) * 2 - 1) * hh;
    const steps = 26;
    const head = fract(M.u * 2 + hash(i, 303));
    ctx.strokeStyle = rgba(cols[i % 4], a * 0.7);
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let s = 0; s < steps; s++) {
      const ang = noise2(x * 0.006 + tc, y * 0.006 + ts, 7) * TAU * 1.2;
      x += Math.cos(ang) * 9;
      y += Math.sin(ang) * 9;
      if (s / steps <= head + 0.35) ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}
function network(ctx: CanvasRenderingContext2D, env: Env, look: Look, M: MotionCtx, a: number) {
  const hw = env.Wu / 2;
  const hh = env.Hu / 2;
  const n = env.thumb ? 16 : 30;
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const x = (hash(i, 401) * 2 - 1) * hw * 0.95 + Math.sin(TAU * (M.u + hash(i, 402))) * 30;
    const y = (hash(i, 403) * 2 - 1) * hh * 0.9 + Math.cos(TAU * (M.u * 2 + hash(i, 404))) * 22;
    pts.push([x, y]);
  }
  ctx.lineWidth = 1;
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      const d = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]);
      if (d < 120) {
        ctx.strokeStyle = rgba(look.pal.ink, a * 0.45 * (1 - d / 120));
        ctx.beginPath();
        ctx.moveTo(pts[i][0], pts[i][1]);
        ctx.lineTo(pts[j][0], pts[j][1]);
        ctx.stroke();
      }
    }
  ctx.fillStyle = rgba(look.pal.s, a * 0.9);
  for (const [x, y] of pts) {
    ctx.beginPath();
    ctx.arc(x, y, 2.4, 0, TAU);
    ctx.fill();
  }
}
function spiro(ctx: CanvasRenderingContext2D, env: Env, look: Look, M: MotionCtx, a: number) {
  const R = Math.min(env.Wu, env.Hu) * 0.42;
  const curves: [number, number, number, string][] = [
    [R, R * 0.36, R * 0.62, look.pal.p],
    [R * 0.8, R * 0.22, R * 0.5, look.pal.s],
  ];
  ctx.lineWidth = 1.2;
  curves.forEach(([Rr, r, d, c], ci) => {
    const turns = 18;
    const N = 900;
    const prog = smooth(0, 0.7, M.u) * (1 - smooth(0.88, 1, M.u));
    ctx.strokeStyle = rgba(c, a * 0.75);
    ctx.beginPath();
    for (let i = 0; i <= N * prog; i++) {
      const t = (i / N) * TAU * turns;
      const k = (Rr - r) / r;
      const x = (Rr - r) * Math.cos(t) + d * Math.cos(k * t);
      const y = (Rr - r) * Math.sin(t) - d * Math.sin(k * t);
      const rot = TAU * M.u * (ci ? -0.25 : 0.25);
      const xr = x * Math.cos(rot) - y * Math.sin(rot);
      const yr = x * Math.sin(rot) + y * Math.cos(rot);
      if (i === 0) ctx.moveTo(xr, yr);
      else ctx.lineTo(xr, yr);
    }
    ctx.stroke();
  });
}
function contour(ctx: CanvasRenderingContext2D, env: Env, look: Look, M: MotionCtx, a: number) {
  const hw = env.Wu / 2 + 20;
  const hh = env.Hu / 2 + 20;
  const cs = env.thumb ? 26 : 16;
  const nx = Math.ceil((hw * 2) / cs);
  const ny = Math.ceil((hh * 2) / cs);
  const tc = Math.cos(TAU * M.u) * 0.8;
  const ts = Math.sin(TAU * M.u) * 0.8;
  const f = (i: number, j: number) => noise2((i * cs) * 0.006 + tc, (j * cs) * 0.006 + ts, 3) * 0.7 + noise2(i * cs * 0.015, j * cs * 0.015 + ts, 5) * 0.3;
  const vals: number[] = [];
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) vals.push(f(i, j));
  const V = (i: number, j: number) => vals[j * (nx + 1) + i];
  ctx.lineWidth = 1.1;
  const levels = [-0.45, -0.3, -0.15, 0, 0.15, 0.3, 0.45];
  levels.forEach((lv, li) => {
    ctx.strokeStyle = rgba(li % 2 ? look.pal.ink : look.pal.s, a * 0.55);
    ctx.beginPath();
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const v0 = V(i, j);
        const v1 = V(i + 1, j);
        const v2 = V(i + 1, j + 1);
        const v3 = V(i, j + 1);
        const x = -hw + i * cs;
        const y = -hh + j * cs;
        const pts: [number, number][] = [];
        const edge = (va: number, vb: number, ax: number, ay: number, bx: number, by: number) => {
          if ((va < lv) !== (vb < lv)) {
            const t = (lv - va) / (vb - va);
            pts.push([ax + (bx - ax) * t, ay + (by - ay) * t]);
          }
        };
        edge(v0, v1, x, y, x + cs, y);
        edge(v1, v2, x + cs, y, x + cs, y + cs);
        edge(v2, v3, x + cs, y + cs, x, y + cs);
        edge(v3, v0, x, y + cs, x, y);
        if (pts.length >= 2) {
          ctx.moveTo(pts[0][0], pts[0][1]);
          ctx.lineTo(pts[1][0], pts[1][1]);
          if (pts.length === 4) {
            ctx.moveTo(pts[2][0], pts[2][1]);
            ctx.lineTo(pts[3][0], pts[3][1]);
          }
        }
      }
    ctx.stroke();
  });
}
function rings(ctx: CanvasRenderingContext2D, env: Env, look: Look, M: MotionCtx, a: number) {
  const R = Math.min(env.Wu, env.Hu) * 0.46;
  const cols = [look.pal.p, look.pal.s, look.pal.a, look.pal.q];
  ctx.lineWidth = 2;
  for (let k = 0; k < 6; k++) {
    const r = R * (0.35 + k * 0.13);
    const sides = 3 + k;
    const rot = TAU * M.u * (k % 2 ? -1 : 1) / sides;
    ctx.strokeStyle = rgba(cols[k % 4], a * 0.7);
    ctx.beginPath();
    for (let i = 0; i <= sides; i++) {
      const ang = rot + (i / sides) * TAU - Math.PI / 2;
      ctx.lineTo(Math.cos(ang) * r, Math.sin(ang) * r);
    }
    ctx.stroke();
  }
}
function grid(ctx: CanvasRenderingContext2D, env: Env, look: Look, M: MotionCtx, a: number) {
  const hw = env.Wu / 2;
  const hh = env.Hu / 2;
  const s = 24;
  ctx.strokeStyle = rgba(look.pal.ink, a * 0.35);
  ctx.lineWidth = 1;
  const disp = (x: number, y: number) => {
    const d = Math.hypot(x, y);
    return Math.sin(d * 0.04 - TAU * M.u * 2) * 8 * Math.exp(-d * 0.004);
  };
  ctx.beginPath();
  for (let y = -hh; y <= hh; y += s) {
    for (let x = -hw; x <= hw; x += 6) {
      const yy = y + disp(x, y);
      if (x === -hw) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
  }
  for (let x = -hw; x <= hw; x += s) {
    for (let y = -hh; y <= hh; y += 6) {
      const xx = x + disp(x, y) * 0.6;
      if (y === -hh) ctx.moveTo(xx, y);
      else ctx.lineTo(xx, y);
    }
  }
  ctx.stroke();
}
function orbit(ctx: CanvasRenderingContext2D, env: Env, look: Look, M: MotionCtx, a: number, cx: number, cy: number) {
  const cols = [look.pal.p, look.pal.s, look.pal.a];
  for (let k = 0; k < 3; k++) {
    const rx = 90 + k * 34;
    const ry = 26 + k * 12;
    const tilt = -0.35 + k * 0.3;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(tilt);
    ctx.strokeStyle = rgba(look.pal.ink, a * 0.35);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, TAU);
    ctx.stroke();
    const ang = TAU * (M.u * (k + 1) + k * 0.3);
    ctx.fillStyle = rgba(cols[k], a);
    ctx.beginPath();
    ctx.arc(Math.cos(ang) * rx, Math.sin(ang) * ry, 5 - k, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}
function rays(ctx: CanvasRenderingContext2D, env: Env, look: Look, M: MotionCtx, a: number) {
  const R = Math.hypot(env.Wu, env.Hu) / 2;
  ctx.strokeStyle = rgba(look.pal.a, a * 0.5);
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < 36; i++) {
    const ang = (i / 36) * TAU + TAU * M.u / 12;
    ctx.moveTo(Math.cos(ang) * 120, Math.sin(ang) * 120);
    ctx.lineTo(Math.cos(ang) * R, Math.sin(ang) * R);
  }
  ctx.stroke();
}
function swarm(ctx: CanvasRenderingContext2D, env: Env, look: Look, M: MotionCtx, a: number, cx: number, cy: number) {
  const n = env.thumb ? 30 : 70;
  ctx.fillStyle = rgba(look.pal.ink, a * 0.85);
  for (let i = 0; i < n; i++) {
    const ph = hash(i, 501);
    const r = 40 + hash(i, 502) * 90;
    const sp = 1 + Math.floor(hash(i, 503) * 2);
    const ang = TAU * (M.u * sp + ph);
    const wob = noise2(Math.cos(TAU * M.u) + i, Math.sin(TAU * M.u), 9) * 30;
    const x = cx + Math.cos(ang) * (r + wob);
    const y = cy + Math.sin(ang * 1.3) * (r * 0.55 + wob * 0.5) - 20;
    const vx = -Math.sin(ang);
    const vy = Math.cos(ang * 1.3) * 0.7;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.atan2(vy, vx));
    ctx.beginPath();
    ctx.moveTo(5, 0);
    ctx.lineTo(-4, 2.6);
    ctx.lineTo(-4, -2.6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
function liquid(ctx: CanvasRenderingContext2D, env: Env, look: Look, M: MotionCtx, a: number, cx: number, cy: number) {
  const n = 7;
  const pts: [number, number, number][] = [];
  for (let i = 0; i < n; i++) {
    const ang = TAU * (M.u * (i % 2 ? 1 : -1) + i / n);
    const r = 70 + 40 * Math.sin(TAU * (M.u * 2 + i * 0.37));
    pts.push([cx + Math.cos(ang) * r * 1.4, cy + Math.sin(ang) * r * 0.8, 14 + hash(i, 601) * 16]);
  }
  ctx.fillStyle = rgba(look.pal.a, a * 0.85);
  ctx.strokeStyle = rgba(look.pal.a, a * 0.85);
  ctx.lineCap = 'round';
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      const d = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]);
      const lim = (pts[i][2] + pts[j][2]) * 2.2;
      if (d < lim) {
        ctx.lineWidth = Math.min(pts[i][2], pts[j][2]) * 1.4 * (1 - d / lim);
        ctx.beginPath();
        ctx.moveTo(pts[i][0], pts[i][1]);
        ctx.lineTo(pts[j][0], pts[j][1]);
        ctx.stroke();
      }
    }
  for (const [x, y, r] of pts) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }
}

export function drawLines(ctx: CanvasRenderingContext2D, env: Env, look: Look, M: MotionCtx, track: [number, number], layer: 'back' | 'front') {
  for (const { t, a } of M.mv.lines) {
    if (a < 0.03) continue;
    const aa = Math.min(1, a);
    ctx.save();
    if (layer === 'back') {
      if (t === 'flow') flowField(ctx, env, look, M, aa);
      else if (t === 'network') network(ctx, env, look, M, aa);
      else if (t === 'spiro') spiro(ctx, env, look, M, aa);
      else if (t === 'contour') contour(ctx, env, look, M, aa);
      else if (t === 'rings') rings(ctx, env, look, M, aa);
      else if (t === 'grid') grid(ctx, env, look, M, aa);
      else if (t === 'rays') rays(ctx, env, look, M, aa);
      else if (t === 'liquid') liquid(ctx, env, look, M, aa, track[0], track[1]);
    } else {
      if (t === 'orbit') orbit(ctx, env, look, M, aa, track[0], track[1]);
      else if (t === 'swarm') swarm(ctx, env, look, M, aa, track[0], track[1]);
    }
    ctx.restore();
  }
}

/** 速度線：衝擊時的集中線 + 移動時的拖尾線 */
export function drawSpeedLines(ctx: CanvasRenderingContext2D, env: Env, look: Look, M: MotionCtx, track: [number, number], vel: [number, number]) {
  const amt = M.mv.speedLines;
  if (amt < 0.05) return;
  const hw = env.Wu / 2;
  const hh = env.Hu / 2;
  const P = look.pal;
  const dark = (0.299 * parseInt(P.bg.slice(1, 3), 16) + 0.587 * parseInt(P.bg.slice(3, 5), 16) + 0.114 * parseInt(P.bg.slice(5, 7), 16)) / 255 < 0.45;
  const col = dark ? P.light : P.ink;
  const pulse = Math.min(1, M.pulse(7));
  if (pulse > 0.05) {
    const R = Math.hypot(hw, hh) + 30;
    const r0 = Math.min(hw, hh) * 0.72;
    ctx.fillStyle = rgba(col, Math.min(0.9, pulse * amt));
    ctx.beginPath();
    const n = 70;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + hash(i, M.jframe, 1) * 0.05;
      const inner = r0 * (0.8 + hash(i, M.jframe, 2) * 0.5);
      const w = 0.006 + hash(i, M.jframe, 3) * 0.012;
      ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
      ctx.lineTo(Math.cos(a - w) * R, Math.sin(a - w) * R);
      ctx.lineTo(Math.cos(a + w) * R, Math.sin(a + w) * R);
      ctx.closePath();
    }
    ctx.fill();
  }
  const sp = Math.hypot(vel[0], vel[1]);
  if (sp > 140) {
    const k = Math.min(1, (sp - 140) / 500) * amt;
    const dx = -vel[0] / sp;
    const dy = -vel[1] / sp;
    ctx.strokeStyle = rgba(col, 0.75 * k);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < 7; i++) {
      const off = (hash(i, M.jframe, 7) - 0.5) * 90;
      const sx = track[0] + -dy * off + dx * 40;
      const sy = track[1] + dx * off + dy * 40;
      const len = 40 + hash(i, M.jframe, 8) * 90;
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + dx * len, sy + dy * len);
    }
    ctx.stroke();
  }
}

export function drawRipples(ctx: CanvasRenderingContext2D, look: Look, M: MotionCtx, evs: Ev[]) {
  const amt = M.mv.ripple;
  if (amt < 0.05) return;
  const list = evs.length ? evs : [{ u: 0.1, x: 0, y: 0 }];
  ctx.lineWidth = 2;
  for (const e of list) {
    const s = M.since(e.u);
    if (s > 0.9) continue;
    for (let k = 0; k < 2; k++) {
      const t = s - k * 0.12;
      if (t <= 0) continue;
      const r = 12 + t * 190;
      ctx.strokeStyle = rgba(look.pal.a, amt * (1 - t / 0.9) * 0.9);
      ctx.beginPath();
      ctx.arc(e.x, e.y, r, 0, TAU);
      ctx.stroke();
    }
  }
}

/** 骨架屏流光（只在主體像素上） */
export function drawShimmer(ctx: CanvasRenderingContext2D, env: Env, M: MotionCtx) {
  const amt = M.mv.shimmer;
  if (amt < 0.05) return;
  const hw = env.Wu / 2;
  const x = -hw * 1.6 + fract(M.u * 2) * hw * 3.2;
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  ctx.rotate(0.35);
  const g = ctx.createLinearGradient(x - 70, 0, x + 70, 0);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.5, `rgba(255,255,255,${0.55 * Math.min(1, amt)})`);
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - 70, -env.Hu, 140, env.Hu * 2);
  ctx.restore();
}

/** 遮罩揭示：開場光圈打開、收尾劃出 */
export function applyMask(ctx: CanvasRenderingContext2D, env: Env, M: MotionCtx) {
  const amt = M.mv.mask;
  if (amt < 0.1) return;
  const u = M.u;
  const R = Math.hypot(env.Wu, env.Hu) / 2 + 10;
  const open = M.io(smooth(0, 0.22, u));
  const close = smooth(0.84, 0.98, u);
  ctx.save();
  ctx.globalCompositeOperation = 'destination-in';
  ctx.fillStyle = '#000';
  ctx.beginPath();
  if (close > 0) {
    const w = env.Wu * (1 - close);
    ctx.rect(env.Wu / 2 - w, -env.Hu, w, env.Hu * 2);
  } else {
    ctx.arc(0, 0, Math.max(0.1, R * open), 0, TAU);
  }
  ctx.fill();
  ctx.restore();
}
