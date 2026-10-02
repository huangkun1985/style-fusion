// 離線混音：把 BGM 循環與動畫提示點的音效混成一段音訊，供導出 WAV／影片使用。
import { CueTracker } from './cues';
import { newStereo, softLimit, type Stereo } from './dsp';
import { synthSfx } from './sfx';
import type { PackId } from './types';

export interface MixdownOpts {
  seconds: number;
  sr: number;
  bgm: Stereo | null;
  bgmVol: number;
  tracker: CueTracker | null;
  pack: PackId | null;
  sfxVol: number;
}

export function mixdown(o: MixdownOpts): Stereo {
  const n = Math.round(o.seconds * o.sr);
  const out = newStereo(n);
  if (o.bgm && o.bgmVol > 0) {
    const len = o.bgm.l.length;
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
        b = synthSfx(o.pack!, cue.kind, o.sr, variant);
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
