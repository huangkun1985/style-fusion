// 配樂模式（1.4.0）：把一首整段都在的「循環」編排成有段落的配樂——前奏只有鋪底與和弦，展開才加低音、琶音、主旋律與鼓，
// 高潮全部到齊，回落時和弦放慢、收在主和弦。另有「墊底」（不搶口播）與「精修」的力度微調。
// 只改音符（哪一段誰在、多大聲），不碰音色；所以任何聲音方案（8-bit、MIDI 取樣、XM…）都能演奏，也能導出 MIDI／XM。
import { clamp, hash } from '../engine/util';
import { DRUM_NOTE } from './genres';
import type { ArrShape, NoteEv, Section, SectionKind, Track, TrackRole } from './types';

/** 各段落形狀：段落種類與佔整首的比例 */
const SHAPES: Record<ArrShape, [SectionKind, number][]> = {
  // 三段：前奏、展開（前半鼓只有大鼓與踩鈸、後半加小鼓）、回落
  arc: [['intro', 0.25], ['build', 0.28], ['build2', 0.27], ['outro', 0.2]],
  // 四段：前奏、展開、高潮、回落
  build: [['intro', 0.2], ['build', 0.3], ['peak', 0.35], ['outro', 0.15]],
  // 一路推進：每一段多一層，最後全部到齊
  rise: [['intro', 0.25], ['rise1', 0.25], ['rise2', 0.25], ['peak', 0.25]],
  // 平穩墊底：短前奏、長而穩定的主體、短回落；沒有主旋律
  steady: [['intro', 0.12], ['body', 0.76], ['outro', 0.12]],
};

export const SECTION_NAME: Record<SectionKind, string> = { intro: '前奏', build: '展開', build2: '展開', peak: '高潮', outro: '回落', rise1: '推進', rise2: '推進', body: '主體' };

export const SHAPE_INFO: Record<ArrShape, { name: string; desc: string }> = {
  arc: { name: '三段', desc: '前奏（鋪底＋和弦）→ 展開（加入低音、琶音、旋律與鼓）→ 回落（和弦放慢、收在主和弦）' },
  build: { name: '四段', desc: '前奏 → 展開 → 高潮（全部到齊、鼓最滿）→ 回落' },
  rise: { name: '推進', desc: '一路疊加：每一段多一層，最後在最滿的地方結束' },
  steady: { name: '平穩', desc: '短前奏、長而穩定的主體、短回落；沒有主旋律，最適合墊在口播底下' },
};

/** 每種段落裡各聲部的音量（0＝不出現）；鼓：none／light（只有大鼓與踩鈸類）／full */
type Level = Partial<Record<TrackRole, number>> & { drums: 'none' | 'light' | 'full' };
const LEVELS: Record<SectionKind, Level> = {
  intro: { pad: 1, chord: 0.85, drums: 'none' },
  build: { pad: 1, chord: 1, arp: 0.8, bass: 1, lead: 1, drums: 'light' },
  build2: { pad: 1, chord: 1, arp: 0.9, bass: 1, lead: 1, counter: 0.9, drums: 'full' },
  peak: { pad: 1, chord: 1, arp: 1, bass: 1, lead: 1, counter: 1, drums: 'full' },
  outro: { pad: 1, chord: 0.85, bass: 0.75, drums: 'none' },
  rise1: { pad: 1, chord: 0.9, bass: 0.9, arp: 0.7, drums: 'none' },
  rise2: { pad: 1, chord: 1, bass: 1, arp: 0.85, lead: 1, drums: 'light' },
  body: { pad: 1, chord: 1, bass: 0.85, arp: 0.6, drums: 'light' },
};
const LIGHT_DRUMS = new Set([DRUM_NOTE.kick, DRUM_NOTE.hatC, DRUM_NOTE.hatP, DRUM_NOTE.shaker]);

