// 主體：音樂視覺化（新主體；筆記見 docs/主體v2參考/music.md）。
// 新技術：畫面直接讀 App 自己作的那首歌（分軌音符、和弦、速度），不是頻譜分析——音符什麼時候響、多大聲、多高，畫面就怎麼動。
// 第五版（審美）：一張會發聲的膜——四十圈髮絲般的同心細線（像唱片的音軌、也像喇叭的振膜），真的透視、遠處沒入霧中。
//   照真實的物理：大鼓從中心推出一道波傳過整張膜；每個音在它那個聲部的頻帶、它音名的角度（12 點鐘是 C）隆起一個光峰並盪開漣漪；
//   低音在它的頻帶形成駐波（音越高波峰越多）；和弦、鋪底讓頻帶緩緩抬升；小鼓激起外圈細碎的顫動；踩鈸讓外緣微微閃爍。
// 克制：只有一種光（帶一點主色的暖白細線）＋一個強調色（只在隆起處）；排版是雜誌式的——細字曲名、精簡的聲部圖例、大號細體的目前和弦。
// 畫面時間＝音樂時間（時鐘秒數取餘整首長度，和音訊引擎播放 BGM 的算法一樣）再減去喇叭的輸出延遲，所以畫面與聲音同拍。
// 自帶環境：深色的空氣與膜後方的地平線光；剪影風格用風格自己的夕陽底、線是純墨色；線稿風格只畫線。
import { composeSong, stepToSec } from '../../audio/compose';
import { NOTE_NAMES, type Song, type TrackRole } from '../../audio/types';
import { darken, luma, mix, rgba } from '../color';
import type { Env } from '../env';
import { audioLatency, getLiveSong } from '../liveSong';
import { TAU, clamp, hash, lerp, smooth } from '../util';
import type { Subject } from './types';

const LOOP = 8;

// ════ 歌曲分析（每首歌只算一次）
interface NoteS {
  s: number; // 起點（秒）
  e: number; // 終點（秒）
  p: number;
  v: number;
}
type Kind = 'wheel' | 'seq' | 'band' | 'wave' | 'drums';
interface Lane {
  role: TrackRole;
  kind: Kind;
  label: string;
  notes: NoteS[];
  /** 鼓：拆成大鼓、小鼓、踩鈸、銅鈸、中鼓 */
  kick?: NoteS[];
  snare?: NoteS[];
  hat?: NoteS[];
  cym?: NoteS[];
  tom?: NoteS[];
}
interface Ana {
  song: Song;
  sec: number;
  lanes: Lane[];
  lead: Lane | null;
  pmin: number;
  pmax: number;
  name: string;
  sub: string;
}
const ORDER: TrackRole[] = ['lead', 'counter', 'arp', 'chord', 'pad', 'bass', 'perc'];
const KIND: Record<TrackRole, Kind> = { lead: 'wheel', counter: 'wheel', arp: 'seq', chord: 'band', pad: 'band', bass: 'wave', perc: 'drums' };
const LABEL: Record<TrackRole, string> = { lead: 'MELODY', counter: 'COUNTER', arp: 'ARPEGGIO', chord: 'CHORDS', pad: 'PAD', bass: 'BASS', perc: 'DRUMS' };

const cache = new WeakMap<Song, Ana>();
let fallback: Song | null = null;

function analyse(song: Song): Ana {
  const hit = cache.get(song);
  if (hit) return hit;
  const sec = song.seconds;
  const conv = (n: { t: number; dur: number; pitch: number; vel: number }): NoteS => {
    const s = stepToSec(song, n.t);
    const e = Math.max(s + 0.04, stepToSec(song, n.t + n.dur));
    return { s, e, p: n.pitch, v: clamp(n.vel > 1 ? n.vel / 127 : n.vel, 0.05, 1) };
  };
  const byRole = new Map<TrackRole, NoteS[]>();
  for (const t of song.tracks) {
    const role: TrackRole = t.drum ? 'perc' : t.role;
    const arr = byRole.get(role) ?? [];
    for (const n of t.notes) arr.push(conv(n));
    byRole.set(role, arr);
  }
  const lanes: Lane[] = [];
  for (const role of ORDER) {
    const notes = byRole.get(role);
    if (!notes || !notes.length) continue;
    notes.sort((a, b) => a.s - b.s);
    const lane: Lane = { role, kind: KIND[role], label: LABEL[role], notes };
    if (role === 'perc') {
      lane.kick = notes.filter((n) => n.p === 35 || n.p === 36);
      lane.snare = notes.filter((n) => n.p >= 37 && n.p <= 40);
      lane.hat = notes.filter((n) => n.p === 42 || n.p === 44 || n.p === 46 || n.p >= 69);
      lane.cym = notes.filter((n) => n.p === 49 || n.p === 51 || n.p === 52 || n.p === 53 || n.p === 55 || n.p === 57 || n.p === 59);
      lane.tom = notes.filter((n) => n.p === 41 || n.p === 43 || n.p === 45 || n.p === 47 || n.p === 48 || n.p === 50);
    }
    lanes.push(lane);
  }
  const lead = lanes.find((l) => l.role === 'lead') ?? lanes.find((l) => l.kind === 'wheel') ?? null;
  const lp = lead ? lead.notes.map((n) => n.p) : [60, 72];
  const parts = song.title.split(' · ');
  const meter = `${song.meter}/4`;
  const ana: Ana = {
    song,
    sec,
    lanes,
    lead,
    pmin: Math.min(...lp),
    pmax: Math.max(...lp),
    name: parts[0] ?? song.title,
    sub: [parts[1], `${Math.round(song.bpm)} BPM`, meter].filter(Boolean).join('  ·  '),
  };
  cache.set(song, ana);
  return ana;
}
function currentSong(): Song {
  const s = getLiveSong();
  if (s) return s;
  if (!fallback) fallback = composeSong({ genre: 'synthwave', seed: 3, animSeconds: LOOP, sync: true, tempo: 1, key: -1 });
  return fallback;
}

