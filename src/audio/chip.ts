// 晶片方案：NES（脈衝＋三角＋噪音）、Game Boy（脈衝＋波形表＋噪音）、C64 SID（PWM＋濾波器）、Mega Drive（FM）。
// 全部用程式逐樣本合成；和弦在 NES／GB／SID 以快速琶音模擬（單聲道晶片的老招）。
import { clamp } from '../engine/util';
import { DRUM_NOTE } from './genres';
import { Noise, Svf, adsr, foldTail, freeverb, master, newStereo, noteSpan, onePoleLP, panGains, quant, removeMean, yieldNow, type Stereo } from './dsp';
import { mtof } from './theory';
import type { NoteEv, Song, Track, TrackRole } from './types';

export type ChipScheme = 'nes' | 'gb' | 'sid' | 'fm';
type Wave = 'pulse' | 'tri' | 'saw' | 'sine' | 'wave4' | 'fm';

interface Voice {
  wave: Wave;
  duty?: number;
  pwm?: [number, number];
  env: [number, number, number, number];
  steps?: number;
  vib?: [number, number, number];
  fm?: { ratio: number; index: number; decay: number; fb?: number };
  lp?: { fc: number; q: number; amt: number };
  gain: number;
  /** 和弦以琶音方式演奏 */
  arp?: boolean;
  /** 多聲部疊加時的失諧（比例） */
  detune?: number;
  pan?: number;
}

/** PolyBLEP：抵銷不連續點的混疊 */
function blep(t: number, dt: number): number {
  if (t < dt) {
    const x = t / dt;
    return x + x - x * x - 1;
  }
  if (t > 1 - dt) {
    const x = (t - 1) / dt;
    return x * x + x + x + 1;
  }
  return 0;
}

const GB_WAVE = Array.from({ length: 32 }, (_, i) => Math.round(7.5 + 6 * Math.sin((2 * Math.PI * i) / 32) + 1.5 * Math.sin((4 * Math.PI * i) / 32)));

