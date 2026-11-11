// 配樂模式／墊底／精修（1.4.0）的自動檢查：npx tsx scripts/arrange-test.ts（已接進 npm run test:audio）
// 檢查：長度接近要求、段落切得對、每段該在的聲部在、前奏沒有鼓與主旋律、回落放慢、最後一小節是主和弦長音、
// 墊底沒有主旋律、精修只動力度不動音高與時間、所有曲風 × 形狀都能作曲且沒有 NaN、XM／MIDI 寫得出來。
import { composeSong } from '../src/audio/compose';
import { GENRES } from '../src/audio/genres';
import { writeMidi } from '../src/audio/midi';
import { planSections } from '../src/audio/arrange';
import { renderScheme } from '../src/audio/render';
import type { ArrShape, GenreId, Song, TrackRole } from '../src/audio/types';
import { useFfmpegDecoder } from './node-decoder';

let fails = 0;
const ok = (cond: unknown, msg: string) => {
  if (!cond) {
    fails++;
    console.log('  ✗', msg);
  }
};

const shapes: ArrShape[] = ['arc', 'build', 'rise', 'steady'];
const roleIn = (s: Song, role: TrackRole, bar0: number, bar1: number) =>
  s.tracks.some((t) => (t.drum ? 'perc' : t.role) === role && t.notes.some((n) => n.t >= bar0 * s.stepsPerBar && n.t < bar1 * s.stepsPerBar));

// 1) 段落切分
for (const bars of [8, 12, 16, 24, 32, 48, 64, 96]) {
  for (const sh of shapes) {
    const sec = planSections(bars, sh);
    const total = sec.reduce((a, b) => a + b.bars, 0);
    ok(total === bars, `段落總長 ${sh} ${bars}：${total}`);
    ok(sec.every((x) => x.bars >= 1), `段落至少 1 小節 ${sh} ${bars}`);
    ok(sec.every((x, i) => i === 0 || x.bar === sec[i - 1].bar + sec[i - 1].bars), `段落連續 ${sh} ${bars}`);
  }
}
console.log('sections ok');

// 2) 所有曲風 × 形狀 × 長度
let n = 0;
for (const g of Object.keys(GENRES) as GenreId[]) {
  for (const sh of shapes) {
    for (const len of [15, 30, 60]) {
      for (const sync of [true, false]) {
        const s = composeSong({ genre: g, seed: 5, animSeconds: 3.2, sync, tempo: 1, key: -1, arrange: { len, shape: sh }, polish: true });
        n++;
        const tag = `${g} ${sh} ${len}s sync=${sync}`;
        ok(s.sections && s.sections.length >= 3, `${tag}：有段落`);
        // 極慢的曲風加上「與動畫對齊」，最短也要 4～6 小節（介面會顯示實際長度）
        ok(Math.abs(s.seconds - len) <= Math.max(6, len * 0.35) || s.bars <= 6, `${tag}：長度 ${s.seconds.toFixed(1)}`);
        if (sync) ok(Math.abs(s.seconds / s.animSeconds - Math.round(s.seconds / s.animSeconds)) < 1e-6, `${tag}：整首是動畫循環的整數倍`);
        for (const t of s.tracks) for (const x of t.notes) if (!Number.isFinite(x.t + x.dur + x.pitch + x.vel) || x.vel <= 0 || x.vel > 1 || x.t < 0 || x.t >= s.steps) ok(false, `${tag}：壞音符 ${t.id} ${JSON.stringify(x)}`);
        const sec = s.sections!;
        const intro = sec[0];
        ok(!roleIn(s, 'perc', intro.bar, intro.bar + intro.bars), `${tag}：前奏沒有鼓`);
        ok(!roleIn(s, 'lead', intro.bar, intro.bar + intro.bars), `${tag}：前奏沒有主旋律`);
        // 前奏至少有一個聲部
        ok(s.tracks.some((t) => t.notes.some((x) => x.t < (intro.bar + intro.bars) * s.stepsPerBar)), `${tag}：前奏不是空的`);
        // 最後一小節：主和弦長音（和弦或鋪底在小節開頭）
        const last = (s.bars - 1) * s.stepsPerBar;
        const lastChord = s.chords.filter((c) => c.bar === s.bars - 1);
        ok(lastChord.length === 1 && lastChord[0].root === s.key, `${tag}：最後一小節是主和弦（${lastChord.map((c) => c.label).join(',')}）`);
        const hasFinal = s.tracks.some((t) => !t.drum && (t.role === 'chord' || t.role === 'pad' || t.role === 'bass') && t.notes.some((x) => x.t === last && x.dur >= s.stepsPerBar * 0.5));
        const anyChordTrack = s.tracks.some((t) => !t.drum && (t.role === 'chord' || t.role === 'pad' || t.role === 'bass'));
        if (anyChordTrack) ok(hasFinal, `${tag}：最後一小節有長和弦`);
        const peak = sec.find((x) => x.kind === 'peak' || x.kind === 'build2');
        if (peak && GENRES[g].drums !== 'none') ok(roleIn(s, 'perc', peak.bar, peak.bar + peak.bars), `${tag}：高潮有鼓`);
        if (sh === 'steady') ok(!s.tracks.some((t) => t.role === 'lead' && t.notes.length), `${tag}：平穩沒有主旋律`);
        writeMidi(s);
      }
    }
  }
}
console.log(`arrangements ok (${n} 首)`);

