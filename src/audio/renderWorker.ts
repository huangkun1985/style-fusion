// 背景執行緒：把歌曲渲染成音訊（B-11）。換曲風、換風格時介面不會卡住幾百毫秒到幾秒。
// 取樣在主執行緒解碼（瀏覽器的解碼器只在主執行緒能用），連同歌曲一起傳進來；這裡只做合成與混音。
// 打包時 vite.config.ts 會把取樣包的載入器換成空殼，背景執行緒的程式不會夾帶 8 MB 的取樣資料。
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
export type RenderReply = { id: number; ok: true; l: Float32Array; r: Float32Array } | { id: number; ok: false; error: string };

const scope = self as unknown as { onmessage: ((e: MessageEvent<RenderJob>) => void) | null; postMessage: (m: RenderReply, t?: Transferable[]) => void };

scope.onmessage = (e) => {
  const job = e.data;
  // 先同步裝好這次帶來的樂器，之後同時在跑的其他渲染也用得到
  for (const inst of job.insts) installInstrument(inst);
  if (job.drums) installDrums(job.drums);
  renderScheme(job.song, job.scheme, job.opts).then(
    (pcm: Stereo) => scope.postMessage({ id: job.id, ok: true, l: pcm.l, r: pcm.r }, [pcm.l.buffer, pcm.r.buffer]),
    (err: unknown) => scope.postMessage({ id: job.id, ok: false, error: (err as Error)?.message ?? String(err) }),
  );
};
