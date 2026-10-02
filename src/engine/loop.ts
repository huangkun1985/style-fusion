import type { Move, Tune } from './types';

/** 一個動畫循環的秒數（受整體速度與循環長度影響） */
export function loopSeconds(sub: { loop: number }, move: Pick<Move, 'speed'>, tune: Pick<Tune, 'loopMul'>) {
  return (sub.loop * tune.loopMul) / Math.max(0.1, move.speed);
}
