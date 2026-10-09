// 開發用：匯入 MIDI 的自動檢查。測試用的 MIDI 由這支程式自己產生（原創的簡單編曲），不依賴任何外部檔案。
// 用法：npx tsx scripts/midi-import-test.ts
import { writeFileSync } from 'node:fs';
import tonejs from '@tonejs/midi';
import { composeSong } from '../src/audio/compose';
import { clearImportedMidi, parseMidiFile, setImportedMidi } from '../src/audio/midiImport';
import { writeMidi } from '../src/audio/midi';
import { planAudio, sanitizeAudioPrefs } from '../src/audio/plan';
import { renderScheme } from '../src/audio/render';
import { AUDIO_DEFAULT, type SchemeId } from '../src/audio/types';
import { buildXm, writeXm } from '../src/audio/xm';
import { MOTION_MAP } from '../src/data/motion';
import { resolveMove, TUNE_DEFAULT } from '../src/engine/resolve';
import { useFfmpegDecoder } from './node-decoder';

const { Midi } = tonejs as unknown as { Midi: typeof import('@tonejs/midi').Midi };
useFfmpegDecoder();

let fails = 0;
const ok = (c: boolean, msg: string) => {
  if (!c) {
    fails++;
    console.log('  ✗', msg);
  }
};

// ---------- 產生測試 MIDI：C 大調，120 BPM，20 小節（40 秒） ----------
function makeTestMidi(bars = 20): Uint8Array {
  const midi = new Midi();
  midi.header.setTempo(120);
  const beat = 0.5;
  const bar = beat * 4;
  const prog = [
    { root: 36, chord: [60, 64, 67] }, // C
    { root: 43, chord: [59, 62, 67] }, // G
    { root: 33, chord: [60, 64, 69] }, // Am
    { root: 41, chord: [60, 65, 69] }, // F
  ];
  // 鼓（第 10 聲道）：含幾個程式沒有直接支援的 GM 鼓號（52、55、58）
  const d = midi.addTrack();
  d.channel = 9;
  for (let b = 0; b < bars; b++) {
    for (let i = 0; i < 8; i++) d.addNote({ midi: 42, time: b * bar + i * beat * 0.5, duration: 0.1, velocity: i % 2 ? 0.45 : 0.65 });
    for (const i of [0, 2]) d.addNote({ midi: 36, time: b * bar + i * beat, duration: 0.1, velocity: 0.9 });
    for (const i of [1, 3]) d.addNote({ midi: 38, time: b * bar + i * beat, duration: 0.1, velocity: 0.85 });
    if (b % 4 === 0) d.addNote({ midi: 52, time: b * bar, duration: 0.5, velocity: 0.6 });
    if (b % 4 === 2) d.addNote({ midi: 55, time: b * bar, duration: 0.5, velocity: 0.6 });
    if (b % 4 === 3) d.addNote({ midi: 58, time: b * bar + beat * 3, duration: 0.2, velocity: 0.6 });
  }
  // 貝斯（GM 33，指彈貝斯）
  const bass = midi.addTrack();
  bass.channel = 1;
  bass.instrument.number = 33;
  for (let b = 0; b < bars; b++) {
    const r = prog[b % 4].root;
    for (let i = 0; i < 4; i++) bass.addNote({ midi: i === 2 ? r + 7 : r, time: b * bar + i * beat, duration: beat * 0.9, velocity: 0.8 });
  }
  // 鋼琴和弦（每拍敲一次）
  const piano = midi.addTrack();
  piano.channel = 2;
  piano.instrument.number = 0;
  for (let b = 0; b < bars; b++) for (let i = 0; i < 4; i++) for (const p of prog[b % 4].chord) piano.addNote({ midi: p, time: b * bar + i * beat, duration: beat * 0.8, velocity: 0.55 });
  // 弦樂鋪底（長音）
  const pad = midi.addTrack();
  pad.channel = 3;
  pad.instrument.number = 48;
  for (let b = 0; b < bars; b++) for (const p of prog[b % 4].chord) pad.addNote({ midi: p - 12, time: b * bar, duration: bar * 0.98, velocity: 0.5 });
  // 長笛旋律（單音）
  const lead = midi.addTrack();
  lead.channel = 4;
  lead.instrument.number = 73;
  const scale = [72, 74, 76, 77, 79, 77, 76, 74];
  for (let b = 0; b < bars; b++) for (let i = 0; i < 8; i++) lead.addNote({ midi: scale[(i + b * 3) % scale.length] + (i === 7 ? -12 : 0), time: b * bar + i * beat * 0.5, duration: beat * 0.45, velocity: 0.75 });
  return midi.toArray();
}

const bytes = makeTestMidi(20);
// SF_WRITE_MIDI=路徑：把測試用的 MIDI 存成檔案（手動測試匯入介面用）
if (process.env.SF_WRITE_MIDI) writeFileSync(process.env.SF_WRITE_MIDI, bytes);

