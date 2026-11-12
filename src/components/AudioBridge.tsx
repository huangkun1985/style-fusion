// 橋接：把目前的風格混合、主體與時間軸餵給音訊引擎，並每幀同步 BGM／音效。
// 2.0 β：播放整支片子（filmPlay）時，音樂換成整支片子的配樂、音效換成每一場各自的提示點；真實音效從專案同步過去。
import { useEffect, useMemo } from 'react';
import { audioEngine } from '../audio/engine';
import { setRealSfx } from '../audio/realSfx';
import { clock } from '../engine/clock';
import { setAudioLatency, setLiveSong } from '../engine/liveSong';
import { FilmCues, filmModel } from '../store/film';
import { useAudioPlan, useLookMove } from '../store/hooks';
import { useStore } from '../store/store';
import { ASPECT } from './Stage';

export function AudioBridge() {
  const { plan, prefs, subject, tune } = useAudioPlan();
  const { look, move } = useLookMove();
  const aspect = useStore((s) => s.aspect);
  const fitAr = useStore((s) => s.fitAr);
  const filmPlay = useStore((s) => s.filmPlay);
  const sounds = useStore((s) => s.sounds);
  const sfxMap = useStore((s) => s.sfxMap);
  // 整支片子：任何場景、片子設定變了都要重算（filmModel 自己有快取）
  const st = useStore();
  const film = filmPlay ? filmModel(st) : null;
  const ar = aspect === 'fit' ? fitAr : ASPECT[aspect];
  const cues = useMemo(() => (film ? new FilmCues(film, ar) : undefined), [film, ar]);

  // 「音樂視覺化」主體讀這首歌（不論聲音開不開，畫面都跟著會播的那首）
  setLiveSong(film ? film.plan.song : plan.song);

  useEffect(() => {
    setRealSfx(sfxMap, sounds);
  }, [sfxMap, sounds]);

  useEffect(() => {
    if (film && cues) audioEngine.configure({ prefs, plan: film.plan, subject, move, tune, look, aspect: ar, cues, cuesKey: film.key + ar });
    else audioEngine.configure({ prefs, plan, subject, move, tune, look, aspect: ar });
  }, [prefs, plan, subject, move, tune, look, ar, film, cues]);

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
