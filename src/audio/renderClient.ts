// 主執行緒這一端：把渲染工作交給背景執行緒（renderWorker.ts），介面不會因為作曲渲染卡住（B-11）。
// 取樣在這裡解碼好再傳過去（每種樂器只傳一次）；背景執行緒建立失敗或出錯時，退回主執行緒渲染（和 1.2 一樣，只是會頓一下）。
import type { Stereo } from './dsp';
import { renderScheme, type RenderOpts } from './render';
import { ensureSamplesFor, neededInstruments } from './sampled';
import { drumSamples, instrument, type DrumSample, type SampledInst } from './sampler';
import type { RenderJob, RenderReply } from './renderWorker';
import type { SchemeId, Song } from './types';

let worker: Worker | null = null;
let tried = false;
let broken = false;
let nextId = 1;
const pending = new Map<number, { res: (s: Stereo) => void; rej: (e: Error) => void; song: Song; scheme: SchemeId; opts: RenderOpts }>();
/** 已經送進背景執行緒的樂器（不必再傳） */
const sent = new Set<string>();
let drumsSent = false;

async function getWorker(): Promise<Worker | null> {
  if (broken) return null;
  if (tried) return worker;
  tried = true;
  try {
    // 線上版：獨立的檔案，第一次開聲音才下載；單檔版（雙擊開啟）：內嵌在 HTML 裡
    const mod = import.meta.env.MODE === 'web' ? await import('./renderWorker?worker') : await import('./renderWorker?worker&inline');
    const w: Worker = new mod.default();
    w.onmessage = (e: MessageEvent<RenderReply>) => {
      const m = e.data;
      const p = pending.get(m.id);
      if (!p) return;
      pending.delete(m.id);
      if (m.ok) p.res({ l: m.l, r: m.r });
      else p.rej(new Error(m.error));
    };
    w.onerror = (e) => {
      // 背景執行緒整個壞掉（例如瀏覽器不允許）：之後都改在主執行緒渲染，進行中的工作也改到主執行緒重做
      e.preventDefault();
      broken = true;
      worker = null;
      w.terminate();
      const list = [...pending.values()];
      pending.clear();
      for (const p of list) renderScheme(p.song, p.scheme, p.opts).then(p.res, p.rej);
    };
    worker = w;
  } catch {
    worker = null;
  }
  return worker;
}

/** 主執行緒先把這首歌需要、背景執行緒還沒有的取樣解碼好 */
async function samplesFor(song: Song, scheme: SchemeId): Promise<{ insts: SampledInst[]; drums: Record<string, DrumSample> | null }> {
  if (scheme !== 'midi' && scheme !== 'xm') return { insts: [], drums: null };
  await ensureSamplesFor(song);
  const insts: SampledInst[] = [];
  for (const id of neededInstruments(song)) {
    if (sent.has(id)) continue;
    const inst = instrument(id);
    if (inst) {
      insts.push(inst);
      sent.add(id);
    }
  }
  let drums: Record<string, DrumSample> | null = null;
  if (!drumsSent && song.tracks.some((t) => t.drum)) {
    drums = drumSamples();
    if (drums) drumsSent = true;
  }
  return { insts, drums };
}

/** 渲染一首歌（在背景執行緒；不行就在主執行緒） */
export async function renderAsync(song: Song, scheme: SchemeId, opts: RenderOpts): Promise<Stereo> {
  const w = await getWorker();
  if (!w) return renderScheme(song, scheme, opts);
  const { insts, drums } = await samplesFor(song, scheme);
  if (broken || !worker) return renderScheme(song, scheme, opts);
  const id = nextId++;
  return new Promise<Stereo>((res, rej) => {
    pending.set(id, { res, rej, song, scheme, opts });
    const job: RenderJob = { id, song, scheme, opts: { ...opts, yieldEvery: false }, insts, drums };
    try {
      w.postMessage(job);
    } catch (e) {
      // 傳不過去（理論上不會）：在主執行緒做
      pending.delete(id);
      for (const inst of insts) sent.delete(inst.id);
      if (drums) drumsSent = false;
      void e;
      renderScheme(song, scheme, opts).then(res, rej);
    }
  });
}