/** 把 bars 小節切成段落；段落邊界對齊 2 小節（夠長時對齊 4 小節），每段至少 2 小節 */
export function planSections(bars: number, shape: ArrShape): Section[] {
  const spec = SHAPES[shape];
  const unit = bars >= 32 ? 4 : bars >= 8 ? 2 : 1;
  const counts = spec.map(([, f]) => Math.max(unit, Math.round((bars * f) / unit) * unit));
  // 修正總數：從最長的段落增減
  let diff = bars - counts.reduce((a, b) => a + b, 0);
  for (let guard = 0; diff !== 0 && guard < 64; guard++) {
    const order = counts.map((c, i) => [c, i]).sort((a, b) => b[0] - a[0]);
    const i = order[0][1];
    const step = diff > 0 ? Math.min(diff, unit) : -Math.min(-diff, unit, counts[i] - unit);
    if (step === 0) break;
    counts[i] += step;
    diff -= step;
  }
  const out: Section[] = [];
  let bar = 0;
  spec.forEach(([kind], i) => {
    if (counts[i] <= 0) return;
    out.push({ kind, name: SECTION_NAME[kind], bar, bars: counts[i] });
    bar += counts[i];
  });
  // 最後一段吸收剩下的（理論上剛好）
  if (out.length && bar !== bars) out[out.length - 1].bars += bars - bar;
  return out;
}

export interface ArrangeCtx {
  spb: number;
  bars: number;
  sections: Section[];
  bed: boolean;
  /** 有收尾（配樂）：回落放慢、最後一小節留給長和弦。循環的墊底沒有 */
  cadence: boolean;
}

/** 這首曲子有哪些聲部；前奏要用的聲部（沒有鋪底與和弦的曲風，退而用琶音、低音或旋律） */
function introRoles(have: Set<TrackRole>): Partial<Record<TrackRole, number>> {
  if (have.has('pad') || have.has('chord')) return {};
  for (const r of ['arp', 'bass', 'lead'] as TrackRole[]) if (have.has(r)) return { [r]: 0.75 };
  return {};
}

/**
 * 依段落編排：每個音依它所在段落決定要不要留、力度乘多少；進場的聲部前 2 小節漸強，回落整段漸弱；
 * 回落的和弦放慢（只留每小節第 1、3 拍並拉長），最後一小節是一個長和弦。墊底模式拿掉主旋律與副旋律、琶音收小、鼓只留大鼓與踩鈸。
 */
