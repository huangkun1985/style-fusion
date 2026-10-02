// 開發用：音訊系統的自動檢查（作曲、MIDI 輸出、XM 結構）。
// 用法：npx tsx scripts/audio-test.ts
import tonejs from '@tonejs/midi';
import { composeSong, planLoop } from '../src/audio/compose';
import { GENRES } from '../src/audio/genres';
import { writeMidi } from '../src/audio/midi';
import { PACK_INFO, SFX_KINDS, synthSfx } from '../src/audio/sfx';
import { SCALES } from '../src/audio/theory';
import type { GenreId, PackId } from '../src/audio/types';
import { buildXm, writeXm } from '../src/audio/xm';
import { PACK_DRUMS, PACK_INSTRUMENTS, PACK_PROGRAM } from '../src/audio/pack/meta';
import { ensureSamplesFor } from '../src/audio/sampled';
import { loadDrums, loadInstrument } from '../src/audio/sampler';
import { useFfmpegDecoder } from './node-decoder';

const { Midi } = tonejs as unknown as { Midi: typeof import('@tonejs/midi').Midi };
let fails = 0;
const ok = (c: boolean, msg: string) => {
  if (!c) {
    fails++;
    console.log('  ✗', msg);
  }
};

// 1) planLoop：音樂循環一定是動畫循環的整數倍
for (const L of [2.2, 2.4, 2.8, 3.4, 3.82, 4, 4.2, 5, 8]) {
  for (const target of [70, 100, 128, 150]) {
    for (const meter of [3, 4] as const) {
      const p = planLoop(L, target, meter, true);
      if (p.synced) {
        const len = (p.bars * meter * 60) / p.bpm;
        ok(Math.abs(len - p.animLoops * L) < 1e-6, `plan L=${L} target=${target} meter=${meter}: ${len} vs ${p.animLoops}×${L}`);
        ok(p.bpm >= 52 && p.bpm <= 196, `plan bpm range ${p.bpm}`);
      }
    }
  }
}

// 2) 作曲：音高範圍、音階內、鼓號、時間範圍
for (const genre of Object.keys(GENRES) as GenreId[]) {
  for (const seed of [1, 7, 42]) {
    for (const L of [2.2, 3.82, 8]) {
      const song = composeSong({ genre, seed, animSeconds: L, sync: true, tempo: 1, key: -1 });
      ok(Math.abs(song.seconds - (song.animLoops ? song.animLoops * L : song.seconds)) < 1e-6, `${genre}: loop length`);
      ok(song.tracks.length >= 2, `${genre}: tracks`);
      const sc = SCALES[song.mode];
      for (const tr of song.tracks) {
        for (const n of tr.notes) {
          ok(Number.isFinite(n.t) && n.t >= 0 && n.t < song.steps, `${genre}/${tr.id}: note t=${n.t} out of [0,${song.steps})`);
          ok(n.dur > 0 && n.vel > 0 && n.vel <= 1, `${genre}/${tr.id}: dur/vel`);
          if (!tr.drum) {
            ok(n.pitch >= 24 && n.pitch <= 108, `${genre}/${tr.id}: pitch ${n.pitch}`);
            // 旋律／琶音應該都在調內（允許走路低音的半音經過音）
            if (tr.role === 'lead' || tr.role === 'arp' || tr.role === 'counter') {
              const pc = (((n.pitch - song.key) % 12) + 12) % 12;
              ok(sc.includes(pc as never), `${genre}/${tr.id}: pitch ${n.pitch} not in ${song.mode} (key ${song.key})`);
            }
          } else ok(n.pitch >= 35 && n.pitch <= 81, `${genre}/drum: ${n.pitch}`);
        }
      }
      // 同一個種子要得到同一首歌
      const again = composeSong({ genre, seed, animSeconds: L, sync: true, tempo: 1, key: -1 });
      ok(JSON.stringify(again) === JSON.stringify(song), `${genre}: not deterministic`);
    }
  }
}

// 3) MIDI：可被標準解析器讀取，音符數一致
for (const genre of ['chipAdventure', 'jazz', 'wonder', 'eastern', 'funk'] as GenreId[]) {
  const song = composeSong({ genre, seed: 11, animSeconds: 4.2, sync: true, tempo: 1, key: -1 });
  const bytes = writeMidi(song);
  const m = new Midi(bytes);
  const total = song.tracks.reduce((s, t) => s + t.notes.length, 0);
  const parsed = m.tracks.reduce((s, t) => s + t.notes.length, 0);
  ok(parsed === total, `${genre}: midi notes ${parsed} != ${total}`);
  ok(Math.abs(m.header.tempos[0].bpm - song.bpm) < 0.01, `${genre}: midi bpm ${m.header.tempos[0].bpm} vs ${song.bpm}`);
  const drums = m.tracks.filter((t) => t.instrument.percussion).length;
  ok(drums === 1, `${genre}: drum tracks ${drums}`);
  const progs = m.tracks.filter((t) => !t.instrument.percussion).map((t) => t.instrument.number);
  const want = song.tracks.filter((t) => !t.drum).map((t) => t.program);
  ok(JSON.stringify(progs) === JSON.stringify(want), `${genre}: programs ${progs} vs ${want}`);
  console.log(`midi ${genre}: ${bytes.length} bytes, ${m.tracks.length} tracks, ${parsed} notes, ${m.header.tempos[0].bpm.toFixed(1)} bpm, duration ${m.duration.toFixed(2)}s (loop ${song.seconds.toFixed(2)}s)`);
}