const TABLE: Record<ChipScheme, Partial<Record<TrackRole, Voice>>> = {
  nes: {
    lead: { wave: 'pulse', duty: 0.5, env: [0.003, 0.14, 0.72, 0.06], steps: 15, vib: [0.14, 0.28, 6], gain: 0.85 },
    counter: { wave: 'pulse', duty: 0.25, env: [0.003, 0.1, 0.6, 0.05], steps: 15, vib: [0.14, 0.2, 6], gain: 0.5 },
    arp: { wave: 'pulse', duty: 0.125, env: [0.002, 0.07, 0.45, 0.03], steps: 15, gain: 0.5 },
    bass: { wave: 'tri', env: [0.002, 0, 1, 0.02], gain: 1 },
    pad: { wave: 'pulse', duty: 0.25, env: [0.006, 0.3, 0.42, 0.1], steps: 15, arp: true, gain: 0.3 },
    chord: { wave: 'pulse', duty: 0.25, env: [0.004, 0.12, 0.35, 0.05], steps: 15, arp: true, gain: 0.34 },
  },
  gb: {
    lead: { wave: 'pulse', duty: 0.5, env: [0.003, 0.12, 0.75, 0.05], steps: 15, vib: [0.16, 0.22, 5.5], gain: 0.8 },
    counter: { wave: 'pulse', duty: 0.25, env: [0.003, 0.1, 0.6, 0.05], steps: 15, gain: 0.5 },
    arp: { wave: 'pulse', duty: 0.125, env: [0.002, 0.07, 0.45, 0.03], steps: 15, gain: 0.5 },
    bass: { wave: 'wave4', env: [0.002, 0, 1, 0.03], gain: 1 },
    pad: { wave: 'pulse', duty: 0.25, env: [0.006, 0.3, 0.42, 0.1], steps: 15, arp: true, gain: 0.3 },
    chord: { wave: 'pulse', duty: 0.5, env: [0.004, 0.12, 0.35, 0.05], steps: 15, arp: true, gain: 0.32 },
  },
  sid: {
    lead: { wave: 'saw', env: [0.004, 0.18, 0.62, 0.1], vib: [0.14, 0.3, 5.5], lp: { fc: 2600, q: 2.4, amt: 1.6 }, gain: 0.7 },
    counter: { wave: 'pulse', duty: 0.5, pwm: [0.6, 0.3], env: [0.004, 0.14, 0.55, 0.08], lp: { fc: 2200, q: 1.5, amt: 0.8 }, gain: 0.5 },
    arp: { wave: 'tri', env: [0.002, 0.08, 0.4, 0.04], gain: 0.62 },
    bass: { wave: 'pulse', duty: 0.5, pwm: [0.4, 0.35], env: [0.002, 0.22, 0.55, 0.05], lp: { fc: 900, q: 2.2, amt: 1.8 }, gain: 0.9 },
    pad: { wave: 'saw', env: [0.02, 0.4, 0.5, 0.15], arp: true, lp: { fc: 1800, q: 1.2, amt: 0.5 }, gain: 0.3 },
    chord: { wave: 'pulse', duty: 0.35, pwm: [0.5, 0.25], env: [0.004, 0.15, 0.4, 0.06], arp: true, lp: { fc: 2000, q: 1.4, amt: 0.8 }, gain: 0.34 },
  },
  fm: {
    lead: { wave: 'fm', fm: { ratio: 1, index: 2.2, decay: 0.45 }, env: [0.004, 0.25, 0.65, 0.09], vib: [0.18, 0.3, 5.5], gain: 0.7 },
    counter: { wave: 'fm', fm: { ratio: 3, index: 1.4, decay: 0.25 }, env: [0.004, 0.2, 0.5, 0.08], gain: 0.45 },
    arp: { wave: 'fm', fm: { ratio: 2, index: 1.3, decay: 0.2 }, env: [0.002, 0.14, 0.35, 0.06], gain: 0.55 },
    bass: { wave: 'fm', fm: { ratio: 1, index: 3.2, decay: 0.13, fb: 0.4 }, env: [0.002, 0.2, 0.6, 0.05], gain: 0.9 },
    pad: { wave: 'fm', fm: { ratio: 1, index: 0.8, decay: 1.5 }, env: [0.18, 0.4, 0.8, 0.35], detune: 0.006, gain: 0.34 },
    chord: { wave: 'fm', fm: { ratio: 14, index: 0.9, decay: 0.12 }, env: [0.003, 0.35, 0.3, 0.12], gain: 0.5 },
  },
};

const MIX: Record<ChipScheme, { lp: number; rev: number; room: number }> = {
  nes: { lp: 13000, rev: 0.0, room: 0.5 },
  gb: { lp: 9000, rev: 0.0, room: 0.5 },
  sid: { lp: 15000, rev: 0.1, room: 0.55 },
  fm: { lp: 16000, rev: 0.16, room: 0.65 },
};

// ---------- 音符 → 緩衝 ----------
interface Group {
  t: number;
  dur: number;
  pitches: number[];
  vel: number;
}

function groupNotes(notes: NoteEv[]): Group[] {
  const map = new Map<string, Group>();
  for (const n of notes) {
    const k = `${n.t.toFixed(3)}|${n.dur.toFixed(3)}`;
    const g = map.get(k);
    if (g) {
      g.pitches.push(n.pitch);
      g.vel = Math.max(g.vel, n.vel);
    } else map.set(k, { t: n.t, dur: n.dur, pitches: [n.pitch], vel: n.vel });
  }
  return [...map.values()].sort((a, b) => a.t - b.t);
}

