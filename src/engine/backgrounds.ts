// 背景生成器：每個風格可指定一種背景（天空、合成波網格、蒙德里安、數位雨…），全部可無縫循環。
import { darken, lighten, mix, rgba } from './color';
import type { Env } from './env';
import type { MotionCtx } from './motion';
import type { BgSpec, Look, Palette } from './types';
import { TAU, fract, hash, wrap } from './util';

interface B {
  ctx: CanvasRenderingContext2D;
  env: Env;
  look: Look;
  M: MotionCtx;
  time: number;
  X0: number;
  Y0: number;
  W: number;
  H: number;
  hw: number;
  hh: number;
  P: Palette;
  spec: BgSpec;
}

const fillAll = (b: B, style: string | CanvasGradient) => {
  b.ctx.fillStyle = style;
  b.ctx.fillRect(b.X0, b.Y0, b.W, b.H);
};
const vgrad = (b: B, c0: string, c1: string, y0 = -b.hh, y1 = b.hh) => {
  const g = b.ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, c0);
  g.addColorStop(1, c1);
  fillAll(b, g);
  return g;
};

export function cloud(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color: string, shade?: string) {
  const puffs: [number, number, number][] = [
    [-34, 4, 20],
    [-12, -10, 26],
    [16, -6, 22],
    [36, 6, 16],
    [0, 8, 20],
  ];
  if (shade) {
    ctx.fillStyle = shade;
    ctx.beginPath();
    for (const [px, py, r] of puffs) {
      ctx.moveTo(x + (px + r) * s, y + (py + 5) * s);
      ctx.arc(x + px * s, y + (py + 5) * s, r * s, 0, TAU);
    }
    ctx.fill();
  }
  ctx.fillStyle = color;
  ctx.beginPath();
  for (const [px, py, r] of puffs) {
    ctx.moveTo(x + (px + r) * s, y + py * s);
    ctx.arc(x + px * s, y + py * s, r * s, 0, TAU);
  }
  ctx.fill();
}

function perspectiveGrid(b: B, hz: number, color: string, glow: boolean, speed = 2) {
  const { ctx, M, hw } = b;
  const bottom = b.hh + 60;
  ctx.save();
  ctx.beginPath();
  ctx.rect(b.X0, hz, b.W, bottom - hz + 200);
  ctx.clip();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6;
  if (glow) {
    ctx.shadowColor = color;
    ctx.shadowBlur = 8 * b.env.u;
  }
  const phase = fract(M.u * speed);
  ctx.beginPath();
  for (let k = 0; k < 16; k++) {
    const z = (k + phase) / 16;
    const y = hz + (bottom - hz) * z * z;
    ctx.moveTo(b.X0, y);
    ctx.lineTo(b.X0 + b.W, y);
  }
  for (let i = -16; i <= 16; i++) {
    ctx.moveTo((i * hw) / 8 / 6, hz);
    ctx.lineTo(i * 70, bottom + 40);
  }
  ctx.stroke();
  ctx.restore();
}

