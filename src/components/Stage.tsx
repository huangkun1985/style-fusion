// 舞台：主預覽（可四宮格）、軌跡間距疊圖、播放控制、主體切換。
import { Camera, Grid2x2, Layers, Maximize, Minimize, Pause, Play, Spline, StepBack, StepForward, Upload, Volume2, VolumeX } from 'lucide-react';
import { Fragment, useEffect, useRef, useState } from 'react';
import { clock } from '../engine/clock';
import { Renderer, loopSeconds, type FrameSpec } from '../engine/renderer';
import { SUBJECTS, SUBJECT_ORDER } from '../engine/subjects';
import { is3D, type SubjectId } from '../engine/types';
import { themes } from '../engine/themes';
import { runExport } from '../lib/exporter';
import { saveBlob, stamp } from '../lib/platform';
import { toggleSound } from '../lib/sound';
import { useLookMove } from '../store/hooks';
import { useStore, type Aspect } from '../store/store';
import { SUBJECT_ICON } from './icons';
import { IconBtn, Segmented } from './ui';

/** fit（填滿）的比例會由舞台依實際大小即時更新；導出與截圖用的是更新後的值 */
export const ASPECT: Record<Aspect, number> = { fit: 16 / 9, '16:9': 16 / 9, '4:3': 4 / 3, '1:1': 1, '9:16': 9 / 16 };
const ASPECT_LABEL: Record<Aspect, string> = { fit: '填滿', '16:9': '16:9', '4:3': '4:3', '1:1': '1:1', '9:16': '9:16' };

/** 全螢幕展示：App 的快捷鍵（F）與播放列的按鈕都呼叫這個，舞台自己決定進入或離開 */
export function toggleStageFullscreen() {
  window.dispatchEvent(new Event('sf:fullscreen'));
}
const QUALITY = [1, 0.75, 0.5];
const MAX_PX = 1920 * 1080;

function gridSubjects(current: SubjectId): SubjectId[] {
  const pref: SubjectId[] = ['mascot', 'ui', 'type', 'landscape', 'walk', 'geo', 'chart'];
  return [current, ...pref.filter((s) => s !== current)].slice(0, 4);
}

