// 場景帶（2.0 α3，F8）：高 64。每一格是一個場景（寬度跟著長度），點一下切換；目前那一格右上有「⋯」（改名、複製、移動、長度、刪除）。
// 最右邊固定兩格：「整支」（播放整支片子）與「＋ 加場景」（不在捲動區裡，位置不會因為場景變多而跑掉），下面一行是總長。
// 選單都是浮層（往上開），不推動版面。最多 12 場、總長 180 秒（超過時總長變紅並提示）。
// 進階模式用 Timeline.tsx（完整時間軸）；場景選單與加場景選單兩邊共用（SceneMenu、AddSceneButton）。
import { Copy, MoreHorizontal, Pause, Play, Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { clock } from '../engine/clock';
import { SUBJECTS } from '../engine/subjects';
import { themeOf, themes } from '../engine/themes';
import { filmModel, setSceneDur } from '../store/film';
import { mixSpec } from '../store/hooks';
import { MAX_SCENES, type Scene } from '../store/project';
import { addScene, deleteScene, loopOf, MAX_TOTAL_SECONDS, moveScene, renameScene, sceneSeconds, switchScene } from '../store/scenes';
import { useStore } from '../store/store';
import { Thumb } from './Thumb';

export function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);
  return { open, setOpen, ref };
}

export const menuItem = 'flex h-9 w-full items-center gap-2 rounded-md px-2.5 text-left text-[13px] text-fg hover:bg-raise disabled:opacity-40';

/** 播放整支片子／回到單場（簡潔模式的場景帶與進階的時間軸都用） */
export function toggleFilm(on = !useStore.getState().filmPlay) {
  const s = useStore.getState();
  if (on === s.filmPlay) return;
  if (on && (s.hist.previewing || s.hist.showingA)) {
    s.showToast('先處理 Agent 的修改卡（套用或放棄），或放開「看 A」');
    return;
  }
  useStore.setState({ filmPlay: on, wall: false });
  clock.set(0);
  if (on) clock.play(true);
}

export function SceneStrip() {
  const s = useStore();
  const scenes = s.scenes;
  const active = s.activeScene;
  useStore((x) => x.themeRev);
  const film = filmModel(s);
  const secs = scenes.map((sc, i) => film.shots[i]?.dur ?? sceneSeconds(sc, s));
  // 總長用整支片子的（已吸到小節線），和時間軸、導出一致
  const total = film.total;
  return (
    <div className="relative flex h-16 shrink-0 gap-1" aria-label="場景帶">
      <div className="scroll-x hide-scrollbar flex min-w-0 flex-1 gap-1" role="listbox" aria-label="場景">
        {scenes.map((sc, i) => (
          <SceneCell key={sc.id} sc={sc} i={i} n={scenes.length} secs={secs[i]} active={sc.id === active} />
        ))}
      </div>
      <FilmToggle disabled={scenes.length < 2} />
      <AddSceneButton total={total} />
    </div>
  );
}

/** 「整支」：從第一場開始把所有場景接起來播（含轉場與跟著場景走的配樂）。固定寬 88 */
function FilmToggle({ disabled }: { disabled: boolean }) {
  const on = useStore((s) => s.filmPlay);
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled && !on}
      onClick={() => toggleFilm()}
      title={disabled && !on ? '整支片子：先加第二個場景才能接成一支片子' : on ? '回到單場：只循環目前這一場（要細調這一場時用）' : '整支片子：從第一場開始接著播，含淡轉場與跟著場景走的配樂。排好場景、想看整體節奏時用'}
      className={`${on ? 'flex' : 'hidden sm:flex'} w-[88px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl border text-[13px] disabled:opacity-40 ${on ? 'border-mot bg-mot-soft text-fg' : 'border-line-2 text-fg hover:bg-raise'}`}
    >
      {on ? <Pause size={15} /> : <Play size={15} />}
      <span>{on ? '單場' : '整支'}</span>
    </button>
  );
}