// 4) XM：結構檢查
for (const genre of Object.keys(GENRES) as GenreId[]) {
  const song = composeSong({ genre, seed: 11, animSeconds: 3.82, sync: true, tempo: 1, key: -1 });
  const mod = buildXm(song);
  const b = writeXm(mod);
  const dv = new DataView(b.buffer);
  const id = String.fromCharCode(...b.slice(0, 17));
  ok(id === 'Extended Module: ', `${genre}: xm id`);
  ok(dv.getUint16(58, true) === 0x0104, `${genre}: xm version`);
  ok(dv.getUint16(68, true) === mod.channels, `${genre}: xm channels`);
  ok(mod.channels <= 16, `${genre}: channels ${mod.channels} > 16`);
  ok(mod.rows <= 256, `${genre}: rows`);
  ok(mod.instruments.length >= 3 && mod.instruments.length <= 40, `${genre}: instruments ${mod.instruments.length}`);
}
// 5) 音效：每個音效包 × 每種音效
{
  let total = 0;
  for (const pack of Object.keys(PACK_INFO) as PackId[]) {
    for (const k of SFX_KINDS) {
      const b = synthSfx(pack, k.id, 44100, 0);
      total++;
      let peak = 0;
      let nan = false;
      let sum = 0;
      for (const x of b) {
        if (Number.isNaN(x)) nan = true;
        peak = Math.max(peak, Math.abs(x));
        sum += x * x;
      }
      const dur = b.length / 44100;
      ok(!nan, `sfx ${pack}/${k.id}: NaN`);
      ok(peak > 0.3 && peak <= 0.81, `sfx ${pack}/${k.id}: peak ${peak.toFixed(2)}`);
      ok(dur >= 0.015 && dur <= 1.6, `sfx ${pack}/${k.id}: duration ${dur.toFixed(2)}`);
      ok(Math.sqrt(sum / b.length) > 0.01, `sfx ${pack}/${k.id}: too quiet`);
    }
  }
  console.log('sfx variants checked:', total);
}
// 6) 取樣包：每個樂器都能解碼、循環點合法、音區涵蓋全音域；XM 轉換後結構正確
{
  useFfmpegDecoder();
  const ids = Object.keys(PACK_INSTRUMENTS);
  let zonesN = 0;
  for (const id of ids) {
    const inst = await loadInstrument(id);
    ok(!!inst, `sample ${id}: 載入失敗`);
    if (!inst) continue;
    const meta = PACK_INSTRUMENTS[id];
    ok(inst.zones.length === meta.zones.length && inst.zones.length >= 4, `sample ${id}: zones ${inst.zones.length}`);
    let prevHi = -1;
    for (const z of inst.zones) {
      zonesN++;
      let pk = 0;
      let bad = false;
      for (let i = 0; i < z.len; i++) {
        const x = z.data[i];
        if (!Number.isFinite(x)) bad = true;
        pk = Math.max(pk, Math.abs(x));
      }
      ok(!bad && pk > 0.05 && pk < 1.2, `sample ${id}@${z.root.toFixed(1)}: peak ${pk.toFixed(2)}`);
      ok(z.len > z.rate * 0.4, `sample ${id}@${z.root.toFixed(1)}: 太短 ${z.len}`);
      ok(z.lo === prevHi + 1 || prevHi < 0, `sample ${id}: 音區不連續 (${z.lo} after ${prevHi})`);
      prevHi = z.hi;
      if (inst.sus) ok(!!z.loop && z.loop[1] - z.loop[0] > z.rate * 0.1 && z.loop[1] <= z.len + 8 && z.loop[0] >= 0, `sample ${id}@${z.root.toFixed(1)}: 持續音沒有合法循環 ${JSON.stringify(z.loop)}`);
    }
    ok(inst.zones[0].lo === 0 && inst.zones[inst.zones.length - 1].hi === 127, `sample ${id}: 音區沒有涵蓋全音域`);
  }
  for (const [p, id] of Object.entries(PACK_PROGRAM)) ok(!!PACK_INSTRUMENTS[id], `program ${p} → 不存在的樂器 ${id}`);
  const drums = await loadDrums();
  ok(!!drums && Object.keys(drums).length === Object.keys(PACK_DRUMS).length, 'drum samples');
  for (const genre of ['pop', 'jazz', 'rock', 'classical', 'kpop', 'cinematic'] as GenreId[]) {
    const song = composeSong({ genre, seed: 11, animSeconds: 3.2, sync: true, tempo: 1, key: -1 });
    await ensureSamplesFor(song);
    const mod = buildXm(song);
    const b = writeXm(mod);
    ok(b.length > 100_000 && b.length < 6_000_000, `${genre}: xm size ${b.length}`);
    for (const inst of mod.instruments) {
      ok(inst.samples.length >= 1 && inst.samples.length <= 16, `${genre}/${inst.name}: samples ${inst.samples.length}`);
      for (const v of inst.keymap) ok(v < inst.samples.length, `${genre}/${inst.name}: keymap ${v}`);
      for (const s of inst.samples) {
        ok(s.loopType === 0 || s.loopStart + s.loopLen <= s.data.length, `${genre}/${inst.name}: loop 超出 (${s.loopStart}+${s.loopLen} > ${s.data.length})`);
        ok(s.relNote >= -96 && s.relNote <= 95, `${genre}/${inst.name}: relNote ${s.relNote}`);
      }
    }
    console.log(`xm ${genre}: ${(b.length / 1024).toFixed(0)} KB, ${mod.instruments.length} 樂器, ${mod.channels} 聲道`);
  }
  console.log(`samples: ${ids.length} instruments, ${zonesN} zones, ${Object.keys(PACK_DRUMS).length} drum hits`);
}
console.log(fails ? `FAILED ${fails}` : 'ALL OK');
process.exit(fails ? 1 : 0);
