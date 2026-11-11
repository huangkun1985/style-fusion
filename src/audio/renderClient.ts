// 主執行緒這一端：把渲染工作交給背景執行緒（renderWorker.ts），介面不會因為作曲渲染卡住（B-11）。
// 取樣在這裡解碼好再傳過去（每種樂器只傳一次）；背景執行緒建立失敗或出錯時，退回主執行緒渲染（和 1.2 一樣，只是會頓一下）。
//
// 2.0 α2 的修正（代碼審查）：
// - R-05：工作分「道」（lane：背景音樂、試聽…）。同一道來了新的工作，還沒開始的舊工作直接取消，
//   不會排在前面讓最新的那首等 10～20 秒（背景執行緒在工作之間會處理取消訊息）。
// - R-07：背景執行緒的建立只做一次，同時進來的呼叫等同一個 Promise（以前第二個呼叫會拿到 null、退回主執行緒）。
// - R-19：補上 messageerror；出錯一次先重建背景執行緒，連續兩次才永久退回主執行緒。
// - R-20：取樣送進背景執行緒之後，主執行緒放掉自己的那份（實測 18 種樂器解碼後約 97 MB），要用時再解碼。
import type { Stereo } from './dsp';
import { renderScheme, type RenderOpts } from './render';
import { neededInstruments } from './sampled';
import { drumSamples, instrument, loadDrums, loadInstrument, releaseDrums, releaseInstrument, samplerAvailable, type DrumSample, type SampledInst } from './sampler';
import type { RenderJob, RenderReply, WorkerMsg } from './renderWorker';
import type { SchemeId, Song } from './types';

/** 被同一道更新的工作取代（呼叫端看到這個錯誤，表示有更新的結果會來，不要顯示錯誤） */
export const SUPERSEDED = 'superseded';

let worker: Worker | null = null;
let workerP: Promise<Worker | null> | null = null;
let failures = 0;
let broken = false;
let nextId = 1;
interface Pending {
  res: (s: Stereo) => void;
  rej: (e: Error) => void;
  song: Song;
  scheme: SchemeId;
  opts: RenderOpts;
  lane?: string;
}
const pending = new Map<number, Pending>();
/** 已經送進背景執行緒的樂器（不必再傳）；背景執行緒重建後要清空 */
const sent = new Set<string>();
let drumsSent = false;

/** 背景執行緒壞掉：進行中的工作改到主執行緒重做；第一次先重建，連續兩次才放棄 */
function onWorkerFailure(w: Worker) {
  if (worker !== w) return;
  w.terminate();
  worker = null;
  workerP = null;
  sent.clear();
  drumsSent = false;
  failures++;
  if (failures >= 2) broken = true;
  const list = [...pending.values()];
  pending.clear();
  for (const p of list) renderScheme(p.song, p.scheme, p.opts).then(p.res, p.rej);
}

function getWorker(): Promise<Worker | null> {
  if (broken) return Promise.resolve(null);
  workerP ??= (async () => {
    try {
      // 線上版：獨立的檔案，第一次開聲音才下載；單檔版（雙擊開啟）：內嵌在 HTML 裡
      const mod = import.meta.env.MODE === 'web' ? await import('./renderWorker?worker') : await import('./renderWorker?worker&inline');
      const w: Worker = new mod.default();
      w.onmessage = (e: MessageEvent<RenderReply>) => {
        const m = e.data;
        const p = pending.get(m.id);
        if (!p) return;
        pending.delete(m.id);
        if (m.ok) {
          failures = 0;
          p.res({ l: m.l, r: m.r });
        } else if (m.cancelled) p.rej(new Error(SUPERSEDED));
        else p.rej(new Error(m.error));
      };
      w.onerror = (e) => {
        e.preventDefault();
        onWorkerFailure(w);
      };
      // 回傳的資料沒辦法還原（R-19）：當作背景執行緒壞了一次
      w.onmessageerror = () => onWorkerFailure(w);
      worker = w;
      return w;
    } catch {
      broken = true;
      return null;
    }
  })();
  return workerP;
}

/** 主執行緒先把這首歌需要、背景執行緒還沒有的取樣解碼好（已經送過的不再解碼：主執行緒已經放掉那一份了） */
async function samplesFor(song: Song, scheme: SchemeId): Promise<{ insts: SampledInst[]; drums: Record<string, DrumSample> | null }> {
  if (scheme !== 'midi' && scheme !== 'xm') return { insts: [], drums: null };
  if (!samplerAvailable()) return { insts: [], drums: null };
  const ids = neededInstruments(song).filter((id) => !sent.has(id));
  const wantDrums = !drumsSent && song.tracks.some((t) => t.drum);
  await Promise.all([Promise.all(ids.map(loadInstrument)), wantDrums ? loadDrums() : null]);
  const insts: SampledInst[] = [];
  for (const id of ids) {
    if (sent.has(id)) continue;
    const inst = instrument(id);
    if (inst) {
      insts.push(inst);
      sent.add(id);
    }
  }
  let drums: Record<string, DrumSample> | null = null;
  if (wantDrums && !drumsSent) {
    drums = drumSamples();
    if (drums) drumsSent = true;
  }
  return { insts, drums };
}

/** 渲染一首歌（在背景執行緒；不行就在主執行緒）。lane：同一道的新工作會取消還沒開始的舊工作（舊的那個 Promise 以 SUPERSEDED 失敗） */
export async function renderAsync(song: Song, scheme: SchemeId, opts: RenderOpts, lane?: string): Promise<Stereo> {
  const w = await getWorker();
  if (!w) return renderScheme(song, scheme, opts);
  const { insts, drums } = await samplesFor(song, scheme);
  if (broken || worker !== w) return renderScheme(song, scheme, opts);
  const id = nextId++;
  if (lane) {
    const old = [...pending.entries()].filter(([, p]) => p.lane === lane).map(([k]) => k);
    if (old.length) w.postMessage({ cancel: old } satisfies WorkerMsg);
  }
  return new Promise<Stereo>((res, rej) => {
    pending.set(id, { res, rej, song, scheme, opts, lane });
    const job: RenderJob = { id, song, scheme, opts: { ...opts, yieldEvery: false }, insts, drums };
    try {
      w.postMessage(job satisfies WorkerMsg);
      // R-20：送過去的是複製品；主執行緒放掉自己的快取，記憶體裡只剩背景執行緒那一份
      for (const inst of insts) releaseInstrument(inst.id);
      if (drums) releaseDrums();
    } catch {
      // 傳不過去（理論上不會）：在主執行緒做
      pending.delete(id);
      for (const inst of insts) sent.delete(inst.id);
      if (drums) drumsSent = false;
      renderScheme(song, scheme, opts).then(res, rej);
    }
  });
}

/** 測試用：背景執行緒的狀態 */
export const renderClientState = () => ({ pending: pending.size, failures, broken, hasWorker: !!worker });

/** 測試用：模擬背景執行緒壞掉一次（等同收到 error／messageerror） */
export function simulateWorkerFailure() {
  if (worker) onWorkerFailure(worker);
}
