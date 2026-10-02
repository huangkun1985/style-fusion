// 縮圖排程器：上百張即時縮圖共用一個渲染器，只畫看得見的、並限制每幀時間預算。
import { Renderer } from './renderer';
import { SUBJECTS } from './subjects';
import type { Look, Move, SubjectId, Tune } from './types';

export interface ThumbSpec {
  subject: SubjectId;
  look: Look;
  move: Move;
  tune: Tune;
}

interface Job {
  canvas: HTMLCanvasElement;
  spec: () => ThumbSpec;
  visible: boolean;
  phase: number;
  last: number;
  dirty: boolean;
  w: number;
  h: number;
}

class ThumbScheduler {
  private renderer: Renderer | null = null;
  private jobs = new Map<HTMLCanvasElement, Job>();
  private io: IntersectionObserver | null = null;
  private ro: ResizeObserver | null = null;
  private raf = 0;
  private cursor = 0;
  animate = true;
  fps = 14;
  budget = 7;

  private ensure() {
    if (!this.renderer) {
      this.renderer = new Renderer(true);
      this.renderer.onThreeReady = () => this.invalidate();
    }
    if (!this.io && typeof IntersectionObserver !== 'undefined') {
      this.io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            const j = this.jobs.get(e.target as HTMLCanvasElement);
            if (j) {
              j.visible = e.isIntersecting;
              if (j.visible) j.dirty = true;
            }
          }
        },
        { rootMargin: '120px' },
      );
    }
    if (!this.ro && typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver((entries) => {
        for (const e of entries) {
          const j = this.jobs.get(e.target as HTMLCanvasElement);
          if (j) this.measure(j);
        }
      });
    }
    if (!this.raf) this.raf = requestAnimationFrame(this.loop);
  }

  private measure(j: Job) {
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    const r = j.canvas.getBoundingClientRect();
    j.w = Math.max(2, Math.round(r.width * dpr));
    j.h = Math.max(2, Math.round(r.height * dpr));
    if (j.canvas.width !== j.w) j.canvas.width = j.w;
    if (j.canvas.height !== j.h) j.canvas.height = j.h;
    j.dirty = true;
  }

  register(canvas: HTMLCanvasElement, spec: () => ThumbSpec) {
    this.ensure();
    const j: Job = { canvas, spec, visible: false, phase: Math.random() * 10, last: 0, dirty: true, w: 0, h: 0 };
    this.jobs.set(canvas, j);
    this.measure(j);
    this.io?.observe(canvas);
    this.ro?.observe(canvas);
    return () => {
      this.io?.unobserve(canvas);
      this.ro?.unobserve(canvas);
      this.jobs.delete(canvas);
    };
  }

  private warmed = false;
  /** 閒置時先載入 Three.js，並把常用的 3D 材質各畫一幀，讓使用者第一次點到 3D 風格時不會卡頓 */
  prewarm(specs: ThumbSpec[]) {
    if (this.warmed || typeof document === 'undefined') return;
    this.warmed = true;
    if (!this.renderer) {
      this.renderer = new Renderer(true);
      this.renderer.onThreeReady = () => this.invalidate();
    }
    const r = this.renderer;
    const cv = document.createElement('canvas');
    cv.width = 128;
    cv.height = 72;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const idle = (fn: () => void) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(() => fn(), { timeout: 600 }) : setTimeout(fn, 60));
    void r.ready('char3d').then(() => {
      let i = 0;
      const step = () => {
        if (i >= specs.length || document.hidden) return;
        const s = specs[i++];
        try {
          r.render(ctx, 128, 72, { ...s, time: 0.3, thumb: true });
        } catch {
          /* 預熱失敗不影響使用 */
        }
        idle(step);
      };
      idle(step);
    });
  }

  /** 規格改變時（例如微調參數）讓所有縮圖重畫 */
  invalidate() {
    for (const j of this.jobs.values()) j.dirty = true;
  }
  touch(canvas: HTMLCanvasElement) {
    const j = this.jobs.get(canvas);
    if (j) j.dirty = true;
  }

  private loop = (now: number) => {
    this.raf = requestAnimationFrame(this.loop);
    if (!this.renderer || document.hidden) return;
    const list = [...this.jobs.values()].filter((j) => j.visible && j.w > 2);
    if (!list.length) return;
    const start = performance.now();
    const interval = 1000 / this.fps;
    const n = list.length;
    for (let k = 0; k < n; k++) {
      const j = list[(this.cursor + k) % n];
      const due = this.animate ? now - j.last >= interval : j.dirty;
      if (!due) continue;
      const spec = j.spec();
      const sub = SUBJECTS[spec.subject];
      const t = this.animate ? now / 1000 + j.phase : sub.loop * sub.hero;
      try {
        const ctx = j.canvas.getContext('2d');
        if (ctx) this.renderer.render(ctx, j.w, j.h, { ...spec, time: t, thumb: true });
      } catch (e) {
        console.warn('thumb', e);
      }
      j.last = now;
      j.dirty = false;
      if (performance.now() - start > this.budget) {
        this.cursor = (this.cursor + k + 1) % n;
        return;
      }
    }
    this.cursor = 0;
  };
}

export const thumbs = new ThumbScheduler();
