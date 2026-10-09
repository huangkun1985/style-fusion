// 取樣包建置腳本（開發用，離線執行一次即可；成品已存在 src/audio/pack/）。
// 用法：node scripts/samples/build.mjs [快取資料夾] [instrumentId...]
// 做的事：下載授權乾淨的取樣 → 轉單聲道 → 去前導靜音 → 量測實際音高 → 為持續音做無縫循環 → 音量一致化 → 壓成 MP3 → 輸出 TS 模組。
// 來源與授權見專案根目錄 CREDITS.md。需要網路（下載約 150 MB 的原始取樣，會快取在 scripts/samples/.cache）。
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', '..', 'src', 'audio', 'pack');
const CACHE = process.argv[2] || join(HERE, '.cache');
const ONLY = process.argv.slice(3);
mkdirSync(CACHE, { recursive: true });
mkdirSync(join(OUT, 'inst'), { recursive: true });

const TJ = 'https://nbrosowsky.github.io/tonejs-instruments/samples';
const VC = 'https://raw.githubusercontent.com/sgossner/VCSL/master';
const NOTE = { C: 0, Cs: 1, 'C#': 1, D: 2, Ds: 3, 'D#': 3, E: 4, F: 5, Fs: 6, 'F#': 6, G: 7, Gs: 8, 'G#': 8, A: 9, As: 10, 'A#': 10, B: 11 };
const midiOf = (n) => {
  const m = n.match(/^([A-G][s#]?)(-?\d)$/);
  return NOTE[m[1]] + (parseInt(m[2]) + 1) * 12;
};

// ---------- 樂器表 ----------
// tj: Tone.js-Instruments（資料夾, 要用的音名）；vc: VCSL（路徑, 檔名→音名, 可選的音名過濾）
// sus：持續音（做循環）；sec：最長秒數；sr：取樣率；programs：對應的 GM 音色號；gain：相對響度
const INST = [
  { id: 'piano', src: 'VSCO 2 CE (CC0)', tj: ['piano', 'A1 C2 Ds2 Fs2 A2 C3 Ds3 Fs3 A3 C4 Ds4 Fs4 A4 C5 Ds5 Fs5 A5 C6 Ds6 Fs6 A6 C7'.split(' ')], sec: 3.6, sr: 44100, programs: [0, 1, 2, 3], gain: 1 },
  { id: 'bass', src: 'Karoryfer (CC0)', tj: ['bass-electric', 'Cs1 E1 G1 As1 Cs2 E2 G2 As2 Cs3 E3 G3 As3 Cs4 E4 G4 As4 Cs5'.split(' ')], sec: 2.4, sr: 32000, programs: [32, 33, 34, 35, 36, 37], gain: 1 },
  { id: 'nylon', src: 'Freesound quartertone (CC-BY)', tj: ['guitar-nylon', 'D2 E2 Fs2 A2 B2 Cs3 E3 G3 A3 B3 Cs4 Ds4 Fs4 A4 B4 Cs5 E5'.split(' ')], sec: 3.0, sr: 44100, programs: [24], gain: 1 },
  { id: 'steel', src: 'Univ. of Iowa MIS (free)', tj: ['guitar-acoustic', 'D2 F2 Gs2 B2 D3 F3 Gs3 B3 D4 F4 Gs4 B4 D5'.split(' ')], sec: 3.0, sr: 44100, programs: [25], gain: 1 },
  { id: 'eguitar', src: 'Karoryfer (CC0)', tj: ['guitar-electric', 'Cs2 E2 Fs2 A2 C3 Ds3 Fs3 A3 C4 Ds4 Fs4 A4 C5 Ds5 Fs5 A5 C6'.split(' ')], sec: 2.6, sr: 44100, programs: [26, 27, 28, 29, 30, 31], gain: 1 },
  { id: 'harp', src: 'VSCO 2 CE (CC0)', tj: ['harp', 'E1 G1 B1 D2 F2 A2 C3 E3 G3 B3 D4 F4 A4 C5 E5 G5 B5 D6 F6 A6 B6 D7 F7'.split(' ')], sec: 3.4, sr: 44100, programs: [46], gain: 1 },
  { id: 'organ', src: 'VSCO 2 CE (CC0)', tj: ['organ', 'C1 Ds1 Fs1 A1 C2 Ds2 Fs2 A2 C3 Ds3 Fs3 A3 C4 Ds4 Fs4 A4 C5 Ds5 Fs5 A5 C6'.split(' ')], sec: 3.0, sr: 44100, sus: true, programs: [16, 17, 18, 19, 20], gain: 0.8 },
  { id: 'harmonium', src: 'Freesound donyaquick (CC0)', tj: ['harmonium', 'C2 Ds2 Fs2 A2 C3 Ds3 Fs3 A3 C4 E4 Gs4 C5 Cs5'.split(' ')], sec: 3.0, sr: 44100, sus: true, programs: [21, 22, 23], gain: 0.85 },
  { id: 'violin', src: 'VSCO 2 CE (CC0)', tj: ['violin', 'G3 A3 C4 E4 G4 A4 C5 E5 G5 A5 C6 E6 G6 A6 C7'.split(' ')], sec: 3.2, sr: 44100, sus: true, programs: [40, 110], gain: 0.9 },
  { id: 'cello', src: 'Freesound flcellogrl (CC-BY)', tj: ['cello', 'C2 D2 E2 G2 A2 C3 D3 E3 G3 A3 C4 D4 E4 G4 A4 C5'.split(' ')], sec: 3.0, sr: 44100, sus: true, programs: [42], gain: 0.95 },
  { id: 'contrabass', src: 'VSCO 2 CE (CC0)', tj: ['contrabass', 'Fs1 G1 As1 C2 D2 E2 Fs2 Gs2 A2 Cs3 E3 Gs3 B3'.split(' ')], sec: 2.6, sr: 32000, sus: true, programs: [43], gain: 0.9 },
  { id: 'trumpet', src: 'VSCO 2 CE (CC0)', tj: ['trumpet', 'F3 A3 C4 Ds4 F4 G4 As4 D5 F5 A5 C6'.split(' ')], sec: 2.4, sr: 44100, sus: true, programs: [56, 59], gain: 0.9 },
  { id: 'trombone', src: 'VSCO 2 CE (CC0)', tj: ['trombone', 'As1 Cs2 Ds2 F2 Gs2 As2 C3 D3 Ds3 F3 Gs3 As3 C4 Cs4 D4 Ds4 F4'.split(' ')], sec: 2.6, sr: 32000, sus: true, programs: [57], gain: 0.9 },
  { id: 'tuba', src: 'VSCO 2 CE (CC0)', tj: ['tuba', 'F1 As1 Ds2 F2 As2 D3 F3 As3 D4'.split(' ')], sec: 2.6, sr: 32000, sus: true, programs: [58], gain: 0.9 },
  { id: 'horn', src: 'VSCO 2 CE (CC0)', tj: ['french-horn', 'A1 C2 Ds2 G2 D3 F3 A3 C4 D5 F5'.split(' ')], sec: 2.8, sr: 32000, sus: true, programs: [60, 69], gain: 0.9 },
  { id: 'sax', src: 'Karoryfer (CC0)', tj: ['saxophone', 'Cs3 Ds3 F3 G3 As3 B3 D4 E4 Fs4 A4 C5 D5 E5 G5'.split(' ')], sec: 2.6, sr: 44100, sus: true, programs: [64, 65, 66, 67], gain: 0.9 },
  { id: 'flute', src: 'VSCO 2 CE (CC0)', tj: ['flute', 'C4 E4 A4 C5 E5 A5 C6 E6 A6 C7'.split(' ')], sec: 2.6, sr: 44100, sus: true, programs: [72, 73, 74, 75, 76, 77, 78, 79], gain: 0.9 },
  { id: 'clarinet', src: 'VSCO 2 CE (CC0)', tj: ['clarinet', 'D3 F3 As3 D4 F4 As4 D5 F5 As5 D6 Fs6'.split(' ')], sec: 2.6, sr: 44100, sus: true, programs: [71], gain: 0.9 },
  { id: 'bassoon', src: 'VSCO 2 CE (CC0)', tj: ['bassoon', 'G2 A2 C3 G3 A3 C4 E4 G4 A4 C5'.split(' ')], sec: 2.4, sr: 32000, sus: true, programs: [70], gain: 0.9 },
  { id: 'xylophone', src: 'VSCO 2 CE (CC0)', tj: ['xylophone', 'G4 C5 G5 C6 G6 C7 G7 C8'.split(' ')], sec: 1.4, sr: 44100, programs: [13], gain: 0.9 },
  { id: 'marimba', src: 'VCSL (CC0)', vc: ['Idiophones/Struck Idiophones/Marimba', (n) => (n.includes('_med_') ? n.match(/_([A-G]#?\d)_med/)?.[1] : null), (note) => note !== 'F1'], sec: 1.8, sr: 44100, programs: [12], gain: 0.95 },
  { id: 'vibes', src: 'VCSL (CC0)', vc: ['Idiophones/Struck Idiophones/Vibraphone', (n) => (n.startsWith('Soft Mallets/') && n.includes('_v2_') ? n.match(/_([A-G]#?\d)_v2/)?.[1] : null)], sec: 3.0, sr: 44100, programs: [11], gain: 0.9 },
  { id: 'glock', src: 'VCSL (CC0)', vc: ['Idiophones/Struck Idiophones/Glockenspiel', (n) => (n.startsWith('glock_medium_') ? n.match(/glock_medium_([A-G]#?\d)_/)?.[1] : null)], sec: 2.2, sr: 44100, programs: [8, 9, 10], gain: 0.9 },
  { id: 'kalimba', src: 'VCSL (CC0)', vc: ['Idiophones/Plucked Idiophones/Kalimba, Kenya', (n) => n.match(/MainSpirit_([A-G]#?\d)_k/)?.[1] ?? null], sec: 2.4, sr: 44100, programs: [108], gain: 0.95 },
  { id: 'bells', src: 'VCSL (CC0)', vc: ['Idiophones/Struck Idiophones/Tubular Bells 1', (n) => n.match(/chimes_([A-G]#?\d)_(ff|f|fff)_/)?.[1] ?? null], sec: 3.4, sr: 44100, programs: [14], gain: 0.85, trust: 'label' },
  { id: 'epiano', src: 'VCSL TX81Z (CC0)', vc: ['Electrophones/TX81Z/FM Piano', (n) => n.match(/FMPiano_([A-G]#?\d)_vl2/)?.[1] ?? null, (note) => /^[CE][1-6]$/.test(note)], sec: 3.2, sr: 44100, programs: [4, 5], gain: 0.95 },
];

// 鼓與打擊樂（單發，不隨音高變）：[id, VCSL 路徑, 最長秒數]
const DRUMS = [
  ['kick', 'Membranophones/Struck Membranophones/Bass Drum 2/bassdrum_hit_mf1.wav', 0.5],
  ['kickHard', 'Membranophones/Struck Membranophones/Bass Drum 2/bassdrum_hit_ff.wav', 0.6],
  ['snareS', 'Membranophones/Struck Membranophones/Snare Drum, Modern 1/Snare2_HitSN_v3_rr1_Mid.wav', 0.5],
  ['snareM', 'Membranophones/Struck Membranophones/Snare Drum, Modern 1/Snare2_HitSN_v6_rr1_Mid.wav', 0.5],
  ['snareH', 'Membranophones/Struck Membranophones/Snare Drum, Modern 1/Snare2_HitSN_v9_rr1_Mid.wav', 0.55],
  ['rim', 'Membranophones/Struck Membranophones/Snare Drum, Modern 2/Snare3M_Xstick_v2_rr1_Mid.wav', 0.3],
  ['hatC', 'Idiophones/Struck Idiophones/Hi-Hat Cymbal/HiHat_HitC_v2_rr1_Mid.wav', 0.25],
  ['hatC2', 'Idiophones/Struck Idiophones/Hi-Hat Cymbal/HiHat_HitC_v4_rr1_Mid.wav', 0.25],
  ['hatP', 'Idiophones/Struck Idiophones/Hi-Hat Cymbal/HiHat_Close_rr1_Mid.wav', 0.2],
  ['hatO', 'Idiophones/Struck Idiophones/Hi-Hat Cymbal/HiHat_HitO_rr1_Mid.wav', 0.9],
  ['tom', 'Membranophones/Struck Membranophones/Tom 1/Stick/TomH_HitS_v3_rr1_Mid.wav', 0.6],
  ['crash', 'Idiophones/Struck Idiophones/Clash Cymbals 1/cymbal_crash1_mf1.wav', 2.2],
  ['ride', 'Idiophones/Struck Idiophones/Suspended Cymbal 1/susCymb1_hit_stick_mp1.wav', 1.4],
  ['rideBell', 'Idiophones/Struck Idiophones/Suspended Cymbal 1/susCymb1_hit_bell_mf1.wav', 1.4],
  ['clap', 'Idiophones/Struck Idiophones/Claps/Clap_rr1.wav', 0.5],
  ['clap2', 'Idiophones/Struck Idiophones/Claps/Clap_rr3.wav', 0.5],
  ['tamb', 'Idiophones/Struck Idiophones/Tambourine 1/Tamb1_Hit_v2_rr1_Mid.wav', 0.5],
  ['shaker', 'Idiophones/Struck Idiophones/Shaker, Small/Mid_ShakerDouble_Down_rr1.wav', 0.3],
  ['cowbell', 'Idiophones/Struck Idiophones/Cowbells/Cowbell1_Hit_v3_rr1_Mid.wav', 0.5],
  ['wood', 'Idiophones/Struck Idiophones/Woodblock/wood_click_mp.wav', 0.25],
  ['tri', 'Idiophones/Struck Idiophones/Triangles/Triangle1_Hit_v1_rr1_Mid.wav', 1.6],
  ['conga', 'Membranophones/Struck Membranophones/Conga/Conga_HitN_v2_rr1_Sum.wav', 0.5],
  ['bongo', 'Membranophones/Struck Membranophones/Bongos/BongoH_Hit1_v2_rr1_Mid.wav', 0.4],
  ['cajon', 'Idiophones/Struck Idiophones/Cajon/Cajon_hit1_f_rr1.wav', 0.4],
  ['timpani', 'Membranophones/Struck Membranophones/Timpani 1/Hit/Timpani1_Hit_v3_rr3_Sum.wav', 1.8],
];

// ---------- 工具 ----------
async function fetchCached(url, name) {
  const f = join(CACHE, name.replace(/[^\w.\-]+/g, '_'));
  if (existsSync(f)) return f;
  for (let t = 0; t < 4; t++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      writeFileSync(f, Buffer.from(await r.arrayBuffer()));
      return f;
    } catch (e) {
      if (t === 3) throw new Error(`${url}: ${e.message}`);
      await new Promise((r) => setTimeout(r, 800 * (t + 1)));
    }
  }
}
const enc = (p) => p.split('/').map(encodeURIComponent).join('/');

function decode(file, sr) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(sr), '-f', 'f32le', '-'], { maxBuffer: 1 << 30 });
  if (r.status !== 0) throw new Error(`ffmpeg decode ${file}: ${r.stderr}`);
  const b = r.stdout;
  return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength - (b.byteLength % 4)));
}
function encodeMp3(x, sr, q) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-f', 'f32le', '-ar', String(sr), '-ac', '1', '-i', '-', '-c:a', 'libmp3lame', '-q:a', String(q), '-f', 'mp3', '-'], { input: Buffer.from(x.buffer, x.byteOffset, x.byteLength), maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error(`ffmpeg encode: ${r.stderr}`);
  return r.stdout;
}

function peakOf(x) {
  let m = 0;
  for (let i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i]));
  return m;
}
function trimStart(x, sr) {
  const th = peakOf(x) * 0.02;
  let i = 0;
  while (i < x.length && Math.abs(x[i]) < th) i++;
  i = Math.max(0, i - Math.round(0.004 * sr));
  return x.slice(i);
}
function rms(x, a, b) {
  let s = 0;
  a = Math.max(0, a);
  b = Math.min(x.length, b);
  for (let i = a; i < b; i++) s += x[i] * x[i];
  return Math.sqrt(s / Math.max(1, b - a));
}
/** 以自相關估計基頻（Hz）：在 [fLo, fHi] 範圍內找最大的正規化相關峰，並做拋物線內插 */
function estimateF0(x, sr, fLo, fHi, start, len) {
  const a = Math.min(start, Math.max(0, x.length - len - 1));
  const W = Math.min(len, x.length - a - 1);
  const lagMin = Math.max(2, Math.floor(sr / fHi));
  const lagMax = Math.min(Math.ceil(sr / fLo), W - 4);
  let best = -1;
  let bestLag = lagMin;
  const r = new Float64Array(lagMax + 3);
  for (let lag = lagMin; lag <= lagMax + 1; lag++) {
    let s = 0;
    let e1 = 0;
    let e2 = 0;
    const n = W - lag;
    for (let i = 0; i < n; i++) {
      const u = x[a + i];
      const v = x[a + i + lag];
      s += u * v;
      e1 += u * u;
      e2 += v * v;
    }
    r[lag] = s / Math.sqrt(e1 * e2 + 1e-12);
    if (lag <= lagMax && r[lag] > best) {
      best = r[lag];
      bestLag = lag;
    }
  }
  if (bestLag <= lagMin || bestLag >= lagMax) return { f: sr / bestLag, conf: best };
  const y0 = r[bestLag - 1];
  const y1 = r[bestLag];
  const y2 = r[bestLag + 1];
  const d = (y0 - y2) / (2 * (y0 - 2 * y1 + y2) || 1);
  return { f: sr / (bestLag + d), conf: best };
}
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const ftom = (f) => 69 + 12 * Math.log2(f / 440);

/**
 * 在「穩定段」烘焙等功率交叉淡化的循環。來源取樣的尾端都有淡出，所以不能拿最尾端來循環：
 * 在 50%–74% 的位置找結尾點 E，循環長度先取整數個週期，再在 ±0.6 個週期內逐點搜尋，
 * 挑「E 之前一段波形」和「一個循環之前的波形」相關係數最高的組合，E 之後的資料直接丟掉。
 * 回傳 { loop: [起點, 終點], end, corr }，呼叫端要把資料截到 end。
 */
function bakeLoop(x, sr, f0, relaxed = false) {
  const period = sr / f0;
  const Nall = x.length;
  const minLoop = relaxed ? Math.min(Math.round(0.16 * sr), Math.floor(Nall * 0.3)) : Math.min(Math.round(0.3 * sr), Math.floor(Nall * 0.35));
  const nom = Math.max(period, Math.round(Math.ceil(minLoop / period) * period));
  const span = Math.ceil(period * 0.6);
  const W = Math.min(Math.round(0.08 * sr), Math.floor(nom / 2));
  let best = null;
  for (const frac of [0.5, 0.58, 0.66, 0.74]) {
    const E = Math.floor(Nall * frac);
    for (let L = Math.round(nom) - span; L <= Math.round(nom) + span; L++) {
      if (L < W || L + W > E || E - L < Math.round((relaxed ? 0.04 : 0.08) * sr)) continue;
      let s = 0;
      let e1 = 0;
      let e2 = 0;
      for (let i = 0; i < W; i++) {
        const a = x[E - 1 - i];
        const b = x[E - 1 - i - L];
        s += a * b;
        e1 += a * a;
        e2 += b * b;
      }
      const cc = s / Math.sqrt(e1 * e2 + 1e-12);
      if (!best || cc > best.cc) best = { E, L, cc };
    }
  }
  if (!best) return null;
  const { E, L, cc } = best;
  // 相位吻合得越差，交叉淡化就拉得越長
  const xf = Math.min(Math.round((cc > 0.85 ? 0.12 : cc > 0.6 ? 0.2 : 0.3) * sr), Math.floor(L / 2));
  for (let j = 0; j < xf; j++) {
    const w = j / xf;
    const idx = E - xf + j;
    x[idx] = x[idx] * Math.cos((w * Math.PI) / 2) + x[idx - L] * Math.sin((w * Math.PI) / 2);
  }
  return { loop: [E - L, E], end: E, corr: cc };
}

const report = [];
function processZone(file, label, def, kind) {
  const rate = def.sr;
  let x = trimStart(decode(file, rate), rate);
  const maxN = Math.round(def.sec * rate);
  let truncated = false;
  if (x.length > maxN) {
    x = x.slice(0, maxN);
    truncated = true;
  }
  let root = label ?? 60;
  if (kind === 'pitched') {
    const fl = mtof(label);
    const att = Math.round(0.12 * rate);
    const W = Math.round(Math.max(0.22, 6 / fl) * rate);
    const est = estimateF0(x, rate, fl / 2.06, fl * 2.06, att, W);
    let m = ftom(est.f);
    while (m - label > 6) m -= 12;
    while (label - m > 6) m += 12;
    if (process.env.DEBUG_PITCH) console.log(`  ${def.id} 標示 ${label} 量測 ${m.toFixed(2)} 信心 ${est.conf.toFixed(2)}`);
    const trustMeasure = def.trust !== 'label' && ((Math.abs(m - label) <= 0.7 && est.conf > 0.6) || (est.conf >= 0.95 && Math.abs(m - label) <= 6));
    if (trustMeasure) root = m;
    else if (def.trust === 'label') root = label;
    else report.push(`  ? ${def.id} ${label}: 量測 ${m.toFixed(2)}（信心 ${est.conf.toFixed(2)}），採用標示音高`);
  }
  let loop = null;
  if (def.sus && kind === 'pitched') {
    const r = bakeLoop(x, rate, mtof(root)) ?? bakeLoop(x, rate, mtof(root), true);
    if (!r) report.push(`  ! ${def.id} ${label}: 太短，無法做循環`);
    else {
      // 循環終點之後多留 0.15 秒真實的聲音：MP3 編碼的最後一個區塊會被削弱，終點正好在串流尾端的話，
      // 循環接縫會落在被削弱的樣本上（實測會出現約 0.3 的跳變，聽起來是一聲「啪」）
      x = x.slice(0, Math.min(x.length, r.end + Math.round(0.15 * rate)));
      loop = r.loop;
      if (r.corr < 0.6) report.push(`  ~ ${def.id} ${label}: 循環相位吻合度只有 ${r.corr.toFixed(2)}`);
    }
  } else if (truncated) {
    const fade = Math.round(0.15 * rate);
    for (let i = 0; i < fade; i++) x[x.length - 1 - i] *= i / fade;
  }
  const ref = rms(x, 0, Math.round(0.4 * rate));
  let g = kind === 'drum' ? 0.9 / Math.max(peakOf(x), 1e-5) : (0.11 * (def.gain ?? 1)) / Math.max(ref, 1e-5);
  const pk = peakOf(x) * g;
  if (pk > 0.95) g *= 0.95 / pk;
  for (let i = 0; i < x.length; i++) x[i] *= g;
  return { x, root, loop, rate };
}

async function main() {
  // VCSL 的檔案清單（GitHub API）；快取資料夾裡沒有就先抓一份
  const treeFile = join(CACHE, 'vcsl_tree.json');
  if (!existsSync(treeFile)) {
    const r = await fetch('https://api.github.com/repos/sgossner/VCSL/git/trees/master?recursive=1', { headers: { 'User-Agent': 'style-fusion-sample-builder' } });
    if (!r.ok) throw new Error(`無法取得 VCSL 檔案清單：HTTP ${r.status}`);
    writeFileSync(treeFile, Buffer.from(await r.arrayBuffer()));
  }
  const manifest = { instruments: {}, drums: {}, programs: {} };
  let total = 0;
  const jobs = INST.filter((d) => !ONLY.length || ONLY.includes(d.id));
  for (const def of jobs) {
    let items = [];
    if (def.tj) {
      const [folder, notes] = def.tj;
      items = notes.map((n) => ({ url: `${TJ}/${folder}/${n}.mp3`, name: `tj_${folder}_${n}.mp3`, label: midiOf(n) }));
    } else {
      const [dir, pickFn, keep] = def.vc;
      const tree = JSON.parse(readFileSync(join(CACHE, 'vcsl_tree.json'), 'utf8')).tree;
      const seen = new Set();
      for (const t of tree) {
        if (t.type !== 'blob' || !t.path.startsWith(dir + '/')) continue;
        const nm = pickFn(t.path.slice(dir.length + 1));
        if (!nm || seen.has(nm)) continue;
        if (keep && !keep(nm)) continue;
        seen.add(nm);
        items.push({ url: `${VC}/${enc(t.path)}`, name: `vc_${def.id}_${nm}.wav`, label: midiOf(nm.replace('#', 's')) });
      }
    }
    items.sort((a, b) => a.label - b.label);
    const zones = [];
    for (let i = 0; i < items.length; i += 6) {
      const batch = items.slice(i, i + 6);
      const files = await Promise.all(batch.map((it) => fetchCached(it.url, it.name)));
      batch.forEach((it, k) => zones.push(processZone(files[k], it.label, def, 'pitched')));
    }
    zones.sort((a, b) => a.root - b.root);
    for (let i = zones.length - 1; i > 0; i--) if (zones[i].root - zones[i - 1].root < 1) zones.splice(i, 1);
    const out = zones.map((z, i) => {
      const lo = i > 0 ? Math.floor((zones[i - 1].root + z.root) / 2) + 1 : 0;
      const hi = i < zones.length - 1 ? Math.floor((z.root + zones[i + 1].root) / 2) : 127;
      const mp3 = encodeMp3(z.x, z.rate, def.q ?? 4);
      total += mp3.length;
      return { root: +z.root.toFixed(3), lo, hi, rate: z.rate, len: z.x.length, loop: z.loop, b64: mp3.toString('base64'), bytes: mp3.length };
    });
    manifest.instruments[def.id] = { id: def.id, src: def.src, sus: !!def.sus, programs: def.programs, zones: out.map(({ b64, bytes, ...r }) => r) };
    for (const p of def.programs) manifest.programs[p] = def.id;
    writeFileSync(join(OUT, 'inst', `${def.id}.ts`), `// 自動產生（scripts/samples/build.mjs）。來源：${def.src}\nexport default ${JSON.stringify(out.map((z) => z.b64))} as string[];\n`);
    console.log(`${def.id.padEnd(11)} ${String(out.length).padStart(2)} 區  ${(out.reduce((s, z) => s + z.bytes, 0) / 1024).toFixed(0).padStart(5)} KB`);
  }
  if (!ONLY.length || ONLY.includes('drums')) {
    const drumMeta = {};
    const b64s = {};
    for (let i = 0; i < DRUMS.length; i += 6) {
      const batch = DRUMS.slice(i, i + 6);
      const files = await Promise.all(batch.map(([id, p]) => fetchCached(`${VC}/${enc(p)}`, `vc_drum_${id}.wav`)));
      batch.forEach(([id, , sec], k) => {
        const z = processZone(files[k], null, { id, sr: 44100, sec, gain: 1 }, 'drum');
        const mp3 = encodeMp3(z.x, z.rate, 4);
        total += mp3.length;
        drumMeta[id] = { rate: z.rate, len: z.x.length };
        b64s[id] = mp3.toString('base64');
      });
    }
    manifest.drums = drumMeta;
    writeFileSync(join(OUT, 'inst', 'drums.ts'), `// 自動產生（scripts/samples/build.mjs）。來源：VCSL (CC0)\nexport default ${JSON.stringify(b64s)} as Record<string, string>;\n`);
    console.log(`drums       ${DRUMS.length} 個`);
  }
  if (!ONLY.length) {
    writeFileSync(
      join(OUT, 'meta.ts'),
      `// 自動產生（scripts/samples/build.mjs）：取樣包的索引。\nexport interface PackZone {\n  root: number;\n  lo: number;\n  hi: number;\n  rate: number;\n  len: number;\n  loop: [number, number] | null;\n}\nexport interface PackInst {\n  id: string;\n  src: string;\n  sus: boolean;\n  programs: number[];\n  zones: PackZone[];\n}\nexport const PACK_INSTRUMENTS: Record<string, PackInst> = ${JSON.stringify(manifest.instruments)};\nexport const PACK_DRUMS: Record<string, { rate: number; len: number }> = ${JSON.stringify(manifest.drums)};\nexport const PACK_PROGRAM: Record<number, string> = ${JSON.stringify(manifest.programs)};\n`,
    );
  }
  if (!ONLY.length) {
    const ids = Object.keys(manifest.instruments);
    const rows = ids.map((i) => `  ${i}: () => import('./inst/${i}'),`).join('\n');
    writeFileSync(
      join(OUT, 'loaders.ts'),
      `// 自動產生（scripts/samples/build.mjs）：各樂器的延遲載入器（打包後仍是同一個檔案，但只在用到時才解碼）。\nexport const INST_LOADERS: Record<string, () => Promise<{ default: string[] }>> = {\n${rows}\n};\nexport const DRUM_LOADER: () => Promise<{ default: Record<string, string> }> = () => import('./inst/drums');\n`,
    );
  }
  console.log(report.join('\n'));
  console.log(`MP3 合計 ${(total / 1024 / 1024).toFixed(2)} MB`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