export function Stage({ fill = false }: { fill?: boolean }) {
  const { look, move, tune, v, m } = useLookMove();
  const subject = useStore((s) => s.subject);
  const aspect = useStore((s) => s.aspect);
  const onion = useStore((s) => s.onion);
  const path = useStore((s) => s.path);
  const grid4 = useStore((s) => s.grid4);
  const quality = useStore((s) => s.quality);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const gridRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const [box, setBox] = useState({ w: 640, h: 360 });
  const [glOk, setGlOk] = useState(true);
  const [idle, setIdle] = useState(!clock.playing && clock.t === 0);
  useEffect(() => clock.on(() => setIdle(!clock.playing && clock.t === 0)), []);
  // 匯入或切換自訂主題時，暫停中的畫面也要馬上重畫
  useEffect(() => themes.onChange(() => (st.current.dirty = true)), []);
  // 全螢幕：先立刻把舞台鋪滿整個視窗（任何環境都有效、馬上看得到），同時向瀏覽器要求真正的全螢幕；
  // 瀏覽器答應了就升級成原生全螢幕。有些內嵌視窗與手機瀏覽器不回應或拒絕，那就維持鋪滿視窗。
  const [fs, setFs] = useState<'off' | 'native' | 'css'>('off');
  const fsRef = useRef(fs);
  fsRef.current = fs;
  const [ctl, setCtl] = useState(true);
  const ctlTimer = useRef(0);
  const showCtl = () => {
    setCtl(true);
    window.clearTimeout(ctlTimer.current);
    ctlTimer.current = window.setTimeout(() => setCtl(false), 2600);
  };
  const enterFs = async () => {
    const el = wrapRef.current;
    if (!el) return;
    setFs('css');
    showCtl();
    try {
      await el.requestFullscreen?.();
    } catch {
      /* 被拒絕：維持鋪滿視窗 */
    }
  };
  const exitFs = async () => {
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch {
        /* 忽略 */
      }
    }
    setFs('off');
  };
  useEffect(() => {
    const toggle = () => void (fsRef.current === 'off' ? enterFs() : exitFs());
    const onChange = () => {
      if (document.fullscreenElement) setFs('native');
      else setFs((f) => (f === 'native' ? 'off' : f));
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && fsRef.current === 'css') setFs('off');
    };
    window.addEventListener('sf:fullscreen', toggle);
    document.addEventListener('fullscreenchange', onChange);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('sf:fullscreen', toggle);
      document.removeEventListener('fullscreenchange', onChange);
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(ctlTimer.current);
    };
  }, []);
  const st = useRef({ look, move, tune, subject, onion, path, grid4, box, quality, dirty: true });
  st.current = { look, move, tune, subject, onion, path, grid4, box, quality, dirty: true };

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const fit = () => {
      const r = el.getBoundingClientRect();
      let w = r.width;
      let h = r.height;
      if (aspect === 'fit') {
        // 填滿：用掉整個舞台區；比例限制在合理範圍，導出才不會變成極端的長條
        ASPECT.fit = Math.min(2.6, Math.max(0.4, w / Math.max(1, h)));
      } else {
        const ar = ASPECT[aspect];
        h = w / ar;
        if (h > r.height) {
          h = r.height;
          w = h * ar;
        }
      }
      setBox({ w: Math.max(40, Math.floor(w)), h: Math.max(40, Math.floor(h)) });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [aspect, fill, fs]);

  useEffect(() => {
    const r = new Renderer(true);
    r.onThreeReady = () => (st.current.dirty = true);
    let raf = 0;
    let lastT = -1;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      clock.tick(now);
      const s = st.current;
      if (!clock.playing && !s.dirty && lastT === clock.t) return;
      lastT = clock.t;
      s.dirty = false;
      const dpr = Math.min(2, window.devicePixelRatio || 1) * QUALITY[s.quality];
      const base: Omit<FrameSpec, 'subject'> = { look: s.look, move: s.move, tune: s.tune, time: clock.t, onion: s.onion };
      if (!s.grid4) {
        const cv = canvasRef.current;
        if (!cv) return;
        let W = Math.round(s.box.w * dpr);
        let H = Math.round(s.box.h * dpr);
        const k = Math.sqrt(Math.min(1, MAX_PX / (W * H)));
        W = Math.round(W * k);
        H = Math.round(H * k);
        if (cv.width !== W) cv.width = W;
        if (cv.height !== H) cv.height = H;
        const ctx = cv.getContext('2d');
        if (!ctx) return;
        r.render(ctx, W, H, { ...base, subject: s.subject });
        const ov = overlayRef.current;
        if (ov) {
          if (ov.width !== W) ov.width = W;
          if (ov.height !== H) ov.height = H;
          const o = ov.getContext('2d')!;
          o.clearRect(0, 0, W, H);
          if (s.path) {
            const tp = r.trackPath({ ...base, subject: s.subject }, W, H);
            const u = Math.min(W, H) / 400;
            o.lineWidth = 1.2 * u;
            o.strokeStyle = 'rgba(255,182,72,0.55)';
            o.setLineDash([4 * u, 4 * u]);
            o.beginPath();
            tp.pts.forEach(([x, y], i) => (i ? o.lineTo(x, y) : o.moveTo(x, y)));
            o.stroke();
            o.setLineDash([]);
            for (const [x, y] of tp.pts) {
              o.fillStyle = 'rgba(255,182,72,0.95)';
              o.beginPath();
              o.arc(x, y, 2.6 * u, 0, Math.PI * 2);
              o.fill();
            }
            o.strokeStyle = '#ffffff';
            o.lineWidth = 2 * u;
            o.beginPath();
            o.arc(tp.cur[0], tp.cur[1], 7 * u, 0, Math.PI * 2);
            o.stroke();
          }
        }
      } else {
        const subs = gridSubjects(s.subject);
        subs.forEach((sid, i) => {
          const cv = gridRefs.current[i];
          if (!cv) return;
          const W = Math.round((s.box.w / 2) * dpr * 0.9);
          const H = Math.round((s.box.h / 2) * dpr * 0.9);
          if (cv.width !== W) cv.width = W;
          if (cv.height !== H) cv.height = H;
          const ctx = cv.getContext('2d');
          if (ctx) r.render(ctx, W, H, { ...base, subject: sid, onion: false });
        });
      }
      if (!r.glOk) setGlOk(false);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      r.dispose();
    };
  }, []);

  const mixEmpty = !v.length && !m.length;
  return (
    <div className={`flex min-h-0 flex-col gap-2 ${fill ? 'flex-1' : ''}`}>
      <div
        ref={wrapRef}
        onDoubleClick={() => toggleStageFullscreen()}
        onMouseMove={fs !== 'off' ? showCtl : undefined}
        className={`${fs === 'css' ? 'fixed inset-0 z-[70]' : 'relative'} flex w-full items-center justify-center ${fs !== 'off' ? 'bg-black' : fill ? 'min-h-0 flex-1' : ''}`}
        style={fs !== 'off' ? { cursor: ctl ? undefined : 'none' } : fill ? undefined : aspect === 'fit' ? { height: '62vh' } : { aspectRatio: String(ASPECT[aspect]), maxHeight: '62vh' }}
      >
        <div className={`relative overflow-hidden bg-stage ${fs !== 'off' ? '' : 'rounded-xl shadow-[var(--shadow)] ring-1 ring-line'}`} style={{ width: box.w, height: box.h }}>
          {!grid4 ? (
            <>
              <canvas ref={canvasRef} className="block size-full" aria-label="風格混合即時預覽" role="img" />
              <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 size-full" aria-hidden />
            </>
          ) : (
            <div className="grid size-full grid-cols-2 grid-rows-2 gap-px bg-line">
              {gridSubjects(subject).map((sid, i) => (
                <div key={sid} className="relative min-h-0 bg-stage">
                  <canvas ref={(el) => {
                      gridRefs.current[i] = el;
                    }} className="block size-full" aria-label={SUBJECTS[sid].name} />
                  <span className="absolute left-1.5 top-1.5 rounded bg-black/55 px-1.5 py-0.5 text-[10px] text-white">{SUBJECTS[sid].name}</span>
                </div>
              ))}
            </div>
          )}
          <StageBadges />
          {mixEmpty && (
            <div className="pointer-events-none absolute inset-x-0 bottom-3 mx-auto w-fit rounded-full bg-black/60 px-3 py-1 text-xs text-white">從左側風格庫點選，開始混合</div>
          )}
          {idle && (
            <button
              type="button"
              onClick={() => {
                clock.play(true);
                useStore.getState().set({ motionOverride: true });
              }}
              className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/40 text-white"
            >
              <span className="flex size-14 items-center justify-center rounded-full bg-accent text-accent-fg shadow-lg">
                <Play size={26} />
              </span>
              <span className="text-sm font-semibold">播放預覽</span>
              <span className="text-xs opacity-80">已依系統「減少動態效果」設定，預設暫停</span>
            </button>
          )}
          {fs !== 'off' && <FsBar visible={ctl} onExit={() => void exitFs()} />}
          {!glOk && <div className="absolute left-2 bottom-2 rounded bg-danger/90 px-2 py-1 text-[11px] text-white">此瀏覽器不支援 WebGL2，後期特效已停用</div>}
        </div>
      </div>
      <Transport />
      <SubjectBar />
    </div>
  );
}

