// 橋接：把目前的風格混合、主體與時間軸餵給音訊引擎，並每幀同步 BGM／音效。
import { useEffect } from 'react';
import { audioEngine } from '../audio/engine';
import { clock } from '../engine/clock';
import { setAudioLatency, setLiveSong } from '../engine/liveSong';
import { useAudioPlan, useLookMove } from '../store/hooks';
import { useStore } from '../store/store';
import { ASPECT } from './Stage';

export function AudioBridge() {
  const { plan, prefs, subject, tune } = useAudioPlan();
  const { look, move } = useLookMove();
  const aspect = useStore((s) => s.aspect);

  // 「音樂視覺化」主體讀這首歌（不論聲音開不開，畫面都跟著會播的那首）
  setLiveSong(plan.song);

  useEffect(() => {
    audioEngine.configure({ prefs, plan, subject, move, tune, look, aspect: ASPECT[aspect] });
  }, [prefs, plan, subject, move, tune, look, aspect]);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      audioEngine.frame(clock.t, clock.playing, clock.rate);
      setAudioLatency(audioEngine.latency());
    };
    raf = requestAnimationFrame(loop);
    const onVis = () => {
      if (document.hidden) audioEngine.pauseAll();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);
  return null;
}
