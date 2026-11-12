// 完整時間軸（2.0 β，F10；進階模式）：場景帶展開成「標記／場景／配樂」三列，共用同一條時間刻度。
// - 上方工具列：單場／整支、總長、加標記、對齊方式（畫面遷就音樂／音樂遷就畫面）、淡轉場長度、縮放。
// - 標記列：菱形是標記，點一下跳過去並可以改名、刪除；拖動改時間（吸到場景交界，按住 Alt 不吸）；點空白處跳到那個時間。
//   標記黏在它所在的那一場上：場景改長度、搬位置，標記跟著走（film.ts 的 markerTime）。
// - 場景列：寬度＝這一場在片子裡的長度（已吸到小節線）；點一下切到這一場；拖右邊緣改長度；左邊緣「淡」切換淡轉場。
// - 配樂列：每一場對應的段落（前奏、展開、高潮、回落…）與小節數。
// - 縮放與捲動（2.0 正式）：工具列的 −／＋（或 Ctrl＋滾輪，以滑鼠位置為中心）放大；放大後滾輪左右捲，底部的總覽條可以拖；
//   播放中播放頭跑出畫面時自動跟上。縮放不存檔（每次打開是「整支放得下」）。
// 版面固定：高度固定 152，右側「＋ 加場景」固定寬 120；浮層（場景選單、標記編輯）畫在捲動區外面，不會被裁掉、不推擠。
import { Diamond, Minus, MoreHorizontal, Pause, Play, Plus } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { clock } from '../engine/clock';
import { addMarker, deleteMarker, filmModel, mmss, setFilm, setSceneTrans, setSceneDur, updateMarker, type FilmModel } from '../store/film';
import { MAX_TOTAL_SECONDS, switchScene } from '../store/scenes';
import { useStore } from '../store/store';
import { AddSceneButton, SceneMenu, sceneLabel, toggleFilm } from './SceneStrip';
import { Segmented } from './ui';

/** 縮放的檔位（1＝整支片子剛好放滿寬度） */
const ZOOMS = [1, 1.5, 2, 3, 4, 6, 8, 12, 16, 24];
/** 放大的上限：每秒最多這麼多像素 */
const MAX_PPS = 320;
/** 工具列高度＋標記列高度（浮層定位用） */
const TOOLBAR_H = 37;
const RULER_H = 25;
const SNAP_PX = 6;

type Overlay = { kind: 'scene' | 'marker'; id: string } | null;
type FilmMarker = FilmModel['markers'][number];

