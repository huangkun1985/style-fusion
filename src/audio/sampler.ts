// 取樣載入器：把內嵌的 MP3 取樣包解碼成可演奏的「音區」。
// 取樣來自授權乾淨的開放素材庫（見 CREDITS.md），已在建置時量過音高、去掉前導靜音、為持續音烘焙好循環。
// 解碼用瀏覽器內建的 decodeAudioData；Node 測試時可用 setSamplerDecoder 換成 ffmpeg。
import { DRUM_LOADER, INST_LOADERS } from './pack/loaders';
import { PACK_DRUMS, PACK_INSTRUMENTS, type PackInst } from './pack/meta';

export interface Zone {
  /** 取樣的實際音高（MIDI，可含小數） */
  root: number;
  lo: number;
  hi: number;
  rate: number;
  /** 解碼後的資料；循環取樣的循環尾端後面附有 4 點循環起頭 */
  data: Float32Array;
  /** 有效長度（不含附加的 4 點） */
  len: number;
  loop: [number, number] | null;
}
export interface SampledInst {
  id: string;
  sus: boolean;
  zones: Zone[];
}
export interface DrumSample {
  rate: number;
  data: Float32Array;
}

export type SamplerDecoder = (bytes: Uint8Array, rate: number) => Promise<Float32Array>;

function browserDecoder(): SamplerDecoder | null {
  if (typeof OfflineAudioContext === 'undefined') return null;
  return async (bytes, rate) => {
    const ctx = new OfflineAudioContext(1, 1, rate);
    const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const buf = await ctx.decodeAudioData(copy);
    return buf.getChannelData(0).slice();
  };
}
let decoder: SamplerDecoder | null = browserDecoder();
export function setSamplerDecoder(d: SamplerDecoder | null) {
  decoder = d;
  insts.clear();
  drums = null;
  drumsP = null;
}
export const samplerAvailable = () => decoder !== null;

/**
 * MP3 解碼器多少會在開頭多留一段編碼延遲（約 1100 點）。建置時我們把音頭留在第 4 毫秒，
 * 所以這裡用同一條規則（超過峰值 2%）找到音頭，把多出來的靜音切掉，音符才會準時發聲，循環點也才對得上。
 */
function alignStart(raw: Float32Array, rate: number): Float32Array {
  let pk = 0;
  for (let i = 0; i < raw.length; i++) pk = Math.max(pk, Math.abs(raw[i]));
  const th = pk * 0.02;
  let first = 0;
  while (first < raw.length && Math.abs(raw[first]) < th) first++;
  const shift = first - Math.round(0.004 * rate);
  return shift > 0 ? raw.slice(shift) : raw;
}

const b64 = (s: string): Uint8Array => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

const insts = new Map<string, Promise<SampledInst | null>>();
const ready = new Map<string, SampledInst>();

export function hasInstrument(id: string): boolean {
  return id in PACK_INSTRUMENTS;
}

/** 載入並解碼一個樂器（有快取；失敗回傳 null，呼叫端會退回程式合成的音色） */
export function loadInstrument(id: string): Promise<SampledInst | null> {
  const hit = insts.get(id);
  if (hit) return hit;
  const meta: PackInst | undefined = PACK_INSTRUMENTS[id];
  const loader = INST_LOADERS[id];
  const dec = decoder;
  if (!meta || !loader || !dec) return Promise.resolve(null);
  const p = (async () => {
    try {
      const mod = await loader();
      const zones = await Promise.all(
        meta.zones.map(async (z, i): Promise<Zone> => {
          const raw = alignStart(await dec(b64(mod.default[i]), z.rate), z.rate);
          const len = raw.length;
          // 解碼器偶爾比建置時短幾十個取樣（編碼延遲的處理不同）；循環終點超出就整段往前靠，保持循環長度
          let loop: [number, number] | null = z.loop ? [z.loop[0], z.loop[1]] : null;
          if (loop && loop[1] > len) {
            const L = loop[1] - loop[0];
            loop = len > L + 64 ? [len - L, len] : null;
          }
          const data = new Float32Array(len + 4);
          data.set(raw);
          // 循環尾端後面接上循環起頭，內插時不必判斷邊界
          if (loop) for (let k = 0; k < 4; k++) data[loop[1] + k] = raw[Math.min(len - 1, loop[0] + k)];
          return { root: z.root, lo: z.lo, hi: z.hi, rate: z.rate, data, len, loop };
        }),
      );
      const inst: SampledInst = { id, sus: meta.sus, zones };
      ready.set(id, inst);
      return inst;
    } catch (e) {
      console.warn('取樣載入失敗，改用合成音色：', id, e);
      return null;
    }
  })();
  insts.set(id, p);
  return p;
}
export const instrument = (id: string): SampledInst | null => ready.get(id) ?? null;

let drums: Record<string, DrumSample> | null = null;
let drumsP: Promise<Record<string, DrumSample> | null> | null = null;
export function loadDrums(): Promise<Record<string, DrumSample> | null> {
  if (drums) return Promise.resolve(drums);
  if (drumsP) return drumsP;
  const dec = decoder;
  if (!dec) return Promise.resolve(null);
  drumsP = (async () => {
    try {
      const mod = await DRUM_LOADER();
      const out: Record<string, DrumSample> = {};
      await Promise.all(
        Object.entries(mod.default).map(async ([id, s]) => {
          const meta = PACK_DRUMS[id];
          out[id] = { rate: meta.rate, data: alignStart(await dec(b64(s), meta.rate), meta.rate) };
        }),
      );
      drums = out;
      return out;
    } catch (e) {
      console.warn('鼓取樣載入失敗，改用合成鼓組：', e);
      return null;
    }
  })();
  return drumsP;
}
export const drumSamples = () => drums;

/** 找最接近的音區 */
export function zoneFor(inst: SampledInst, midi: number): Zone {
  let best = inst.zones[0];
  let bd = Infinity;
  for (const z of inst.zones) {
    const d = midi >= z.lo && midi <= z.hi ? Math.abs(midi - z.root) * 0.5 : Math.abs(midi - z.root) + 2;
    if (d < bd) {
      bd = d;
      best = z;
    }
  }
  return best;
}