/** 「＋ 加場景」：固定寬 120，下面一行是總長 */
export function AddSceneButton({ total, compact = false }: { total: number; compact?: boolean }) {
  const s = useStore();
  const full = s.scenes.length >= MAX_SCENES;
  const over = total > MAX_TOTAL_SECONDS;
  const add = usePopover();
  const err = (msg: string | null) => msg && s.showToast(msg);
  return (
    <div ref={add.ref} className="relative w-[120px] shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={add.open}
        disabled={full}
        onClick={() => add.setOpen(!add.open)}
        title={full ? `一個專案最多 ${MAX_SCENES} 場` : '加場景：把幾段動畫排成一支片子。可以複製這一場，或開一個新的再選模板、請 Agent 生成'}
        className={`flex size-full flex-col items-center justify-center rounded-xl border border-dashed border-line-2 text-[13px] text-fg hover:bg-raise disabled:opacity-40 ${compact ? 'gap-0' : ''}`}
      >
        <span className="flex items-center gap-1">
          <Plus size={15} /> 加場景
        </span>
        <span className={`num text-[12px] ${over ? 'text-danger' : 'text-fg-3'}`} title={over ? `總長超過 ${MAX_TOTAL_SECONDS} 秒：超過的部分之後不會有配樂` : `全部場景加起來的長度（上限 ${MAX_TOTAL_SECONDS} 秒）`}>
          總長 {total.toFixed(1)}s
        </span>
      </button>
      {add.open && (
        <div role="menu" className="pop-in absolute bottom-[calc(100%+6px)] right-0 z-40 w-[240px] rounded-xl border border-line-2 bg-panel-2 p-1.5 shadow-[var(--shadow)]">
          <button type="button" role="menuitem" className={menuItem} title="複製這一場：內容、風格、對話都一樣，接在後面。要做同一段的不同版本時用" onClick={() => { add.setOpen(false); err(addScene('copy')); }}>
            <Copy size={14} className="text-fg-2" /> 複製這一場
          </button>
          <button
            type="button"
            role="menuitem"
            className={menuItem}
            title="新的一場：先放一個文字標誌模板（沿用目前的風格），之後可以換模板，或在 Agent 面板生成自己的內容"
            onClick={() => {
              add.setOpen(false);
              const e = addScene('blank');
              if (e) err(e);
              else useStore.getState().set({ rightTab: 'agent', panelCollapsed: false });
            }}
          >
            <Plus size={14} className="text-fg-2" /> 新的一場（再選模板或生成）
          </button>
        </div>
      )}
    </div>
  );
}

/** 一個場景顯示的名字：沒改過名（場景 N）就用內容的名字；生成的內容用它自己的主題名 */
export function sceneLabel(sc: Scene, active: boolean, subject = sc.mix.subject): string {
  let contentName = SUBJECTS[subject].name;
  if (subject === 'custom' && !active && sc.theme) contentName = (themeOf(sc.theme)?.name ?? contentName).slice(0, 30);
  return /^場景 \d+$/.test(sc.name) ? contentName : sc.name;
}

/** 場景的縮圖規格：用那一場自己的內容欄位與主題（2.0 β：不再借用目前場景的） */
export function sceneThumb(sc: Scene, active: boolean, live: { v: Scene['mix']['v']; m: Scene['mix']['m']; subject: Scene['mix']['subject']; tune: Scene['mix']['tune'] }) {
  const spec = mixSpec(live.v, live.m, live.subject, live.tune, active ? undefined : themeOf(sc.theme));
  if (active) return spec;
  const theme = live.subject === 'custom' ? themeOf(sc.theme) : undefined;
  return { ...spec, scope: { content: sc.mix.content ?? {}, ...(theme !== undefined ? { theme } : {}) } };
}

function SceneCell({ sc, i, n, secs, active }: { sc: Scene; i: number; n: number; secs: number; active: boolean }) {
  const s = useStore.getState();
  const v = useStore((x) => (active ? x.v : sc.mix.v));
  const m = useStore((x) => (active ? x.m : sc.mix.m));
  const subject = useStore((x) => (active ? x.subject : sc.mix.subject));
  const tune = useStore((x) => (active ? x.tune : sc.mix.tune));
  const content = useStore((x) => (active ? x.content : sc.mix.content));
  const showToast = s.showToast;
  const generated = subject === 'custom';
  const menu = usePopover();
  const label = sceneLabel(sc, active, subject);
  const key = `${sc.id}|${v.map((x) => x.id + x.w).join()}|${m.map((x) => x.id + x.w).join()}|${subject}|${JSON.stringify(tune)}|${JSON.stringify(content ?? {})}|${active ? themes.rev() : (sc.theme?.length ?? 0)}`;
  const w = Math.round(Math.min(320, Math.max(140, secs * 22)));
  return (
    <div ref={menu.ref} className="relative h-full shrink-0" style={{ width: w }}>
      <button
        type="button"
        role="option"
        aria-selected={active}
        onClick={() => {
          const st0 = useStore.getState();
          if (!active && !switchScene(sc.id)) {
            showToast('先處理 Agent 的修改卡（套用或放棄），或放開「看 A」');
            return;
          }
          // 整支片子播放中：跳到這一場的開頭
          if (st0.filmPlay) {
            const sh = filmModel(useStore.getState()).shots.find((x) => x.id === sc.id);
            if (sh) clock.set(sh.start + 0.001);
          }
        }}
        title={`場景 ${i + 1}「${sc.name}」：${generated ? '生成的內容（可以用對話修改）' : '內建模板（換風格、換動效）'}，${secs.toFixed(1)} 秒。${active ? '這是目前的場景' : '點一下切換到這一場'}`}
        className={`flex size-full items-center gap-2.5 overflow-hidden rounded-xl px-2.5 text-left ${active ? 'border-[1.5px] border-mot bg-mot-soft' : 'border border-line-2 bg-panel-2 hover:bg-raise'}`}
      >
        <span className="relative h-10 w-[60px] shrink-0 overflow-hidden rounded-md bg-stage">
          <Thumb spec={() => sceneThumb(sc, active, { v, m, subject, tune })} specKey={key} className="size-full" />
        </span>
        <span className="flex min-w-0 flex-col pr-5 leading-[18px]">
          <span className="flex min-w-0 items-center gap-1.5 text-[13px] text-fg">
            <span className="truncate">
              {i + 1} {label}
            </span>
            <span className={`shrink-0 rounded px-1.5 text-[12px] ${generated ? 'bg-mot font-bold text-on-mot' : 'border border-line-2 text-fg-2'}`}>{generated ? '生成' : '模板'}</span>
          </span>
          <span className="num text-[12px] text-fg-2">{secs.toFixed(1)}s</span>
        </span>
      </button>
      {active && (
        <button
          type="button"
          aria-label="這個場景的選項：改名、複製、移動、長度、刪除"
          title="這個場景的選項：改名、複製、往前／往後移、長度、刪除"
          aria-haspopup="menu"
          aria-expanded={menu.open}
          onClick={() => menu.setOpen(!menu.open)}
          className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-md text-fg-2 hover:bg-raise hover:text-fg"
        >
          <MoreHorizontal size={15} />
        </button>
      )}
      {menu.open && <SceneMenu sc={sc} i={i} n={n} onClose={() => menu.setOpen(false)} />}
    </div>
  );
}