export function Timeline() {
  const s = useStore();
  const film = filmModel(s);
  const filmPlay = s.filmPlay;
  const scrollRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const [w, setW] = useState(600);
  const [zoom, setZoom] = useState(1);
  const [sx, setSx] = useState(0);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  // 縮放之後要把哪個時間留在滑鼠（或畫面中間）下面
  const anchor = useRef<{ t: number; cx: number } | null>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(200, el.getBoundingClientRect().width)));
    ro.observe(el);
    setW(Math.max(200, el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);
  const total = Math.max(0.5, film.total);
  const maxZoom = Math.max(1, (MAX_PPS * total) / w);
  const zooms = ZOOMS.filter((z, i) => i === 0 || z <= maxZoom * 1.01);
  const z = Math.min(zoom, zooms[zooms.length - 1]);
  const inner = w * z;
  const pps = inner / total;
  const x = (t: number) => t * pps;
  const active = film.shots.find((sh) => sh.id === s.activeScene) ?? film.shots[0];
  const setZoomAt = (nz: number, cx = w / 2) => {
    const el = scrollRef.current;
    anchor.current = { t: ((el?.scrollLeft ?? 0) + cx) / pps, cx };
    // 寬度順便重量一次（ResizeObserver 在分頁沒顯示時不會回報）
    if (el) setW(Math.max(200, el.getBoundingClientRect().width));
    setZoom(nz);
  };
  const stepZoom = (dir: 1 | -1, cx?: number) => {
    const i = zooms.indexOf(z);
    const ni = Math.max(0, Math.min(zooms.length - 1, (i < 0 ? 0 : i) + dir));
    if (zooms[ni] !== z) setZoomAt(zooms[ni], cx);
  };
  // 縮放後把錨點放回原來的位置
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const a = anchor.current;
    if (!el || !a) return;
    anchor.current = null;
    el.scrollLeft = Math.max(0, a.t * pps - a.cx);
    setSx(el.scrollLeft);
  }, [pps]);
  // 滾輪：Ctrl／⌘＋滾輪縮放；放大時一般滾輪左右捲（要 passive: false 才能擋掉頁面捲動）
  const wheel = useRef<(e: WheelEvent) => void>(() => {});
  wheel.current = (e: WheelEvent) => {
    const el = scrollRef.current;
    if (!el) return;
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      stepZoom(e.deltaY < 0 ? 1 : -1, e.clientX - el.getBoundingClientRect().left);
    } else if (z > 1 && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    }
  };
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const h = (e: WheelEvent) => wheel.current(e);
    el.addEventListener('wheel', h, { passive: false });
    return () => el.removeEventListener('wheel', h);
  }, []);
  // 播放頭：整支模式＝片子時間；單場模式＝目前場景的開始＋循環內的時間。播放中跑出畫面時自動捲過去
  useEffect(() => {
    let raf = 0;
    const upd = () => {
      raf = requestAnimationFrame(upd);
      let t: number;
      if (filmPlay) t = ((clock.t % film.total) + film.total) % film.total;
      else t = active.start + Math.min(active.dur, ((clock.t % active.loop) + active.loop) % active.loop);
      const px = x(t);
      if (headRef.current) headRef.current.style.transform = `translateX(${px}px)`;
      if (timeRef.current) timeRef.current.textContent = `${mmss(t)} / ${mmss(film.total)}`;
      const el = scrollRef.current;
      if (el && z > 1 && clock.playing && !overlay && !dragging.current && (px < el.scrollLeft || px > el.scrollLeft + w - 16)) {
        el.scrollLeft = Math.max(0, px - w * 0.1);
      }
    };
    upd();
    return () => cancelAnimationFrame(raf);
  });
  // 浮層：點外面或按 Esc 關掉（點開浮層的那顆按鈕本身不算外面，它自己會切換）
  useEffect(() => {
    if (!overlay) return;
    const close = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (overlayRef.current?.contains(t) || t.closest?.('[data-tl-trigger]')) return;
      setOverlay(null);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOverlay(null);
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', esc);
    };
  }, [overlay]);
  const dragging = useRef(false);
  const seek = (t: number) => {
    const tt = Math.max(0, Math.min(film.total - 0.001, t));
    if (!filmPlay) toggleFilm(true);
    clock.play(false);
    clock.set(tt);
  };
  const playheadT = () => (filmPlay ? ((clock.t % film.total) + film.total) % film.total : active.start);
  const onRuler = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    seek((e.clientX - r.left) / pps);
  };
  const over = film.total > MAX_TOTAL_SECONDS;
  // 吸附點：場景交界
  const edges = film.shots.map((sh) => sh.start).concat(film.total);
  const snap = (t: number, free: boolean) => {
    if (free) return t;
    let best = t;
    let d = SNAP_PX / pps;
    for (const e of edges)
      if (Math.abs(e - t) < d) {
        d = Math.abs(e - t);
        best = e;
      }
    return best;
  };
  // 浮層的水平位置（捲動區外面的座標）
  const ovLeft = (t: number, width: number) => Math.max(0, Math.min(w - width, x(t) - sx - 8));
  const ovMarker = overlay?.kind === 'marker' ? film.markers.find((m) => m.id === overlay.id) : undefined;
  const ovShot = overlay?.kind === 'scene' ? film.shots.find((sh) => sh.id === overlay.id) : undefined;
  const ovScene = ovShot ? s.scenes.find((sc) => sc.id === ovShot.id) : undefined;
  return (
    <div className="flex h-[152px] shrink-0 gap-1" aria-label="時間軸">
      <div className="relative flex min-w-0 flex-1 flex-col rounded-xl border border-line bg-panel">
        {/* 工具列 */}
        <div className="flex h-9 shrink-0 items-center gap-2 overflow-hidden border-b border-line px-2">
          <button
            type="button"
            aria-pressed={filmPlay}
            onClick={() => toggleFilm()}
            title={filmPlay ? '回到單場：只循環目前這一場（要細調這一場時用）' : '整支片子：從第一場開始接著播，含淡轉場與跟著場景走的配樂。排好場景、想看整體節奏時用'}
            className={`flex h-7 w-[84px] shrink-0 items-center justify-center gap-1 rounded-md border text-[13px] ${filmPlay ? 'border-mot bg-mot-soft' : 'border-line-2 hover:bg-raise'}`}
          >
            {filmPlay ? <Pause size={13} /> : <Play size={13} />} {filmPlay ? '單場' : '整支'}
          </button>
          <span ref={timeRef} className={`num hidden w-[124px] shrink-0 2xl:inline text-[12px] ${over ? 'text-danger' : 'text-fg-2'}`} title={over ? `總長超過 ${MAX_TOTAL_SECONDS} 秒` : '播放頭的時間／整支片子的總長'} />
          <AddMarkerBtn at={playheadT} />
          <Segmented
            id="film-sync"
            size="sm"
            value={s.film.sync}
            onChange={(v) => setFilm({ sync: v as 'picture' | 'music' })}
            options={[
              { value: 'picture', label: '畫面遷就音樂', title: '畫面遷就音樂（預設）：每一場的長度吸到整數小節，換場剛好落在小節線上。大部分情況用這個' },
              { value: 'music', label: '音樂遷就畫面', title: '音樂遷就畫面：場景長度不動，配樂的速度微調（最多 ±6%）讓總長剛好是整數小節。長度已經和口播或客戶對好時用' },
            ]}
          />
          <label className="flex shrink-0 items-center gap-1 text-[12px] text-fg-2" title="淡轉場長度：設成「淡」的場景，從上一場淡進來要多久。想要轉場更柔或更俐落時調">
            淡轉場
            <select
              value={String(s.film.fade)}
              onChange={(e) => setFilm({ fade: parseFloat(e.target.value) })}
              className="h-7 rounded-md border border-line-2 bg-panel-2 px-1 text-[12px] text-fg"
            >
              {[0.2, 0.4, 0.6, 1, 1.5].map((v) => (
                <option key={v} value={v}>
                  {v} 秒
                </option>
              ))}
            </select>
          </label>
          <span className="min-w-0 flex-1 truncate text-[12px] text-fg-3" title={film.note || undefined}>
            {film.note || (film.scored ? `配樂 ${Math.round(film.bpm)} BPM · ${film.meter}/4 · 每場一個段落${film.drift ? `（速度 ${film.drift > 0 ? '+' : ''}${(film.drift * 100).toFixed(1)}%）` : ''}` : `配樂照原曲循環 · ${Math.round(film.bpm)} BPM`)}
          </span>
          <div className="flex shrink-0 items-center" role="group" aria-label="時間軸縮放">
            <button type="button" disabled={z <= 1} onClick={() => stepZoom(-1)} aria-label="縮小時間軸" title="縮小時間軸：看到更多時間。整支放得下時不能再縮（Ctrl＋滾輪也可以）" className="flex size-7 items-center justify-center rounded-md text-fg-2 hover:bg-raise hover:text-fg disabled:opacity-30">
              <Minus size={13} />
            </button>
            <button type="button" onClick={() => setZoomAt(1)} title="縮放倍率；點一下回到「整支放得下」。場景很多、每格太窄時放大看" className="num h-7 w-10 rounded-md text-[12px] text-fg-2 hover:bg-raise hover:text-fg">
              {z < 10 ? z.toFixed(z % 1 ? 1 : 0) : Math.round(z)}×
            </button>
            <button type="button" disabled={z >= zooms[zooms.length - 1]} onClick={() => stepZoom(1)} aria-label="放大時間軸" title="放大時間軸：每一秒更寬，方便拖長度、放標記（以畫面中間為準；Ctrl＋滾輪以滑鼠位置為準）" className="flex size-7 items-center justify-center rounded-md text-fg-2 hover:bg-raise hover:text-fg disabled:opacity-30">
              <Plus size={13} />
            </button>
          </div>
        </div>
        {/* 三列（可以左右捲） */}
        <div ref={scrollRef} className="hide-scrollbar relative min-h-0 flex-1 overflow-x-auto overflow-y-hidden" onScroll={(e) => setSx((e.currentTarget as HTMLElement).scrollLeft)}>
          <div className="relative h-full" style={{ width: inner }}>
            <MarkerRow film={film} x={x} pps={pps} onSeek={seek} onRuler={onRuler} snap={snap} dragging={dragging} openId={ovMarker?.id} onOpen={(id) => setOverlay(overlay?.kind === 'marker' && overlay.id === id ? null : { kind: 'marker', id })} />
            <SceneRow film={film} x={x} pps={pps} openId={ovShot?.id} onMenu={(id) => setOverlay(overlay?.kind === 'scene' && overlay.id === id ? null : { kind: 'scene', id })} />
            <MusicRow film={film} x={x} />
            <div ref={headRef} className="pointer-events-none absolute inset-y-0 left-0 w-px bg-accent" aria-hidden>
              <span className="absolute -left-[4px] top-0 size-[9px] rotate-45 bg-accent" />
            </div>
          </div>
        </div>
        <Overview w={w} inner={inner} sx={sx} onScrollTo={(v) => scrollRef.current && (scrollRef.current.scrollLeft = v)} />
        {/* 浮層：畫在捲動區外面 */}
        {ovMarker && (
          <div ref={overlayRef} className="absolute z-40 h-0 w-[220px]" style={{ left: ovLeft(ovMarker.t, 220), top: TOOLBAR_H }}>
            <MarkerEditor key={ovMarker.id} m={ovMarker} onClose={() => setOverlay(null)} />
          </div>
        )}
        {ovShot && ovScene && (
          <div ref={overlayRef} className="absolute z-40 h-0" style={{ left: Math.max(0, Math.min(w - 248, x(ovShot.start + ovShot.dur) - sx - 248)), top: TOOLBAR_H + RULER_H + 4, width: 248 }}>
            <SceneMenu sc={ovScene} i={ovShot.index} n={film.shots.length} onClose={() => setOverlay(null)} />
          </div>
        )}
      </div>
      <AddSceneButton total={film.total} />
    </div>
  );
}

