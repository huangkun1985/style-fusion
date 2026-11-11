// 背景執行緒：把歌曲渲染成音訊（B-11）。換曲風、換風格時介面不會卡住幾百毫秒到幾秒。
// 取樣在主執行緒解碼（瀏覽器的解碼器只在主執行緒能用），連同歌曲一起傳進來；這裡只做合成與混音。
// 打包時 vite.config.ts 會把取樣包的載入器換成空殼，背景執行緒的程式不會夾帶 8 MB 的取樣資料。
//
// 2.0 α2（審查 R-05）：工作先排進自己的佇列，一次做一個，做完讓出執行權（setTimeout 0）再做下一個；
// 這樣主執行緒送來的「取消」訊息會在工作之間被處理，被取代的舊工作不會再佔時間。
import type { Stereo } from './dsp';
import { renderScheme, type RenderOpts } from './render';
import { installDrums, installInstrument, type DrumSample, type SampledInst } from './sampler';
import type { SchemeId, Song } from './types';

export interface RenderJob {
  id: number;
  song: Song;
  scheme: SchemeId;
  opts: RenderOpts;
  insts: SampledInst[];
  drums: Record<string, DrumSample> | null;
}
export type WorkerMsg = RenderJob | { cancel: number[] };
export type RenderReply = { id: number; ok: true; l: Float32Array; r: Float32Array } | { id: number; ok: false; error: string; cancelled?: boolean };

const scope = self as unknown as { onmessage: ((e: MessageEvent<WorkerMsg>) => void) | null; postMessage: (m: RenderReply, t?: Transferable[]) => void };

const queue: RenderJob[] = [];
let busy = false;

function pump() {
  if (busy) return;
  const job = queue.shift();
  if (!job) return;
  busy = true;
  renderScheme(job.song, job.scheme, job.opts)
    .then(
      (pcm: Stereo) => scope.postMessage({ id: job.id, ok: true, l: pcm.l, r: pcm.r }, [pcm.l.buffer, pcm.r.buffer]),
      (err: unknown) => scope.postMessage({ id: job.id, ok: false, error: (err as Error)?.message ?? String(err) }),
    )
    .finally(() => {
      busy = false;
      // 讓出執行權：先處理在這段時間裡進來的取消訊息，再做下一個
      setTimeout(pump, 0);
    });
}

scope.onmessage = (e) => {
  const m = e.data;
  if ('cancel' in m) {
    for (const id of m.cancel) {
      const i = queue.findIndex((j) => j.id === id);
      if (i >= 0) {
        queue.splice(i, 1);
        scope.postMessage({ id, ok: false, error: 'cancelled', cancelled: true });
      }
    }
    return;
  }
  // 先同步裝好這次帶來的樂器（即使這個工作之後被取消，樂器已經送來了，後面的工作會用到）
  for (const inst of m.insts) installInstrument(inst);
  if (m.drums) installDrums(m.drums);
  queue.push(m);
  pump();
};
