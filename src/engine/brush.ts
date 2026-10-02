// StyleBrush：所有主體都透過它繪圖，因此「圖像風格」會自動套用到每個形狀上：
// 幾何（多邊形面數、圓角、沸騰、果凍、網格吸附）→ 陰影 → 填色模式 → 描邊樣式 → 發光。
import { darken, hueRotate, lighten, rgba } from './color';
import { fontCss } from './fonts';
import type { MotionCtx } from './motion';
import type { FillMode, FontId, Look, Palette, Role } from './types';
import { TAU, clamp, hash, noise1, noise2, smooth } from './util';

type Mat = [number, number, number, number, number, number];
const ID: Mat = [1, 0, 0, 1, 0, 0];
function mul(m: Mat, n: Mat): Mat {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

export type Paint = Role | (string & {}) | null | undefined;

export interface SOpts {
  /** 描邊顏色（角色或色碼）；false 關閉描邊 */
  stroke?: Paint | false;
  /** 描邊寬度倍率 */
  lw?: number;
  alpha?: number;
  mode?: FillMode;
  shadow?: boolean;
  /** 沸騰／果凍強度倍率 */
  boil?: number;
  hl?: boolean;
  /** 強制平塗（小細節不做花紋） */
  flat?: boolean;
  /** 即使風格無描邊也強制描邊（嘴巴、眉毛等線條細節） */
  outline?: boolean;
  glow?: boolean;
  drawOn?: boolean;
}
export interface LOpts extends SOpts {
  w?: number;
  cap?: CanvasLineCap;
  dash?: number[];
  closed?: boolean;
  /** 先畫一圈墨線外框（肢體） */
  outlined?: boolean;
}
export interface TOpts extends SOpts {
  align?: CanvasTextAlign;
  base?: CanvasTextBaseline;
  font?: FontId;
}

interface BBox {
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
  r: number;
}

function bbox(P: number[]): BBox {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < P.length; i += 2) {
    const x = P[i];
    const y = P[i + 1];
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  const w = Math.max(0.01, x1 - x0);
  const h = Math.max(0.01, y1 - y0);
  return { x: x0, y: y0, w, h, cx: x0 + w / 2, cy: y0 + h / 2, r: Math.max(w, h) / 2 };
}

function perimeter(P: number[], closed: boolean) {
  let L = 0;
  const n = P.length;
  for (let i = 2; i < n; i += 2) L += Math.hypot(P[i] - P[i - 2], P[i + 1] - P[i - 1]);
  if (closed && n > 2) L += Math.hypot(P[0] - P[n - 2], P[1] - P[n - 1]);
  return L;
}

export class Brush {
  ctx!: CanvasRenderingContext2D;
  look!: Look;
  M!: MotionCtx;
  pal!: Palette;
  /** 每設計單位的裝置像素（陰影偏移用） */
  px = 1;
  alpha = 1;
  time = 0;
  drawP = 1;
  private m: Mat = ID;
  private stack: Mat[] = [];
  private sid = 0;
  private boilAmt = 0;
  private wobAmt = 0;
  private morphAmt = 0;
  private drawOnAmt = 0;

  setup(ctx: CanvasRenderingContext2D, look: Look, M: MotionCtx, px: number, time: number) {
    this.ctx = ctx;
    this.look = look;
    this.pal = look.pal;
    this.M = M;
    this.px = px;
    this.time = time;
    this.alpha = 1;
    this.m = ID;
    this.stack = [];
    this.sid = 0;
    this.boilAmt = look.boil + M.mv.boil;
    this.wobAmt = look.wobble + M.mv.wobble;
    this.morphAmt = M.mv.morph;
    this.drawOnAmt = M.mv.drawOn;
    const u = M.u;
    this.drawP = this.drawOnAmt > 0.15 ? (u < 0.42 ? smooth(0, 0.42, u) : u > 0.88 ? 1 - smooth(0.88, 1, u) : 1) : 1;
  }

  // ---------- 變換 ----------
  push() {
    this.stack.push(this.m);
  }
  pop() {
    this.m = this.stack.pop() ?? ID;
  }
  translate(x: number, y: number) {
    this.m = mul(this.m, [1, 0, 0, 1, x, y]);
  }
  rotate(r: number) {
    if (!r) return;
    const c = Math.cos(r);
    const s = Math.sin(r);
    this.m = mul(this.m, [c, s, -s, c, 0, 0]);
  }
  scale(sx: number, sy = sx) {
    this.m = mul(this.m, [sx, 0, 0, sy, 0, 0]);
  }
  /** 沿 ang 方向以 (px,py) 為支點擠壓拉伸，保持面積 */
  stretch(px: number, py: number, s: number, ang = -Math.PI / 2) {
    if (Math.abs(s) < 0.001) return;
    const k = Math.max(0.25, 1 + s);
    this.translate(px, py);
    this.rotate(ang);
    this.scale(k, 1 / k);
    this.rotate(-ang);
    this.translate(-px, -py);
  }
  /** 依角色抖動（定格動畫） */
  jitter(id: number, k = 1) {
    const j = this.M.jit(id, k);
    if (j.x || j.y) this.translate(j.x, j.y);
    if (j.r) this.rotate(j.r);
  }
  tp(x: number, y: number): [number, number] {
    const m = this.m;
    return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  }

  // ---------- 顏色 ----------
  col(p: Paint): string {
    if (!p) return 'rgba(0,0,0,0)';
    const v = (this.pal as unknown as Record<string, string>)[p];
    return v ?? p;
  }

  // ---------- 點生成 ----------
  private morphK(theta: number): number {
    const m = this.morphAmt;
    if (m < 0.02) return 1;
    const u = this.M.u;
    const mm = Math.min(1, m) * (0.5 - 0.5 * Math.cos(TAU * u * 2));
    const which = Math.floor(u * 2) % 2;
    const sq = 0.86 / Math.max(Math.abs(Math.cos(theta)), Math.abs(Math.sin(theta)));
    const st = 1 + 0.34 * Math.cos(5 * theta + Math.PI / 2);
    return 1 + ((which ? st : sq) - 1) * mm;
  }
  ellipsePts(cx: number, cy: number, rx: number, ry: number, n?: number): number[] {
    const f = this.look.facets;
    const N = n ?? (f >= 3 ? f : Math.max(22, Math.min(72, Math.round((rx + ry) * 0.55))));
    const pts = new Array(N * 2);
    for (let i = 0; i < N; i++) {
      const th = -Math.PI / 2 + (i / N) * TAU;
      const k = this.morphK(th);
      pts[i * 2] = cx + Math.cos(th) * rx * k;
      pts[i * 2 + 1] = cy + Math.sin(th) * ry * k;
    }
    return pts;
  }
  rectPts(cx: number, cy: number, w: number, h: number, r: number): number[] {
    const mm = this.morphAmt > 0.02 ? Math.min(1, this.morphAmt) * (0.5 - 0.5 * Math.cos(TAU * this.M.u * 2)) : 0;
    let rr = Math.min(Math.abs(w), Math.abs(h)) / 2;
    rr = Math.min(rr, r * this.look.round + (rr - r * this.look.round) * mm);
    const x0 = cx - w / 2;
    const y0 = cy - h / 2;
    if (rr < 0.4) return [x0, y0, x0 + w, y0, x0 + w, y0 + h, x0, y0 + h];
    const f = this.look.facets;
    const seg = f >= 3 && f < 12 ? 1 : Math.max(2, Math.min(8, Math.round(rr * 0.45)));
    const pts: number[] = [];
    const corner = (ccx: number, ccy: number, a0: number) => {
      for (let i = 0; i <= seg; i++) {
        const a = a0 + (i / seg) * (Math.PI / 2);
        pts.push(ccx + Math.cos(a) * rr, ccy + Math.sin(a) * rr);
      }
    };
    corner(x0 + w - rr, y0 + rr, -Math.PI / 2);
    corner(x0 + w - rr, y0 + h - rr, 0);
    corner(x0 + rr, y0 + h - rr, Math.PI / 2);
    corner(x0 + rr, y0 + rr, Math.PI);
    return pts;
  }
  /** Catmull-Rom 平滑曲線取樣 */
  splinePts(pts: number[], closed: boolean, per = 8): number[] {
    const n = pts.length / 2;
    if (n < 3) return pts.slice();
    const out: number[] = [];
    const P = (i: number) => {
      if (closed) i = ((i % n) + n) % n;
      else i = Math.max(0, Math.min(n - 1, i));
      return [pts[i * 2], pts[i * 2 + 1]];
    };
    const segs = closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const p0 = P(i - 1);
      const p1 = P(i);
      const p2 = P(i + 1);
      const p3 = P(i + 2);
      for (let k = 0; k < per; k++) {
        const t = k / per;
        const t2 = t * t;
        const t3 = t2 * t;
        for (let d = 0; d < 2; d++) {
          out.push(
            0.5 *
              (2 * p1[d] +
                (-p0[d] + p2[d]) * t +
                (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2 +
                (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t3),
          );
        }
      }
    }
    if (!closed) out.push(pts[(n - 1) * 2], pts[(n - 1) * 2 + 1]);
    return out;
  }

  // ---------- 幾何處理 ----------
  private prep(local: number[], closed: boolean, bk: number): number[] {
    const m = this.m;
    let P: number[] = new Array(local.length);
    for (let i = 0; i < local.length; i += 2) {
      const x = local[i];
      const y = local[i + 1];
      P[i] = m[0] * x + m[2] * y + m[4];
      P[i + 1] = m[1] * x + m[3] * y + m[5];
    }
    const boil = this.boilAmt * bk;
    const wob = this.wobAmt * bk;
    if ((boil > 0.01 || wob > 0.01) && P.length >= 4) {
      // 細分長邊，讓抖動沿邊緣分佈
      const sub: number[] = [];
      const n = P.length / 2;
      const segs = closed ? n : n - 1;
      for (let i = 0; i < segs; i++) {
        const ax = P[i * 2];
        const ay = P[i * 2 + 1];
        const j = (i + 1) % n;
        const bx = P[j * 2];
        const by = P[j * 2 + 1];
        const len = Math.hypot(bx - ax, by - ay);
        const k = Math.min(10, Math.max(1, Math.floor(len / 9)));
        for (let s = 0; s < k; s++) sub.push(ax + ((bx - ax) * s) / k, ay + ((by - ay) * s) / k);
      }
      if (!closed) sub.push(P[P.length - 2], P[P.length - 1]);
      P = sub;
      const bb = bbox(P);
      const seed = this.sid * 13 + this.M.seed;
      const bf = this.M.bframe;
      const tu = this.M.u * TAU;
      const tcx = Math.cos(tu) * 0.9;
      const tcy = Math.sin(tu) * 0.9;
      const N = P.length / 2;
      for (let i = 0; i < N; i++) {
        const x = P[i * 2];
        const y = P[i * 2 + 1];
        let dx: number;
        let dy: number;
        let a: number;
        if (closed) {
          a = Math.atan2(y - bb.cy, x - bb.cx);
          dx = Math.cos(a);
          dy = Math.sin(a);
        } else {
          const ip = Math.max(0, i - 1);
          const inx = Math.min(N - 1, i + 1);
          const tx = P[inx * 2] - P[ip * 2];
          const ty = P[inx * 2 + 1] - P[ip * 2 + 1];
          const tl = Math.hypot(tx, ty) || 1;
          dx = -ty / tl;
          dy = tx / tl;
          a = (i / N) * 5;
        }
        let d = 0;
        if (wob > 0.01) d += wob * (1.6 + bb.r * 0.07) * noise2(Math.cos(a) * 1.3 + tcx, Math.sin(a) * 1.3 + tcy, seed);
        if (boil > 0.01) d += boil * 2.1 * noise2(Math.cos(a) * 2.6 + bf * 3.17, Math.sin(a) * 2.6 + bf * 1.37, seed + 9);
        P[i * 2] = x + dx * d;
        P[i * 2 + 1] = y + dy * d;
      }
    }
    const g = this.look.snap;
    if (g > 0.3) for (let i = 0; i < P.length; i++) P[i] = Math.round(P[i] / g) * g;
    return P;
  }

  private toPath(P: number[], closed: boolean): Path2D {
    const p = new Path2D();
    if (P.length < 2) return p;
    p.moveTo(P[0], P[1]);
    for (let i = 2; i < P.length; i += 2) p.lineTo(P[i], P[i + 1]);
    if (closed) p.closePath();
    return p;
  }

  private jitterPath(P: number[], closed: boolean, amp: number, seed: number): Path2D {
    const Q = P.slice();
    for (let i = 0; i < Q.length; i++) Q[i] += (hash(i, seed, this.sid) - 0.5) * 2 * amp;
    return this.toPath(Q, closed);
  }

  // ---------- 對外：形狀 ----------
  circle(x: number, y: number, r: number, fill: Paint, o: SOpts = {}) {
    this.shape(this.ellipsePts(x, y, r, r), true, fill, o);
  }
  ellipse(x: number, y: number, rx: number, ry: number, fill: Paint, o: SOpts = {}) {
    this.shape(this.ellipsePts(x, y, rx, ry), true, fill, o);
  }
  rect(cx: number, cy: number, w: number, h: number, r: number, fill: Paint, o: SOpts = {}) {
    this.shape(this.rectPts(cx, cy, w, h, r), true, fill, o);
  }
  poly(pts: number[], fill: Paint, o: SOpts = {}) {
    this.shape(pts, true, fill, o);
  }
  blob(pts: number[], fill: Paint, o: SOpts = {}) {
    this.shape(this.splinePts(pts, true, 6), true, fill, o);
  }
  /** 只描線（不填色） */
  line(pts: number[], color: Paint, o: LOpts = {}) {
    this.stroke(pts, o.closed ?? false, color, o);
  }
  curve(pts: number[], color: Paint, o: LOpts = {}) {
    this.stroke(this.splinePts(pts, o.closed ?? false, 8), o.closed ?? false, color, o);
  }
  arc(cx: number, cy: number, r: number, a0: number, a1: number, color: Paint, o: LOpts = {}) {
    const n = Math.max(6, Math.ceil((Math.abs(a1 - a0) * r) / 5));
    const pts: number[] = [];
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      pts.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    this.stroke(pts, false, color, o);
  }

  private shape(local: number[], closed: boolean, fillP: Paint, o: SOpts) {
    this.sid++;
    const ctx = this.ctx;
    const L = this.look;
    const P = this.prep(local, closed, o.boil ?? 1);
    if (P.length < 6) return;
    const path = this.toPath(P, true);
    const bb = bbox(P);
    const color = this.col(fillP);
    let mode: FillMode = o.mode ?? L.fill;
    if (o.flat && mode !== 'none' && mode !== 'line' && mode !== 'silhouette' && mode !== 'glass') mode = mode === 'neu' ? 'neu' : 'flat';

    let a = this.alpha * (o.alpha ?? 1);
    let reveal = 1;
    if (this.drawOnAmt > 0.15 && o.drawOn !== false) {
      reveal = clamp(this.drawP * 1.4 - (this.sid % 9) * 0.045);
      a *= mixf(1, smooth(0.55, 1, reveal), Math.min(1, this.drawOnAmt * 1.2));
    }
    if (a <= 0.003 && reveal >= 1) return;
    const hasFill = fillP != null && mode !== 'none';

    ctx.save();
    ctx.globalAlpha = a;
    // 貼紙白邊
    if (L.sticker > 0.2 && hasFill && o.shadow !== false) {
      ctx.lineJoin = 'round';
      ctx.strokeStyle = this.pal.light;
      ctx.lineWidth = L.sticker * 2;
      ctx.shadowColor = 'rgba(0,0,0,0.22)';
      ctx.shadowBlur = 6 * this.px;
      ctx.shadowOffsetY = 2 * this.px;
      ctx.stroke(path);
      ctx.shadowColor = 'transparent';
    }
    if (hasFill && o.shadow !== false && L.shadow !== 'none') this.drawShadow(path, color, bb);
    if (hasFill) this.fillPath(path, P, bb, color, mode, o);
    ctx.restore();

    // 描邊
    const sw = L.stroke;
    const forced = o.outline && sw < 0.5;
    if ((sw > 0.05 || forced || (reveal < 1 && this.drawOnAmt > 0.15)) && o.stroke !== false) {
      let w = (forced || sw <= 0.05 ? 2.2 : sw) * (o.lw ?? 1);
      let sc = this.strokeColor(color, o.stroke);
      let sa = this.alpha * (o.alpha ?? 1);
      if (sw <= 0.05 && !forced) {
        // 描邊生長時臨時出現的鉛筆線
        sa *= 1 - smooth(0.75, 1, reveal);
        sc = this.pal.ink;
        w = 1.6;
      }
      if (mode === 'glass') sa *= 0.6;
      if (sa > 0.003) this.strokePath(P, true, sc, w, sa, reveal, o.glow || L.glow > 0.05);
      // 線框模式：加上內部網格線，像 3D 模型的 wireframe
      if (mode === 'none' && L.facets >= 3 && bb.r > 12 && fillP != null && reveal > 0.5) {
        ctx.save();
        ctx.globalAlpha = sa * 0.42;
        ctx.strokeStyle = sc;
        ctx.lineWidth = Math.max(0.6, w * 0.5);
        ctx.beginPath();
        for (let i = 0; i < P.length; i += 2) {
          ctx.moveTo(bb.cx, bb.cy);
          ctx.lineTo(P[i], P[i + 1]);
        }
        for (const k of [0.33, 0.66]) {
          for (let i = 0; i < P.length; i += 2) {
            const x = bb.cx + (P[i] - bb.cx) * k;
            const y = bb.cy + (P[i + 1] - bb.cy) * k;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.closePath();
        }
        ctx.stroke();
        ctx.restore();
      }
    } else if (L.glow > 0.05 && hasFill) {
      ctx.save();
      ctx.globalAlpha = a;
      ctx.shadowColor = color;
      ctx.shadowBlur = 16 * L.glow * this.px;
      ctx.fillStyle = color;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = a * 0.35;
      ctx.fill(path);
      ctx.restore();
    }
  }

  private strokeColor(fill: string, ov?: Paint | false): string {
    if (ov) return this.col(ov);
    switch (this.look.strokeColor) {
      case 'darker':
        return darken(fill, 0.34);
      case 'lighter':
        return lighten(fill, 0.3);
      case 'fill':
        return fill;
      case 'light':
        return this.pal.light;
      case 'accent':
        return this.pal.a;
      default:
        return this.pal.ink;
    }
  }

  private drawShadow(path: Path2D, color: string, bb: BBox) {
    const ctx = this.ctx;
    const L = this.look;
    const d = L.shadowD;
    const px = this.px;
    const sc = L.shadowColor || darken(this.pal.bg, 0.45);
    switch (L.shadow) {
      case 'soft':
        ctx.shadowColor = rgba(sc, 0.38);
        ctx.shadowBlur = d * 2.4 * px;
        ctx.shadowOffsetY = d * 0.9 * px;
        ctx.fillStyle = color;
        ctx.fill(path);
        ctx.shadowColor = 'transparent';
        break;
      case 'paper':
        ctx.shadowColor = 'rgba(30,20,10,0.32)';
        ctx.shadowBlur = 5 * px;
        ctx.shadowOffsetX = 1.2 * px;
        ctx.shadowOffsetY = 2.6 * px;
        ctx.fillStyle = color;
        ctx.fill(path);
        ctx.shadowColor = 'transparent';
        break;
      case 'hard':
        ctx.shadowColor = L.shadowColor || this.pal.ink;
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = d * px;
        ctx.shadowOffsetY = d * px;
        ctx.fillStyle = color;
        ctx.fill(path);
        ctx.shadowColor = 'transparent';
        break;
      case 'long': {
        const steps = 18;
        ctx.fillStyle = rgba(L.shadowColor || darken(this.pal.bg, 0.3), 0.07);
        for (let k = 1; k <= steps; k++) {
          ctx.save();
          ctx.translate(k * d * 0.55, k * d * 0.55);
          ctx.fill(path);
          ctx.restore();
        }
        break;
      }
      case 'extrude': {
        const steps = Math.max(4, Math.round(d * 1.4));
        const ec = L.shadowColor || darken(color, 0.32);
        ctx.fillStyle = ec;
        for (let k = steps; k >= 1; k--) {
          ctx.save();
          ctx.translate(k * 0.9, k * 0.9);
          ctx.fill(path);
          ctx.restore();
        }
        if (L.stroke > 0.3) {
          ctx.save();
          ctx.translate(steps * 0.9, steps * 0.9);
          ctx.strokeStyle = this.pal.ink;
          ctx.lineWidth = L.stroke;
          ctx.lineJoin = 'round';
          ctx.stroke(path);
          ctx.restore();
        }
        break;
      }
      default:
        break;
    }
    void bb;
  }

  private fillPath(path: Path2D, P: number[], bb: BBox, color: string, mode: FillMode, o: SOpts) {
    const ctx = this.ctx;
    const L = this.look;
    const [lx, ly] = L.light;
    const big = bb.r > 13 && o.hl !== false;
    switch (mode) {
      case 'flat':
      default:
        ctx.fillStyle = color;
        ctx.fill(path);
        break;
      case 'silhouette':
        ctx.fillStyle = this.pal.ink;
        ctx.fill(path);
        break;
      case 'line':
        ctx.fillStyle = this.pal.bg;
        ctx.fill(path);
        break;
      case 'gradient': {
        const g = ctx.createLinearGradient(bb.x, bb.y, bb.x + bb.w * 0.35, bb.y + bb.h);
        g.addColorStop(0, lighten(color, 0.13));
        g.addColorStop(1, darken(color, 0.1));
        ctx.fillStyle = g;
        ctx.fill(path);
        break;
      }
      case 'soft':
      case 'inflate':
      case 'clay': {
        const cx = bb.cx + lx * bb.w * 0.24;
        const cy = bb.cy + ly * bb.h * 0.24;
        const r = Math.max(bb.w, bb.h) * 0.9;
        const g = ctx.createRadialGradient(cx, cy, r * 0.04, cx, cy, r);
        g.addColorStop(0, lighten(color, mode === 'inflate' ? 0.2 : 0.14));
        g.addColorStop(0.5, color);
        g.addColorStop(1, darken(color, mode === 'clay' ? 0.16 : 0.22));
        ctx.fillStyle = g;
        ctx.fill(path);
        if (mode === 'clay' && big) {
          ctx.save();
          ctx.clip(path);
          ctx.strokeStyle = rgba(darken(color, 0.12), 0.5);
          ctx.lineWidth = 1.1;
          for (let i = 0; i < 7; i++) {
            const hx = bb.x + hash(this.sid, i, 1) * bb.w;
            const hy = bb.y + hash(this.sid, i, 2) * bb.h;
            const rr = 2 + hash(this.sid, i, 3) * 4;
            ctx.beginPath();
            ctx.arc(hx, hy, rr, hash(this.sid, i, 4) * TAU, hash(this.sid, i, 4) * TAU + 2.2);
            ctx.stroke();
          }
          ctx.restore();
        }
        if (mode === 'inflate' && big) {
          ctx.save();
          ctx.clip(path);
          ctx.strokeStyle = rgba(lighten(color, 0.4), 0.55);
          ctx.lineWidth = Math.max(2, bb.r * 0.08);
          ctx.translate(-lx * 2, -ly * 2);
          ctx.stroke(path);
          ctx.restore();
        }
        if (big && mode !== 'clay') this.highlight(bb, color, 0.42);
        break;
      }
      case 'cel': {
        ctx.save();
        ctx.clip(path);
        ctx.fillStyle = darken(color, 0.17);
        ctx.fill(path);
        ctx.translate(lx * bb.r * 0.22, ly * bb.r * 0.22);
        ctx.fillStyle = color;
        ctx.fill(path);
        ctx.restore();
        if (big) this.highlight(bb, color, 0.55);
        break;
      }
      case 'dots': {
        ctx.fillStyle = color;
        ctx.fill(path);
        ctx.save();
        ctx.clip(path);
        ctx.fillStyle = darken(color, 0.3);
        const step = 5.2;
        ctx.beginPath();
        for (let y = bb.y + step / 2; y < bb.y + bb.h; y += step) {
          const odd = Math.round((y - bb.y) / step) % 2;
          for (let x = bb.x + (odd ? step / 2 : 0); x < bb.x + bb.w + step; x += step) {
            const proj = ((x - bb.cx) * -lx + (y - bb.cy) * -ly) / Math.max(4, bb.r);
            const rr = step * 0.5 * smooth(-0.1, 0.95, proj);
            if (rr > 0.35) {
              ctx.moveTo(x + rr, y);
              ctx.arc(x, y, rr, 0, TAU);
            }
          }
        }
        ctx.fill();
        ctx.restore();
        break;
      }
      case 'hatch': {
        ctx.fillStyle = lighten(color, 0.2);
        ctx.fill(path);
        ctx.save();
        ctx.clip(path);
        const ax = bb.cx + lx * bb.r;
        const ay = bb.cy + ly * bb.r;
        const bx = bb.cx - lx * bb.r;
        const by = bb.cy - ly * bb.r;
        const g = ctx.createLinearGradient(ax, ay, bx, by);
        g.addColorStop(0, rgba(this.pal.ink, 0));
        g.addColorStop(0.42, rgba(this.pal.ink, 0.15));
        g.addColorStop(1, rgba(this.pal.ink, 0.9));
        ctx.strokeStyle = g;
        ctx.lineWidth = 0.9;
        const D = bb.r * 1.5;
        ctx.beginPath();
        for (let k = -D; k < D; k += 4.2) {
          ctx.moveTo(bb.cx + k - D, bb.cy - D);
          ctx.lineTo(bb.cx + k + D, bb.cy + D);
        }
        ctx.stroke();
        const g2 = ctx.createLinearGradient(ax, ay, bx, by);
        g2.addColorStop(0, rgba(this.pal.ink, 0));
        g2.addColorStop(0.65, rgba(this.pal.ink, 0));
        g2.addColorStop(1, rgba(this.pal.ink, 0.8));
        ctx.strokeStyle = g2;
        ctx.beginPath();
        for (let k = -D; k < D; k += 4.2) {
          ctx.moveTo(bb.cx + k + D, bb.cy - D);
          ctx.lineTo(bb.cx + k - D, bb.cy + D);
        }
        ctx.stroke();
        ctx.restore();
        break;
      }
      case 'glass': {
        ctx.fillStyle = rgba(color, 0.22);
        ctx.fill(path);
        const g = ctx.createLinearGradient(bb.x, bb.y, bb.x + bb.w, bb.y + bb.h);
        g.addColorStop(0, rgba(this.pal.light, 0.42));
        g.addColorStop(0.55, rgba(this.pal.light, 0.08));
        g.addColorStop(1, rgba(this.pal.light, 0.02));
        ctx.fillStyle = g;
        ctx.fill(path);
        break;
      }
      case 'neu': {
        const base = this.pal.bg;
        const d = Math.max(2, L.shadowD);
        const px = this.px;
        ctx.save();
        ctx.fillStyle = color;
        ctx.shadowColor = rgba(darken(base, 0.2), 0.75);
        ctx.shadowBlur = d * 2.2 * px;
        ctx.shadowOffsetX = d * px;
        ctx.shadowOffsetY = d * px;
        ctx.fill(path);
        ctx.shadowColor = rgba(lighten(base, 0.12), 0.95);
        ctx.shadowOffsetX = -d * px;
        ctx.shadowOffsetY = -d * px;
        ctx.fill(path);
        ctx.restore();
        const g = ctx.createLinearGradient(bb.x, bb.y, bb.x + bb.w, bb.y + bb.h);
        g.addColorStop(0, lighten(color, 0.035));
        g.addColorStop(1, darken(color, 0.035));
        ctx.fillStyle = g;
        ctx.fill(path);
        break;
      }
      case 'chrome': {
        const g = ctx.createLinearGradient(bb.x, bb.y, bb.x + bb.w * 0.2, bb.y + bb.h);
        g.addColorStop(0, lighten(color, 0.42));
        g.addColorStop(0.4, lighten(color, 0.2));
        g.addColorStop(0.49, darken(color, 0.38));
        g.addColorStop(0.58, darken(color, 0.1));
        g.addColorStop(0.82, lighten(color, 0.22));
        g.addColorStop(1, lighten(color, 0.42));
        ctx.fillStyle = g;
        ctx.fill(path);
        if (big) this.highlight(bb, color, 0.6);
        break;
      }
      case 'iridescent': {
        const h = (this.time * 45) % 360;
        const g = ctx.createLinearGradient(bb.x, bb.y, bb.x + bb.w, bb.y + bb.h);
        g.addColorStop(0, lighten(hueRotate(color, h), 0.12));
        g.addColorStop(0.5, lighten(hueRotate(color, h + 70), 0.16));
        g.addColorStop(1, lighten(hueRotate(color, h + 150), 0.1));
        ctx.fillStyle = g;
        ctx.fill(path);
        if (big) this.highlight(bb, color, 0.6);
        break;
      }
      case 'gloss': {
        const g = ctx.createLinearGradient(bb.x, bb.y, bb.x, bb.y + bb.h);
        g.addColorStop(0, lighten(color, 0.15));
        g.addColorStop(1, darken(color, 0.14));
        ctx.fillStyle = g;
        ctx.fill(path);
        if (big) {
          ctx.save();
          ctx.clip(path);
          ctx.fillStyle = 'rgba(255,255,255,0.42)';
          ctx.beginPath();
          ctx.ellipse(bb.cx, bb.y + bb.h * 0.24, bb.w * 0.4, bb.h * 0.19, 0, 0, TAU);
          ctx.fill();
          ctx.restore();
        }
        break;
      }
      case 'crayon': {
        ctx.fillStyle = rgba(color, 0.2);
        ctx.fill(path);
        ctx.save();
        ctx.clip(path);
        ctx.strokeStyle = rgba(color, 0.85);
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        const ang = -0.55;
        const ca = Math.cos(ang);
        const sa = Math.sin(ang);
        const D = bb.r * 1.25;
        const bs = this.boilAmt > 0.05 ? this.M.bframe : 0;
        ctx.beginPath();
        let li = 0;
        for (let k = -D; k < D; k += 3.3, li++) {
          for (let t = -D, j = 0; t <= D; t += 6, j++) {
            const jx = (hash(li, j, this.sid + bs) - 0.5) * 2.4;
            const x = bb.cx + t * ca - (k + jx) * sa;
            const y = bb.cy + t * sa + (k + jx) * ca;
            if (j === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
        ctx.restore();
        break;
      }
      case 'marker': {
        ctx.fillStyle = rgba(color, 0.28);
        ctx.fill(path);
        ctx.save();
        ctx.clip(path);
        ctx.strokeStyle = rgba(color, 0.6);
        ctx.lineWidth = 9;
        ctx.lineCap = 'round';
        const D = bb.r * 1.3;
        for (let k = -D, i = 0; k < D; k += 7.5, i++) {
          ctx.beginPath();
          const off = (hash(i, this.sid, 5) - 0.5) * 3;
          ctx.moveTo(bb.cx - D, bb.cy + k + off - D * 0.25);
          ctx.lineTo(bb.cx + D, bb.cy + k + off + D * 0.25);
          ctx.stroke();
        }
        ctx.restore();
        break;
      }
      case 'wash': {
        ctx.fillStyle = rgba(color, 0.8);
        ctx.fill(path);
        ctx.strokeStyle = rgba(darken(color, 0.2), 0.45);
        ctx.lineWidth = 2.6;
        ctx.lineJoin = 'round';
        ctx.stroke(path);
        break;
      }
      case 'offset': {
        ctx.save();
        ctx.translate(4.5, 4.5);
        ctx.fillStyle = color;
        ctx.fill(path);
        ctx.restore();
        break;
      }
      case 'jianzhi':
      case 'puppet': {
        ctx.fillStyle = mode === 'puppet' ? rgba(color, 0.86) : color;
        ctx.fill(path);
        if (bb.r > 16 && o.hl !== false) this.cutouts(path, bb, mode === 'puppet' ? rgba(this.pal.bg, 0.75) : this.pal.bg);
        break;
      }
    }
    void P;
  }

  /** 剪紙鏤空花紋 */
  private cutouts(path: Path2D, bb: BBox, holeColor: string) {
    const ctx = this.ctx;
    const T = ctx.getTransform();
    const inside = (x: number, y: number) => {
      const q = T.transformPoint(new DOMPoint(x, y));
      return ctx.isPointInPath(path, q.x, q.y);
    };
    ctx.save();
    ctx.fillStyle = holeColor;
    const step = 12;
    ctx.beginPath();
    let row = 0;
    for (let y = bb.y + step; y < bb.y + bb.h - 4; y += step * 0.86, row++) {
      for (let x = bb.x + (row % 2 ? step : step / 2); x < bb.x + bb.w - 4; x += step) {
        const m = 6.5;
        if (!(inside(x, y) && inside(x + m, y) && inside(x - m, y) && inside(x, y + m) && inside(x, y - m))) continue;
        const kind = (row + Math.round(x / step)) % 3;
        if (kind === 0) {
          ctx.moveTo(x, y - 3.6);
          ctx.lineTo(x + 2.4, y);
          ctx.lineTo(x, y + 3.6);
          ctx.lineTo(x - 2.4, y);
          ctx.closePath();
        } else if (kind === 1) {
          ctx.moveTo(x + 2.2, y);
          ctx.arc(x, y, 2.2, 0, TAU);
        } else {
          ctx.moveTo(x - 3, y + 1.4);
          ctx.quadraticCurveTo(x, y - 3.8, x + 3, y + 1.4);
          ctx.quadraticCurveTo(x, y - 0.6, x - 3, y + 1.4);
        }
      }
    }
    ctx.fill();
    ctx.restore();
  }

  private highlight(bb: BBox, color: string, k: number) {
    if (this.look.detail < 0.5) return;
    const ctx = this.ctx;
    const [lx, ly] = this.look.light;
    ctx.save();
    ctx.fillStyle = rgba(lighten(color, k), 0.85);
    ctx.beginPath();
    ctx.ellipse(bb.cx + lx * bb.w * 0.27, bb.cy + ly * bb.h * 0.27, bb.w * 0.11, bb.h * 0.065, Math.atan2(ly, lx) + Math.PI / 2, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  // ---------- 描邊 ----------
  private stroke(local: number[], closed: boolean, color: Paint, o: LOpts) {
    this.sid++;
    const P = this.prep(local, closed, o.boil ?? 1);
    if (P.length < 4) return;
    const L = this.look;
    const w = o.w ?? Math.max(1, L.stroke || 2);
    let reveal = 1;
    let a = this.alpha * (o.alpha ?? 1);
    if (this.drawOnAmt > 0.15 && o.drawOn !== false) reveal = clamp(this.drawP * 1.4 - (this.sid % 9) * 0.045);
    if (a <= 0.003) return;
    const c = this.col(color);
    if (o.outlined && L.stroke > 0.3) {
      this.strokePath(P, closed, this.pal.ink, w + L.stroke * 2, a, reveal, false, o.cap, o.dash);
    }
    this.strokePath(P, closed, c, w, a, reveal, o.glow || L.glow > 0.05, o.cap, o.dash);
  }

  private strokePath(P: number[], closed: boolean, color: string, w: number, a: number, reveal: number, glow: boolean, cap?: CanvasLineCap, dash?: number[]) {
    const ctx = this.ctx;
    const L = this.look;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.lineJoin = 'round';
    ctx.lineCap = cap ?? 'round';
    let len = 0;
    if (reveal < 0.999) {
      len = perimeter(P, closed);
      ctx.setLineDash([len * reveal, len + 10]);
    } else if (dash) ctx.setLineDash(dash);
    if (glow) {
      ctx.shadowColor = color;
      ctx.shadowBlur = (8 + 14 * L.glow) * this.px;
    }
    const style = L.strokeStyle;
    const path = this.toPath(P, closed);
    switch (style) {
      case 'sketch': {
        const amp = 0.9 + L.sketch * 1.2;
        const bs = this.M.bframe;
        ctx.globalAlpha = a * 0.85;
        ctx.stroke(this.jitterPath(P, closed, amp, 11 + (this.boilAmt > 0.05 ? bs : 0)));
        ctx.lineWidth = w * 0.7;
        ctx.stroke(this.jitterPath(P, closed, amp, 29 + (this.boilAmt > 0.05 ? bs : 0)));
        break;
      }
      case 'pencil': {
        ctx.lineWidth = w * 0.55;
        ctx.globalAlpha = a * 0.5;
        for (let k = 0; k < 3; k++) ctx.stroke(this.jitterPath(P, closed, 0.7, 40 + k));
        break;
      }
      case 'chalk': {
        if (reveal >= 0.999) ctx.setLineDash([7, 1.6, 3, 1.2, 10, 2.2]);
        ctx.globalAlpha = a * 0.9;
        ctx.stroke(path);
        ctx.lineWidth = w * 0.6;
        ctx.globalAlpha = a * 0.45;
        ctx.stroke(this.jitterPath(P, closed, 0.8, 71));
        break;
      }
      case 'dashed':
        if (reveal >= 0.999) ctx.setLineDash([w * 2.6, w * 2]);
        ctx.stroke(path);
        break;
      case 'brush': {
        if (reveal < 0.999) {
          ctx.stroke(path);
          break;
        }
        const n = P.length / 2;
        const segs = closed ? n : n - 1;
        ctx.lineCap = 'round';
        for (let i = 0; i < segs; i++) {
          const j = (i + 1) % n;
          const t = i / Math.max(1, segs);
          let k = 0.5 + 0.75 * (0.5 + 0.5 * noise1(i * 0.32 + this.sid * 3.7, this.sid));
          if (!closed) k *= Math.pow(Math.sin(Math.PI * clamp(t * 0.96 + 0.02)), 0.5);
          ctx.lineWidth = w * k * 1.15;
          ctx.beginPath();
          ctx.moveTo(P[i * 2], P[i * 2 + 1]);
          ctx.lineTo(P[j * 2], P[j * 2 + 1]);
          ctx.stroke();
        }
        break;
      }
      case 'glow': {
        ctx.shadowColor = color;
        ctx.shadowBlur = (10 + 16 * L.glow) * this.px;
        ctx.stroke(path);
        ctx.shadowBlur = 0;
        ctx.strokeStyle = lighten(color, 0.38);
        ctx.lineWidth = Math.max(0.8, w * 0.42);
        ctx.stroke(path);
        break;
      }
      default:
        ctx.stroke(path);
    }
    ctx.restore();
  }

  // ---------- 文字 ----------
  measure(str: string, size: number, font?: FontId): number {
    const ctx = this.ctx;
    ctx.save();
    ctx.font = fontCss(font ?? this.look.font, size);
    const w = ctx.measureText(this.look.upper ? str.toUpperCase() : str).width;
    ctx.restore();
    return w;
  }

  text(str: string, x: number, y: number, size: number, fillP: Paint, o: TOpts = {}) {
    this.sid++;
    const ctx = this.ctx;
    const L = this.look;
    const m = this.m;
    const s = L.upper ? str.toUpperCase() : str;
    const color = this.col(fillP);
    let a = this.alpha * (o.alpha ?? 1);
    if (this.drawOnAmt > 0.15 && o.drawOn !== false) {
      const rv = clamp(this.drawP * 1.4 - (this.sid % 9) * 0.045);
      a *= smooth(0.2, 1, rv);
    }
    if (a <= 0.003) return;
    ctx.save();
    ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
    ctx.translate(x, y);
    const boil = this.boilAmt + this.wobAmt * 0.5;
    if (boil > 0.02) {
      const bf = this.M.bframe;
      ctx.rotate((hash(bf, this.sid, 1) - 0.5) * 0.06 * boil);
      ctx.translate((hash(bf, this.sid, 2) - 0.5) * 1.6 * boil, (hash(bf, this.sid, 3) - 0.5) * 1.6 * boil);
    }
    ctx.globalAlpha = a;
    ctx.font = fontCss(o.font ?? L.font, size);
    ctx.textAlign = o.align ?? 'center';
    ctx.textBaseline = o.base ?? 'middle';
    ctx.lineJoin = 'round';
    const px = this.px;
    let mode: FillMode = o.mode ?? L.fill;
    if (o.flat && mode !== 'none' && mode !== 'line' && mode !== 'silhouette') mode = 'flat';

    if (L.sticker > 0.2 && o.shadow !== false) {
      ctx.strokeStyle = this.pal.light;
      ctx.lineWidth = L.sticker * 2 + L.stroke * 2;
      ctx.shadowColor = 'rgba(0,0,0,0.25)';
      ctx.shadowBlur = 6 * px;
      ctx.strokeText(s, 0, 0);
      ctx.shadowColor = 'transparent';
    }
    if (o.shadow !== false && mode !== 'none') {
      const d = L.shadowD;
      if (L.shadow === 'hard' || L.shadow === 'soft' || L.shadow === 'paper') {
        ctx.save();
        ctx.fillStyle = L.shadow === 'hard' ? L.shadowColor || this.pal.ink : 'rgba(0,0,0,0)';
        ctx.shadowColor = L.shadow === 'hard' ? L.shadowColor || this.pal.ink : 'rgba(20,20,30,0.35)';
        ctx.shadowBlur = L.shadow === 'hard' ? 0 : d * 2 * px;
        ctx.shadowOffsetX = (L.shadow === 'hard' ? d : d * 0.3) * px;
        ctx.shadowOffsetY = (L.shadow === 'hard' ? d : d * 0.8) * px;
        ctx.fillStyle = color;
        ctx.fillText(s, 0, 0);
        ctx.restore();
      } else if (L.shadow === 'extrude' || L.shadow === 'long') {
        const steps = L.shadow === 'long' ? 22 : Math.max(4, Math.round(d * 1.4));
        ctx.fillStyle = L.shadow === 'long' ? rgba(darken(this.pal.bg, 0.3), 0.08) : L.shadowColor || darken(color, 0.32);
        for (let k = steps; k >= 1; k--) ctx.fillText(s, k * (L.shadow === 'long' ? d * 0.5 : 0.9), k * (L.shadow === 'long' ? d * 0.5 : 0.9));
      }
    }
    const metrics = size;
    let fill: string | CanvasGradient = color;
    switch (mode) {
      case 'gradient':
      case 'soft':
      case 'gloss':
      case 'clay':
      case 'inflate': {
        const g = ctx.createLinearGradient(0, -metrics * 0.5, 0, metrics * 0.5);
        g.addColorStop(0, lighten(color, 0.16));
        g.addColorStop(1, darken(color, 0.12));
        fill = g;
        break;
      }
      case 'chrome': {
        const g = ctx.createLinearGradient(0, -metrics * 0.55, 0, metrics * 0.55);
        g.addColorStop(0, lighten(color, 0.45));
        g.addColorStop(0.46, lighten(color, 0.18));
        g.addColorStop(0.5, darken(color, 0.4));
        g.addColorStop(0.62, darken(color, 0.1));
        g.addColorStop(1, lighten(color, 0.35));
        fill = g;
        break;
      }
      case 'iridescent': {
        const h = (this.time * 45) % 360;
        const w = ctx.measureText(s).width;
        const g = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
        g.addColorStop(0, lighten(hueRotate(color, h), 0.15));
        g.addColorStop(0.5, lighten(hueRotate(color, h + 80), 0.18));
        g.addColorStop(1, lighten(hueRotate(color, h + 160), 0.12));
        fill = g;
        break;
      }
      case 'silhouette':
        fill = this.pal.ink;
        break;
      case 'line':
        fill = this.pal.bg;
        break;
      case 'glass':
        fill = rgba(this.pal.light, 0.38);
        break;
      case 'wash':
        fill = rgba(color, 0.82);
        break;
      default:
        break;
    }
    if (mode === 'neu') {
      const d = Math.max(2, L.shadowD);
      ctx.save();
      ctx.fillStyle = color;
      ctx.shadowColor = rgba(darken(this.pal.bg, 0.2), 0.8);
      ctx.shadowBlur = d * 1.6 * px;
      ctx.shadowOffsetX = d * 0.6 * px;
      ctx.shadowOffsetY = d * 0.6 * px;
      ctx.fillText(s, 0, 0);
      ctx.shadowColor = rgba(lighten(this.pal.bg, 0.12), 0.95);
      ctx.shadowOffsetX = -d * 0.6 * px;
      ctx.shadowOffsetY = -d * 0.6 * px;
      ctx.fillText(s, 0, 0);
      ctx.restore();
    }
    const glow = L.glow > 0.05 || o.glow;
    if (mode !== 'none') {
      if (glow) {
        ctx.shadowColor = color;
        ctx.shadowBlur = (10 + 18 * L.glow) * px;
      }
      ctx.fillStyle = fill;
      ctx.fillText(s, 0, 0);
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
    }
    const sw = L.stroke;
    if ((sw > 0.05 || mode === 'none' || mode === 'line') && o.stroke !== false) {
      const sc = mode === 'none' ? color : this.strokeColor(color, o.stroke);
      ctx.strokeStyle = sc;
      ctx.lineWidth = Math.max(1, sw || 2) * (o.lw ?? 1) * 0.9;
      if (mode === 'none' && glow) {
        ctx.shadowColor = sc;
        ctx.shadowBlur = (10 + 18 * L.glow) * px;
      }
      if (L.strokeStyle === 'sketch' || L.strokeStyle === 'pencil') {
        ctx.globalAlpha = a * 0.8;
        ctx.strokeText(s, 0.6, -0.4);
        ctx.strokeText(s, -0.5, 0.5);
      } else ctx.strokeText(s, 0, 0);
      if (mode === 'none' && glow) {
        ctx.shadowBlur = 0;
        ctx.strokeStyle = lighten(sc, 0.4);
        ctx.lineWidth = Math.max(0.6, ctx.lineWidth * 0.4);
        ctx.strokeText(s, 0, 0);
      }
    }
    ctx.restore();
  }
}

function mixf(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