/** 底部的總覽條：亮的那段是目前看得到的範圍，可以拖；整支放得下時整條都亮 */
function Overview({ w, inner, sx, onScrollTo }: { w: number; inner: number; sx: number; onScrollTo: (v: number) => void }) {
  const drag = useRef<{ x0: number; s0: number } | null>(null);
  const k = w / inner;
  const zoomed = inner > w + 1;
  return (
    <div className="relative mx-1 mb-0.5 h-[6px] shrink-0 rounded-full bg-raise" title={zoomed ? '總覽：亮的那段是看得到的範圍，拖動它左右捲（滾輪也可以）' : '整支片子都在畫面裡。放大後這裡可以拖動捲動'}>
      <div
        className={`absolute inset-y-0 rounded-full ${zoomed ? 'cursor-grab bg-line-2 hover:bg-fg-3' : 'bg-line'}`}
        style={{ left: sx * k, width: Math.max(12, w * k) }}
        onPointerDown={(e) => {
          if (!zoomed) return;
          drag.current = { x0: e.clientX, s0: sx };
          capture(e);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (d) onScrollTo(d.s0 + (e.clientX - d.x0) / k);
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
      />
    </div>
  );
}

function AddMarkerBtn({ at }: { at: () => number }) {
  const showToast = useStore((s) => s.showToast);
  return (
    <button
      type="button"
      onClick={() => {
        const e = addMarker(at());
        if (e) showToast(e);
      }}
      title="加標記：在播放頭的位置放一個標記（例如「口播開始」「Logo 出現」），風格包的規格頁會列出來。要和剪輯、口播對時間時用"
      className="flex h-7 w-[84px] shrink-0 items-center justify-center gap-1 rounded-md border border-line-2 text-[13px] hover:bg-raise"
    >
      <Diamond size={12} /> 加標記
    </button>
  );
}

/** 刻度間隔：讓兩個刻度至少隔 44 像素 */
function tickStep(pps: number) {
  for (const st of [0.25, 0.5, 1, 2, 5, 10, 15, 30, 60]) if (st * pps >= 44) return st;
  return 60;
}

function MarkerRow(p: {
  film: FilmModel;
  x: (t: number) => number;
  pps: number;
  onSeek: (t: number) => void;
  onRuler: (e: React.PointerEvent) => void;
  snap: (t: number, free: boolean) => number;
  dragging: { current: boolean };
  openId?: string;
  onOpen: (id: string) => void;
}) {
  const { film, x } = p;
  const step = tickStep(p.pps);
  const ticks: number[] = [];
  for (let i = 0; i * step <= film.total + 1e-6; i++) ticks.push(Math.round(i * step * 100) / 100);
  return (
    <div className="relative h-6 cursor-pointer border-b border-line" onPointerDown={p.onRuler} title="時間刻度：點一下跳到那個時間（會切到整支片子）">
      {ticks.map((t) => (
        <span key={t} className="num pointer-events-none absolute top-0 h-full border-l border-line pl-1 text-[10px] leading-6 text-fg-3" style={{ left: x(t) }}>
          {t}s
        </span>
      ))}
      {film.markers.map((m) => (
        <MarkerPin key={m.id} m={m} left={x(Math.min(m.t, film.total))} pps={p.pps} open={p.openId === m.id} onSeek={p.onSeek} snap={p.snap} dragging={p.dragging} onOpen={() => p.onOpen(m.id)} />
      ))}
    </div>
  );
}

/** 一個標記：點一下跳過去並打開編輯；拖動改時間；選到時方向鍵微調（Shift 一次 1 秒） */
function MarkerPin(p: { m: FilmMarker; left: number; pps: number; open: boolean; onSeek: (t: number) => void; snap: (t: number, free: boolean) => number; dragging: { current: boolean }; onOpen: () => void }) {
  const { m } = p;
  const drag = useRef<{ x0: number; t0: number; moved: boolean } | null>(null);
  return (
    <div className="absolute top-0 z-10 h-6" style={{ left: p.left - 8 }} onPointerDown={(e) => e.stopPropagation()}>
      <button
        type="button"
        data-tl-trigger
        aria-expanded={p.open}
        onPointerDown={(e) => {
          drag.current = { x0: e.clientX, t0: m.t, moved: false };
          capture(e);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const dx = e.clientX - d.x0;
          if (!d.moved && Math.abs(dx) < 3) return;
          d.moved = true;
          p.dragging.current = true;
          updateMarker(m.id, { t: p.snap(d.t0 + dx / p.pps, e.altKey) });
        }}
        onPointerUp={() => {
          const d = drag.current;
          drag.current = null;
          p.dragging.current = false;
          if (d && !d.moved) {
            p.onSeek(m.t);
            p.onOpen();
          }
        }}
        onPointerCancel={() => {
          drag.current = null;
          p.dragging.current = false;
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            p.onSeek(m.t);
            p.onOpen();
          } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            e.preventDefault();
            updateMarker(m.id, { t: m.t + (e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 1 : 0.1) });
          }
        }}
        title={`標記「${m.label}」在 ${m.t.toFixed(2)} 秒：點一下跳過去並改名、刪除；拖動改時間（會吸到場景交界，按住 Alt 不吸）。標記跟著它所在的那一場走`}
        className="flex h-6 w-4 cursor-ew-resize touch-none items-center justify-center"
      >
        <span className={`size-[9px] rotate-45 border border-accent ${p.open ? 'bg-accent' : 'bg-accent/70'}`} />
      </button>
    </div>
  );
}