/** 距離音符起點的秒數（循環：在整首的頭尾接得起來） */
const since = (t: number, s: number, sec: number) => (((t - s) % sec) + sec) % sec;
/**
 * 包絡（0..1）：照樂器的發聲方式——起音 A 秒、持續中以 D 的速度衰減、放開後以 R 秒衰減。
 * 同時響的音取最大值。
 */
function envOf(notes: NoteS[] | undefined, t: number, sec: number, A: number, D: number, R: number): number {
  if (!notes) return 0;
  let m = 0;
  for (const n of notes) {
    const dt = since(t, n.s, sec);
    const d = n.e - n.s;
    let a: number;
    if (dt < d) a = Math.min(1, dt / A) * Math.exp(-dt * D);
    else {
      const rel = dt - d;
      if (rel > R * 6) continue;
      a = Math.min(1, d / A) * Math.exp(-d * D) * Math.exp(-rel / R);
    }
    a *= n.v;
    if (a > m) m = a;
  }
  return m;
}
/** 單一音符的包絡（envOf 的單音版；輻射頻譜逐音高取最大值用） */
function envNote(n: NoteS, t: number, sec: number, A: number, D: number, R: number): number {
  const dt = since(t, n.s, sec);
  const d = n.e - n.s;
  if (dt < d) return Math.min(1, dt / A) * Math.exp(-dt * D) * n.v;
  const rel = dt - d;
  if (rel > R * 6) return 0;
  return Math.min(1, d / A) * Math.exp(-d * D) * Math.exp(-rel / R) * n.v;
}
/** 各聲部的起音 A／持續衰減 D／釋放 R（秒）：照樂器的發聲方式 */
const ADR: Record<TrackRole, [number, number, number]> = {
  lead: [0.02, 0.5, 0.18],
  counter: [0.02, 0.5, 0.18],
  arp: [0.005, 3, 0.1],
  chord: [0.015, 1.4, 0.22],
  pad: [0.45, 0.05, 0.7],
  bass: [0.01, 1.2, 0.12],
  perc: [0.004, 8, 0.1],
};
/** 擊打：起音瞬間全亮、只看衰減（鼓，以及每個音的「落鍵」那一下） */
function hitOf(notes: NoteS[] | undefined, t: number, sec: number, R: number): number {
  if (!notes) return 0;
  let m = 0;
  for (const n of notes) {
    const dt = since(t, n.s, sec);
    if (dt > R * 6) continue;
    const a = Math.exp(-dt / R) * n.v; // 起音是瞬間的：落下那一刻就是最亮
    if (a > m) m = a;
  }
  return m;
}
/** 最近開始的音與它前一個音（音高輪的滑動用） */
function recent(notes: NoteS[], t: number, sec: number): [NoteS | null, NoteS | null, number] {
  let best: NoteS | null = null;
  let bestDt = Infinity;
  let prev: NoteS | null = null;
  let prevDt = Infinity;
  for (const n of notes) {
    const dt = since(t, n.s, sec);
    if (dt < bestDt) {
      prev = best;
      prevDt = bestDt;
      best = n;
      bestDt = dt;
    } else if (dt < prevDt) {
      prev = n;
      prevDt = dt;
    }
  }
  return [best, prev, bestDt];
}
const noteName = (p: number) => `${NOTE_NAMES[((p % 12) + 12) % 12]}${Math.floor(p / 12) - 1}`;
/** 音名 → 角度（12 點鐘方向是 C，順時針） */
const pcAngle = (p: number) => -Math.PI / 2 + ((((p % 12) + 12) % 12) / 12) * TAU;

/**
 * 版面：膜的中心與半徑、圖例欄、左上標題、右下和弦字。
 * 橫式：膜在左、圖例在右上、和弦字在右下；直式與方形：膜在上、圖例兩欄與和弦字在下。
 */
