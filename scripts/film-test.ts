// 2.0 β 的自動檢查：npx tsx scripts/film-test.ts（已接進 npm run test:audio）
// 整支片子的配樂（每一場一段）、專案的片子設定與真實音效的逐欄檢查、真實音效的 WAV 編解碼與修剪、Freesound 搜尋頁的解析。
import { composeSong, tempoFor } from '../src/audio/compose';
import { GENRES } from '../src/audio/genres';
import { renderScheme } from '../src/audio/render';
import { autoRange, bytesToB64, cutSfx, decodeWav16, encodeWav16, levelMatched, prepareSfx, STORE_SR } from '../src/audio/realSfx';
import { anchorAt, markerTime } from '../src/store/markers';
import type { GenreId, SectionKind } from '../src/audio/types';
import { sanitizeFilm, sanitizeSounds } from '../src/store/project';
import { parseFreesound } from './agent-bridge';
import { useFfmpegDecoder } from './node-decoder';

let fails = 0;
const ok = (cond: unknown, msg: string) => {
  if (!cond) {
    fails++;
    console.log('  ✗', msg);
  }
};

// 1) 每一場一段：段落邊界＝場景交界、速度照指定、長度＝小節數 × 小節長、最後一小節是主和弦
let n = 0;
for (const g of Object.keys(GENRES) as GenreId[]) {
  const { bpm, meter } = tempoFor({ genre: g, seed: 3, tempo: 1 });
  ok(bpm >= 52 && bpm <= 196 && (meter === 3 || meter === 4), `${g} 速度 ${bpm}`);
  const parts: { bars: number; kind: SectionKind; name: string }[] = [
    { bars: 2, kind: 'intro', name: '前奏' },
    { bars: 3, kind: 'build', name: '展開' },
    { bars: 4, kind: 'peak', name: '高潮' },
    { bars: 2, kind: 'outro', name: '回落' },
  ];
  const s = composeSong({ genre: g, seed: 3, animSeconds: 3, sync: false, tempo: 1, key: -1, film: { bpm, parts }, polish: true });
  n++;
  ok(s.bars === 11, `${g} 小節數 ${s.bars}`);
  ok(Math.abs(s.bpm - bpm) < 1e-9, `${g} 速度照指定`);
  ok(Math.abs(s.seconds - (11 * meter * 60) / bpm) < 1e-6, `${g} 長度 ${s.seconds}`);
  ok(s.sections?.map((x) => x.bar).join() === '0,2,5,9', `${g} 段落邊界 ${s.sections?.map((x) => x.bar).join()}`);
  ok(s.tracks.every((t) => t.notes.every((x) => Number.isFinite(x.t) && x.t >= 0 && x.t < s.steps + 1e-6)), `${g} 音符在範圍內`);
  const introDrums = s.tracks.some((t) => t.drum && t.notes.some((x) => x.t < 2 * s.stepsPerBar));
  ok(!introDrums, `${g} 前奏沒有鼓`);
}
console.log(`film score ok（${n} 種曲風）`);

// 2) 實際渲染一首整支片子的配樂：長度、沒有 NaN
useFfmpegDecoder();
{
  const { bpm } = tempoFor({ genre: 'pop', seed: 1, tempo: 1 });
  const s = composeSong({ genre: 'pop', seed: 1, animSeconds: 3, sync: false, tempo: 1, key: -1, film: { bpm, parts: [{ bars: 2, kind: 'build2', name: '展開' }, { bars: 2, kind: 'outro', name: '回落' }] }, polish: true });
  const pcm = await renderScheme(s, 'midi', { sr: 44100, seed: 1 });
  let nan = 0;
  for (let i = 0; i < pcm.l.length; i++) if (!Number.isFinite(pcm.l[i])) nan++;
  ok(Math.abs(pcm.l.length - Math.round(s.seconds * 44100)) <= 2, `渲染長度 ${pcm.l.length}`);
  ok(nan === 0, `NaN ${nan}`);
}
console.log('film render ok');

