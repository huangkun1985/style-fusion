// 完整時間軸（2.0 β，F10；進階模式）：場景帶展開成「標記／場景／配樂」三列，共用同一條時間刻度（寬度＝秒數）。
// - 上方工具列：單場／整支、總長、對齊方式（畫面遷就音樂／音樂遷就畫面）、淡轉場長度、加標記。
// - 標記列：菱形是標記，點一下跳過去並可以改名、刪除；點空白處跳到那個時間。
// - 場景列：寬度＝這一場在片子裡的長度（已吸到小節線）；點一下切到這一場；拖右邊緣改長度；左邊緣「淡」切換淡轉場。
// - 配樂列：每一場對應的段落（前奏、展開、高潮、回落…）與小節數。
// 版面固定：高度固定 152，右側「＋ 加場景」固定寬 120；浮層往上開，不推擠。
import { Diamond, MoreHorizontal, Pause, Play } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { clock } from '../engine/clock';
import { addMarker, deleteMarker, filmModel, mmss, setFilm, setSceneTrans, setSceneDur, updateMarker, type FilmModel } from '../store/film';
import { MAX_TOTAL_SECONDS, switchScene } from '../store/scenes';
import { useStore } from '../store/store';
import type { Marker } from '../store/project';
import { AddSceneButton, SceneMenu, sceneLabel, toggleFilm, usePopover } from './SceneStrip';
import { Segmented } from './ui';

const LEFT = 0;