export function applyArrangement(tracks: Track[], c: ArrangeCtx): Track[] {
  const have = new Set(tracks.map((t) => (t.drum ? 'perc' : t.role)));
  const fallback = introRoles(have);
  const sectionAt = (bar: number) => c.sections.find((s) => bar >= s.bar && bar < s.bar + s.bars) ?? c.sections[c.sections.length - 1];
  const lastBar = c.bars - 1;
  const out: Track[] = [];
  for (const tr of tracks) {
    const role: TrackRole = tr.drum ? 'perc' : tr.role;
    if (c.bed && (role === 'lead' || role === 'counter')) continue;
    const notes: NoteEv[] = [];
    // R-14：每小節哪些拍點本來就有音（回落時用來判斷要不要把別的音移過去）
    const onBeat = new Set<number>();
    const moved = new Map<number, number>();
    let peak = 0;
    for (const n of tr.notes) {
      const b = Math.floor(n.t / c.spb);
      const st = n.t - b * c.spb;
      for (const k of c.spb === 16 ? [0, 8] : [0]) if (Math.abs(st - k) < 0.01) onBeat.add(b * 64 + k);
    }
    for (const n of tr.notes) {
      const bar = Math.floor(n.t / c.spb);
      const sec = sectionAt(bar);
      const lv0 = LEVELS[sec.kind];
      const inSec = (bar - sec.bar + (n.t / c.spb - bar)) / Math.max(1, sec.bars); // 0..1 在段落內的位置
      let lv: number;
      if (role === 'perc') {
        const mode = c.bed && lv0.drums === 'full' ? 'light' : lv0.drums;
        if (mode === 'none') continue;
        if (mode === 'light' && !LIGHT_DRUMS.has(n.pitch)) continue;
        lv = mode === 'light' ? 0.85 : 1;
      } else {
        lv = lv0[role] ?? (sec.kind === 'intro' || sec.kind === 'outro' ? (fallback[role] ?? 0) : 0);
        if (lv <= 0) continue;
      }
      // 這個聲部在這一段剛進場：前 2 小節漸強
      const prev = c.sections[c.sections.indexOf(sec) - 1];
      const enters = !prev || (role === 'perc' ? LEVELS[prev.kind].drums === 'none' : (LEVELS[prev.kind][role] ?? 0) <= 0);
      if (enters && sec.bar > 0) lv *= 0.6 + 0.4 * clamp((n.t / c.spb - sec.bar) / 2);
      // 回落：整段漸弱
      if (sec.kind === 'outro') lv *= 1 - 0.45 * inSec;
      if (c.bed && role === 'arp') lv *= 0.75;
      let { t, dur } = n;
      // 回落的和弦與低音放慢：只留每小節的第 1、3 拍（三拍子留第 1 拍），拉長；最後一小節另外處理。
      // 那一拍剛好沒有音（浩室這類反拍的型態）：把那半小節裡最早的一個音移到拍點上，回落才不會只剩鋪底（審查 R-14）
      if (c.cadence && sec.kind === 'outro' && (role === 'chord' || role === 'bass') && bar < lastBar) {
        const step = n.t - bar * c.spb;
        const keepAt = c.spb === 16 ? [0, 8] : [0];
        const span = c.spb === 16 ? 8 : c.spb;
        const slot = keepAt.find((k) => step >= k - 0.01 && step < k + span - 0.01);
        if (slot === undefined) continue;
        if (Math.abs(step - slot) >= 0.01) {
          const key = bar * 64 + slot;
          if (onBeat.has(key)) continue;
          // 和弦是同一個時間的好幾個音：記住第一個被移的音原本在哪一步，同一步的其他音一起移
          const src = moved.get(key);
          if (src === undefined) moved.set(key, step);
          else if (Math.abs(src - step) >= 0.01) continue;
          t = bar * c.spb + slot;
        }
        dur = Math.max(dur, (c.spb === 16 ? 8 : 12) * 0.92);
      }
      if (c.cadence && bar === lastBar && role !== 'perc') continue; // 最後一小節：下面放一個長和弦
      peak = Math.max(peak, lv);
      notes.push({ ...n, t, dur, vel: clamp(n.vel * lv, 0.05, 1) });
    }
    // 審查 R-02：整軌最大聲的那一段都比 1 小（例如墊底的琶音 ×0.75、平穩主體的琶音 0.6），精修的逐軌響度對齊會把它拉回目標。
    // 把「整軌要低多少」記成 trim（dB），精修對齊時加上去；段落之間的相對大小仍在力度裡
    const trim = role !== 'perc' && peak > 0 && peak < 0.999 ? Math.round(20 * Math.log10(peak) * 10) / 10 : 0;
    out.push({ ...tr, notes, ...(trim ? { trim } : {}) });
  }
  return out;
}

/** 最後一小節：主和弦長音（和弦、鋪底、低音），在小節的四分之三處放開，讓餘音在循環前收掉 */
export function finalChord(tracks: Track[], c: ArrangeCtx, tonic: number[], bassPitch: number): void {
  const t = (c.bars - 1) * c.spb;
  const dur = c.spb * 0.72;
  for (const tr of tracks) {
    if (tr.drum) continue;
    if (tr.role === 'chord' || tr.role === 'pad') for (const p of tonic) tr.notes.push({ t, dur, pitch: p, vel: tr.role === 'pad' ? 0.36 : 0.5 });
    else if (tr.role === 'bass') tr.notes.push({ t, dur, pitch: bassPitch, vel: 0.55 });
  }
  for (const tr of tracks) tr.notes.sort((a, b) => a.t - b.t);
}

/** 精修：每個音的力度做小幅、可重現的隨機（避免機器味）；鼓的幅度小一點 */
export function humanize(tracks: Track[], seed: number): Track[] {
  return tracks.map((tr, ti) => ({
    ...tr,
    notes: tr.notes.map((n, i) => ({ ...n, vel: clamp(n.vel * (1 + (hash(seed, ti * 977 + i, 41) - 0.5) * (tr.drum ? 0.1 : 0.14)), 0.05, 1) })),
  }));
}
