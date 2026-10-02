// 渲染器：背景 → 線條系統 → 洋蔥皮 → 殘影／拖影 → 主體 → 流光／遮罩 → 粒子／速度線 → 裝飾 → WebGL 後期。
import { drawBackground } from './backgrounds';
import { Brush } from './brush';
import { drawDecos } from './decos';
import { loopSeconds } from './loop';
import type { Env, ThreeLike } from './env';
import { FX } from './fx';
import { MotionCtx } from './motion';
import { applyMask, drawLines, drawParticles, drawRipples, drawShimmer, drawSpeedLines } from './overlays';
import { PostFX } from './postfx/PostFX';
import { SUBJECTS } from './subjects';
import type { Subject } from './subjects/types';
import { is3D, type FxInst, type Look, type Move, type SubjectId, type Tune } from './types';
import { TAU, bump, hash, smooth } from './util';

export interface FrameSpec {
  subject: SubjectId;
  look: Look;
  move: Move;
  tune: Tune;
  /** 秒 */
  time: number;
  onion?: boolean;
  transparent?: boolean;
  thumb?: boolean;
  /** 關閉 WebGL 後期（比較用） */
  noPost?: boolean;
}

interface Cam {
  x: number;
  y: number;
  rot: number;
  zoom: number;
}
const CAM0: Cam = { x: 0, y: 0, rot: 0, zoom: 1 };

function mk(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d', { willReadFrequently: false })!;
  return [c, ctx];
}
function size(c: HTMLCanvasElement, w: number, h: number) {
  if (c.width !== w) c.width = w;
  if (c.height !== h) c.height = h;
}
function setBase(ctx: CanvasRenderingContext2D, W: number, H: number, u: number, cam: Cam) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.translate(W / 2, H / 2);
  ctx.scale(u, u);
  ctx.translate(cam.x, cam.y);
  if (cam.rot) ctx.rotate(cam.rot);
  if (cam.zoom !== 1) ctx.scale(cam.zoom, cam.zoom);
}

export { loopSeconds };

export function camera(M: MotionCtx, look: Look, env: Env): Cam {
  const mv = M.mv;
  let x = 0;
  let y = 0;
  let rot = look.tilt;
  let zoom = 1;
  if (mv.handheld > 0.01) {
    x += mv.handheld * 9 * M.nz(11, 3);
    y += mv.handheld * 7 * M.nz(12, 3);
    rot += mv.handheld * 0.016 * M.nz(13, 2);
  }
  const shake = mv.shake + mv.heavy * 0.6;
  if (shake > 0.01 && M.ev.length) {
    const p = Math.min(1.2, M.pulse(9));
    if (p > 0.01) {
      const f = M.jframe;
      x += shake * 15 * p * (hash(f, 1, 9) - 0.5) * 2;
      y += shake * 15 * p * (hash(f, 2, 9) - 0.5) * 2;
    }
  }
  if (mv.kenburns > 0.01) {
    zoom += mv.kenburns * 0.15 * (0.5 - 0.5 * Math.cos(TAU * M.u));
    x += mv.kenburns * 26 * Math.sin(TAU * M.u);
  }
  if (mv.zoomPunch > 0.01) zoom += mv.zoomPunch * (0.1 * Math.min(1, M.pulse(10)) + 0.05 * M.beat(9));
  if (mv.beat > 0.01) zoom += mv.beat * 0.04 * M.beat();
  if (mv.tilt > 0.01) rot += mv.tilt * 0.085 * Math.sin(TAU * M.u);
  if (mv.whip > 0.01) {
    const u = M.u;
    const k = u > 0.9 ? -M.in(smooth(0.9, 1, u)) : u < 0.1 ? 1 - M.out(smooth(0, 0.1, u)) : 0;
    x += mv.whip * k * env.Wu * 1.15;
  }
  return { x, y, rot, zoom };
}

export function dynamicFx(M: MotionCtx): FxInst[] {
  const out: FxInst[] = [];
  const mv = M.mv;
  if (mv.impact > 0.05 && M.ev.length) {
    if (M.ev.some((e) => M.since(e) < 2 / 24 + 1e-3)) out.push({ fx: 'invert', p: { amt: Math.min(1, mv.impact) }, c: [], pal: [] });
  }
  if (mv.glitch > 0.05) {
    const chunk = Math.floor(M.tReal * 4);
    const burst = hash(chunk, 3, 7) > 0.55 ? 1 : 0.12;
    out.push({ fx: 'glitch', p: { amt: Math.min(1, mv.glitch * burst) }, c: [], pal: [] });
    out.push({ fx: 'chroma', p: { amt: Math.min(1, mv.glitch * burst * 0.8) }, c: [], pal: [] });
  }
  if (mv.whip > 0.05) {
    const u = M.u;
    const k = Math.max(bump(0.86, 1.0001, u), bump(-0.14, 0.14, u > 0.5 ? u - 1 : u));
    if (k > 0.02) out.push({ fx: 'mblur', p: { amt: Math.min(1, mv.whip * k), angle: 0 }, c: [], pal: [] });
  }
  return out;
}