/** 場景選單（浮層，往上開）：改名、複製、移動、長度、刪除 */
export function SceneMenu({ sc, i, n, onClose, align = 'left' }: { sc: Scene; i: number; n: number; onClose: () => void; align?: 'left' | 'right' }) {
  const showToast = useStore((s) => s.showToast);
  const st = useStore();
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(sc.name);
  const loop = loopOf(sc, st);
  const cur = sc.dur ?? loop;
  const step = (k: number) => setSceneDur(sc.id, Math.max(0.5, Math.round((cur + k * loop) / loop) * loop));
  return (
    <div role="menu" className={`pop-in absolute bottom-[calc(100%+6px)] ${align === 'left' ? 'left-0' : 'right-0'} z-40 w-[248px] rounded-xl border border-line-2 bg-panel-2 p-1.5 shadow-[var(--shadow)]`}>
      {renaming ? (
        <div className="flex gap-1.5 p-1">
          <label htmlFor={`scene-name-${sc.id}`} className="sr-only">場景名稱</label>
          <input
            id={`scene-name-${sc.id}`}
            autoFocus
            value={draft}
            maxLength={40}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                renameScene(sc.id, draft);
                onClose();
              }
            }}
            className="h-8 min-w-0 flex-1 rounded-md border border-line-2 bg-panel px-2 text-[13px] outline-none focus:border-mot"
          />
          <button type="button" className="h-8 rounded-md bg-raise px-2 text-[13px]" onClick={() => { renameScene(sc.id, draft); onClose(); }}>確定</button>
        </div>
      ) : (
        <button type="button" role="menuitem" className={menuItem} onClick={() => setRenaming(true)} title="改名：場景名稱會出現在場景帶、時間軸、全螢幕展示與風格包裡">改名</button>
      )}
      <div className="flex h-9 items-center gap-1 px-2.5 text-[13px]" title="長度：這一場在片子裡放多久。以一個動畫循環為單位加減；在時間軸上也可以直接拖場景的右邊緣">
        <span className="flex-1">長度</span>
        <button type="button" className="flex size-7 items-center justify-center rounded-md border border-line-2 hover:bg-raise disabled:opacity-40" disabled={cur <= loop + 0.01} onClick={() => step(-1)} aria-label="少一個循環">−</button>
        <span className="num w-[52px] text-center">{cur.toFixed(1)}s</span>
        <button type="button" className="flex size-7 items-center justify-center rounded-md border border-line-2 hover:bg-raise" onClick={() => step(1)} aria-label="多一個循環">＋</button>
      </div>
      <button type="button" role="menuitem" className={menuItem} disabled={!sc.dur} onClick={() => { setSceneDur(sc.id, null); onClose(); }} title="長度回到一個動畫循環">長度回到一個循環（{loop.toFixed(1)}s）</button>
      <button type="button" role="menuitem" className={menuItem} onClick={() => { onClose(); const e = addScene('copy'); if (e) showToast(e); }} title="複製這一場：接在後面">複製這一場</button>
      <button type="button" role="menuitem" className={menuItem} disabled={i === 0} onClick={() => { onClose(); moveScene(sc.id, -1); }} title="往前移一格">往前移</button>
      <button type="button" role="menuitem" className={menuItem} disabled={i === n - 1} onClick={() => { onClose(); moveScene(sc.id, 1); }} title="往後移一格">往後移</button>
      <button
        type="button"
        role="menuitem"
        className={`${menuItem} text-danger`}
        disabled={n <= 1}
        onClick={() => {
          onClose();
          const e = deleteScene(sc.id);
          showToast(e ?? `已刪除「${sc.name}」；按 Ctrl+Z 可以救回來`);
        }}
        title={n <= 1 ? '至少要留一個場景' : '刪除這一場（可以 Ctrl+Z 復原）'}
      >
        刪除這一場
      </button>
    </div>
  );
}
