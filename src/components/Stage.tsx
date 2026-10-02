// 舞台：主預覽（可四宮格）、軌跡間距疊圖、播放控制、主體切換。
import { Camera, Grid2x2, Layers, Pause, Play, Spline, StepBack, StepForward, Volume2, VolumeX } from 'lucide-react';
import { Fragment, useEffect, useRef, useState } from 'react';
import { clock } from '../engine/clock';
import { Renderer, loopSeconds, type FrameSpec } from '../engine/renderer';
import { SUBJECTS, SUBJECT_ORDER } from '../engine/subjects';
import { is3D, type SubjectId } from '../engine/types';
import { runExport } from '../lib/exporter';
import { saveBlob, stamp } from '../lib/platform';
import { toggleSound } from '../lib/sound';
import { useLookMove } from '../store/hooks';
import { useStore, type Aspect } from '../store/store';
import { SUBJECT_ICON } from './icons';
import { IconBtn, Segmented } from './ui';

export const ASPECT: Record<Aspect, number> = { '16:9': 16 / 9, '4:3': 4 / 3, '1:1': 1, '9:16': 9 / 16 };
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
  const st = useRef({ look, move, tune, subject, onion, path, grid4, box, quality, dirty: true });
  st.current = { look, move, tune, subject, onion, path, grid4, box, quality, dirty: true };

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const fit = () => {
      const r = el.getBoundingClientRect();
      const ar = ASPECT[aspect];
      let w = r.width;
      let h = w / ar;
      if (h > r.height) {
        h = r.height;
        w = h * ar;
      }
      setBox({ w: Math.max(40, Math.floor(w)), h: Math.max(40, Math.floor(h)) });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [aspect, fill]);

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
      <div ref={wrapRef} className={`relative flex w-full items-center justify-center ${fill ? 'min-h-0 flex-1' : ''}`} style={fill ? undefined : { aspectRatio: String(ASPECT[aspect]), maxHeight: '62vh' }}>
        <div className="relative overflow-hidden rounded-xl bg-stage shadow-[var(--shadow)] ring-1 ring-line" style={{ width: box.w, height: box.h }}>
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
          {!glOk && <div className="absolute left-2 bottom-2 rounded bg-danger/90 px-2 py-1 text-[11px] text-white">此瀏覽器不支援 WebGL2，後期特效已停用</div>}
        </div>
      </div>
      <Transport />
      <SubjectBar />
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
        <Segmented
          id="aspect"
          size="sm"
          value={aspect}
          onChange={(a) => set({ aspect: a })}
          options={(['16:9', '4:3', '1:1', '9:16'] as Aspect[]).map((a) => ({ value: a, label: a, title: `畫面比例 ${a}` }))}
        />
      </div>
    </div>
  );
}

function SubjectBar() {
  const subject = useStore((s) => s.subject);
  const set = useStore((s) => s.set);
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
    </div>
  );
}
