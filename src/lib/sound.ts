// 聲音開關與引擎狀態的共用小工具（給播放列與「聲音」分頁共用，避免元件互相引用）。
import { useSyncExternalStore } from 'react';
import { audioEngine } from '../audio/engine';
import { clock } from '../engine/clock';
import { useStore } from '../store/store';

export function useEngineStatus() {
  return useSyncExternalStore(audioEngine.subscribe, audioEngine.getStatus);
}

/** 開關聲音。開啟時必須在使用者的點擊手勢內呼叫，瀏覽器才會允許 AudioContext 出聲。 */
export async function toggleSound(next?: boolean) {
  const s = useStore.getState();
  const want = next ?? !s.audio.on;
  if (!want) {
    s.setAudio({ on: false });
    return;
  }
  const ok = await audioEngine.unlock();
  s.setAudio({ on: true });
  if (!clock.playing) clock.play(true);
  s.showToast(ok ? '聲音已開啟' : '瀏覽器還沒允許出聲，請再點一次');
}