export function Timeline() {
  const s = useStore();
  const film = filmModel(s);
  const filmPlay = s.filmPlay;
  const wrapRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const [w, setW] = useState(600);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(200, el.getBoundingClientRect().width)));
    ro.observe(el);
    setW(Math.max(200, el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);
  const pps = (w - LEFT) / Math.max(0.5, film.total);
  const x = (t: number) => LEFT + t * pps;
  const active = film.shots.find((sh) => sh.id === s.activeScene) ?? film.shots[0];
  // 播放頭：整支模式＝片子時間；單場模式＝目前場景的開始＋循環內的時間
  useEffect(() => {
    let raf = 0;
    const upd = () => {
      raf = requestAnimationFrame(upd);
      let t: number;
      if (filmPlay) t = ((clock.t % film.total) + film.total) % film.total;
      else t = active.start + Math.min(active.dur, ((clock.t % active.loop) + active.loop) % active.loop);
      if (headRef.current) headRef.current.style.transform = `translateX(${x(t)}px)`;
      if (timeRef.current) timeRef.current.textContent = `${mmss(t)} / ${mmss(film.total)}`;
    };
    upd();
    return () => cancelAnimationFrame(raf);
  });
  const seek = (t: number) => {
    const tt = Math.max(0, Math.min(film.total - 0.001, t));
    if (!filmPlay) toggleFilm(true);
    clock.play(false);
    clock.set(tt);
  };
  const playheadT = () => (filmPlay ? ((clock.t % film.total) + film.total) % film.total : active.start);
  const onRuler = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    seek((e.clientX - r.left - LEFT) / pps);
  };
  const over = film.total > MAX_TOTAL_SECONDS;
  return (
    <div className="flex h-[152px] shrink-0 gap-1" aria-label="時間軸">
      <div className="flex min-w-0 flex-1 flex-col rounded-xl border border-line bg-panel">
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
        </div>
        {/* 三列 */}
        <div ref={wrapRef} className="relative min-h-0 flex-1 overflow-hidden">
          <MarkerRow film={film} x={x} onSeek={seek} onRuler={onRuler} />
          <SceneRow film={film} x={x} pps={pps} />
          <MusicRow film={film} x={x} />
          <div ref={headRef} className="pointer-events-none absolute inset-y-0 left-0 w-px bg-accent" aria-hidden>
            <span className="absolute -left-[4px] top-0 size-[9px] rotate-45 bg-accent" />
          </div>
        </div>
      </div>
      <AddSceneButton total={film.total} />
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

function MarkerRow({ film, x, onSeek, onRuler }: { film: FilmModel; x: (t: number) => number; onSeek: (t: number) => void; onRuler: (e: React.PointerEvent) => void }) {
  const markers = useStore((s) => s.film.markers);
  const step = film.total > 90 ? 10 : film.total > 30 ? 5 : film.total > 10 ? 2 : 1;
  const ticks: number[] = [];
  for (let t = 0; t <= film.total + 1e-6; t += step) ticks.push(t);
  return (
    <div className="relative h-6 cursor-pointer border-b border-line" onPointerDown={onRuler} title="時間刻度：點一下跳到那個時間（會切到整支片子）">
      {ticks.map((t) => (
        <span key={t} className="num pointer-events-none absolute top-0 h-full border-l border-line pl-1 text-[10px] leading-6 text-fg-3" style={{ left: x(t) }}>
          {t}s
        </span>
      ))}
      {markers.map((m) => (
        <MarkerPin key={m.id} m={m} left={x(Math.min(m.t, film.total))} onSeek={onSeek} />
      ))}
    </div>
  );
}

function MarkerPin({ m, left, onSeek }: { m: Marker; left: number; onSeek: (t: number) => void }) {
  const pop = usePopover();
  const [draft, setDraft] = useState(m.label);
  return (
    <div ref={pop.ref} className="absolute top-0 z-10 h-6" style={{ left: left - 8 }} onPointerDown={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => {
          onSeek(m.t);
          setDraft(m.label);
          pop.setOpen(!pop.open);
        }}
        title={`標記「${m.label}」在 ${m.t.toFixed(2)} 秒：點一下跳過去，可以改名或刪除`}
        className="flex h-6 w-4 items-center justify-center"
      >
        <span className="size-[9px] rotate-45 border border-accent bg-accent/70" />
      </button>
      {pop.open && (
        <div className="pop-in absolute left-0 top-[calc(100%+4px)] z-40 w-[220px] rounded-xl border border-line-2 bg-panel-2 p-2 shadow-[var(--shadow)]">
          <label htmlFor={`mk-${m.id}`} className="mb-1 block text-[12px] text-fg-2">
            標記名稱（{m.t.toFixed(2)} 秒）
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
                pop.setOpen(false);
              }
            }}
            className="h-8 w-full rounded-md border border-line-2 bg-panel px-2 text-[13px] outline-none focus:border-mot"
          />
          <div className="mt-2 flex justify-between gap-1">
            <button type="button" className="h-8 rounded-md px-2 text-[13px] text-danger hover:bg-raise" onClick={() => { deleteMarker(m.id); pop.setOpen(false); }} title="刪除這個標記（可以 Ctrl+Z 復原）">
              刪除
            </button>
            <button type="button" className="h-8 rounded-md bg-raise px-3 text-[13px]" onClick={() => { updateMarker(m.id, { label: draft }); pop.setOpen(false); }}>
              確定
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SceneRow({ film, x, pps }: { film: FilmModel; x: (t: number) => number; pps: number }) {
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
            label={`${sh.index + 1} ${sceneLabel(sc, active)}`}
            sub={`${sh.dur.toFixed(1)}s`}
            fade={sh.trans === 'fade'}
            first={sh.index === 0}
            sc={sc}
            i={sh.index}
            n={film.shots.length}
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
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
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
  label: string;
  sub: string;
  fade: boolean;
  first: boolean;
  sc: ReturnType<typeof useStore.getState>['scenes'][number];
  i: number;
  n: number;
  onPick: () => void;
  onDragStart: (e: React.PointerEvent) => void;
  onDragMove: (e: React.PointerEvent) => void;
  onDragEnd: () => void;
}) {
  const menu = usePopover();
  return (
    <div ref={menu.ref} className="absolute top-1 h-[44px]" style={{ left: p.left + 1, width: p.width }}>
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
          onClick={() => setSceneTrans(p.sc.id, p.fade ? 'cut' : 'fade')}
          title={p.fade ? '淡轉場：從上一場淡進來。再按一下改回直接切' : '直接切：按一下改成淡轉場（從上一場淡進來）'}
          className={`absolute left-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded text-[10px] ${p.fade ? 'bg-mot font-bold text-on-mot' : 'text-fg-3 hover:bg-raise hover:text-fg'}`}
        >
          {p.fade ? '淡' : '|'}
        </button>
      )}
      {p.active && p.width > 60 && (
        <button
          type="button"
          aria-label="這個場景的選項"
          title="這個場景的選項：改名、長度、複製、移動、刪除"
          onClick={() => menu.setOpen(!menu.open)}
          className="absolute right-2 top-0.5 flex size-5 items-center justify-center rounded text-fg-2 hover:bg-raise hover:text-fg"
        >
          <MoreHorizontal size={13} />
        </button>
      )}
      <span
        role="separator"
        aria-label="拖動改這一場的長度"
        title="拖動改這一場的長度（畫面遷就音樂時會吸到小節線）"
        onPointerDown={p.onDragStart}
        onPointerMove={p.onDragMove}
        onPointerUp={p.onDragEnd}
        onPointerCancel={p.onDragEnd}
        className="absolute -right-1 top-0 h-full w-2.5 cursor-ew-resize rounded-r-lg hover:bg-accent/40"
      />
      {menu.open && <SceneMenu sc={p.sc} i={p.i} n={p.n} onClose={() => menu.setOpen(false)} align={p.left > 300 ? 'right' : 'left'} />}
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
