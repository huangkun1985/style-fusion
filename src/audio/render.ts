// 渲染調度：依聲音方案把同一首歌交給不同的合成器。
import { renderChip, type RenderOpts } from './chip';
import type { Stereo } from './dsp';
import type { SchemeId, Song } from './types';

export type { RenderOpts };
export const chipEnabled = true;

export const SCHEME_INFO: Record<SchemeId, { name: string; tag: string; desc: string }> = {
  nes: { name: '8-bit NES', tag: '脈衝＋三角＋噪音', desc: '紅白機的四個聲道：兩條脈衝波、一條三角波低音和噪音鼓，和弦以快速琶音模擬。' },
  gb: { name: 'Game Boy', tag: '脈衝＋波形表', desc: '掌機的脈衝波與 4-bit 波形表低音，聲音偏窄偏顆粒。' },
  sid: { name: 'C64 SID', tag: 'PWM＋濾波器', desc: '脈衝寬度調變、鋸齒波與會掃動的低通濾波器，帶有類比的呼吸感。' },
  fm: { name: 'Mega Drive FM', tag: 'FM 合成', desc: '調頻合成的貝斯、銅管與電鋼琴，90 年代主機的金屬光澤。' },
  midi: { name: 'MIDI（真實樂器）', tag: '取樣樂器 + General MIDI', desc: '用真實錄音的取樣樂器（鋼琴、吉他、弦樂、銅管、木管、電鋼琴、打擊樂…）依 General MIDI 音色編號演奏；沒有取樣的音色（合成器、人聲）才用程式合成。可導出標準 .mid。' },
  xm: { name: 'XM 追蹤器', tag: '16 位元取樣 + 音軌', desc: '把同一批真實取樣放進 FastTracker II 的樂器格式（多音區、持續音循環、音量包絡），再用音軌與追蹤器效果（琶音、顫音、延遲）演奏。可導出 .xm，用 OpenMPT 等開啟。' },
};

export async function renderScheme(song: Song, scheme: SchemeId, opts: RenderOpts): Promise<Stereo> {
  switch (scheme) {
    case 'nes':
    case 'gb':
    case 'sid':
    case 'fm':
      return renderChip(song, scheme, opts);
    case 'midi': {
      const m = await import('./gm');
      return m.renderGm(song, opts);
    }
    case 'xm': {
      const m = await import('./xm');
      return m.renderXm(song, opts);
    }
  }
}