function MarkerEditor({ m, onClose }: { m: FilmMarker; onClose: () => void }) {
  const [draft, setDraft] = useState(m.label);
  return (
    <div className="pop-in absolute bottom-[calc(100%+6px)] left-0 w-[220px] rounded-xl border border-line-2 bg-panel-2 p-2 shadow-[var(--shadow)]">
      <label htmlFor={`mk-${m.id}`} className="mb-1 block text-[12px] text-fg-2">
        標記名稱（<span className="num">{m.t.toFixed(2)}</span> 秒）
      </label>
      <input
        id={`mk-${m.id}`}
        autoFocus
        value={draft}
        maxLength={40}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            updateMarker(m.id, { label: draft });
            onClose();
          }
        }}
        className="h-8 w-full rounded-md border border-line-2 bg-panel px-2 text-[13px] outline-none focus:border-mot"
      />
      <div className="mt-2 flex justify-between gap-1">
        <button type="button" className="h-8 rounded-md px-2 text-[13px] text-danger hover:bg-raise" onClick={() => { deleteMarker(m.id); onClose(); }} title="刪除這個標記（可以 Ctrl+Z 復原）">
          刪除
        </button>
        <button type="button" className="h-8 rounded-md bg-raise px-3 text-[13px]" onClick={() => { updateMarker(m.id, { label: draft }); onClose(); }} title="確定改名">
          確定
        </button>
      </div>
    </div>
  );
}