// 3) 片子設定與真實音效的逐欄檢查
{
  const f = sanitizeFilm({ fade: 99, sync: 'music', markers: [{ t: 5, label: 'B' }, { t: 1, label: 'A' }, { t: 'x' }, { t: -3, label: 'neg' }] });
  ok(f.fade === 2, `淡轉場上限 ${f.fade}`);
  ok(f.sync === 'music', '對齊方式');
  ok(f.markers.length === 3 && f.markers[0].t === 0 && f.markers[1].label === 'A', `標記排序與夾住 ${JSON.stringify(f.markers)}`);
  const d = sanitizeFilm(null);
  ok(d.sync === 'picture' && d.markers.length === 0, '預設片子設定');
  const wav = btoa(String.fromCharCode(...encodeWav16(new Float32Array([0, 0.5, -0.5, 0]), STORE_SR)));
  const sd = sanitizeSounds(
    [
      { id: 'a1', name: 'Knock', author: 'x', license: 'CC0', page: 'https://freesound.org/people/x/sounds/1/', dur: 0.5, b64: wav },
      { id: 'a2', name: 'Bad', author: 'x', license: 'CC0', page: 'javascript:alert(1)', dur: 1, b64: wav },
      { id: 'a3', b64: '!!!' },
    ],
    { land: 'a1', jump: 'nope', 'Bad Key': 'a1' },
  );
  ok(sd.sounds?.length === 2, `音效數 ${sd.sounds?.length}`);
  ok(sd.sounds?.[1].page === '', '不是 Freesound 的網址要拿掉');
  ok(JSON.stringify(sd.sfxMap) === '{"land":"a1"}', `對應表 ${JSON.stringify(sd.sfxMap)}`);
}
console.log('sanitize ok');

// 4) 真實音效：WAV 編解碼、修剪靜音、對齊峰值、長度上限
{
  const sr = 44100;
  const x = new Float32Array(sr * 6);
  for (let i = sr; i < sr * 1.3; i++) x[i] = Math.sin(i * 0.05) * 0.2 * Math.exp(-(i - sr) / 4000);
  const { pcm, dur } = prepareSfx(x, sr);
  ok(dur < 0.5 && dur > 0.05, `修剪後長度 ${dur.toFixed(3)}`);
  let peak = 0;
  for (const v of pcm) peak = Math.max(peak, Math.abs(v));
  ok(Math.abs(peak - 0.62) < 0.05, `峰值對齊 ${peak.toFixed(3)}`);
  const back = decodeWav16(encodeWav16(pcm, STORE_SR));
  ok(back.length === pcm.length, 'WAV 長度');
  let err = 0;
  for (let i = 0; i < pcm.length; i++) err = Math.max(err, Math.abs(back[i] - pcm[i]));
  ok(err < 1e-4, `WAV 誤差 ${err}`);
  const long = new Float32Array(sr * 10).map((_, i) => Math.sin(i * 0.01) * 0.5);
  ok(prepareSfx(long, sr).dur <= 4.01, '最長 4 秒');
  // 連續好幾下（0.5 秒一下、中間安靜）：只留第一下
  const multi = new Float32Array(sr * 3);
  for (const s0 of [0.2, 0.9, 1.6, 2.3]) for (let i = 0; i < sr * 0.12; i++) multi[Math.round(s0 * sr) + i] = Math.sin(i * 0.3) * 0.5 * (1 - i / (sr * 0.12));
  const one = prepareSfx(multi, sr).dur;
  ok(one > 0.1 && one < 0.45, `只留第一下 ${one.toFixed(3)} 秒`);
  // 音量對齊：真實音效的有聲部分響度調到和合成的一樣，峰值不超過 0.95
  const quietReal = new Float32Array(4410).map((_, i) => Math.sin(i * 0.2) * 0.05);
  const loudSynth = new Float32Array(4410).map((_, i) => Math.sin(i * 0.3) * 0.2);
  const lm = levelMatched(quietReal, loudSynth, 't');
  let lp = 0;
  for (const v of lm) lp = Math.max(lp, Math.abs(v));
  ok(Math.abs(lp - 0.2) < 0.01, `音量對齊後峰值 ${lp.toFixed(3)}`);
}
console.log('real sfx ok');