function layout(env: Env) {
  const r = env.Wu / env.Hu;
  const m = r < 1 ? 22 : 30;
  const x0 = -env.Wu / 2 + m;
  const x1 = env.Wu / 2 - m;
  const top = -env.Hu / 2 + m;
  const bot = env.Hu / 2 - m;
  if (r < 1.5) {
    const R = Math.min(env.Wu * 0.46, env.Hu * (r < 1 ? 0.34 : 0.4));
    const cy = top + (r < 1 ? 70 : 52) + R * 0.42;
    return { tall: true, R, cx: 0, cy, x0, x1, top, bot, gx: x0, gy: cy + R * 0.62 + 26 };
  }
  const R = Math.min(env.Wu * 0.33, env.Hu * 0.9);
  return { tall: false, R, cx: -env.Wu * 0.12, cy: env.Hu * 0.08, x0, x1, top, bot, gx: x1 - 128, gy: top + 26 };
}

export const music: Subject = {
  id: 'music',
  name: '音樂視覺化',
  en: 'Music Visualizer',
  desc: '一張會發聲的膜：四十圈髮絲般的同心細線組成的振膜，跟著 App 自己作的配樂起伏——大鼓從中心推出一道波、每個音在它的頻帶與音名位置隆起光峰並盪開漣漪、低音在它的頻帶形成駐波、和弦與鋪底讓頻帶緩緩抬升、小鼓激起外圈的細碎顫動；暖白的細線、只有隆起處亮成強調色，遠處沒入霧中。旁邊是精簡的聲部圖例與目前的和弦。',
  loop: LOOP,
  key: 0.5,
  hero: 0.5,
  events: () => [],
  cues: () => [],
  track(_M, env) {
    const L = layout(env);
    return [L.cx, L.cy];
  },
  draw(S, M, env) {
    const pal = S.pal;
    const det = S.look.detail;
    const ctx = S.ctx;
    const baseA = S.alpha;
    const A = analyse(currentSong());
    const song = A.song;
    const sec = A.sec;
    // 畫面時間＝音樂時間（和音訊引擎的 BGM 對齊方式一樣：時鐘秒數取餘整首長度），再減去喇叭的輸出延遲
    const tm = (((M.tStep - audioLatency()) % sec) + sec) % sec;
    const L = layout(env);
    const { cx } = L;
    let R = L.R;
    // 直式／方形：鏡頭從更高的角度俯看（膜在畫面上更高），膜＋圖例＋和弦三塊依實際高度一起垂直置中；放不下大號和弦字就不畫
    const PHI0 = L.tall ? 0.62 : 0.4;
    let cy = L.cy;
    let gy = L.gy;
    let chordY = L.bot - 4;
    let showChord = true;
    if (L.tall) {
      const rows = Math.ceil(A.lanes.length / 2);
      const legendH = rows * 24;
      const chordH = 70;
      const avail = L.bot - (L.top + 52);
      // 放不下（方形、聲部多）就把膜縮小到剛好放得進去
      const perR = Math.sin(PHI0) * 2 + 0.28;
      R = Math.min(R, Math.max(L.R * 0.55, (avail - 30 - legendH - 22) / perR));
      const memH = R * perR;
      showChord = memH + 30 + legendH + 26 + chordH <= avail;
      const stack = memH + 30 + legendH + (showChord ? 26 + chordH : 22);
      const y0 = L.top + 52 + Math.max(0, (avail - stack) / 2);
      cy = y0 + R * 0.28 + R * Math.sin(PHI0);
      gy = y0 + memH + 38;
      chordY = gy + legendH + (showChord ? 26 + chordH - 12 : 10);
    }

    const fill = S.look.fill;
    const lineMode = fill === 'line' || fill === 'none';
    const sil = fill === 'silhouette';
    const softOK = !lineMode && !sil;
    const cell = (S.look.post.find((q) => q.fx === 'pixelate')?.p.size ?? 0) * 400;
    const quant = S.look.post.some((q) => q.fx === 'quantize');

    // ── 顏色：一種光（帶一點主色的暖白）＋一個強調色（只在隆起處），其餘是深色的空氣
    const dk = luma(pal.ink) < luma(pal.bg) ? pal.ink : darken(pal.bg, 0.65);
    const stage = sil || lineMode ? pal.bg : mix(darken(dk, 0.55), pal.p, 0.05);
    const onDark = !sil && luma(stage) < 0.45;
    const ink = sil || lineMode ? pal.ink : onDark ? pal.light : pal.ink;
    const lineC = sil || lineMode ? ink : mix(pal.light, pal.p, 0.14);
    const peakC = sil || lineMode ? ink : mix(pal.a, pal.light, 0.22);
    const accC = sil || lineMode ? ink : mix(pal.p, pal.a, 0.35);
    const txt = mix(ink, stage, 0.1);
    const dim = mix(ink, stage, quant ? 0.35 : 0.58);
    const faint = mix(ink, stage, quant ? 0.55 : 0.82);
    const lum = softOK && onDark;

    const P = (x: number, y: number) => S.tp(x, y);
    const scNow = () => {
      const [ax, ay] = P(0, 0);
      const [bx, by] = P(1, 0);
      return Math.hypot(bx - ax, by - ay);
    };
    const sc = scNow();
    const thin = (w: number) => (cell > 1.2 ? Math.max(w, cell * 0.75) : w);
    const FL = { stroke: false, shadow: false, hl: false, flat: true, drawOn: false, mode: 'flat' } as const;
    const LN = { drawOn: false, cap: 'round' as CanvasLineCap };
    const poster = S.look.post.some((q) => q.fx === 'posterize');

    /** 文字（細字、字距）；像素化風格下小字讀不出來，改畫色條 */
    const say = (str: string, x: number, y: number, size: number, c: string, o: { w?: number; mono?: boolean; align?: CanvasTextAlign; track?: number; a?: number } = {}) => {
      const a = o.a ?? 1;
      if (a < 0.01 || !str) return;
      const font = o.mono ? `${o.w ?? 400} ${size * sc}px "JetBrains Mono", monospace` : `${o.w ?? 300} ${size * sc}px "Outfit", "Noto Sans TC", sans-serif`;
      const c2 = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
      const tr = (o.track ?? 0) * size;
      ctx.save();
      ctx.font = font;
      if ('letterSpacing' in c2) c2.letterSpacing = `${tr * sc}px`;
      const tw = ctx.measureText(str).width / sc;
      ctx.restore();
      const left = o.align === 'right' ? x - tw : o.align === 'center' ? x - tw / 2 : x;
      if (cell > 1.2 && size < cell * 6.5) {
        S.rect(left + tw / 2, y - size * 0.35, tw, size * 0.5, 0, c, { ...FL, alpha: a * 0.7 });
        return;
      }
      const [qx, qy] = P(left, y);
      ctx.save();
      ctx.font = font;
      if ('letterSpacing' in c2) c2.letterSpacing = `${tr * sc}px`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.globalAlpha = baseA * a;
      ctx.fillStyle = c;
      ctx.fillText(str, qx, qy);
      ctx.restore();
    };
    /** 一團光（畫面座標）；色階分離的風格不畫大範圍柔光 */
    const glowAt = (x: number, y: number, rx: number, ry: number, c: string, a: number) => {
      if (!softOK || a < 0.004 || (poster && rx > 30)) return;
      const [qx, qy] = P(x, y);
      const RR = rx * scNow();
      ctx.save();
      ctx.globalAlpha = baseA;
      ctx.translate(qx, qy);
      ctx.scale(1, ry / rx);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, RR);
      g.addColorStop(0, rgba(c, a));
      g.addColorStop(1, rgba(c, 0));
      ctx.fillStyle = g;
      ctx.fillRect(-RR, -RR, RR * 2, RR * 2);
      ctx.restore();
    };

    // ── 各聲部的包絡與擊打
    const drums = A.lanes.find((l) => l.kind === 'drums');
    const kick = drums ? hitOf(drums.kick, tm, sec, 0.16) : 0;
    const snare = drums ? hitOf(drums.snare, tm, sec, 0.12) : 0;
    const hat = drums ? hitOf(drums.hat, tm, sec, 0.05) : 0;
    const cym = drums ? hitOf(drums.cym, tm, sec, 0.55) : 0;
    const tom = drums ? hitOf(drums.tom, tm, sec, 0.2) : 0;
    const levels = A.lanes.map((l) => {
      if (l.kind === 'drums') return Math.max(kick, snare * 0.85, tom * 0.7, cym * 0.5);
      const [Aa, Dd, Rr] = ADR[l.role];
      return envOf(l.notes, tm, sec, Aa, Dd, Rr);
    });
    const hits = A.lanes.map((l) => (l.kind === 'drums' ? Math.max(kick, snare * 0.9, tom * 0.8) : hitOf(l.notes, tm, sec, l.role === 'pad' ? 0.3 : 0.12)));
    const energy = clamp((levels.reduce((a, b) => a + b, 0) / Math.max(1, levels.length)) * 1.6);
    const spb = song.stepsPerBar;
    const stepNow = (tm * song.bpm) / 15;
    const bar = Math.floor(stepNow / spb);
    const beatSteps = spb / song.meter;
    const beat = Math.floor((stepNow - bar * spb) / beatSteps);

    // ── 各聲部在膜上的頻帶半徑（由內而外：旋律 → 副旋律 → 琶音 → 和弦 → 鋪底 → 低音 → 鼓）
    const k = A.lanes.length;
    const rad = A.lanes.map((_, i) => (k === 1 ? R * 0.55 : lerp(R * 0.24, R * 0.84, i / (k - 1))));
    const gap = k > 1 ? (R * 0.6) / (k - 1) : R * 0.3;

    // ════ 鏡頭（真的透視）：從斜上方看這張膜；整首歌左右擺一次、俯仰微微呼吸；大鼓讓畫面輕輕一震
    const ph0 = (tm / sec) * TAU;
    const th = 0.3 * Math.sin(ph0);
    const phi = PHI0 + 0.035 * Math.sin(ph0 * 2 + 1);
    const ct = Math.cos(th);
    const st = Math.sin(th);
    const sph = Math.sin(phi);
    const cph = Math.cos(phi);
    const Dc = R * 3.2;
    const hop = 2.5 * kick;
    /** 膜上的點（以中心為原點的 x、y 與高度 z）→ 畫面；第三個值是前後（正＝靠近鏡頭） */
    const proj = (x: number, y: number, z: number): [number, number, number] => {
      const xr = x * ct - y * st;
      const yr = x * st + y * ct;
      const f = Dc / (Dc - yr * cph - z * sph);
      return [cx + xr * f, cy + (yr * sph - z * cph) * f - hop, yr];
    };

    // ════ 背景：深色的空氣、膜後方一道地平線般的光、四角收暗
    if (!lineMode) {
      if (sil) {
        const [, ya] = P(0, -env.Hu / 2);
        const [, yb] = P(0, env.Hu / 2);
        const [xa] = P(-env.Wu / 2 - 20, 0);
        const [xb] = P(env.Wu / 2 + 20, 0);
        const g = ctx.createLinearGradient(0, ya, 0, yb);
        g.addColorStop(0, pal.bg);
        g.addColorStop(1, pal.bg2);
        ctx.save();
        ctx.globalAlpha = baseA;
        ctx.fillStyle = g;
        ctx.fillRect(xa, ya - 40, xb - xa, yb - ya + 80);
        ctx.restore();
      } else {
        S.rect(0, 0, env.Wu + 120, env.Hu + 120, 0, stage, FL);
        if (det > 0.3) {
          const [, hy] = proj(0, -R, 0);
          glowAt(cx, hy, R * 1.5, R * 0.42, mix(pal.p, pal.light, 0.1), 0.1 + 0.06 * energy + 0.05 * kick);
          glowAt(cx, cy, R * 1.1, R * 1.1 * sph, mix(pal.p, pal.a, 0.3), 0.05 + 0.05 * energy);
        }
      }
    }

    // ════ 振膜的高度場：所有聲音在這張膜上留下的起伏（照真實的物理：擊打是瞬間的、之後衰減與傳開）
    // 會動的來源先整理好（每格只算一次）
    interface Bump {
      x: number;
      y: number;
      r: number;
      a: number;
      amp: number;
      rip: number;
      ripR: number;
      dt: number;
    }
    const bumps: Bump[] = [];
    const lift: { r: number; amp: number; w: number }[] = [];
    let bassWave: { r: number; amp: number; lobes: number; ph: number } | null = null;
    A.lanes.forEach((l, i) => {
      if (l.kind === 'drums') return;
      const r = rad[i];
      const [Aa, Dd, Rr] = ADR[l.role];
      if (l.kind === 'band') lift.push({ r, amp: levels[i] * R * (l.role === 'pad' ? 0.045 : 0.035), w: gap * 1.1 });
      if (l.kind === 'wave') {
        const [n0, , ndt] = recent(l.notes, tm, sec);
        const p = n0 ? n0.p : 40;
        bassWave = {
          r,
          amp: R * 0.075 * Math.max(levels[i] * 0.35, hits[i]),
          lobes: clamp(Math.round(3 + (p - 28) / 2.5), 3, 14),
          ph: tm * (0.6 + (p % 12) * 0.05) * TAU * 0.25 + ndt * 9,
        };
      }
      const peak = l.role === 'lead' || l.role === 'counter' ? 0.17 : l.role === 'pad' ? 0.05 : l.role === 'bass' ? 0.08 : 0.11;
      for (const n of l.notes) {
        const dt = since(tm, n.s, sec);
        if (dt > 1.1) continue;
        const sus = envNote(n, tm, sec, Aa, Dd, Rr);
        const amp = R * peak * n.v * Math.max(sus * 0.55, Math.exp(-dt / 0.2));
        const a = pcAngle(n.p);
        bumps.push({ x: Math.cos(a) * r, y: Math.sin(a) * r, r, a, amp, rip: R * 0.045 * n.v * Math.exp(-dt / 0.4), ripR: dt * R * 0.85, dt });
      }
    });
    const kicks: { rw: number; amp: number }[] = [];
    if (drums?.kick) {
      for (const n of drums.kick) {
        const dt = since(tm, n.s, sec);
        if (dt > 1.3) continue;
        kicks.push({ rw: R * 0.05 + dt * R * 1.05, amp: R * 0.11 * n.v * Math.exp(-dt / 0.42) });
      }
    }
    const rDrum = drums ? rad[k - 1] : R;
    const SA = 0.24; // 擊打隆起在角度方向的寬度
    const SR = gap * 0.6; // 在半徑方向的寬度
    const RW = R * 0.055; // 波的厚度
    // 效能：每一圈先挑出「影響得到這一圈」的隆起與漣漪（離得遠的整個略過），每個點只算這些
    let near: Bump[] = [];
    let ripN: Bump[] = [];
    const prepRing = (r: number) => {
      near = bumps.filter((b) => b.amp > 0.25 && Math.abs(r - b.r) < SR * 3);
      ripN = bumps.filter((b) => b.rip > 0.05 && Math.abs(r - b.r) < b.ripR + RW * 2.5 && b.ripR - RW * 2.5 < r + b.r);
    };
    const SA3 = SA * 3;
    const height = (r: number, a: number, axial: number) => {
      let h = axial;
      for (const b of near) {
        let da = Math.abs(a - b.a) % TAU;
        if (da > Math.PI) da = TAU - da;
        if (da > SA3) continue;
        const dr = r - b.r;
        h += b.amp * Math.exp(-(da * da) / (2 * SA * SA) - (dr * dr) / (2 * SR * SR));
      }
      if (ripN.length) {
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r;
        for (const b of ripN) {
          const d = Math.hypot(x - b.x, y - b.y) - b.ripR;
          if (d > RW * 2.5 || d < -RW * 2.5) continue;
          h += b.rip * Math.exp(-(d * d) / (RW * RW * 0.5));
        }
      }
      const bw = bassWave as { r: number; amp: number; lobes: number; ph: number } | null;
      if (bw && bw.amp > 0.05) {
        const dr = r - bw.r;
        h += bw.amp * Math.sin(bw.lobes * a + bw.ph) * Math.exp(-(dr * dr) / (2 * gap * gap * 0.5));
      }
      if (hat > 0.02 && r > rDrum * 0.9) h += R * 0.012 * hat * Math.sin(a * 48 + stepNow * 2.3 + r * 0.3);
      // 膜的外緣固定在框上（像鼓皮、喇叭振膜）：越靠外緣起伏越小，邊緣不動
      const q = r / R;
      return h * (1 - q * q * q * q * q * q);
    };
    const axialOf = (r: number) => {
      let h = 0;
      for (const kw of kicks) {
        const d = r - kw.rw;
        h += kw.amp * Math.exp(-(d * d) / (RW * RW * 1.6));
      }
      for (const lf of lift) {
        const d = r - lf.r;
        h += lf.amp * Math.exp(-(d * d) / (2 * lf.w * lf.w));
      }
      if (snare > 0.02) {
        const d = r - rDrum;
        h += R * 0.035 * snare * Math.sin(r * 0.45 - tm * 40) * Math.exp(-(d * d) / (2 * gap * gap));
      }
      if (cym > 0.02) h += R * 0.02 * cym * Math.exp(-((r - rDrum) * (r - rDrum)) / (2 * gap * gap * 2));
      return h;
    };

    // ════ 畫膜：每一圈是一條髮絲線；近處亮、遠處沒入霧中（垂直漸層）；隆起處另外描一條強調色的亮線
    const NR = cell > 1.2 ? clamp(Math.round((R * 0.88) / (cell * 2.4)), 8, 14) : det > 0.6 ? 36 : det > 0.4 ? 28 : 20;
    const NS = det > 0.6 ? 112 : 88;
    const Hc = R * 0.16; // 「很高」的參考高度
    const [, yFar] = proj(0, -R, 0);
    const [, yNear] = proj(0, R, 0);
    const fogGrad = (aFar: number, aNear: number, c: string) => {
      const [, ga] = P(0, yFar - R * 0.1);
      const [, gb] = P(0, yNear + R * 0.05);
      const g = ctx.createLinearGradient(0, ga, 0, gb);
      g.addColorStop(0, rgba(c, aFar));
      g.addColorStop(1, rgba(c, aNear));
      return g;
    };
    ctx.save();
    if (lum) ctx.globalCompositeOperation = 'lighter';
    const baseAlpha = sil ? 0.9 : lineMode ? 0.75 : 0.5 + 0.12 * energy;
    const hairW = (sil ? 1.1 : 0.75) * sc;
    // 景深霧的漸層每格只建兩個（一般圈、每 6 圈一條較亮的「主線」）
    const fogStd = lum || sil || lineMode ? fogGrad(baseAlpha * 0.16, baseAlpha * 0.62, lineC) : rgba(lineC, baseAlpha * 0.6);
    const fogMain = lum || sil || lineMode ? fogGrad(baseAlpha * 0.16, baseAlpha, lineC) : rgba(lineC, baseAlpha * 0.6);
    const peaks: { pts: number[]; hmax: number }[] = [];
    for (let j = 0; j < NR; j++) {
      const r = R * (0.12 + (0.88 * j) / (NR - 1));
      const axial = axialOf(r);
      prepRing(r);
      const pts: number[] = [];
      let run: number[] = [];
      let runMax = 0;
      for (let s = 0; s <= NS; s++) {
        const a = (s / NS) * TAU;
        const h = height(r, a, axial);
        const [x, y] = proj(Math.cos(a) * r, Math.sin(a) * r, h);
        pts.push(x, y);
        if (h > Hc * 0.38) {
          run.push(x, y);
          runMax = Math.max(runMax, h);
        } else if (run.length) {
          if (run.length >= 4) peaks.push({ pts: run, hmax: runMax });
          run = [];
          runMax = 0;
        }
      }
      if (run.length >= 4) peaks.push({ pts: run, hmax: runMax });
      // 髮絲線（直接畫，才能用垂直漸層做景深霧）
      ctx.save();
      ctx.globalAlpha = baseA;
      ctx.lineWidth = Math.max(hairW, cell > 1.2 ? cell * 0.75 * sc : 0);
      ctx.lineJoin = 'round';
      ctx.strokeStyle = j % 6 === 0 ? fogMain : fogStd;
      ctx.beginPath();
      for (let i = 0; i < pts.length; i += 2) {
        const [qx, qy] = P(pts[i], pts[i + 1]);
        if (i === 0) ctx.moveTo(qx, qy);
        else ctx.lineTo(qx, qy);
      }
      ctx.stroke();
      ctx.restore();
    }
    // 隆起處：強調色的亮線＋一層淡淡的光暈（越高越亮）
    for (const pk of peaks) {
      const e = clamp((pk.hmax / Hc - 0.38) / 0.9);
      if (lum) S.line(pk.pts, accC, { ...LN, w: thin(3), alpha: 0.06 * e });
      S.line(pk.pts, mix(accC, peakC, e), { ...LN, w: thin(0.8 + 0.5 * e), alpha: 0.25 + 0.5 * e });
    }
    // 每個音的頂點：剛落下的那一下有一顆白熱的點與一條往上的細光
    for (const b of bumps) {
      if (b.dt > 0.35) continue;
      const e = 1 - b.dt / 0.35;
      prepRing(b.r);
      const h = height(b.r, b.a, axialOf(b.r));
      const [x, y] = proj(b.x, b.y, h);
      const [x2, y2] = proj(b.x, b.y, h + R * 0.12 * e);
      S.line([x, y, x2, y2], peakC, { ...LN, w: thin(0.7), alpha: 0.7 * e });
      glowAt(x, y, 7 + 6 * e, 7 + 6 * e, peakC, 0.5 * e * e);
      S.circle(x, y, 1 + 1.6 * e * e, sil || lineMode ? ink : mix(pal.light, peakC, 0.25), { ...FL, alpha: e });
    }
    // 中心：目前和弦的音名連成的細線多邊形（平放在膜的中心），換和弦時頂點滑過去
    if (det > 0.35 && song.chords.length) {
      const chs = song.chords;
      let ci = 0;
      for (let j = 0; j < chs.length; j++) if (chs[j].bar * spb + chs[j].step <= stepNow + 0.01) ci = j;
      const curC = chs[ci];
      const prevC = chs[(ci - 1 + chs.length) % chs.length];
      const pcsOf = (ch: typeof curC) => [...new Set(ch.notes.map((x) => ((x % 12) + 12) % 12))].sort((a2, b2) => a2 - b2);
      const Tp = pcsOf(curC);
      const Pv = pcsOf(prevC).map((x) => pcAngle(x));
      const g = smooth(0, 0.25, since(tm, stepToSec(song, curC.bar * spb + curC.step), sec));
      const rp = R * 0.085;
      const poly: number[] = [];
      Tp.forEach((pc, j) => {
        const a1 = pcAngle(pc);
        const a0 = Pv.length ? Pv[Math.floor((j * Pv.length) / Tp.length)] : a1;
        let d = a1 - a0;
        d = ((d + Math.PI) % TAU + TAU) % TAU - Math.PI;
        const a = a1 - d * (1 - g);
        const [x, y] = proj(Math.cos(a) * rp, Math.sin(a) * rp, 0);
        poly.push(x, y);
      });
      if (poly.length >= 6) {
        S.line(poly, accC, { ...LN, closed: true, w: thin(0.8), alpha: 0.75 });
        for (let j = 0; j < poly.length; j += 2) S.circle(poly[j], poly[j + 1], 1.3, peakC, { ...FL, alpha: 0.9 });
      }
    }
    ctx.restore();

    // ════ 圖例：聲部編號、名稱、即時讀數、髮絲音量條（外圈在上）
    const valOf = (l: Lane) => {
      if (l.kind === 'wheel' || l.kind === 'wave') {
        const [n0, , dt] = recent(l.notes, tm, sec);
        return n0 && dt < n0.e - n0.s + 0.25 ? noteName(n0.p) : '';
      }
      if (l.kind === 'band') {
        const ch = [...song.chords].reverse().find((c2) => c2.bar * spb + c2.step <= stepNow + 0.01) ?? song.chords[song.chords.length - 1];
        return ch ? ch.label : '';
      }
      if (l.kind === 'seq') return `${String(Math.floor(stepNow - bar * spb) + 1).padStart(2, '0')}/${spb}`;
      return kick > 0.35 ? 'KICK' : snare > 0.35 ? 'SNARE' : tom > 0.35 ? 'TOM' : cym > 0.3 ? 'CRASH' : hat > 0.3 ? 'HAT' : '';
    };
    const legendRow = (l: Lane, i: number, x: number, y: number, w: number, idx: number) => {
      const lv = levels[i];
      const on = Math.max(lv, hits[i]);
      say(String(idx).padStart(2, '0'), x, y, 7.5, faint, { mono: true });
      say(l.label, x + 18, y, 8.5, mix(dim, txt, clamp(on * 1.6)), { w: 500, track: 0.22 });
      const val = valOf(l);
      if (val) say(val, x + w, y, 8.5, mix(dim, peakC, clamp(on * 1.5)), { mono: true, align: 'right' });
      S.line([x, y + 7, x + w, y + 7], faint, { ...LN, cap: 'butt', w: thin(0.6) });
      if (on > 0.01) S.line([x, y + 7, x + w * clamp(on), y + 7], accC, { ...LN, cap: 'butt', w: thin(1.2), alpha: 0.9 });
    };
    const order = A.lanes.map((_, i) => k - 1 - i);
    if (!L.tall) {
      order.forEach((i, row) => legendRow(A.lanes[i], i, L.gx, L.gy + row * 24, L.x1 - L.gx, row + 1));
    } else {
      const colW = (L.x1 - L.x0 - 20) / 2;
      order.forEach((i, row) => legendRow(A.lanes[i], i, L.x0 + (row % 2) * (colW + 20), gy + Math.floor(row / 2) * 24, colW, row + 1));
    }

    // ════ 左上：曲名與規格；節拍點
    say(A.name, L.x0, L.top + 12, L.tall ? 17 : 20, txt, { w: 300 });
    say(A.sub, L.x0, L.top + 28, 8.5, dim, { w: 400, track: 0.1 });
    if (det > 0.4) {
      for (let j = 0; j < song.meter; j++) {
        const on = j === beat;
        const pulse = on ? 1 - smooth(0, 0.7, (stepNow - bar * spb) / beatSteps - beat) : 0;
        S.circle(L.x0 + 2.5 + j * 10, L.top + 42, on ? 1.8 + 0.8 * pulse : 1.3, on ? accC : faint, FL);
      }
    }

    // ════ 目前的和弦：大號細字（雜誌式的字體錨點）＋小節與時間＋一條細時間軸
    {
      const chs = song.chords;
      let ci = 0;
      for (let j = 0; j < chs.length; j++) if (chs[j].bar * spb + chs[j].step <= stepNow + 0.01) ci = j;
      const ch = chs[ci];
      const fresh = ch ? since(tm, stepToSec(song, ch.bar * spb + ch.step), sec) : 1;
      const tall = L.tall;
      const xr = L.x1;
      const yb = tall ? chordY : L.bot - 4;
      const big = tall ? 34 : 38;
      if (ch && showChord) {
        say('CHORD', xr, yb - big - 6, 7.5, faint, { w: 500, track: 0.3, align: 'right' });
        say(ch.label, xr, yb - 12, big, txt, { w: 200, align: 'right', a: 0.55 + 0.45 * smooth(0, 0.18, fresh) });
      }
      const fmt = (v: number) => `${String(Math.floor(v / 60)).padStart(2, '0')}:${(v % 60).toFixed(1).padStart(4, '0')}`;
      const tx0 = tall ? L.x0 : L.gx;
      say(`BAR ${String(bar + 1).padStart(2, '0')}/${String(song.bars).padStart(2, '0')}`, tx0, yb, 7.5, dim, { mono: true });
      say(fmt(tm), xr, yb, 7.5, dim, { mono: true, align: 'right' });
      const ly = yb + 8;
      const lx0 = tx0;
      const lx1 = xr;
      if (lx1 - lx0 > 30) {
        const px = lerp(lx0, lx1, tm / sec);
        S.line([lx0, ly, lx1, ly], faint, { ...LN, cap: 'butt', w: thin(0.6) });
        S.line([lx0, ly, px, ly], accC, { ...LN, cap: 'butt', w: thin(0.9) });
        S.circle(px, ly, 1.6, peakC, FL);
      }
    }
  },
};
