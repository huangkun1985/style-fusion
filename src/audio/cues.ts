// 動畫提示點追蹤：把「時間」換成動畫循環內的位置 u，偵測音效該在何時觸發。
import type { Env } from '../engine/env';
import { loopSeconds } from '../engine/loop';
import { MotionCtx } from '../engine/motion';
import { SUBJECTS } from '../engine/subjects';
import type { Look, Move, SubjectId, Tune } from '../engine/types';
import type { Cue } from './types';

export function previewEnv(look: Look, aspect = 16 / 9): Env {
  const Hu = 400;
  const Wu = Hu * aspect;
  return { Wu, Hu, u: 1, look, detail: look.detail, thumb: false, W: Wu, H: Hu };
}

export class CueTracker {
  readonly L: number;
  readonly cues: Cue[];
  private evU: number[];
  private key: number;

  constructor(
    readonly subject: SubjectId,
    private move: Move,
    private tune: Tune,
    look: Look,
    aspect = 16 / 9,
  ) {
    const sub = SUBJECTS[subject];
    this.L = loopSeconds(sub, move, tune);
    const env = previewEnv(look, aspect);
    const evs = sub.events(env);
    this.evU = evs.map((e) => e.u);
    this.key = sub.key;
    const M0 = new MotionCtx(move, this.L, 0, tune.seed, this.evU, sub.key);
    const raw: Cue[] = sub.cues ? sub.cues(M0, env) : evs.map((e) => ({ u: e.u, kind: 'impact' as const, k: e.k ?? 0.6 }));
    this.cues = raw.filter((c) => c.u >= 0 && c.u < 1).sort((a, b) => a.u - b.u);
  }

  /** 時間 t（秒）對應的動畫循環位置，包含停格、慢放、往返等時間重映射 */
  u(t: number): number {
    return new MotionCtx(this.move, this.L, t, this.tune.seed, this.evU, this.key).u;
  }

  /** 從 u0 走到 u1 之間經過的提示點 */
  scan(u0: number, u1: number): Cue[] {
    const d = u1 - u0;
    if (d === 0) return [];
    const out: Cue[] = [];
    const pp = this.move.pingpong > 0.35;
    for (const c of this.cues) {
      let hit: boolean;
      if (Math.abs(d) < 0.5) hit = d > 0 ? c.u > u0 && c.u <= u1 : pp && c.u >= u1 && c.u < u0;
      else if (d < 0) hit = c.u > u0 || c.u <= u1; // 正向換圈
      else hit = false;
      if (hit) out.push(c);
    }
    return out;
  }

  /** 在 [0, seconds) 內所有提示點的觸發時間（離線混音用） */
  timeline(seconds: number, step = 1 / 480): { t: number; cue: Cue }[] {
    const out: { t: number; cue: Cue }[] = [];
    let prev = this.u(0);
    for (let t = step; t < seconds; t += step) {
      const cur = this.u(t);
      for (const c of this.scan(prev, cur)) out.push({ t, cue: c });
      prev = cur;
    }
    return out;
  }
}
