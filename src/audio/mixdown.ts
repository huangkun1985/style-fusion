// 離線混音：把 BGM 循環與動畫提示點的音效混成一段音訊，供導出 WAV／影片使用。
import type { SfxSource } from './cues';
import { newStereo, softLimit, type Stereo } from './dsp';
import { levelMatched, realSfx } from './realSfx';
import { synthSfx } from './sfx';
import type { PackId } from './types';

export interface MixdownOpts {
  seconds: number;
  sr: number;
  bgm: Stereo | null;
  bgmVol: number;
  tracker: SfxSource | null;
  pack: PackId | null;
  sfxVol: number;
  /** false＝音樂不循環（有收尾的配樂、整支片子）：放完就停，最後 40 毫秒淡出 */
  loop?: boolean;
}

export function mixdown(o: MixdownOpts): Stereo {
  const n = Math.round(o.seconds * o.sr);
  const out = newStereo(n);
  if (o.bgm && o.bgmVol > 0) {
    const len = o.bgm.l.length;
    if (o.loop === false) {
      const m = Math.min(n, len);
      for (let i = 0; i < m; i++) {
        out.l[i] += o.bgm.l[i] * o.bgmVol;
        out.r[i] += o.bgm.r[i] * o.bgmVol;
      }
      const fade = Math.min(m, Math.round(o.sr * 0.04));
      for (let i = 0; i < fade; i++) {
        const g = i / fade;
        out.l[m - 1 - i] *= g;
        out.r[m - 1 - i] *= g;
      }
    } else
      for (let i = 0; i < n; i++) {
        const j = i % len;
        out.l[i] += o.bgm.l[j] * o.bgmVol;
        out.r[i] += o.bgm.r[j] * o.bgmVol;
      }
  }
  if (o.tracker && o.pack && o.sfxVol > 0) {
    const cache = new Map<string, Float32Array>();
    const hits = o.tracker.timeline(o.seconds);
    hits.forEach(({ t, cue }, idx) => {
      const variant = idx % 2;
      const key = `${cue.kind}|${variant}`;
      let b = cache.get(key);
      if (!b) {
        // 換成真實錄音的種類用錄音（2.0 β）；其他照舊用程式合成
        const real = realSfx(cue.kind);
        b = real ? levelMatched(real, synthSfx(o.pack!, cue.kind, o.sr, 0), `${o.pack}|${cue.kind}`) : synthSfx(o.pack!, cue.kind, o.sr, variant);
        cache.set(key, b);
      }
      const start = Math.round(t * o.sr);
      const g = cue.k * o.sfxVol * 0.8;
      for (let i = 0; i < b.length && start + i < n; i++) {
        out.l[start + i] += b[i] * g;
        out.r[start + i] += b[i] * g;
      }
    });
  }
  softLimit(out.l);
  softLimit(out.r);
  return out;
}