function renderVoice(buf: Float32Array, sr: number, start: number, durSec: number, pitches: number[], vel: number, v: Voice, scheme: ChipScheme, seed: number) {
  const rel = v.env[3];
  const total = Math.min(buf.length - start, Math.ceil((durSec + rel) * sr));
  if (total <= 0) return;
  const [ea, ed, es] = v.env;
  const filt = v.lp ? new Svf(sr) : null;
  const detunes = v.detune ? [1 - v.detune, 1, 1 + v.detune] : [1];
  const poly = !v.arp && pitches.length > 1;
  const freqs = pitches.map(mtof);
  const phase = new Float64Array(detunes.length * Math.max(1, poly ? freqs.length : 1));
  const phase2 = new Float64Array(phase.length);
  void seed;
  let fbPrev = 0;
  for (let i = 0; i < total; i++) {
    const t = i / sr;
    let e = adsr(t, durSec, ea, ed, es, rel);
    if (v.steps) e = quant(e * vel, v.steps) / Math.max(vel, 1e-6);
    // 琶音：每 20 ms 換下一個音（約 50 Hz）
    const arpIdx = v.arp && freqs.length > 1 ? Math.floor(t * 50) % freqs.length : 0;
    let vibMul = 1;
    if (v.vib && t > v.vib[0]) vibMul = Math.pow(2, ((v.vib[1] / 12) * Math.sin(2 * Math.PI * v.vib[2] * (t - v.vib[0]))));
    let y = 0;
    const nVoices = poly ? freqs.length : 1;
    for (let vi = 0; vi < nVoices; vi++) {
      const f0 = (poly ? freqs[vi] : freqs[arpIdx]) * vibMul;
      for (let di = 0; di < detunes.length; di++) {
        const idx = vi * detunes.length + di;
        const f = f0 * detunes[di];
        phase[idx] += f / sr;
        if (phase[idx] >= 1) phase[idx] -= 1;
        const ph = phase[idx];
        switch (v.wave) {
          case 'pulse': {
            let duty = v.duty ?? 0.5;
            if (v.pwm) duty = clamp(duty + v.pwm[1] * 0.5 * Math.sin(2 * Math.PI * v.pwm[0] * t), 0.08, 0.92);
            const dt = f / sr;
            let w = ph < duty ? 1 : -1;
            w += blep(ph, dt) - blep(ph >= duty ? ph - duty : ph - duty + 1, dt);
            y += w;
            break;
          }
          case 'tri': {
            let w = 4 * Math.abs(ph - 0.5) - 1;
            if (scheme === 'nes') w = Math.round(((w + 1) / 2) * 15) / 7.5 - 1;
            y += w;
            break;
          }
          case 'saw':
            y += 2 * ph - 1 - blep(ph, f / sr);
            break;
          case 'sine':
            y += Math.sin(2 * Math.PI * ph);
            break;
          case 'wave4': {
            const s = GB_WAVE[Math.floor(ph * 32) & 31];
            y += s / 7.5 - 1;
            break;
          }
          case 'fm': {
            const fmv = v.fm!;
            phase2[idx] += (f * fmv.ratio) / sr;
            if (phase2[idx] >= 1) phase2[idx] -= 1;
            const idxEnv = fmv.index * Math.exp(-t / Math.max(0.02, fmv.decay)) + fmv.index * 0.12;
            const mod = Math.sin(2 * Math.PI * phase2[idx] + (fmv.fb ?? 0) * fbPrev);
            fbPrev = mod;
            y += Math.sin(2 * Math.PI * ph + idxEnv * mod);
            break;
          }
        }
      }
    }
    y /= nVoices * detunes.length;
    if (filt) {
      if ((i & 7) === 0) filt.set(v.lp!.fc * (1 + v.lp!.amt * Math.exp(-t / 0.18)), v.lp!.q);
      y = filt.lp(y);
    }
    buf[start + i] += y * e * vel * v.gain * 0.5;
  }
}