/** 全螢幕時浮在畫面下方的簡易控制：播放／暫停、聲音、離開；滑鼠不動 2.6 秒後淡出 */
function FsBar({ visible, onExit }: { visible: boolean; onExit: () => void }) {
  const soundOn = useStore((s) => s.audio.on);
  const [playing, setPlaying] = useState(clock.playing);
  useEffect(() => clock.on(() => setPlaying(clock.playing)), []);
  return (
    <div className={`absolute inset-x-0 bottom-4 flex justify-center transition-opacity duration-300 ${visible ? 'opacity-100' : 'pointer-events-none opacity-0'}`}>
      <div className="flex items-center gap-1 rounded-full bg-black/65 px-2 py-1 text-white backdrop-blur">
        <button type="button" aria-label={playing ? '暫停' : '播放'} title={playing ? '暫停（空白鍵）' : '播放（空白鍵）'} onClick={() => clock.play()} className="flex size-9 items-center justify-center rounded-full hover:bg-white/15">
          {playing ? <Pause size={18} /> : <Play size={18} />}
        </button>
        <button type="button" aria-label={soundOn ? '關閉聲音' : '開啟聲音'} title={soundOn ? '關閉聲音（M）' : '開啟聲音（M）'} onClick={() => void toggleSound()} className="flex size-9 items-center justify-center rounded-full hover:bg-white/15">
          {soundOn ? <Volume2 size={18} /> : <VolumeX size={18} />}
        </button>
        <button type="button" aria-label="離開全螢幕" title="離開全螢幕（Esc 或 F）" onClick={onExit} className="flex size-9 items-center justify-center rounded-full hover:bg-white/15">
          <Minimize size={18} />
        </button>
      </div>
    </div>
  );
}

