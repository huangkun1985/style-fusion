// 窄畫面（直式 9:16、手機的「填滿」）的收合：設計是照橫式畫的，左右需要 need 單位（半寬）才放得下；
// 畫面不夠寬時回傳一個 < 1 的縮放比例，讓整組畫面（含襯景）以中心縮小。寬畫面一律是 1，外觀完全不變。
import type { Env } from '../../env';

export function narrowFit(env: Pick<Env, 'Wu'>, need: number, margin = 8): number {
  return Math.min(1, Math.max(0.3, (env.Wu / 2 - margin) / need));
}