// 1) 解析
const imp = parseMidiFile(bytes, '測試.mid');
console.log(`解析：${imp.tracks.length} 軌，${imp.bars} 小節，${imp.bpm.toFixed(1)} BPM，${imp.key} ${imp.mode}，拍號 ${imp.meter}，角色 ${imp.tracks.map((t) => t.role).join('/')}`);
ok(imp.name === '測試', `檔名：${imp.name}`);
ok(Math.abs(imp.bpm - 120) < 0.5, `平均速度 ${imp.bpm}`);
ok(imp.bars === 20 && imp.meter === 4, `小節數 ${imp.bars}／拍號 ${imp.meter}`);
const roles = imp.tracks.map((t) => t.role);
ok(roles.includes('lead') && roles.includes('bass') && roles.includes('perc'), `角色 ${roles}`);
ok(roles.includes('chord') || roles.includes('pad'), `要有和弦或鋪底 ${roles}`);
ok(imp.tracks.find((t) => t.role === 'bass')!.program === 33, '貝斯保留 GM 33 音色');
ok(imp.tracks.find((t) => t.role === 'lead')!.program === 73, '主旋律保留 GM 73 音色');
ok(imp.key === 0 && imp.mode === 'major', `調性偵測：${imp.key} ${imp.mode}`);
const drum = imp.tracks.find((t) => t.drum)!;
ok(!!drum && drum.notes.every((n) => n.pitch >= 36 && n.pitch <= 81), '鼓號都整理在支援的範圍內');
ok(!drum.notes.some((n) => n.pitch === 52 || n.pitch === 55 || n.pitch === 58), '52／55／58 號鼓要被對應到支援的鼓號');

// 2) 壞檔案
for (const [label, b] of [['亂碼', new Uint8Array([1, 2, 3, 4, 5])], ['空檔', new Uint8Array(0)]] as [string, Uint8Array][]) {
  let threw = false;
  try {
    parseMidiFile(b, 'x.mid');
  } catch {
    threw = true;
  }
  ok(threw, `${label}要丟出錯誤`);
}
{
  const empty = new Midi();
  empty.addTrack();
  let msg = '';
  try {
    parseMidiFile(empty.toArray(), 'empty.mid');
  } catch (e) {
    msg = (e as Error).message;
  }
  ok(msg.includes('沒有音符'), `沒有音符的 MIDI：${msg}`);
}

// 3) 轉成 Song：與動畫對齊、段落、移調
setImportedMidi(bytes, '測試.mid');
const base = { genre: 'pop' as const, seed: 11, tempo: 1, key: -1, piece: 'import' };
for (const L of [2.2, 3.2, 4.2, 8]) {
  const s = composeSong({ ...base, animSeconds: L, sync: true });
  ok(s.animLoops > 0 && Math.abs(s.seconds - s.animLoops * L) < 1e-6, `L=${L}：循環 ${s.seconds} vs ${s.animLoops}×${L}`);
  ok(s.bpm >= 96 && s.bpm <= 150, `L=${L}：速度 ${s.bpm}`);
  ok(s.bars === 20 && s.steps === 320, `L=${L}：小節 ${s.bars}／步數 ${s.steps}`);
}
const free = composeSong({ ...base, animSeconds: 3.2, sync: false });
ok(free.animLoops === 0 && Math.abs(free.bpm - 120) < 0.5 && Math.abs(free.seconds - 40) < 0.1, `不對齊：${free.bpm} BPM／${free.seconds} 秒`);
const slow = composeSong({ ...base, animSeconds: 3.2, sync: false, tempo: 0.8 });
ok(Math.abs(slow.bpm - 96) < 0.5, `速度偏好 0.8：${slow.bpm}`);

for (const s of [free, composeSong({ ...base, animSeconds: 3.2, sync: true })]) {
  for (const tr of s.tracks) {
    for (const n of tr.notes) {
      ok(n.t >= 0 && n.t < s.steps && n.dur > 0 && n.vel > 0 && n.vel <= 1, `${tr.id}: 音符 t=${n.t} dur=${n.dur} vel=${n.vel}`);
      if (!tr.drum) ok(n.pitch >= 24 && n.pitch <= 108, `${tr.id}: 音高 ${n.pitch}`);
    }
  }
}
ok(free.chords.length > 4 && free.chords[0].label === 'C', `和弦標示：${free.chords.slice(0, 5).map((c) => c.label)}`);

const seg = composeSong({ ...base, animSeconds: 3.2, sync: false, midiStart: 4, midiBars: 8 });
ok(seg.bars === 8 && seg.steps === 128, `段落 8 小節：${seg.bars}／${seg.steps}`);
ok(seg.tracks.every((t) => t.notes.every((n) => n.t < 128)), '段落裡的音符都在 8 小節內');
const total = free.tracks.reduce((s, t) => s + t.notes.length, 0);
const part = seg.tracks.reduce((s, t) => s + t.notes.length, 0);
ok(part < total * 0.5 && part > total * 0.3, `段落音符 ${part} / 全曲 ${total}`);
const empty = composeSong({ ...base, animSeconds: 3.2, sync: false, midiStart: 500, midiBars: 4 });
ok(empty.tracks.length > 0, '起點超過全曲長度時要退回有內容的段落');