function StageBadges() {
  const { move } = useLookMove();
  return (
    <div className="pointer-events-none absolute right-2 top-2 flex gap-1.5">
      <span className="num rounded bg-black/55 px-1.5 py-0.5 text-[10px] text-white">{move.fps ? `${move.fps} fps` : '60 fps'}</span>
    </div>
  );
}

function Transport() {
  const { move, tune, look } = useLookMove();
  const subject = useStore((s) => s.subject);
  const aspect = useStore((s) => s.aspect);
  const onion = useStore((s) => s.onion);
  const path = useStore((s) => s.path);
  const grid4 = useStore((s) => s.grid4);
  const soundOn = useStore((s) => s.audio.on);
  const set = useStore((s) => s.set);
  const showToast = useStore((s) => s.showToast);
  useStore((s) => s.themeRev); // 自訂主題的循環秒數會變
  const L = loopSeconds(SUBJECTS[subject], move, tune);
  const rangeRef = useRef<HTMLInputElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const [playing, setPlaying] = useState(clock.playing);
  const [rate, setRate] = useState(clock.rate);
  const fps = move.fps || 24;

  useEffect(() => {
    let raf = 0;
    const upd = () => {
      raf = requestAnimationFrame(upd);
      const t = ((clock.t % L) + L) % L;
      if (rangeRef.current && document.activeElement !== rangeRef.current) rangeRef.current.value = String(t / L);
      if (timeRef.current) timeRef.current.textContent = `${t.toFixed(2)}s / ${L.toFixed(2)}s · F${String(Math.floor(t * fps)).padStart(3, '0')}`;
    };
    upd();
    const off = clock.on(() => {
      setPlaying(clock.playing);
      setRate(clock.rate);
    });
    return () => {
      cancelAnimationFrame(raf);
      off();
    };
  }, [L, fps]);

  const snapshot = async () => {
    try {
      const short = 1080;
      const ar = ASPECT[aspect];
      const w = ar >= 1 ? Math.round(short * ar) : short;
      const h = ar >= 1 ? short : Math.round(short / ar);
      const { blob, name } = await runExport({ format: 'png', subject, look, move, tune, w, h, fps: 24, loops: 1, time: clock.t }, () => undefined);
      saveBlob(blob, name.replace('.png', `-${stamp()}.png`));
      showToast('已存下目前畫面 PNG');
    } catch (e) {
      showToast(`截圖失敗：${(e as Error).message}`);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-xl border border-line bg-panel px-2 py-1.5">
      <div className="flex items-center">
        <IconBtn label="上一幀 (←)" onClick={() => clock.step(-1 / fps)}>
          <StepBack size={16} />
        </IconBtn>
        <IconBtn label={playing ? '暫停 (空白鍵)' : '播放 (空白鍵)'} onClick={() => clock.play()} className="text-fg">
          {playing ? <Pause size={18} /> : <Play size={18} />}
        </IconBtn>
        <IconBtn label="下一幀 (→)" onClick={() => clock.step(1 / fps)}>
          <StepForward size={16} />
        </IconBtn>
      </div>
      <div className="flex min-w-[180px] flex-1 items-center gap-2">
        <input
          ref={rangeRef}
          id="timeline"
          aria-label="時間軸"
          type="range"
          className="timeline"
          min={0}
          max={1}
          step={0.001}
          defaultValue={0}
          onInput={(e) => {
            const p = parseFloat((e.target as HTMLInputElement).value);
            clock.play(false);
            clock.set(Math.floor(clock.t / L) * L + p * L);
          }}
        />
        <span ref={timeRef} className="num hidden w-[150px] shrink-0 text-[11px] text-fg-3 sm:inline" />
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-1">
        <Segmented
          id="rate"
          size="sm"
          value={String(rate)}
          onChange={(x) => clock.setRate(parseFloat(x))}
          options={[
            { value: '0.25', label: '¼×', title: '0.25 倍速' },
            { value: '0.5', label: '½×', title: '0.5 倍速' },
            { value: '1', label: '1×', title: '原速' },
          ]}
        />
        <IconBtn label="洋蔥皮：顯示前後幀 (O)" active={onion} onClick={() => set({ onion: !onion })}>
          <Layers size={16} />
        </IconBtn>
        <IconBtn label="運動軌跡與間距 (P)" active={path} onClick={() => set({ path: !path })}>
          <Spline size={16} />
        </IconBtn>
        <IconBtn label="四宮格：同時看四種主體 (G)" active={grid4} onClick={() => set({ grid4: !grid4 })}>
          <Grid2x2 size={16} />
        </IconBtn>
        <IconBtn label={soundOn ? '關閉聲音（M）' : '開啟聲音：背景音樂＋音效（M）'} active={soundOn} onClick={() => void toggleSound()}>
          {soundOn ? <Volume2 size={16} /> : <VolumeX size={16} />}
        </IconBtn>
        <IconBtn label="存下目前畫面（PNG）" onClick={snapshot}>
          <Camera size={16} />
        </IconBtn>
        <IconBtn label="全螢幕展示（F；在畫面上連點兩下也可以）" onClick={() => toggleStageFullscreen()}>
          <Maximize size={16} />
        </IconBtn>
        <Segmented
          id="aspect"
          size="sm"
          value={aspect}
          onChange={(a) => set({ aspect: a })}
          options={(['fit', '16:9', '4:3', '1:1', '9:16'] as Aspect[]).map((a) => ({ value: a, label: ASPECT_LABEL[a], title: a === 'fit' ? '填滿：用掉舞台區所有空間（導出時用目前的長寬比）' : `畫面比例 ${a}` }))}
        />
      </div>
    </div>
  );
}

function SubjectBar() {
  const subject = useStore((s) => s.subject);
  const set = useStore((s) => s.set);
  const subjectVer = useStore((s) => s.subjectVer);
  const setSubjectVer = useStore((s) => s.setSubjectVer);
  useStore((s) => s.themeRev); // 自訂主題的名稱會變
  return (
    <div className="scroll-x -mx-1 flex gap-1 px-1 pb-0.5" role="radiogroup" aria-label="主體">
      {SUBJECT_ORDER.map((id, i) => {
        const Icon = SUBJECT_ICON[id];
        const on = id === subject;
        const first3d = is3D(id) && !is3D(SUBJECT_ORDER[i - 1]);
        return (
          <Fragment key={id}>
            {first3d && (
              <span className="flex shrink-0 items-center gap-1 px-1.5 text-[10px] font-bold tracking-widest text-vis" aria-hidden>
                <span className="h-5 w-px bg-line-2" />
                3D
              </span>
            )}
            <button
              type="button"
              role="radio"
              aria-checked={on}
              title={SUBJECTS[id].desc}
              onClick={() => set({ subject: id })}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[13px] transition-colors ${
                on ? 'border-mot/60 bg-mot-soft text-fg' : 'border-line bg-panel text-fg-2 hover:text-fg'
              }`}
            >
              <Icon size={15} />
              {SUBJECTS[id].name}
            </button>
          </Fragment>
        );
      })}
      <div className="ml-1 flex shrink-0 items-center gap-1 rounded-lg border border-line bg-panel px-1 py-0.5" role="radiogroup" aria-label="主體版本" title="主體的設計版本：v1 是最初的設計（原樣保留），v2 是重新設計的版本；全域切換">
        {(['v1', 'v2'] as const).map((v) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={subjectVer === v}
            onClick={() => setSubjectVer(v)}
            className={`rounded-md px-2 py-1 text-[12px] font-semibold transition-colors ${subjectVer === v ? 'bg-mot-soft text-fg' : 'text-fg-3 hover:text-fg'}`}
          >
            {v}
          </button>
        ))}
      </div>
      <button
        type="button"
        title="匯入你自己的動畫主題檔（JSON）；視窗裡有格式說明、範本、給 AI 的提示詞"
        onClick={() => set({ themeOpen: true })}
        className="ml-1 flex shrink-0 items-center gap-1.5 rounded-lg border border-dashed border-line-2 px-2.5 py-1.5 text-[13px] text-fg-2 transition-colors hover:border-mot/60 hover:text-fg"
      >
        <Upload size={15} />
        匯入主題
      </button>
    </div>
  );
}