export class Renderer {
  private scene: HTMLCanvasElement;
  private sctx: CanvasRenderingContext2D;
  private layer: HTMLCanvasElement;
  private lctx: CanvasRenderingContext2D;
  private tmp: HTMLCanvasElement;
  private tctx: CanvasRenderingContext2D;
  private post: PostFX | null = null;
  private postFailed = false;
  private brush = new Brush();
  private three: ThreeLike | null = null;
  onThreeReady?: () => void;
  useGL: boolean;

  constructor(useGL = true) {
    [this.scene, this.sctx] = mk();
    [this.layer, this.lctx] = mk();
    [this.tmp, this.tctx] = mk();
    this.useGL = useGL;
  }

  get glOk() {
    return !this.postFailed;
  }

  private ensurePost(): PostFX | null {
    if (!this.useGL || this.postFailed) return null;
    if (!this.post) {
      this.post = new PostFX();
      if (!this.post.ok) {
        this.postFailed = true;
        this.post = null;
      }
    }
    return this.post?.ok ? this.post : null;
  }

  private threeP: Promise<void> | null = null;
  private loadThree(): Promise<void> {
    if (this.threeP) return this.threeP;
    this.threeP = import('./three/stage')
      .then((m) => {
        this.three = new m.Stage3D();
        this.onThreeReady?.();
      })
      .catch((e) => console.warn('3D 載入失敗', e));
    return this.threeP;
  }

  /** 3D 主體要先載入 Three.js 並建好舞台；導出、存圖前先等它，否則第一幀會畫成「載入 3D 場景…」的占位卡 */
  async ready(subject: SubjectId): Promise<void> {
    if (is3D(subject)) await this.loadThree();
  }

  private drawSubject(ctx: CanvasRenderingContext2D, sub: Subject, M: MotionCtx, env: Env, look: Look, W: number, H: number, cam: Cam, time: number, alpha = 1) {
    setBase(ctx, W, H, env.u, cam);
    this.brush.setup(ctx, look, M, env.u * cam.zoom, time);
    this.brush.alpha = alpha;
    ctx.save();
    sub.draw(this.brush, M, env);
    ctx.restore();
  }

