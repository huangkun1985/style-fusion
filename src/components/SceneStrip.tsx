// 場景帶（2.0 α3，F8）：高 64。每一格是一個場景（寬度跟著長度），點一下切換；目前那一格右上有「⋯」（改名、複製、移動、刪除）。
// 最右邊固定一格「＋ 加場景」（不在捲動區裡，位置不會因為場景變多而跑掉），下面一行是總長。
// 選單都是浮層（往上開），不推動版面。最多 12 場、總長 180 秒（超過時總長變紅並提示）。
import { Copy, MoreHorizontal, Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { SUBJECTS } from '../engine/subjects';
import { themes } from '../engine/themes';
import { mixSpec } from '../store/hooks';
import { MAX_SCENES, type Scene } from '../store/project';
import { addScene, deleteScene, MAX_TOTAL_SECONDS, moveScene, renameScene, sceneSeconds, switchScene } from '../store/scenes';
import { useStore } from '../store/store';
import { Thumb } from './Thumb';

function usePopover() {
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

const item = 'flex h-9 w-full items-center gap-2 rounded-md px-2.5 text-left text-[13px] text-fg hover:bg-raise disabled:opacity-40';

export function SceneStrip() {
  const s = useStore();
  const scenes = s.scenes;
  const active = s.activeScene;
  const showToast = s.showToast;
  useStore((x) => x.themeRev);
  const secs = scenes.map((sc) => sceneSeconds(sc, s));
  const total = secs.reduce((a, b) => a + b, 0);
  const over = total > MAX_TOTAL_SECONDS;
  const full = scenes.length >= MAX_SCENES;
  const add = usePopover();
  const err = (msg: string | null) => msg && showToast(msg);
  return (
    <div className="relative flex h-16 shrink-0 gap-1" aria-label="場景帶">
      <div className="scroll-x hide-scrollbar flex min-w-0 flex-1 gap-1" role="listbox" aria-label="場景">
        {scenes.map((sc, i) => (
          <SceneCell key={sc.id} sc={sc} i={i} n={scenes.length} secs={secs[i]} active={sc.id === active} />
        ))}
      </div>
      <div ref={add.ref} className="relative w-[120px] shrink-0">
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={add.open}
          disabled={full}
          onClick={() => add.setOpen(!add.open)}
          title={full ? `一個專案最多 ${MAX_SCENES} 場` : '加場景：把幾段動畫排成一支片子。可以複製這一場，或開一個新的再選模板、請 Agent 生成'}
          className="flex size-full flex-col items-center justify-center rounded-xl border border-dashed border-line-2 text-[13px] text-fg hover:bg-raise disabled:opacity-40"
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
            <button type="button" role="menuitem" className={item} title="複製這一場：內容、風格、對話都一樣，接在後面。要做同一段的不同版本時用" onClick={() => { add.setOpen(false); err(addScene('copy')); }}>
              <Copy size={14} className="text-fg-2" /> 複製這一場
            </button>
            <button
              type="button"
              role="menuitem"
              className={item}
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
    </div>
  );
}

function SceneCell({ sc, i, n, secs, active }: { sc: Scene; i: number; n: number; secs: number; active: boolean }) {
  const s = useStore.getState();
  const v = useStore((x) => (active ? x.v : sc.mix.v));
  const m = useStore((x) => (active ? x.m : sc.mix.m));
  const subject = useStore((x) => (active ? x.subject : sc.mix.subject));
  const tune = useStore((x) => (active ? x.tune : sc.mix.tune));
  const showToast = s.showToast;
  const generated = subject === 'custom';
  const menu = usePopover();
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(sc.name);
  // 沒改過名字的場景顯示內容的名字；生成的內容用它自己的主題名（不是目前播放中的那個）
  let contentName = SUBJECTS[subject].name;
  if (generated && !active && sc.theme) {
    try {
      contentName = String(JSON.parse(sc.theme).name ?? contentName).slice(0, 30);
    } catch {
      /* 用預設 */
    }
  }
  const label = /^場景 \d+$/.test(sc.name) ? contentName : sc.name;
  // 縮圖：模板＝實際畫面；生成的內容只有目前那一場的主題在播放，其他場顯示名稱卡（避免畫成別場的內容）
  const live = !generated || active;
  const key = `${sc.id}|${v.map((x) => x.id + x.w).join()}|${m.map((x) => x.id + x.w).join()}|${subject}|${JSON.stringify(tune)}|${active ? themes.rev() : ''}`;
  const w = Math.round(Math.min(320, Math.max(140, secs * 22)));
  return (
    <div ref={menu.ref} className="relative h-full shrink-0" style={{ width: w }}>
      <button
        type="button"
        role="option"
        aria-selected={active}
        onClick={() => {
          if (active) return;
          if (!switchScene(sc.id)) showToast('先處理 Agent 的修改卡（套用或放棄），或放開「看 A」');
        }}
        title={`場景 ${i + 1}「${sc.name}」：${generated ? '生成的內容（可以用對話修改）' : '內建模板（換風格、換動效）'}，${secs.toFixed(1)} 秒。${active ? '這是目前的場景' : '點一下切換到這一場'}`}
        className={`flex size-full items-center gap-2.5 overflow-hidden rounded-xl px-2.5 text-left ${active ? 'border-[1.5px] border-mot bg-mot-soft' : 'border border-line-2 bg-panel-2 hover:bg-raise'}`}
      >
        <span className="relative h-10 w-[60px] shrink-0 overflow-hidden rounded-md bg-stage">
          {live ? (
            <Thumb spec={() => mixSpec(v, m, subject, tune)} specKey={key} className="size-full" />
          ) : (
            <span className="flex size-full items-center justify-center bg-raise text-[12px] text-fg-2">生成</span>
          )}
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
          aria-label="這個場景的選項：改名、複製、移動、刪除"
          title="這個場景的選項：改名、複製、往前／往後移、刪除"
          aria-haspopup="menu"
          aria-expanded={menu.open}
          onClick={() => {
            setDraft(sc.name);
            setRenaming(false);
            menu.setOpen(!menu.open);
          }}
          className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-md text-fg-2 hover:bg-raise hover:text-fg"
        >
          <MoreHorizontal size={15} />
        </button>
      )}
      {menu.open && (
        <div role="menu" className="pop-in absolute bottom-[calc(100%+6px)] left-0 z-40 w-[240px] rounded-xl border border-line-2 bg-panel-2 p-1.5 shadow-[var(--shadow)]">
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
                    menu.setOpen(false);
                  }
                }}
                className="h-8 min-w-0 flex-1 rounded-md border border-line-2 bg-panel px-2 text-[13px] outline-none focus:border-mot"
              />
              <button type="button" className="h-8 rounded-md bg-raise px-2 text-[13px]" onClick={() => { renameScene(sc.id, draft); menu.setOpen(false); }}>確定</button>
            </div>
          ) : (
            <button type="button" role="menuitem" className={item} onClick={() => setRenaming(true)} title="改名：場景名稱會出現在場景帶與之後的片子裡">改名</button>
          )}
          <button type="button" role="menuitem" className={item} onClick={() => { menu.setOpen(false); const e = addScene('copy'); if (e) showToast(e); }} title="複製這一場：接在後面">複製這一場</button>
          <button type="button" role="menuitem" className={item} disabled={i === 0} onClick={() => { menu.setOpen(false); moveScene(sc.id, -1); }} title="往前移一格">往前移</button>
          <button type="button" role="menuitem" className={item} disabled={i === n - 1} onClick={() => { menu.setOpen(false); moveScene(sc.id, 1); }} title="往後移一格">往後移</button>
          <button
            type="button"
            role="menuitem"
            className={`${item} text-danger`}
            disabled={n <= 1}
            onClick={() => {
              menu.setOpen(false);
              const e = deleteScene(sc.id);
              showToast(e ?? `已刪除「${sc.name}」；按 Ctrl+Z 可以救回來`);
            }}
            title={n <= 1 ? '至少要留一個場景' : '刪除這一場（可以 Ctrl+Z 復原）'}
          >
            刪除這一場
          </button>
        </div>
      )}
    </div>
  );
}