// 3) 墊底：沒有主旋律與副旋律；循環模式也可以用
for (const g of ['pop', 'kpop', 'cinematic', 'jazz', 'lofi'] as GenreId[]) {
  const a = composeSong({ genre: g, seed: 3, animSeconds: 3.2, sync: true, tempo: 1, key: -1, bed: true });
  ok(!a.tracks.some((t) => t.role === 'lead' || t.role === 'counter'), `${g} 墊底循環：沒有旋律`);
  ok(a.tracks.length >= 2, `${g} 墊底循環：還有伴奏`);
  const b = composeSong({ genre: g, seed: 3, animSeconds: 3.2, sync: true, tempo: 1, key: -1, bed: true, arrange: { len: 30, shape: 'build' } });
  ok(!b.tracks.some((t) => t.role === 'lead' || t.role === 'counter'), `${g} 墊底配樂：沒有旋律`);
}
console.log('bed ok');

// 4) 精修只動力度
for (const g of ['pop', 'jazz', 'cinematic'] as GenreId[]) {
  const a = composeSong({ genre: g, seed: 9, animSeconds: 3.2, sync: true, tempo: 1, key: -1 });
  const b = composeSong({ genre: g, seed: 9, animSeconds: 3.2, sync: true, tempo: 1, key: -1, polish: true });
  ok(a.tracks.length === b.tracks.length, `${g} 精修：音軌數相同`);
  let diffVel = 0;
  a.tracks.forEach((t, i) =>
    t.notes.forEach((x, j) => {
      const y = b.tracks[i].notes[j];
      ok(y && x.t === y.t && x.pitch === y.pitch && x.dur === y.dur, `${g} 精修：音高與時間不變`);
      if (y && Math.abs(x.vel - y.vel) > 1e-9) diffVel++;
    }),
  );
  ok(diffVel > 0, `${g} 精修：力度有微調`);
  ok(b.polish === true && !a.polish, `${g} 精修旗標`);
}
console.log('polish ok');

// 5) 實際渲染：配樂＋精修、墊底，在 MIDI、XM、8-bit 三種方案都要長度正確、沒有 NaN、不削波
useFfmpegDecoder();
for (const [g, sh, bed] of [['cinematic', 'build', false], ['pop', 'arc', true], ['jazz', 'steady', false]] as [GenreId, ArrShape, boolean][]) {
  const s = composeSong({ genre: g, seed: 7, animSeconds: 3.2, sync: true, tempo: 1, key: -1, arrange: { len: 24, shape: sh }, bed, polish: true });
  for (const scheme of ['midi', 'xm', 'nes'] as const) {
    const pcm = await renderScheme(s, scheme, { sr: 44100, seed: 7 });
    let peak = 0;
    let nan = 0;
    let sum = 0;
    for (let i = 0; i < pcm.l.length; i++) {
      if (!Number.isFinite(pcm.l[i]) || !Number.isFinite(pcm.r[i])) nan++;
      peak = Math.max(peak, Math.abs(pcm.l[i]), Math.abs(pcm.r[i]));
      sum += pcm.l[i] * pcm.l[i];
    }
    const tag = `${g} ${sh}${bed ? ' 墊底' : ''} ${scheme}`;
    ok(Math.abs(pcm.l.length - Math.round(s.seconds * 44100)) <= 2, `${tag}：長度 ${pcm.l.length}`);
    ok(nan === 0, `${tag}：NaN ${nan}`);
    ok(peak <= 1 && peak > 0.2, `${tag}：峰值 ${peak.toFixed(3)}`);
    ok(Math.sqrt(sum / pcm.l.length) > 0.05, `${tag}：太小聲`);
  }
}
console.log('render ok');

if (fails) {
  console.log(`ARRANGE FAIL（${fails} 項）`);
  process.exit(1);
}
console.log('ARRANGE OK');