function SceneRow({ film, x, pps, openId, onMenu }: { film: FilmModel; x: (t: number) => number; pps: number; openId?: string; onMenu: (id: string) => void }) {
  const s = useStore();
  const drag = useRef<{ id: string; x0: number; d0: number; pps: number } | null>(null);
  return (
    <div className="relative h-[52px] border-b border-line">
      {film.shots.map((sh) => {
        const sc = s.scenes.find((x0) => x0.id === sh.id)!;
        const active = sh.id === s.activeScene;
        const left = x(sh.start);
        const width = Math.max(8, sh.dur * pps - 2);
        return (
          <SceneBlock
            key={sh.id}
            left={left}
            width={width}
            active={active}
            menuOpen={openId === sh.id}
            label={`${sh.index + 1} ${sceneLabel(sc, active)}`}
            sub={`${sh.dur.toFixed(1)}s`}
            fade={sh.trans === 'fade'}
            first={sh.index === 0}
            id={sh.id}
            onMenu={() => onMenu(sh.id)}
            onPick={() => {
              if (!active && !switchScene(sh.id)) {
                s.showToast('先處理 Agent 的修改卡（套用或放棄），或放開「看 A」');
                return;
              }
              if (s.filmPlay) {
                clock.play(false);
                clock.set(sh.start + 0.001);
                useStore.setState({ filmPlay: true });
              }
            }}
            onDragStart={(e) => {
              drag.current = { id: sh.id, x0: e.clientX, d0: sh.dur, pps };
              capture(e);
            }}
            onDragMove={(e) => {
              const d = drag.current;
              if (!d) return;
              setSceneDur(d.id, d.d0 + (e.clientX - d.x0) / d.pps);
            }}
            onDragEnd={() => (drag.current = null)}
          />
        );
      })}
    </div>
  );
}

