// 目前的配樂（給「音樂視覺化」主體讀）：App 的 AudioBridge 每次音樂計畫改變時設定；
// 沒有設定時（接觸表、尚未建立計畫）主體會自己用預設曲風作一首。
// 只放「歌曲資料」（音符、和弦、速度），不牽涉音訊引擎；不論聲音開不開，畫面都跟著「會播的那首歌」。
import type { Song } from '../audio/types';

let live: Song | null = null;
let rev = 0;

export function setLiveSong(s: Song | null) {
  if (s !== live) {
    live = s;
    rev++;
  }
}
export function getLiveSong(): Song | null {
  return live;
}
let latency = 0;
/** 音訊輸出延遲（秒）：喇叭出聲比排程晚這麼多，畫面也延後這麼多才會對拍 */
export function setAudioLatency(s: number) {
  latency = Number.isFinite(s) ? Math.max(0, Math.min(0.5, s)) : 0;
}
export function audioLatency(): number {
  return latency;
}
let liveRender = false;
/** 渲染器每畫一格都會設定：這一格是不是即時舞台（導出、縮圖、接觸表不是） */
export function setLiveRender(v: boolean) {
  liveRender = v;
}
/** 畫面該延後多少秒才對得上喇叭：只有即時舞台要補償；導出時音軌是從 0 開始對齊的，補償反而會錯開 */
export function liveLatency(): number {
  return liveRender ? latency : 0;
}
/** 每次換歌加一（給快取判斷用） */
export function liveSongRev(): number {
  return rev;
}