  render(out: CanvasRenderingContext2D, W: number, H: number, f: FrameSpec) {
    W = Math.max(2, Math.round(W));
    H = Math.max(2, Math.round(H));
    const sub = SUBJECTS[f.subject] ?? SUBJECTS.mascot;
    size(this.scene, W, H);
    size(this.layer, W, H);
    size(this.tmp, W, H);
    const u = Math.min(W, H) / 400;
    const look = f.look;
    const env: Env = {
      Wu: W / u,
      Hu: H / u,
      u,
      look,
      detail: look.detail,
      thumb: !!f.thumb,
      three: this.three,
      requestThree: () => void this.loadThree(),
      W,
      H,
    };
    const L = loopSeconds(sub, f.move, f.tune);
    const evs = sub.events(env);
    const M = new MotionCtx(f.move, L, f.time, f.tune.seed, evs.map((e) => e.u), sub.key);
    const cam = camera(M, look, env);
    const mv = f.move;

    const sc = this.sctx;
    sc.setTransform(1, 0, 0, 1, 0, 0);
    sc.globalAlpha = 1;
    sc.globalCompositeOperation = 'source-over';
    sc.shadowColor = 'transparent';
    if (f.transparent) sc.clearRect(0, 0, W, H);
    else {
      sc.fillStyle = look.pal.bg;
      sc.fillRect(0, 0, W, H);
      setBase(sc, W, H, u, cam);
      drawBackground(sc, env, look, M, f.time);
    }
    setBase(sc, W, H, u, cam);
    const track = sub.track(M, env);
    if (mv.lines.length) drawLines(sc, env, look, M, track, 'back');

    // 洋蔥皮（只在預覽）
    if (f.onion) {
      const step = 1 / (mv.fps > 0 ? mv.fps : 12);
      const ghosts: [number, string][] = [
        [-2 * step, '#ff4d6d'],
        [-step, '#ff4d6d'],
        [step, '#2ec4b6'],
        [2 * step, '#2ec4b6'],
      ];
      for (const [dt, col] of ghosts) {
        const tc = this.tctx;
        tc.setTransform(1, 0, 0, 1, 0, 0);
        tc.clearRect(0, 0, W, H);
        this.drawSubject(tc, sub, M.at(f.time + dt), env, look, W, H, cam, f.time + dt);
        tc.setTransform(1, 0, 0, 1, 0, 0);
        tc.globalCompositeOperation = 'source-atop';
        tc.fillStyle = col;
        tc.fillRect(0, 0, W, H);
        tc.globalCompositeOperation = 'source-over';
        sc.setTransform(1, 0, 0, 1, 0, 0);
        sc.globalAlpha = Math.abs(dt) > step * 1.5 ? 0.16 : 0.3;
        sc.drawImage(this.tmp, 0, 0);
        sc.globalAlpha = 1;
      }
    }

    // 主體層
    const lc = this.lctx;
    lc.setTransform(1, 0, 0, 1, 0, 0);
    lc.globalAlpha = 1;
    lc.globalCompositeOperation = 'source-over';
    lc.clearRect(0, 0, W, H);
    const copies: [number, number][] = [];
    if (mv.echo > 0.05) {
      const n = Math.round(2 + mv.echo * 3);
      const dt = 0.06 + 0.04 * mv.echo;
      for (let k = n; k >= 1; k--) copies.push([-k * dt, 0.42 * (1 - k / (n + 1)) * Math.min(1, mv.echo + 0.3)]);
    }
    if (mv.smear > 0.05) {
      const dt = 0.012 + 0.02 * mv.smear;
      for (let k = 3; k >= 1; k--) copies.push([-k * dt, 0.3 * Math.min(1, mv.smear)]);
    }
    for (const [dt, a] of copies) {
      const tc = this.tctx;
      tc.setTransform(1, 0, 0, 1, 0, 0);
      tc.clearRect(0, 0, W, H);
      this.drawSubject(tc, sub, M.at(f.time + dt), env, look, W, H, cam, f.time + dt);
      lc.setTransform(1, 0, 0, 1, 0, 0);
      lc.globalAlpha = a;
      lc.drawImage(this.tmp, 0, 0);
      lc.globalAlpha = 1;
    }
    this.drawSubject(lc, sub, M, env, look, W, H, cam, f.time);
    setBase(lc, W, H, u, cam);
    drawShimmer(lc, env, M);
    applyMask(lc, env, M);
    sc.setTransform(1, 0, 0, 1, 0, 0);
    sc.drawImage(this.layer, 0, 0);

    // 前景疊加
    setBase(sc, W, H, u, cam);
    if (mv.lines.length) drawLines(sc, env, look, M, track, 'front');
    drawParticles(sc, env, look, M, evs);
    drawRipples(sc, look, M, evs);
    if (mv.speedLines > 0.05) {
      const prev = sub.track(M.at(f.time - 1 / 30), env);
      drawSpeedLines(sc, env, look, M, track, [(track[0] - prev[0]) * 30, (track[1] - prev[1]) * 30]);
    }
    setBase(sc, W, H, u, CAM0);
    drawDecos(sc, env, look, M);

    // 後期
    const passes = f.noPost ? [] : [...look.post, ...dynamicFx(M)].sort((a, b) => (FX[a.fx]?.order ?? 0) - (FX[b.fx]?.order ?? 0));
    out.setTransform(1, 0, 0, 1, 0, 0);
    out.globalAlpha = 1;
    out.globalCompositeOperation = 'source-over';
    const post = passes.length && !f.transparent ? this.ensurePost() : null;
    if (post) {
      const res = post.run(this.scene, passes, f.time, look.pal.bg);
      out.drawImage(res, 0, 0, W, H);
    } else {
      if (f.transparent) out.clearRect(0, 0, W, H);
      out.drawImage(this.scene, 0, 0, W, H);
    }
  }

  /** 主要元素在一個循環內的軌跡（畫布像素座標），用於間距圖 */
  trackPath(f: FrameSpec, W: number, H: number, samples?: number): { pts: [number, number][]; cur: [number, number] } {
    const sub = SUBJECTS[f.subject] ?? SUBJECTS.mascot;
    const u = Math.min(W, H) / 400;
    const env: Env = { Wu: W / u, Hu: H / u, u, look: f.look, detail: f.look.detail, thumb: false, W, H };
    const L = loopSeconds(sub, f.move, f.tune);
    const fps = f.move.fps > 0 ? f.move.fps : 24;
    const n = samples ?? Math.max(8, Math.min(240, Math.round(L * fps)));
    const evs = sub.events(env).map((e) => e.u);
    const toPx = (p: [number, number]): [number, number] => [W / 2 + p[0] * u, H / 2 + p[1] * u];
    const pts: [number, number][] = [];
    const base = Math.floor(f.time / L) * L;
    for (let i = 0; i < n; i++) {
      const M = new MotionCtx(f.move, L, base + (i / n) * L + 1e-4, f.tune.seed, evs, sub.key);
      pts.push(toPx(sub.track(M, env)));
    }
    const Mc = new MotionCtx(f.move, L, f.time, f.tune.seed, evs, sub.key);
    return { pts, cur: toPx(sub.track(Mc, env)) };
  }

  dispose() {
    this.post?.dispose();
    this.post = null;
    this.three?.dispose?.();
    this.three = null;
  }
}