// ---------- 鼓 ----------
function renderDrum(buf: Float32Array, sr: number, start: number, gm: number, vel: number, scheme: ChipScheme, noise: Noise) {
  const out = (len: number, fn: (t: number, i: number) => number) => {
    const n = Math.min(buf.length - start, Math.ceil(len * sr));
    for (let i = 0; i < n; i++) buf[start + i] += fn(i / sr, i) * vel;
  };
  const lfsrNoise = scheme === 'nes' || scheme === 'gb';
  // LFSR 噪音：以固定時脈取樣保持，聽起來是粗糙的「顆粒」
  const mkNoise = (clock: number, short = false) => {
    let reg = 0x7fff;
    let acc = 0;
    let bit = 1;
    return () => {
      if (!lfsrNoise) return noise.next();
      acc += clock / sr;
      while (acc >= 1) {
        acc -= 1;
        const x = (reg ^ (reg >> (short ? 6 : 1))) & 1;
        reg = (reg >> 1) | (x << 14);
        bit = reg & 1 ? 1 : -1;
      }
      return bit;
    };
  };
  const sweep = (f0: number, f1: number, tau: number) => {
    let ph = 0;
    return (t: number) => {
      const f = f1 + (f0 - f1) * Math.exp(-t / tau);
      ph += f / sr;
      return ph;
    };
  };
  const tone = scheme === 'nes' ? (p: number) => 4 * Math.abs((p % 1) - 0.5) - 1 : (p: number) => Math.sin(2 * Math.PI * p);
  switch (gm) {
    case 35:
    case 36: {
      const s = sweep(170, 45, 0.035);
      const nz = mkNoise(2000);
      out(0.22, (t) => tone(s(t)) * Math.exp(-t / 0.085) * 1.1 + nz() * Math.exp(-t / 0.004) * 0.3);
      break;
    }
    case 38:
    case 40: {
      const s = sweep(240, 170, 0.03);
      const nz = mkNoise(scheme === 'gb' ? 6000 : 9000);
      out(0.2, (t) => nz() * Math.exp(-t / 0.06) * 0.7 + tone(s(t)) * Math.exp(-t / 0.04) * 0.5);
      break;
    }
    case 37:
    case 76: {
      let ph = 0;
      out(0.06, (t) => {
        ph += (gm === 37 ? 1750 : 1180) / sr;
        return (ph % 1 < 0.5 ? 1 : -1) * Math.exp(-t / 0.012) * 0.45;
      });
      break;
    }
    case 39: {
      const nz = mkNoise(12000);
      out(0.2, (t) => nz() * (Math.exp(-((t % 0.012)) / 0.004) * (t < 0.036 ? 1 : 0) + Math.exp(-t / 0.07) * 0.5) * 0.6);
      break;
    }
    case 42:
    case 44: {
      const nz = mkNoise(scheme === 'gb' ? 16000 : 22000);
      let prev = 0;
      out(0.05, (t) => {
        const x = nz();
        const hp = x - prev * 0.6;
        prev = x;
        return hp * Math.exp(-t / 0.011) * 0.42;
      });
      break;
    }
    case 46: {
      const nz = mkNoise(scheme === 'gb' ? 14000 : 22000);
      let prev = 0;
      out(0.3, (t) => {
        const x = nz();
        const hp = x - prev * 0.6;
        prev = x;
        return hp * Math.exp(-t / 0.09) * 0.38;
      });
      break;
    }
    case 41:
    case 43:
    case 45:
    case 47:
    case 48:
    case 50: {
      const f = 80 + (gm - 41) * 22;
      const s = sweep(f * 1.5, f, 0.05);
      out(0.3, (t) => tone(s(t)) * Math.exp(-t / 0.1) * 0.9);
      break;
    }
    case 49:
    case 57: {
      const nz = mkNoise(20000);
      let prev = 0;
      out(0.9, (t) => {
        const x = nz();
        const hp = x - prev * 0.5;
        prev = x;
        return hp * Math.exp(-t / 0.3) * 0.34;
      });
      break;
    }
    case 51:
    case 59: {
      let p1 = 0;
      let p2 = 0;
      const nz = mkNoise(22000);
      out(0.5, (t) => {
        p1 += 4100 / sr;
        p2 += 5600 / sr;
        return ((p1 % 1 < 0.5 ? 1 : -1) * 0.12 + (p2 % 1 < 0.5 ? 1 : -1) * 0.1 + nz() * 0.18) * Math.exp(-t / 0.12);
      });
      break;
    }
    case 54:
    case 70: {
      const nz = mkNoise(20000);
      out(0.1, (t) => nz() * Math.exp(-t / 0.025) * 0.32);
      break;
    }
    case 56: {
      let p1 = 0;
      let p2 = 0;
      out(0.25, (t) => {
        p1 += 560 / sr;
        p2 += 845 / sr;
        return ((p1 % 1 < 0.5 ? 1 : -1) + (p2 % 1 < 0.5 ? 1 : -1)) * 0.22 * Math.exp(-t / 0.07);
      });
      break;
    }
    case 81: {
      let ph = 0;
      out(0.5, (t) => {
        ph += 3400 / sr;
        return Math.sin(2 * Math.PI * ph) * Math.exp(-t / 0.18) * 0.3;
      });
      break;
    }
    default: {
      const nz = mkNoise(8000);
      out(0.1, (t) => nz() * Math.exp(-t / 0.03) * 0.3);
    }
  }
}

