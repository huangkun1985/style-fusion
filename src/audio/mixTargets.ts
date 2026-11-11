// 自動產生（scripts/mix-targets.ts）：精修混音時各聲部「有聲部分」的目標響度（dB）。
// 取樣包、音色模型、ROLE_MIX 或效果鏈改了就重跑：npx tsx scripts/mix-targets.ts
import type { TrackRole } from './types';

export const MIX_TARGET: Record<TrackRole, number> = { lead: -21.4, counter: -29.4, arp: -31.6, chord: -24.2, pad: -29.2, bass: -22.9, perc: -22.9 };