const BG: Record<string, (b: B) => void> = {
  none: () => undefined,
  solid: (b) => fillAll(b, b.P.bg),
  paper: (b) => fillAll(b, b.P.bg),
  vgrad: (b) => void vgrad(b, b.P.bg, b.P.bg2),
  radial: (b) => {
    const g = b.ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(b.hw, b.hh) * 1.15);
    g.addColorStop(0, b.P.bg);
    g.addColorStop(1, b.P.bg2);
    fillAll(b, g);
  },
  sky: (b) => {
    vgrad(b, b.P.bg2, b.P.bg, -b.hh, b.hh * 0.6);
    const { ctx, M, hw, hh } = b;
    const n = b.env.detail > 0.5 ? 4 : 2;
    for (let i = 0; i < n; i++) {
      const span = b.env.Wu + 260;
      const x = wrap(hash(i, 3) * span + M.u * span * (i % 2 ? 1 : 2), span) - span / 2;
      const y = -hh * 0.62 + hash(i, 5) * hh * 0.55;
      cloud(ctx, x, y, 0.75 + hash(i, 7) * 0.7, rgba(b.P.light, 0.95), rgba(darken(b.P.bg, 0.08), 0.6));
    }
    void hw;
  },
  pixelsky: (b) => {
    vgrad(b, b.P.bg2, b.P.bg, -b.hh, b.hh * 0.5);
    const { ctx, M } = b;
    ctx.fillStyle = b.P.light;
    for (let i = 0; i < 3; i++) {
      const span = b.env.Wu + 300;
      const x = wrap(hash(i, 13) * span + M.u * span, span) - span / 2;
      const y = -b.hh * 0.62 + hash(i, 15) * b.hh * 0.4;
      const s = 16;
      ctx.fillRect(x - 3 * s, y, 6 * s, s);
      ctx.fillRect(x - 2 * s, y - s, 3 * s, s);
      ctx.fillRect(x - 4 * s, y + s, 8 * s, s);
    }
  },
  sunset: (b) => {
    const { ctx, P } = b;
    const hz = (b.spec.h as number) ?? 30;
    const g = ctx.createLinearGradient(0, -b.hh, 0, hz);
    g.addColorStop(0, P.bg2);
    g.addColorStop(0.55, mix(P.bg2, P.p, 0.55));
    g.addColorStop(1, P.a);
    ctx.fillStyle = g;
    ctx.fillRect(b.X0, b.Y0, b.W, hz - b.Y0);
    // 條紋太陽
    const R = Math.min(110, b.hh * 0.55);
    const sy = hz - R * 0.55;
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, sy, R, 0, TAU);
    ctx.clip();
    const sg = ctx.createLinearGradient(0, sy - R, 0, sy + R);
    sg.addColorStop(0, P.a);
    sg.addColorStop(1, P.p);
    ctx.fillStyle = sg;
    ctx.fillRect(-R, sy - R, R * 2, R * 2);
    ctx.fillStyle = g;
    for (let i = 0; i < 7; i++) {
      const yy = sy + R * 0.05 + i * R * 0.15 + fract(b.M.u * 2) * R * 0.15;
      ctx.fillRect(-R, yy, R * 2, 2 + i * 1.6);
    }
    ctx.restore();
    ctx.fillStyle = darken(P.bg2, 0.12);
    ctx.fillRect(b.X0, hz, b.W, b.Y0 + b.H - hz);
    perspectiveGrid(b, hz, P.s, true, 2);
  },
  vapor: (b) => {
    const { ctx, P } = b;
    const hz = 40;
    const g = ctx.createLinearGradient(0, -b.hh, 0, hz);
    g.addColorStop(0, P.bg2);
    g.addColorStop(1, P.bg);
    ctx.fillStyle = g;
    ctx.fillRect(b.X0, b.Y0, b.W, hz - b.Y0);
    const R = Math.min(90, b.hh * 0.45);
    const sg = ctx.createLinearGradient(0, hz - R * 2, 0, hz);
    sg.addColorStop(0, P.a);
    sg.addColorStop(1, P.p);
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.arc(0, hz - R * 0.6, R, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = mix(P.bg2, P.p, 0.3);
    ctx.fillRect(b.X0, hz, b.W, b.Y0 + b.H - hz);
    perspectiveGrid(b, hz, rgba(P.light, 0.8), false, 1);
  },
  grid: (b) => {
    fillAll(b, b.P.bg);
    const { ctx } = b;
    const step = (b.spec.step as number) ?? 20;
    const col = (b.spec.color as string) ?? b.P.ink;
    ctx.lineWidth = 1;
    for (const [s, a] of [
      [step, 0.07],
      [step * 5, 0.14],
    ] as [number, number][]) {
      ctx.strokeStyle = rgba(col, a * ((b.spec.alpha as number) ?? 1));
      ctx.beginPath();
      for (let x = Math.floor(b.X0 / s) * s; x < b.X0 + b.W; x += s) {
        ctx.moveTo(x, b.Y0);
        ctx.lineTo(x, b.Y0 + b.H);
      }
      for (let y = Math.floor(b.Y0 / s) * s; y < b.Y0 + b.H; y += s) {
        ctx.moveTo(b.X0, y);
        ctx.lineTo(b.X0 + b.W, y);
      }
      ctx.stroke();
    }
  },
  dotgrid: (b) => {
    fillAll(b, b.P.bg);
    const { ctx } = b;
    const s = 18;
    ctx.fillStyle = rgba(b.P.ink, 0.16);
    ctx.beginPath();
    for (let x = Math.floor(b.X0 / s) * s; x < b.X0 + b.W; x += s)
      for (let y = Math.floor(b.Y0 / s) * s; y < b.Y0 + b.H; y += s) {
        ctx.moveTo(x + 1.3, y);
        ctx.arc(x, y, 1.3, 0, TAU);
      }
    ctx.fill();
  },
  checker: (b) => {
    fillAll(b, b.P.bg);
    const { ctx } = b;
    const s = 40;
    ctx.fillStyle = b.P.bg2;
    for (let x = Math.floor(b.X0 / s); x * s < b.X0 + b.W; x++)
      for (let y = Math.floor(b.Y0 / s); y * s < b.Y0 + b.H; y++) if ((x + y) % 2 === 0) ctx.fillRect(x * s, y * s, s, s);
  },
  stripes: (b) => {
    fillAll(b, b.P.bg);
    const { ctx } = b;
    ctx.save();
    ctx.rotate(-0.6);
    ctx.fillStyle = b.P.bg2;
    const D = Math.max(b.W, b.H);
    const off = fract(b.M.u) * 40;
    for (let x = -D; x < D; x += 40) ctx.fillRect(x + off, -D, 18, D * 2);
    ctx.restore();
  },
  lined: (b) => {
    fillAll(b, b.P.bg);
    const { ctx } = b;
    ctx.strokeStyle = 'rgba(110,150,220,0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let y = Math.floor(b.Y0 / 22) * 22; y < b.Y0 + b.H; y += 22) {
      ctx.moveTo(b.X0, y);
      ctx.lineTo(b.X0 + b.W, y);
    }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(230,90,90,0.6)';
    ctx.beginPath();
    ctx.moveTo(-b.hw + 54, b.Y0);
    ctx.lineTo(-b.hw + 54, b.Y0 + b.H);
    ctx.stroke();
  },
  stars: (b) => {
    vgrad(b, b.P.bg2, b.P.bg);
    const { ctx, M } = b;
    const n = b.env.thumb ? 60 : 140;
    for (let i = 0; i < n; i++) {
      const x = b.X0 + hash(i, 1) * b.W;
      const y = b.Y0 + hash(i, 2) * b.H;
      const r = 0.5 + hash(i, 3) * 1.4;
      const tw = 0.45 + 0.55 * Math.sin(TAU * (M.u * (1 + (i % 3)) + hash(i, 4)));
      ctx.fillStyle = rgba(b.P.light, 0.35 + 0.65 * tw);
      ctx.fillRect(x - r / 2, y - r / 2, r, r);
    }
  },
  aurora: (b) => {
    fillAll(b, b.P.bg);
    const { ctx, M, P } = b;
    const cols = [P.p, P.s, P.a, P.q];
    const R = Math.max(b.hw, b.hh) * 0.95;
    ctx.save();
    for (let i = 0; i < 4; i++) {
      const a = TAU * (M.u + i * 0.25);
      const x = Math.cos(a + i) * b.hw * 0.45;
      const y = Math.sin(a * 1 + i * 2) * b.hh * 0.4;
      const g = ctx.createRadialGradient(x, y, 0, x, y, R);
      g.addColorStop(0, rgba(cols[i], 0.75));
      g.addColorStop(1, rgba(cols[i], 0));
      ctx.fillStyle = g;
      ctx.fillRect(b.X0, b.Y0, b.W, b.H);
    }
    ctx.restore();
  },
  memphis: (b) => {
    fillAll(b, b.P.bg);
    const { ctx, M, P } = b;
    const cols = [P.p, P.s, P.a, P.q, P.ink];
    const n = b.env.thumb ? 16 : 30;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = 0; i < n; i++) {
      const x = b.X0 + 30 + hash(i, 11) * (b.W - 60);
      const y = b.Y0 + 30 + hash(i, 12) * (b.H - 60);
      if (Math.abs(x) < b.hw * 0.32 && Math.abs(y) < b.hh * 0.42) continue;
      const kind = Math.floor(hash(i, 13) * 6);
      const c = cols[Math.floor(hash(i, 14) * cols.length)];
      const rot = hash(i, 15) * TAU + 0.25 * Math.sin(TAU * (M.u + hash(i, 16)));
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.strokeStyle = c;
      ctx.fillStyle = c;
      ctx.lineWidth = 4;
      if (kind === 0) {
        ctx.beginPath();
        for (let k = 0; k <= 24; k++) ctx.lineTo(-30 + k * 2.5, Math.sin(k * 0.8) * 6);
        ctx.stroke();
      } else if (kind === 1) {
        ctx.beginPath();
        ctx.moveTo(0, -14);
        ctx.lineTo(13, 10);
        ctx.lineTo(-13, 10);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = P.ink;
        ctx.lineWidth = 2.5;
        ctx.stroke();
      } else if (kind === 2) {
        ctx.beginPath();
        ctx.arc(0, 0, 11, 0, TAU);
        ctx.stroke();
      } else if (kind === 3) {
        for (let k = 0; k < 9; k++) {
          ctx.beginPath();
          ctx.arc((k % 3) * 9 - 9, Math.floor(k / 3) * 9 - 9, 2.4, 0, TAU);
          ctx.fill();
        }
      } else if (kind === 4) {
        ctx.beginPath();
        for (let k = 0; k <= 6; k++) ctx.lineTo(-24 + k * 8, k % 2 ? -7 : 7);
        ctx.stroke();
      } else {
        ctx.fillRect(-3, -13, 6, 26);
        ctx.fillRect(-13, -3, 26, 6);
      }
      ctx.restore();
    }
  },
  mondrian: (b) => {
    fillAll(b, b.P.bg);
    const { ctx, P } = b;
    const xs = [b.X0, -b.hw * 0.62, -b.hw * 0.12, b.hw * 0.48, b.hw * 0.8, b.X0 + b.W];
    const ys = [b.Y0, -b.hh * 0.55, b.hh * 0.18, b.hh * 0.7, b.Y0 + b.H];
    const cols = [P.p, P.s, P.a];
    for (let i = 0; i < xs.length - 1; i++)
      for (let j = 0; j < ys.length - 1; j++) {
        const h = hash(i, j, 41);
        if (h < 0.3) {
          ctx.fillStyle = cols[Math.floor(hash(i, j, 42) * 3)];
          ctx.fillRect(xs[i], ys[j], xs[i + 1] - xs[i], ys[j + 1] - ys[j]);
        }
      }
    ctx.fillStyle = P.ink;
    for (const x of xs.slice(1, -1)) ctx.fillRect(x - 4, b.Y0, 8, b.H);
    for (const y of ys.slice(1, -1)) ctx.fillRect(b.X0, y - 4, b.W, 8);
  },
  sunburst: (b) => {
    fillAll(b, b.P.bg);
    const { ctx, M } = b;
    const N = 28;
    const cy = b.hh * 0.9;
    const off = M.u * (TAU / N) * 2;
    ctx.fillStyle = b.P.bg2;
    const R = Math.hypot(b.W, b.H);
    ctx.beginPath();
    for (let i = 0; i < N; i++) {
      const a0 = off + (i / N) * TAU;
      const a1 = a0 + TAU / N / 2;
      ctx.moveTo(0, cy);
      ctx.lineTo(Math.cos(a0) * R, cy + Math.sin(a0) * R);
      ctx.lineTo(Math.cos(a1) * R, cy + Math.sin(a1) * R);
      ctx.closePath();
    }
    ctx.fill();
  },
  decofan: (b) => {
    vgrad(b, b.P.bg, b.P.bg2);
    const { ctx, P } = b;
    const cy = b.hh + 10;
    ctx.strokeStyle = rgba(P.a, 0.55);
    ctx.lineWidth = 1.4;
    for (let r = 60; r < b.hh * 2.4; r += 26) {
      ctx.beginPath();
      ctx.arc(0, cy, r, Math.PI, TAU);
      ctx.stroke();
    }
    ctx.beginPath();
    for (let i = 0; i <= 18; i++) {
      const a = Math.PI + (i / 18) * Math.PI;
      ctx.moveTo(Math.cos(a) * 60, cy + Math.sin(a) * 60);
      ctx.lineTo(Math.cos(a) * 900, cy + Math.sin(a) * 900);
    }
    ctx.stroke();
  },
  seigaiha: (b) => {
    fillAll(b, b.P.bg);
    const { ctx, P } = b;
    const R = 24;
    const line = (b.spec.line as string) ?? darken(P.bg, 0.12);
    ctx.lineWidth = 1.6;
    let row = 0;
    for (let y = b.Y0; y < b.Y0 + b.H + R; y += R * 0.5, row++) {
      for (let x = b.X0 + (row % 2 ? R : 0); x < b.X0 + b.W + R; x += R * 2) {
        ctx.fillStyle = P.bg;
        ctx.beginPath();
        ctx.arc(x, y, R, Math.PI, TAU);
        ctx.fill();
        ctx.strokeStyle = line;
        for (let k = 4; k >= 1; k--) {
          ctx.beginPath();
          ctx.arc(x, y, (R * k) / 4, Math.PI, TAU);
          ctx.stroke();
        }
      }
    }
  },
  matrix: (b) => {
    fillAll(b, b.P.bg);
    const { ctx, M, P } = b;
    const cw = 14;
    const chars = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄ0123456789';
    ctx.font = '13px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    const span = b.H + 300;
    const step = b.env.thumb ? 2 : 1;
    for (let c = 0, x = b.X0; x < b.X0 + b.W; x += cw * step, c++) {
      const sp = 1 + Math.floor(hash(c, 5) * 3);
      const head = b.Y0 + wrap(hash(c, 6) * span + M.u * span * sp, span);
      for (let k = 0; k < 18; k++) {
        const y = head - k * 15;
        if (y < b.Y0 || y > b.Y0 + b.H) continue;
        const a = (1 - k / 18) * (k === 0 ? 1 : 0.75);
        ctx.fillStyle = k === 0 ? rgba(P.light, 0.95) : rgba(P.q, a);
        const ch = chars[Math.floor(hash(c, Math.floor(y / 15), Math.floor(M.u * 12)) * chars.length)];
        ctx.fillText(ch, x, y);
      }
    }
  },
  hud: (b) => {
    vgrad(b, b.P.bg, b.P.bg2);
    BG.gridOverlay(b);
    const { ctx, M, P } = b;
    ctx.strokeStyle = rgba(P.s, 0.35);
    ctx.lineWidth = 1.2;
    for (const [r, d, sp] of [
      [150, [6, 6], 1],
      [172, [2, 10], -1],
      [196, [40, 12], 1],
    ] as [number, number[], number][]) {
      ctx.save();
      ctx.rotate(TAU * M.u * sp * 0.25);
      ctx.setLineDash(d);
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
    ctx.setLineDash([]);
  },
  gridOverlay: (b) => {
    const { ctx } = b;
    const s = 24;
    ctx.strokeStyle = rgba(b.P.s, 0.08);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = Math.floor(b.X0 / s) * s; x < b.X0 + b.W; x += s) {
      ctx.moveTo(x, b.Y0);
      ctx.lineTo(x, b.Y0 + b.H);
    }
    for (let y = Math.floor(b.Y0 / s) * s; y < b.Y0 + b.H; y += s) {
      ctx.moveTo(b.X0, y);
      ctx.lineTo(b.X0 + b.W, y);
    }
    ctx.stroke();
  },
  circuit: (b) => {
    fillAll(b, b.P.bg);
    const { ctx, M, P } = b;
    const g = 20;
    const n = b.env.thumb ? 18 : 34;
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = 0; i < n; i++) {
      let x = Math.round((b.X0 + hash(i, 1) * b.W) / g) * g;
      let y = Math.round((b.Y0 + hash(i, 2) * b.H) / g) * g;
      const pts: [number, number][] = [[x, y]];
      let dir = Math.floor(hash(i, 3) * 4);
      for (let k = 0; k < 4; k++) {
        const len = (2 + Math.floor(hash(i, k, 4) * 4)) * g;
        const dx = [1, 0, -1, 0][dir];
        const dy = [0, 1, 0, -1][dir];
        x += dx * len;
        y += dy * len;
        pts.push([x, y]);
        dir = (dir + (hash(i, k, 5) > 0.5 ? 1 : 3)) % 4;
      }
      ctx.strokeStyle = rgba(P.r, 0.55);
      ctx.beginPath();
      pts.forEach(([px, py], k) => (k ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
      ctx.stroke();
      ctx.fillStyle = P.r;
      for (const [px, py] of [pts[0], pts[pts.length - 1]]) {
        ctx.beginPath();
        ctx.arc(px, py, 4, 0, TAU);
        ctx.fill();
      }
      // 沿線流動的訊號點
      if (i % 3 === 0) {
        const total = pts.length - 1;
        const t = fract(M.u * 2 + hash(i, 9)) * total;
        const k = Math.floor(t);
        const f = t - k;
        const px = pts[k][0] + (pts[k + 1][0] - pts[k][0]) * f;
        const py = pts[k][1] + (pts[k + 1][1] - pts[k][1]) * f;
        ctx.fillStyle = P.light;
        ctx.beginPath();
        ctx.arc(px, py, 2.6, 0, TAU);
        ctx.fill();
      }
    }
  },
  brick: (b) => {
    fillAll(b, b.P.bg);
    const { ctx, P } = b;
    const bh = 22;
    const bw = 50;
    let row = 0;
    for (let y = Math.floor(b.Y0 / bh) * bh; y < b.Y0 + b.H; y += bh, row++) {
      for (let x = Math.floor(b.X0 / bw) * bw - (row % 2 ? bw / 2 : 0); x < b.X0 + b.W; x += bw) {
        ctx.fillStyle = mix(P.bg2, P.bg, hash(Math.round(x), Math.round(y), 3) * 0.6);
        ctx.fillRect(x + 1.5, y + 1.5, bw - 3, bh - 3);
      }
    }
    const g = ctx.createRadialGradient(0, 0, 50, 0, 0, Math.max(b.hw, b.hh) * 1.2);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.55)');
    fillAll(b, g);
  },
  bokeh: (b) => {
    vgrad(b, b.P.bg, b.P.bg2);
    const { ctx, M, P } = b;
    const cols = [P.p, P.s, P.a, P.q, P.light];
    const n = b.env.thumb ? 14 : 26;
    for (let i = 0; i < n; i++) {
      const r = 10 + hash(i, 1) * 50;
      const x = b.X0 + hash(i, 2) * b.W + Math.sin(TAU * (M.u + hash(i, 3))) * 14;
      const y = b.Y0 + hash(i, 4) * b.H + Math.cos(TAU * (M.u + hash(i, 5))) * 10;
      const g = ctx.createRadialGradient(x, y, r * 0.2, x, y, r);
      const c = cols[i % cols.length];
      g.addColorStop(0, rgba(c, 0.32));
      g.addColorStop(0.85, rgba(c, 0.22));
      g.addColorStop(1, rgba(c, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    }
  },
  halfdots: (b) => {
    fillAll(b, b.P.bg);
    const { ctx } = b;
    const s = 12;
    ctx.fillStyle = b.P.bg2;
    ctx.beginPath();
    for (let x = Math.floor(b.X0 / s) * s; x < b.X0 + b.W; x += s)
      for (let y = Math.floor(b.Y0 / s) * s; y < b.Y0 + b.H; y += s) {
        const k = (x / b.hw + y / b.hh + 2) / 4;
        const r = 0.6 + 4.6 * Math.max(0, Math.min(1, k));
        ctx.moveTo(x + r, y);
        ctx.arc(x, y, r, 0, TAU);
      }
    ctx.fill();
  },
  burst: (b) => {
    fillAll(b, b.P.bg);
    const { ctx, M } = b;
    const N = 22;
    const off = M.u * (TAU / N) * 2;
    const R = Math.hypot(b.W, b.H);
    ctx.fillStyle = b.P.bg2;
    ctx.beginPath();
    for (let i = 0; i < N; i++) {
      const a0 = off + (i / N) * TAU;
      const a1 = a0 + TAU / N / 2;
      ctx.moveTo(0, -10);
      ctx.lineTo(Math.cos(a0) * R, Math.sin(a0) * R);
      ctx.lineTo(Math.cos(a1) * R, Math.sin(a1) * R);
      ctx.closePath();
    }
    ctx.fill();
  },
  focus: (b) => {
    fillAll(b, b.P.bg);
    const { ctx, M } = b;
    const R = Math.hypot(b.hw, b.hh) + 40;
    const r0 = Math.min(b.hw, b.hh) * 0.8;
    const n = b.env.thumb ? 60 : 110;
    const f = M.bframe;
    ctx.fillStyle = rgba(b.P.ink, 0.85);
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + (hash(i, f, 1) - 0.5) * 0.04;
      const inner = r0 * (0.75 + hash(i, f, 2) * 0.45);
      const w = 0.004 + hash(i, f, 3) * 0.012;
      ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
      ctx.lineTo(Math.cos(a - w) * R, Math.sin(a - w) * R);
      ctx.lineTo(Math.cos(a + w) * R, Math.sin(a + w) * R);
      ctx.closePath();
    }
    ctx.fill();
  },
  rays: (b) => {
    fillAll(b, b.P.bg);
    const { ctx, P } = b;
    ctx.fillStyle = P.p;
    ctx.beginPath();
    ctx.moveTo(b.X0, b.hh * 0.9);
    ctx.lineTo(b.hw * 1.1, -b.hh * 1.2);
    ctx.lineTo(b.hw * 1.3, -b.hh * 0.4);
    ctx.lineTo(b.X0, b.hh * 1.6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = P.ink;
    ctx.save();
    ctx.rotate(-0.55);
    ctx.fillRect(-b.W, b.hh * 0.38, b.W * 2, 16);
    ctx.restore();
    ctx.beginPath();
    ctx.arc(-b.hw * 0.62, -b.hh * 0.45, 46, 0, TAU);
    ctx.fill();
  },
  blinds: (b) => {
    const g = b.ctx.createRadialGradient(-b.hw * 0.3, -b.hh * 0.2, 20, 0, 0, Math.max(b.hw, b.hh) * 1.3);
    g.addColorStop(0, b.P.bg);
    g.addColorStop(1, b.P.bg2);
    fillAll(b, g);
    const { ctx } = b;
    ctx.save();
    ctx.rotate(-0.42);
    for (let y = -b.H; y < b.H; y += 34) {
      const lg = ctx.createLinearGradient(0, y, 0, y + 20);
      lg.addColorStop(0, rgba(b.P.light, 0));
      lg.addColorStop(0.5, rgba(b.P.light, 0.13));
      lg.addColorStop(1, rgba(b.P.light, 0));
      ctx.fillStyle = lg;
      ctx.fillRect(-b.W, y, b.W * 2, 20);
    }
    ctx.restore();
  },
  swirl: (b) => {
    const { ctx, M, P } = b;
    const cols = [P.p, P.a, P.s, P.q, P.bg2];
    const R = Math.hypot(b.W, b.H) / 2 + 40;
    const w = 26;
    const shift = M.u * w * 2;
    for (let r = R + w * 2; r > 0; r -= w) {
      const idx = Math.floor((r + shift) / w);
      ctx.fillStyle = cols[((idx % 5) + 5) % 5];
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(0, r - (shift % w)), 0, TAU);
      ctx.fill();
    }
  },
  // 軟木板：底色加上深淺不一的小顆粒，便利貼貼在上面的感覺
  cork: (b) => {
    fillAll(b, b.P.bg);
    const { ctx } = b;
    const step = 7;
    const cols = [rgba(darken(b.P.bg, 0.3), 0.32), rgba(b.P.bg2, 0.5), rgba(darken(b.P.bg, 0.12), 0.45)];
    for (let k = 0; k < cols.length; k++) {
      ctx.fillStyle = cols[k];
      ctx.beginPath();
      for (let y = b.Y0; y < b.Y0 + b.H; y += step) {
        for (let x = b.X0; x < b.X0 + b.W; x += step) {
          const gx = Math.floor(x / step);
          const gy = Math.floor(y / step);
          if (hash(gx, gy, 40 + k) > 0.34) continue;
          const r = 0.8 + hash(gx, gy, 50 + k) * 1.9;
          const px = x + hash(gx, gy, 60 + k) * step;
          const py = y + hash(gx, gy, 70 + k) * step;
          ctx.moveTo(px + r, py);
          ctx.arc(px, py, r, 0, TAU);
        }
      }
      ctx.fill();
    }
  },
  // 剪報散落：桌面上散落著大小不一的紙片、報紙與色紙（有文字行與網點）
  scraps: (b) => {
    fillAll(b, b.P.bg);
    const { ctx } = b;
    const roles: (keyof Palette)[] = ['light', 'card', 'bg2', 'a', 'p', 's', 'light', 'card', 'q'];
    const n = 16;
    for (let i = 0; i < n; i++) {
      const w = 90 + hash(i, 1, 81) * 150;
      const h = 60 + hash(i, 2, 81) * 120;
      const x = b.X0 + hash(i, 3, 81) * b.W;
      const y = b.Y0 + hash(i, 4, 81) * b.H;
      const rot = (hash(i, 5, 81) - 0.5) * 0.7;
      const col = b.P[roles[i % roles.length]];
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.shadowColor = 'rgba(30,20,10,0.22)';
      ctx.shadowBlur = 5;
      ctx.shadowOffsetY = 2;
      ctx.fillStyle = col;
      ctx.beginPath();
      // 撕邊：每個角落與邊中點略有偏移
      const J = (k: number) => (hash(i, k, 82) - 0.5) * 7;
      ctx.moveTo(-w / 2 + J(1), -h / 2 + J(2));
      ctx.lineTo(J(3), -h / 2 + J(4));
      ctx.lineTo(w / 2 + J(5), -h / 2 + J(6));
      ctx.lineTo(w / 2 + J(7), J(8));
      ctx.lineTo(w / 2 + J(9), h / 2 + J(10));
      ctx.lineTo(J(11), h / 2 + J(12));
      ctx.lineTo(-w / 2 + J(13), h / 2 + J(14));
      ctx.lineTo(-w / 2 + J(15), J(16));
      ctx.closePath();
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.clip();
      if (hash(i, 6, 81) < 0.6) {
        // 文字行
        ctx.fillStyle = rgba(b.P.ink, 0.2);
        for (let ly = -h / 2 + 10; ly < h / 2 - 8; ly += 8) {
          const len = w * (0.5 + hash(i, Math.round(ly), 83) * 0.4);
          ctx.fillRect(-w / 2 + 8, ly, len, 3);
        }
      } else {
        // 網點
        ctx.fillStyle = rgba(b.P.ink, 0.16);
        ctx.beginPath();
        for (let ly = -h / 2 + 5; ly < h / 2; ly += 8) {
          for (let lx = -w / 2 + 5; lx < w / 2; lx += 8) {
            ctx.moveTo(lx + 2, ly);
            ctx.arc(lx, ly, 2, 0, TAU);
          }
        }
        ctx.fill();
      }
      ctx.restore();
    }
  },
  newsprint: (b) => {
    fillAll(b, b.P.bg);
    const { ctx } = b;
    ctx.fillStyle = rgba(b.P.ink, 0.13);
    const colW = 120;
    let ci = 0;
    for (let x = b.X0 + 10; x < b.X0 + b.W; x += colW + 14, ci++) {
      for (let y = b.Y0 + 10, li = 0; y < b.Y0 + b.H; y += 9, li++) {
        const len = colW * (0.55 + hash(ci, li, 3) * 0.45);
        if (hash(ci, li, 4) < 0.08) continue;
        ctx.fillRect(x, y, len, 3.4);
      }
    }
  },
  linen: (b) => {
    fillAll(b, b.P.bg);
    const { ctx } = b;
    ctx.strokeStyle = rgba(b.P.ink, 0.035);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = b.X0; x < b.X0 + b.W; x += 3) {
      ctx.moveTo(x, b.Y0);
      ctx.lineTo(x, b.Y0 + b.H);
    }
    for (let y = b.Y0; y < b.Y0 + b.H; y += 3) {
      ctx.moveTo(b.X0, y);
      ctx.lineTo(b.X0 + b.W, y);
    }
    ctx.stroke();
  },
  chalkboard: (b) => {
    fillAll(b, b.P.bg);
    const { ctx } = b;
    for (let i = 0; i < 6; i++) {
      const x = b.X0 + hash(i, 31) * b.W;
      const y = b.Y0 + hash(i, 32) * b.H;
      const r = 80 + hash(i, 33) * 160;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, rgba(b.P.light, 0.07));
      g.addColorStop(1, rgba(b.P.light, 0));
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  },
  auspicious: (b) => {
    vgrad(b, b.P.bg, b.P.bg2);
    const { ctx, M, P } = b;
    ctx.strokeStyle = rgba(P.a, 0.65);
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    const spots: [number, number, number][] = [
      [-b.hw * 0.78, -b.hh * 0.62, 1],
      [b.hw * 0.72, -b.hh * 0.5, -1],
      [-b.hw * 0.7, b.hh * 0.6, 1],
      [b.hw * 0.8, b.hh * 0.58, -1],
    ];
    spots.forEach(([x, y, d], i) => {
      ctx.save();
      ctx.translate(x + Math.sin(TAU * (M.u + i * 0.25)) * 6, y);
      ctx.scale(d, 1);
      for (const [cx, cy, r] of [
        [0, 0, 16],
        [30, -8, 12],
        [-26, 6, 10],
      ] as [number, number, number][]) {
        ctx.beginPath();
        for (let k = 0; k <= 40; k++) {
          const a = (k / 40) * TAU * 1.6;
          const rr = r * (1 - k / 52);
          ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
        }
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(-40, 20);
      ctx.quadraticCurveTo(0, 30, 50, 12);
      ctx.stroke();
      ctx.restore();
    });
  },
  screen: (b) => {
    const g = b.ctx.createRadialGradient(0, -b.hh * 0.1, 10, 0, 0, Math.max(b.hw, b.hh) * 1.1);
    g.addColorStop(0, lighten(b.P.bg, 0.08));
    g.addColorStop(0.6, b.P.bg);
    g.addColorStop(1, b.P.bg2);
    fillAll(b, g);
  },
};

export function drawBackground(ctx: CanvasRenderingContext2D, env: Env, look: Look, M: MotionCtx, time: number) {
  const pad = Math.max(env.Wu, env.Hu) * 0.35;
  const b: B = {
    ctx,
    env,
    look,
    M,
    time,
    X0: -env.Wu / 2 - pad,
    Y0: -env.Hu / 2 - pad,
    W: env.Wu + pad * 2,
    H: env.Hu + pad * 2,
    hw: env.Wu / 2,
    hh: env.Hu / 2,
    P: look.pal,
    spec: look.bg,
  };
  const fn = BG[look.bg.type] ?? BG.vgrad;
  ctx.save();
  fn(b);
  ctx.restore();
}

export const BG_TYPES = Object.keys(BG);