const up = composeSong({ ...base, animSeconds: 3.2, sync: false, key: 7 });
ok(up.key === 7, `移調：${up.key}`);
const lead0 = free.tracks.find((t) => t.role === 'lead')!.notes;
const lead7 = up.tracks.find((t) => t.role === 'lead')!.notes;
ok(lead0.length === lead7.length && lead0.every((n, i) => ((lead7[i].pitch - n.pitch) % 12 + 12) % 12 === 7), '移調後旋律整體平移 7 個半音（可差八度）');
ok(JSON.stringify(composeSong({ ...base, animSeconds: 3.2, sync: true })) === JSON.stringify(composeSong({ ...base, animSeconds: 3.2, sync: true })), '同樣的設定要得到同一首歌');

// 4) 導出：MIDI 往返、XM 多個樂段與聲道上限
{
  const s = composeSong({ ...base, animSeconds: 3.2, sync: true });
  const back = new Midi(writeMidi(s));
  const want = s.tracks.reduce((a, t) => a + t.notes.length, 0);
  const got = back.tracks.reduce((a, t) => a + t.notes.length, 0);
  ok(got === want, `MIDI 往返：${got} vs ${want}`);
  const mod = buildXm(s);
  const b = writeXm(mod);
  const dv = new DataView(b.buffer);
  const pats = Math.ceil(mod.rows / 256);
  ok(mod.rows === 320 && pats === 2, `XM 列數 ${mod.rows}`);
  ok(dv.getUint16(64, true) === pats && dv.getUint16(70, true) === pats, `XM 樂段數 ${dv.getUint16(70, true)}／曲長 ${dv.getUint16(64, true)}`);
  ok(mod.channels <= 32 && mod.channels === dv.getUint16(68, true), `XM 聲道 ${mod.channels}`);
  console.log(`導出：MIDI ${got} 個音；XM ${(b.length / 1024).toFixed(0)} KB，${mod.rows} 列 ${pats} 個樂段，${mod.channels} 聲道，${mod.instruments.length} 樂器`);
}

// 5) 每個聲音方案都能演奏匯入的歌（取 6 小節）
for (const scheme of ['nes', 'gb', 'sid', 'fm', 'midi', 'xm'] as SchemeId[]) {
  const s = composeSong({ ...base, animSeconds: 3.2, sync: true, midiStart: 0, midiBars: 6 });
  const t0 = performance.now();
  const pcm = await renderScheme(s, scheme, { sr: 44100, seed: 11 });
  const ms = Math.round(performance.now() - t0);
  let peak = 0;
  let sum = 0;
  let bad = 0;
  for (let i = 0; i < pcm.l.length; i++) {
    const a = pcm.l[i];
    const c = pcm.r[i];
    if (!isFinite(a) || !isFinite(c)) bad++;
    peak = Math.max(peak, Math.abs(a), Math.abs(c));
    sum += a * a + c * c;
  }
  const rms = Math.sqrt(sum / (2 * pcm.l.length));
  ok(bad === 0 && peak <= 1.001 && rms > 0.05 && rms < 0.2, `${scheme}：peak ${peak.toFixed(2)} rms ${rms.toFixed(3)} NaN ${bad}`);
  console.log(`渲染 ${scheme.padEnd(4)} ${s.seconds.toFixed(1)}s  peak ${peak.toFixed(2)} rms ${rms.toFixed(3)} ${ms}ms`);
}

// 6) 計畫與偏好：選了匯入就用匯入的歌；匯入被移除後退回自動作曲
{
  const baseMove = resolveMove([], MOTION_MAP, TUNE_DEFAULT);
  const input = { v: [{ id: 'flat', w: 1 }], m: [], subject: 'mascot' as const, tune: TUNE_DEFAULT, baseMove, prefs: { ...AUDIO_DEFAULT, piece: 'import', scheme: 'nes' as const } };
  const a = planAudio(input);
  ok(a.song.title.startsWith('測試') && a.genreLabel === '匯入的 MIDI', `計畫：${a.song.title}／${a.genreLabel}`);
  ok(a.profile.reasons[0].includes('匯入的 MIDI'), '理由欄寫匯入的 MIDI');
  const b = planAudio({ ...input, prefs: { ...input.prefs, midiStart: 4, midiBars: 8 } });
  ok(b.songKey !== a.songKey && b.song.bars === 8, '換段落＝另一首歌');
  const c = planAudio({ ...input, prefs: { ...input.prefs, scheme: 'xm' } });
  ok(c.songKey === a.songKey && c.musicKey !== a.musicKey, '換聲音方案＝同一首歌、不同聲音');
  ok(sanitizeAudioPrefs({ piece: 'import' }).piece === 'import', '有匯入時 import 是合法的');
  clearImportedMidi();
  ok(sanitizeAudioPrefs({ piece: 'import' }).piece === 'off', '移除匯入後 import 要退回 off');
  const d = planAudio(input);
  ok(!d.song.title.startsWith('測試'), '移除匯入後計畫退回自動作曲');
}

console.log(fails ? `FAILED ${fails}` : 'MIDI IMPORT OK');
process.exit(fails ? 1 : 0);