// 5) Freesound 搜尋頁的解析（照 sound skill 的格式做一段假資料）
{
  const html = `<div class="bw-search__result" data-sound-id="629987" data-title="Knocking on Wood Door (1)" data-username="Flem0527" data-duration="0.704" data-num-downloads="9288" data-mp3="https://cdn.freesound.org/previews/629/629987_12715066-lq.mp3"><span title="License: Creative Commons 0"></span><span aria-label="Average rating of 4.7"></span><span class="bw-rating__count">(135)</span><div class="max-h-60px x" > knocking on a <b>wooden</b> door &amp; more </div></div><div class="bw-search__result" data-sound-id="" data-mp3=""></div>`;
  const rows = parseFreesound(html);
  ok(rows.length === 1, `解析筆數 ${rows.length}`);
  const r = rows[0];
  ok(r?.preview.endsWith('-hq.mp3'), '試聽檔用高品質版');
  ok(r?.license === 'CC0' && r.downloads === 9288 && r.rating === 4.7 && r.votes === 135, `欄位 ${JSON.stringify(r)}`);
  ok(r?.desc === 'knocking on a wooden door & more', `描述 ${r?.desc}`);
  ok(r?.page === 'https://freesound.org/people/Flem0527/sounds/629987/', '頁面網址');
}
console.log('freesound parse ok');

// 6) 2.0 正式：標記黏在場景上（場景改長度、搬位置時跟著走）
{
  const shots = [
    { id: 'a', start: 0, dur: 4 },
    { id: 'b', start: 4, dur: 6 },
  ];
  const at = anchorAt({ shots, total: 10 }, 5.5);
  ok(at?.scene === 'b' && Math.abs((at?.off ?? -1) - 1.5) < 1e-9, `標記黏到第 2 場 ${JSON.stringify(at)}`);
  const m = { id: 'm', t: 5.5, label: 'x', ...at! };
  ok(markerTime(shots, 10, m) === 5.5, '沒改時位置不變');
  // 第 1 場變長 2 秒：標記跟著往後 2 秒
  ok(markerTime([{ id: 'a', start: 0, dur: 6 }, { id: 'b', start: 6, dur: 6 }], 12, m) === 7.5, '前一場變長，標記跟著往後');
  // 兩場對調：標記跟著第 2 場跑到前面
  ok(markerTime([{ id: 'b', start: 0, dur: 6 }, { id: 'a', start: 6, dur: 4 }], 10, m) === 1.5, '場景搬位置，標記跟著走');
  // 這一場變短到比 off 還短：停在這一場的結尾
  ok(markerTime([{ id: 'a', start: 0, dur: 4 }, { id: 'b', start: 4, dur: 1 }], 5, m) === 4.99, '場景變短，標記停在那一場的結尾');
  // 那一場被刪掉：用存著的 t（不超過片尾）
  ok(markerTime([{ id: 'a', start: 0, dur: 4 }], 4, m) === 3.99, '那一場刪掉時用存著的時間');
  // 舊專案（沒有 scene）：用 t
  ok(markerTime(shots, 10, { id: 'o', t: 2, label: '' }) === 2, '舊的標記用 t');
  // 逐欄檢查：黏的欄位留著、壞的丟掉
  const f = sanitizeFilm({ markers: [{ id: 'm1', t: 3, label: 'a', scene: 'b', off: 1.5 }, { id: 'm2', t: 1, label: 'b', scene: 'bad id!', off: 1 }, { id: 'm3', t: 2, label: 'c', scene: 'b', off: 'x' }] });
  const m1 = f.markers.find((x) => x.id === 'm1');
  ok(m1?.scene === 'b' && m1.off === 1.5, '黏的欄位跟著專案存讀');
  ok(f.markers.filter((x) => x.scene).length === 1, '壞的黏著欄位不收');
}
console.log('markers ok');