// ---------- 主渲染 ----------
export interface RenderOpts {
  sr: number;
  seed?: number;
  /** 每軌渲染完讓出事件迴圈 */
  yieldEvery?: boolean;
  /** 除錯用：不做母帶標準化，輸出原始混音（用來比較各軌音量） */
  raw?: boolean;
}

export async function renderChip(song: Song, scheme: ChipScheme, opts: RenderOpts): Promise<Stereo> {
  const sr = opts.sr;
  const n = Math.round(song.seconds * sr);
  const tail = Math.round(2.4 * sr);
  const mix = newStereo(n + tail);
  const noise = new Noise((opts.seed ?? 1) * 2654435761);
  const table = TABLE[scheme];
  for (const tr of song.tracks) {
    const [gl, gr] = panGains(tr.pan);
    const buf = new Float32Array(n + tail);
    if (tr.drum) {
      for (const nt of tr.notes) {
        const [s0] = noteSpan(song, nt);
        renderDrum(buf, sr, Math.round(s0 * sr), nt.pitch, nt.vel, scheme, noise);
      }
    } else {
      const v = table[tr.role] ?? table.lead!;
      const groups = v.arp || tr.role === 'pad' || tr.role === 'chord' ? groupNotes(tr.notes) : tr.notes.map((x) => ({ t: x.t, dur: x.dur, pitches: [x.pitch], vel: x.vel }));
      for (const g of groups) {
        const [s0, s1] = noteSpan(song, { t: g.t, dur: g.dur, pitch: 0, vel: 0 });
        renderVoice(buf, sr, Math.round(s0 * sr), s1 - s0, g.pitches, g.vel, v, scheme, 0);
      }
    }
    const gain = tr.gain * (tr.drum ? 0.9 : 1);
    for (let i = 0; i < buf.length; i++) {
      mix.l[i] += buf[i] * gain * gl;
      mix.r[i] += buf[i] * gain * gr;
    }
    if (opts.yieldEvery) await yieldNow();
  }
  const m = MIX[scheme];
  if (m.rev > 0) {
    const rv = freeverb(mix.l, mix.r, sr, { room: m.room, wet: m.rev, damp: 0.4 });
    for (let i = 0; i < mix.l.length; i++) {
      mix.l[i] += rv.l[i] * 6;
      mix.r[i] += rv.r[i] * 6;
    }
  }
  onePoleLP(mix.l, m.lp, sr);
  onePoleLP(mix.r, m.lp, sr);
  const out = foldTail(mix, n);
  removeMean(out.l);
  removeMean(out.r);
  master(out, 0.12);
  return out;
}

export { DRUM_NOTE };
export type { Track };
