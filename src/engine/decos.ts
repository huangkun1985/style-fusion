// 裝飾層：閃光、HUD 框線、VHS 螢幕字、印章、裝飾邊框、拍立得相框、藍圖標註…
import { darken, rgba } from './color';
import type { Env } from './env';
import { fontCss } from './fonts';
import type { MotionCtx } from './motion';
import type { Look } from './types';
import { TAU, fract, hash, smooth } from './util';

interface D {
  ctx: CanvasRenderingContext2D;
  env: Env;
  look: Look;
  M: MotionCtx;
  a: number;
  hw: number;
  hh: number;
}

function star4(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r, y);
  ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.fill();
}
function heart(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.35);
  ctx.bezierCurveTo(x - s, y - s * 0.4, x - s * 0.45, y - s * 1.05, x, y - s * 0.45);
  ctx.bezierCurveTo(x + s * 0.45, y - s * 1.05, x + s, y - s * 0.4, x, y + s * 0.35);
  ctx.fill();
}

const FRONT: Record<string, (d: D) => void> = {
  sparkles: ({ ctx, M, look, a, hw, hh }) => {
    const n = 9;
    for (let i = 0; i < n; i++) {
      const x = (hash(i, 51) * 2 - 1) * hw * 0.92;
      const y = (hash(i, 52) * 2 - 1) * hh * 0.85;
      if (Math.abs(x) < hw * 0.25 && Math.abs(y) < hh * 0.3) continue;
      const tw = Math.max(0, Math.sin(TAU * (M.u * 2 + hash(i, 53))));
      ctx.fillStyle = rgba(i % 2 ? look.pal.light : look.pal.a, a * tw);
      star4(ctx, x, y, 4 + 9 * tw);
    }
  },
  hearts: ({ ctx, M, look, a, hw, hh }) => {
    for (let i = 0; i < 6; i++) {
      const x = (hash(i, 61) * 2 - 1) * hw * 0.85;
      const y0 = hh + 20;
      const y = y0 - fract(M.u + hash(i, 62)) * (hh * 2 + 40);
      ctx.fillStyle = rgba(i % 2 ? look.pal.p : look.pal.a, a * 0.75);
      heart(ctx, x + Math.sin(TAU * (M.u * 2 + i)) * 8, y, 9 + hash(i, 63) * 6);
    }
  },
  hud: ({ ctx, M, look, a, hw, hh }) => {
    const c = look.pal.s;
    ctx.strokeStyle = rgba(c, 0.8 * a);
    ctx.fillStyle = rgba(c, 0.85 * a);
    ctx.lineWidth = 2;
    const m = 18;
    const L = 26;
    for (const [sx, sy] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ]) {
      const x = sx * (hw - m);
      const y = sy * (hh - m);
      ctx.beginPath();
      ctx.moveTo(x, y - sy * -L);
      ctx.lineTo(x, y);
      ctx.lineTo(x - sx * L, y);
      ctx.stroke();
    }
    ctx.font = fontCss('mono', 10);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const t = M.t.toFixed(2).padStart(5, '0');
    ctx.fillText(`T+${t}  FUSION.SYS`, -hw + m + 6, -hh + m + 6);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`LAT 25.03  SIG ${(70 + 25 * Math.sin(TAU * M.u * 3)).toFixed(0)}%`, hw - m - 6, hh - m - 6);
    ctx.strokeStyle = rgba(c, 0.45 * a);
    ctx.beginPath();
    ctx.moveTo(-14, 0);
    ctx.lineTo(-5, 0);
    ctx.moveTo(5, 0);
    ctx.lineTo(14, 0);
    ctx.moveTo(0, -14);
    ctx.lineTo(0, -5);
    ctx.moveTo(0, 5);
    ctx.lineTo(0, 14);
    ctx.stroke();
  },
  vhsosd: ({ ctx, M, a, hw, hh }) => {
    ctx.font = fontCss('term', 22);
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillStyle = `rgba(255,255,255,${0.92 * a})`;
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 2;
    ctx.fillText('PLAY ▶', -hw + 22, -hh + 18);
    ctx.textBaseline = 'bottom';
    const sec = Math.floor(M.t);
    ctx.fillText(`SP  0:00:${String(sec).padStart(2, '0')}`, -hw + 22, hh - 18);
    ctx.textAlign = 'right';
    ctx.fillText('OCT. 02 1996', hw - 22, hh - 18);
    ctx.shadowBlur = 0;
  },
  seal: ({ ctx, look, a, hw, hh }) => {
    const s = 34;
    const x = hw - 30 - s;
    const y = hh - 30 - s;
    ctx.fillStyle = rgba('#B8191E', 0.88 * a);
    ctx.fillRect(x, y, s, s);
    ctx.fillStyle = rgba(look.pal.bg, a);
    ctx.font = fontCss('brush', 14);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('風', x + s / 2, y + s * 0.3);
    ctx.fillText('格', x + s / 2, y + s * 0.72);
  },
  cartouche: ({ ctx, look, a, hw, hh }) => {
    const w = 30;
    const h = 92;
    const x = hw - 34 - w;
    const y = -hh + 26;
    ctx.fillStyle = rgba(look.pal.light, 0.92 * a);
    ctx.strokeStyle = rgba(look.pal.ink, a);
    ctx.lineWidth = 1.5;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = rgba(look.pal.ink, a);
    ctx.font = fontCss('brush', 15);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    '動效風格'.split('').forEach((ch, i) => ctx.fillText(ch, x + w / 2, y + 14 + i * 21));
  },
  nouveau: ({ ctx, look, a, hw, hh }) => {
    const c = rgba(look.pal.ink, 0.8 * a);
    ctx.strokeStyle = c;
    ctx.lineWidth = 2;
    const m = 14;
    ctx.strokeRect(-hw + m, -hh + m, (hw - m) * 2, (hh - m) * 2);
    ctx.lineWidth = 1;
    ctx.strokeRect(-hw + m + 6, -hh + m + 6, (hw - m - 6) * 2, (hh - m - 6) * 2);
    ctx.lineWidth = 2;
    for (const [sx, sy] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ]) {
      ctx.beginPath();
      const x = sx * (hw - m);
      const y = sy * (hh - m);
      ctx.moveTo(x, y + -sy * 46);
      ctx.bezierCurveTo(x - sx * 30, y - sy * 30, x - sx * 10, y - sy * 6, x - sx * 46, y);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x - sx * 18, y - sy * 18, 5, 0, TAU);
      ctx.stroke();
    }
  },
  decoframe: ({ ctx, look, a, hw, hh }) => {
    ctx.strokeStyle = rgba(look.pal.a, 0.9 * a);
    ctx.lineWidth = 1.6;
    for (const m of [12, 20]) {
      const s = 22;
      ctx.beginPath();
      ctx.moveTo(-hw + m + s, -hh + m);
      ctx.lineTo(hw - m - s, -hh + m);
      ctx.lineTo(hw - m, -hh + m + s);
      ctx.lineTo(hw - m, hh - m - s);
      ctx.lineTo(hw - m - s, hh - m);
      ctx.lineTo(-hw + m + s, hh - m);
      ctx.lineTo(-hw + m, hh - m - s);
      ctx.lineTo(-hw + m, -hh + m + s);
      ctx.closePath();
      ctx.stroke();
    }
  },
  // 紙膠帶：貼在畫面四角的半透明斜條
  tape: ({ ctx, look, a, hw, hh }) => {
    const strip = (x: number, y: number, ang: number, c: string, k: number) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(ang);
      ctx.shadowColor = 'rgba(30,20,10,0.18)';
      ctx.shadowBlur = 3;
      ctx.shadowOffsetY = 1;
      ctx.fillStyle = rgba(c, 0.62 * a);
      ctx.fillRect(-56, -13, 112, 26);
      ctx.shadowColor = 'transparent';
      ctx.fillStyle = rgba('#FFFFFF', 0.22 * a);
      for (let i = -48; i < 48; i += 16) ctx.fillRect(i + k, -13, 7, 26);
      ctx.restore();
    };
    strip(-hw + 30, -hh + 30, -Math.PI / 4, look.pal.a, 0);
    strip(hw - 30, -hh + 30, Math.PI / 4, look.pal.s, 8);
    strip(-hw + 30, hh - 30, Math.PI / 4, look.pal.p, 4);
    strip(hw - 30, hh - 30, -Math.PI / 4, look.pal.q, 12);
  },
  polaroid: ({ ctx, look, a, hw, hh }) => {
    ctx.fillStyle = rgba('#F7F5EE', a);
    const m = Math.min(hw, hh) * 0.08;
    const bottom = m * 3.2;
    ctx.beginPath();
    ctx.rect(-hw - 50, -hh - 50, hw * 2 + 100, hh * 2 + 100);
    ctx.rect(-hw + m, -hh + m, hw * 2 - m * 2, hh * 2 - m - bottom);
    ctx.fill('evenodd');
    ctx.fillStyle = rgba(darken('#F7F5EE', 0.5), 0.7 * a);
    ctx.font = fontCss('script', 16);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('summer ’98', -hw + m + 6, hh - bottom / 2);
    void look;
  },
  annot: ({ ctx, look, a, hw, hh }) => {
    const c = rgba(look.pal.light, 0.85 * a);
    ctx.strokeStyle = c;
    ctx.fillStyle = c;
    ctx.lineWidth = 1;
    ctx.font = fontCss('mono', 10);
    ctx.textAlign = 'center';
    const y = hh - 36;
    ctx.beginPath();
    ctx.moveTo(-120, y);
    ctx.lineTo(120, y);
    ctx.moveTo(-120, y - 6);
    ctx.lineTo(-120, y + 6);
    ctx.moveTo(120, y - 6);
    ctx.lineTo(120, y + 6);
    ctx.stroke();
    ctx.fillText('240.00', 0, y - 8);
    ctx.textAlign = 'left';
    ctx.fillText('SECTION A-A', -hw + 22, -hh + 26);
    ctx.fillText('SCALE 1:4', -hw + 22, -hh + 40);
    ctx.textAlign = 'right';
    ctx.fillText('DWG NO. SF-042', hw - 22, -hh + 26);
    ctx.strokeRect(hw - 140, hh - 64, 118, 42);
  },
  sprockets: ({ ctx, a, hw, hh, M }) => {
    ctx.fillStyle = `rgba(10,8,6,${a})`;
    ctx.fillRect(-hw - 40, -hh - 40, 58, hh * 2 + 80);
    ctx.fillRect(hw - 18, -hh - 40, 58, hh * 2 + 80);
    ctx.fillStyle = `rgba(235,225,200,${0.8 * a})`;
    const off = fract(M.u * 6) * 30;
    for (let y = -hh - 30 + off; y < hh + 30; y += 30) {
      ctx.fillRect(-hw + 4, y, 9, 14);
      ctx.fillRect(hw - 13, y, 9, 14);
    }
  },
  lightleak: ({ ctx, M, a, hw, hh }) => {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const k = 0.5 + 0.5 * Math.sin(TAU * M.u);
    const g = ctx.createRadialGradient(hw, -hh * 0.6, 0, hw, -hh * 0.6, hw * 0.9);
    g.addColorStop(0, `rgba(255,120,40,${0.55 * a * (0.5 + k * 0.5)})`);
    g.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-hw, -hh, hw * 2, hh * 2);
    const g2 = ctx.createRadialGradient(-hw, hh, 0, -hw, hh, hw * 0.7);
    g2.addColorStop(0, `rgba(255,60,90,${0.35 * a * (1 - k * 0.5)})`);
    g2.addColorStop(1, 'rgba(255,60,90,0)');
    ctx.fillStyle = g2;
    ctx.fillRect(-hw, -hh, hw * 2, hh * 2);
    ctx.restore();
  },
  blinds: ({ ctx, a, hw, hh }) => {
    ctx.save();
    ctx.rotate(-0.42);
    ctx.fillStyle = `rgba(0,0,0,${0.22 * a})`;
    for (let y = -hh * 2; y < hh * 2; y += 34) ctx.fillRect(-hw * 2, y + 20, hw * 4, 14);
    ctx.restore();
  },
  pow: ({ ctx, M, look, a, hw, hh }) => {
    const p = M.ev.length ? Math.max(...M.ev.map((e) => Math.exp(-M.since(e) * 5))) : 0;
    if (p < 0.05) return;
    const x = hw * 0.55;
    const y = -hh * 0.5;
    const s = 0.7 + p * 0.5;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.15);
    ctx.scale(s, s);
    ctx.fillStyle = look.pal.a;
    ctx.strokeStyle = look.pal.ink;
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i < 24; i++) {
      const r = i % 2 ? 34 : 56;
      const ang = (i / 24) * TAU;
      ctx.lineTo(Math.cos(ang) * r * 1.3, Math.sin(ang) * r);
    }
    ctx.closePath();
    ctx.globalAlpha = a * Math.min(1, p * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = look.pal.p;
    ctx.font = fontCss('display', 26);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeText('POW!', 0, 2);
    ctx.fillText('POW!', 0, 2);
    ctx.restore();
  },
  rec: ({ ctx, M, a, hw, hh }) => {
    const on = Math.sin(TAU * M.u * 3) > 0;
    ctx.fillStyle = `rgba(230,40,40,${on ? a : a * 0.2})`;
    ctx.beginPath();
    ctx.arc(-hw + 30, -hh + 30, 6, 0, TAU);
    ctx.fill();
    ctx.fillStyle = `rgba(255,255,255,${0.9 * a})`;
    ctx.font = fontCss('mono', 12);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('REC', -hw + 42, -hh + 30);
  },
  blockclouds: () => undefined,
  glints: ({ ctx, M, look, a, hw, hh }) => {
    const k = smooth(0.3, 0.5, M.u) * (1 - smooth(0.5, 0.7, M.u));
    if (k <= 0) return;
    ctx.fillStyle = rgba(look.pal.light, a * k);
    star4(ctx, hw * 0.28, -hh * 0.35, 16 * k);
  },
};

export function drawDecos(ctx: CanvasRenderingContext2D, env: Env, look: Look, M: MotionCtx) {
  if (!look.deco.length) return;
  for (const { id, a } of look.deco) {
    const fn = FRONT[id];
    if (!fn) continue;
    ctx.save();
    fn({ ctx, env, look, M, a, hw: env.Wu / 2, hh: env.Hu / 2 });
    ctx.restore();
  }
}