function SceneBlock(p: {
  left: number;
  width: number;
  active: boolean;
  menuOpen: boolean;
  label: string;
  sub: string;
  fade: boolean;
  first: boolean;
  id: string;
  onMenu: () => void;
  onPick: () => void;
  onDragStart: (e: React.PointerEvent) => void;
  onDragMove: (e: React.PointerEvent) => void;
  onDragEnd: () => void;
}) {
  return (
    <div className="absolute top-1 h-[44px]" style={{ left: p.left + 1, width: p.width }}>
      <button
        type="button"
        onClick={p.onPick}
        title={`${p.label}，${p.sub}。點一下切到這一場（整支片子播放中會跳到這一場的開頭）`}
        className={`flex size-full flex-col justify-center overflow-hidden rounded-lg px-2 text-left leading-[17px] ${p.active ? 'border-[1.5px] border-mot bg-mot-soft' : 'border border-line-2 bg-panel-2 hover:bg-raise'} ${p.first ? '' : 'pl-6'}`}
      >
        <span className="truncate text-[12px] text-fg">{p.label}</span>
        <span className="num truncate text-[11px] text-fg-2">{p.sub}</span>
      </button>
      {!p.first && (
        <button
          type="button"
          aria-pressed={p.fade}
          onClick={() => setSceneTrans(p.id, p.fade ? 'cut' : 'fade')}
          title={p.fade ? '淡轉場：從上一場淡進來。再按一下改回直接切' : '直接切：按一下改成淡轉場（從上一場淡進來）'}
          className={`absolute left-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded text-[10px] ${p.fade ? 'bg-mot font-bold text-on-mot' : 'text-fg-3 hover:bg-raise hover:text-fg'}`}
        >
          {p.fade ? '淡' : '|'}
        </button>
      )}
      {p.active && p.width > 60 && (
        <button
          type="button"
          data-tl-trigger
          aria-label="這個場景的選項"
          aria-expanded={p.menuOpen}
          title="這個場景的選項：改名、長度、複製、移動、刪除"
          onClick={p.onMenu}
          className="absolute right-2 top-0.5 flex size-5 items-center justify-center rounded text-fg-2 hover:bg-raise hover:text-fg"
        >
          <MoreHorizontal size={13} />
        </button>
      )}
      <span
        role="separator"
        aria-label="拖動改這一場的長度"
        title="拖動改這一場的長度（畫面遷就音樂時會吸到小節線）。放大時間軸會比較好拖"
        onPointerDown={p.onDragStart}
        onPointerMove={p.onDragMove}
        onPointerUp={p.onDragEnd}
        onPointerCancel={p.onDragEnd}
        className="absolute -right-1 top-0 h-full w-2.5 cursor-ew-resize touch-none rounded-r-lg hover:bg-accent/40"
      />
    </div>
  );
}

function MusicRow({ film, x }: { film: FilmModel; x: (t: number) => number }) {
  return (
    <div className="relative h-[26px]" title="配樂：整支片子一首曲子，每一場是一個段落（用第 1 場的音樂設定作曲）。在「聲音」分頁換曲風、聲音方案">
      {film.shots.map((sh) => (
        <span
          key={sh.id}
          className="num absolute top-1 flex h-[18px] items-center truncate rounded border border-line bg-raise px-1.5 text-[11px] text-fg-2"
          style={{ left: x(sh.start) + 1, width: Math.max(6, x(sh.start + sh.dur) - x(sh.start) - 2) }}
        >
          {sh.section} · {sh.bars} 小節
        </span>
      ))}
    </div>
  );
}

/** 拖動時抓住指標（觸控筆、某些瀏覽器會拒絕；拒絕時照樣能拖，只是滑出元素就停） */
function capture(e: React.PointerEvent) {
  try {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  } catch {
    /* 沒有作用中的指標 */
  }
}