// 7) 2.0 正式：真實音效的片段與音量
{
  const sr = 44100;
  // 0.5 秒安靜 → 0.2 秒聲音 → 0.6 秒安靜 → 0.3 秒聲音
  const x = new Float32Array(Math.round(sr * 1.6));
  for (let i = 0; i < x.length; i++) {
    const t = i / sr;
    if ((t >= 0.5 && t < 0.7) || (t >= 1.3 && t < 1.6)) x[i] = Math.sin(i * 0.05) * 0.5;
  }
  const r = autoRange(x, sr);
  ok(r[0] > 0.48 && r[0] < 0.5 && r[1] > 0.7 && r[1] < 0.95, `自動選段只留第一下 ${r.map((v) => v.toFixed(3))}`);
  const p = prepareSfx(x, sr);
  ok(p.range[0] === r[0] && p.range[1] === r[1], 'prepareSfx 回報用了哪一段');
  // 自己選第二下
  const c = cutSfx(x, sr, 1.3, 1.6);
  ok(Math.abs(c.dur - 0.3) < 0.002, `自選片段長度 ${c.dur.toFixed(3)}`);
  let pk = 0;
  for (const v of c.pcm) pk = Math.max(pk, Math.abs(v));
  ok(Math.abs(pk - 0.62) < 0.03, `自選片段峰值對齊 ${pk.toFixed(3)}`);
  ok(Math.abs(c.pcm[0]) < 1e-6 && Math.abs(c.pcm[c.pcm.length - 1]) < 0.01, '自選片段開頭淡入、結尾淡出');
  ok(cutSfx(x, sr, 0, 30).dur <= 4.0001, '片段最長 4 秒');
  // 音量：+6 dB 約 2 倍、−6 dB 約一半（相對於對齊後）
  const real = new Float32Array(4410).map((_, i) => Math.sin(i * 0.2) * 0.05);
  const synth = new Float32Array(4410).map((_, i) => Math.sin(i * 0.3) * 0.2);
  const peakOf = (a: Float32Array) => a.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  const base = peakOf(levelMatched(real, synth, 'g'));
  const up = peakOf(levelMatched(real, synth, 'g', 6));
  const down = peakOf(levelMatched(real, synth, 'g', -6));
  ok(Math.abs(up / base - 1.995) < 0.02 && Math.abs(down / base - 0.501) < 0.01, `音量微調 +6／−6 dB：${(up / base).toFixed(3)}／${(down / base).toFixed(3)}`);
  ok(peakOf(levelMatched(real, synth, 'g', 12)) <= 0.99 + 1e-6, '調大也不會削波');
  // 逐欄檢查
  const b64 = bytesToB64(encodeWav16(new Float32Array(100), STORE_SR));
  const sv = sanitizeSounds([{ id: 's1', name: 'a', author: 'b', license: 'CC0', page: '', dur: 0.3, b64, gain: 3.3, range: [1.3, 1.6], preview: 'https://cdn.freesound.org/previews/1/1-hq.mp3' }, { id: 's2', name: 'a', author: 'b', license: 'CC0', page: '', dur: 0.3, b64, gain: 99, range: [2, 1], preview: 'https://evil.example/x.mp3' }], {});
  const s1 = sv.sounds?.[0];
  const s2 = sv.sounds?.[1];
  ok(s1?.gain === 3.5 && s1.range?.[0] === 1.3 && s1.preview?.startsWith('https://cdn.freesound.org/'), `音量、片段、試聽網址跟著專案 ${JSON.stringify({ g: s1?.gain, r: s1?.range })}`);
  ok(s2?.gain === 12 && !s2.range && !s2.preview, '壞的片段與外站網址不收、音量限制在 ±12');
}
console.log('sfx edit ok');

if (fails) {
  console.log(`FILM FAIL（${fails} 項）`);
  process.exit(1);
}
console.log('FILM OK');
