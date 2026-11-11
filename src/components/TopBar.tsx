// 頂列（2.0）：專案名稱與選單、儲存狀態、復原／重做、A／B 比較、簡潔／進階開關、分享、導出。
// 每顆按鈕都有固定的格子：會變的字（儲存狀態）有固定寬度，開關只換外觀不換寬，點了版面不會跳。
import { ArrowLeft, BookmarkPlus, BookOpen, Check, ChevronDown, Download, FilePlus2, FolderOpen, Info, Library, Monitor, Moon, Pencil, Redo2, Save, Share2, Sun, Undo2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { mixTitle } from '../lib/brief';
import { useMedia } from '../lib/useMedia';
import { clearA, markA, redo, showA, undo } from '../store/history';
import { listProjects, newProject, openProjectFile, saveProjectFile, switchProject } from '../store/persist';
import { useStore } from '../store/store';
import { APP_VERSION, AboutModal } from './About';
import { Button, IconBtn, Modal } from './ui';

export function Logo() {
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden>
      <rect x="4" y="9" width="12" height="12" rx="2.5" transform="rotate(45 10 15)" fill="var(--fg)" opacity="0.9" />
      <rect x="14" y="9" width="12" height="12" rx="2.5" transform="rotate(45 20 15)" fill="var(--mot)" style={{ mixBlendMode: 'screen' }} opacity="0.92" />
    </svg>
  );
}

const VIEW_NAME = { library: '風格圖鑑', recipes: '案例配方', saved: '我的配方' } as const;

export function TopBar() {
  const view = useStore((s) => s.view);
  const set = useStore((s) => s.set);
  const uiMode = useStore((s) => s.uiMode);
  const hist = useStore((s) => s.hist);
  const md = useMedia('(min-width: 768px)');
  const sm = useMedia('(min-width: 640px)');
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-panel px-3 sm:gap-3 sm:px-4">
      <div className="flex shrink-0 items-center gap-2">
        <Logo />
        <span className="hidden font-display text-[15px] font-extrabold tracking-tight lg:inline">Style Fusion</span>
      </div>
      <span className="hidden h-5 w-px shrink-0 bg-line lg:block" aria-hidden />
      <ProjectMenu />
      <SaveStatus compact={!sm} />
      <div className="flex shrink-0 items-center">
        <IconBtn label={`復原（Ctrl+Z）：回到上一步。改錯了、套錯配方、骰到不喜歡的都可以退回${hist.undo ? `；還可以退 ${hist.undo} 步` : '；目前沒有可以復原的'}`} disabled={!hist.undo} onClick={() => undo()} className="size-11 sm:size-8">
          <Undo2 size={16} />
        </IconBtn>
        <IconBtn label={`重做（Ctrl+Shift+Z）：把剛剛復原的再做一次${hist.redo ? '' : '；目前沒有可以重做的'}`} disabled={!hist.redo} onClick={() => redo()} className="size-11 sm:size-8">
          <Redo2 size={16} />
        </IconBtn>
      </div>
      {sm && <AbButton />}
      {view !== 'mixer' && (
        <Button size="sm" variant="soft" onClick={() => set({ view: 'mixer' })} title="回到舞台。看完圖鑑或配方，回到正在做的動畫">
          <ArrowLeft size={15} />
          <span className="hidden md:inline">回到舞台</span>
          <span className="hidden text-fg-3 xl:inline">（{VIEW_NAME[view]}）</span>
        </Button>
      )}
      <span className="min-w-0 flex-1" />
      {md && (
        <div role="radiogroup" aria-label="版式" className="flex shrink-0 rounded-lg border border-line bg-panel-2 p-0.5">
          {(['simple', 'advanced'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={uiMode === m}
              title={m === 'simple' ? '簡潔模式：只留舞台、播放列、場景帶和 Agent。找靈感、快速出一段、給客戶看的時候用' : '進階模式：再展開素材庫、混合配方、調整／聲音／規格頁籤。要細調風格比重、聲音與交付規格的時候用'}
              onClick={() => set({ uiMode: m })}
              className={`h-7 w-14 rounded-md text-[13px] transition-colors ${uiMode === m ? 'bg-raise font-medium text-fg' : 'text-fg-2 hover:text-fg'}`}
            >
              {m === 'simple' ? '簡潔' : '進階'}
            </button>
          ))}
        </div>
      )}
      {sm && (
        <Button size="sm" variant="outline" onClick={() => set({ shareOpen: true })} title="分享：配方碼與連結。要把這組風格給同事或客戶看的時候用">
          <Share2 size={15} />
          <span className="hidden md:inline">分享</span>
        </Button>
      )}
      {sm && (
        <Button size="sm" variant="primary" onClick={() => set({ exportOpen: true })} title="導出：影片（MP4／WebM）、GIF、PNG 序列、音樂。要交付或放進剪輯軟體的時候用">
          <Download size={15} />
          導出
        </Button>
      )}
    </header>
  );
}

/** 儲存狀態：固定寬度，三種字輪替都不會推動旁邊的按鈕 */
function SaveStatus({ compact }: { compact: boolean }) {
  const st = useStore((s) => s.saveState);
  const storage = useStore((s) => s.storage);
  const where = storage === 'idb' ? '這個瀏覽器（IndexedDB）' : storage === 'local' ? '這個瀏覽器（localStorage，空間較小）' : '記憶體（瀏覽器不讓網頁存資料，關掉就不見了；請用「存成檔案」）';
  const bad = st === 'error' || storage === 'memory';
  const label = bad ? '沒存到' : st === 'saving' ? '儲存中' : '已儲存';
  const tip = `${bad ? '這次沒有存下來' : st === 'saving' ? '正在自動儲存' : '所有改動都已自動儲存'}：存在${where}。要帶到別台電腦，用專案選單的「存成檔案」。`;
  return (
    <span className={`flex shrink-0 items-center gap-1.5 text-[12px] ${bad ? 'text-danger' : 'text-fg-2'} ${compact ? 'w-4' : 'w-[64px]'}`} title={tip} role="status" aria-label={tip}>
      <span className={`size-2 shrink-0 rounded-full ${bad ? 'bg-danger' : st === 'saving' ? 'bg-mot' : 'bg-ok'}`} aria-hidden />
      {!compact && label}
    </span>
  );
}

/** A／B 比較：先「記下 A」，之後按住「看 A」就暫時換成 A，放開回到現在的。固定寬度。 */
function AbButton() {
  const hist = useStore((s) => s.hist);
  useEffect(() => {
    if (!hist.showingA) return;
    const up = () => showA(false);
    window.addEventListener('pointerup', up);
    window.addEventListener('blur', up);
    return () => {
      window.removeEventListener('pointerup', up);
      window.removeEventListener('blur', up);
    };
  }, [hist.showingA]);
  if (!hist.a) {
    return (
      <Button size="sm" variant="ghost" className="w-[104px]" onClick={() => markA()} title="記下 A：把現在的樣子存成 A，之後繼續改，就能按住「看 A」對照改之前和改之後。比較兩個版本時用">
        記下 A
      </Button>
    );
  }
  return (
    <div className="flex w-[104px] shrink-0 items-center">
      <button
        type="button"
        title="按住看 A：按住時舞台換成記下的 A，放開回到現在的（B）。決定要不要保留這次修改時用（鍵盤：按住 Enter）"
        onPointerDown={(e) => {
          e.preventDefault();
          showA(true);
        }}
        onKeyDown={(e) => e.key === 'Enter' && !e.repeat && showA(true)}
        onKeyUp={(e) => e.key === 'Enter' && showA(false)}
        className={`h-8 flex-1 select-none rounded-l-md border text-[13px] transition-colors ${hist.showingA ? 'border-mot bg-mot-soft text-fg' : 'border-line-2 text-fg hover:bg-raise'}`}
      >
        {hist.showingA ? '正在看 A' : '按住看 A'}
      </button>
      <button type="button" aria-label="清掉 A" title="清掉 A：不再比較。要重新記一個 A 時先清掉" onClick={() => clearA()} className="flex h-8 w-7 items-center justify-center rounded-r-md border border-l-0 border-line-2 text-fg-2 hover:bg-raise hover:text-fg">
        <X size={13} />
      </button>
    </div>
  );
}

function ProjectMenu() {
  const name = useStore((s) => s.projectName);
  const projectId = useStore((s) => s.projectId);
  const set = useStore((s) => s.set);
  const showToast = useStore((s) => s.showToast);
  const theme = useStore((s) => s.theme);
  const v = useStore((s) => s.v);
  const m = useStore((s) => s.m);
  const saveCurrent = useStore((s) => s.saveCurrent);
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(name);
  const [recent, setRecent] = useState<{ id: string; name: string; updated: number }[]>([]);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [recipeOpen, setRecipeOpen] = useState(false);
  const [recipeName, setRecipeName] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    void listProjects().then(setRecent);
    const close = (e: PointerEvent) => !boxRef.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);
  const nextTheme = theme === 'system' ? 'dark' : theme === 'dark' ? 'light' : 'system';
  const ThemeIcon = theme === 'system' ? Monitor : theme === 'dark' ? Moon : Sun;
  const item = 'flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-[13px] text-fg hover:bg-raise';
  const commitName = () => {
    const n = draft.trim().slice(0, 60);
    if (n) set({ projectName: n });
    setRenaming(false);
  };
  return (
    <div ref={boxRef} className="relative min-w-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        title="專案：改名、新專案、開啟、存成檔案、我的配方。同時有幾個案子、或要把專案帶到別台電腦時用"
        className="flex h-8 max-w-[220px] items-center gap-1.5 rounded-lg px-2 text-[16px] font-bold text-fg hover:bg-raise"
      >
        <span className="truncate">{name}</span>
        <ChevronDown size={14} className="shrink-0 text-fg-2" />
      </button>
      {open && (
        <div role="menu" className="pop-in absolute left-0 top-10 z-50 w-[288px] rounded-xl border border-line-2 bg-panel-2 p-1.5 shadow-[var(--shadow)]">
          {renaming ? (
            <div className="flex items-center gap-1.5 p-1">
              <label htmlFor="proj-name" className="sr-only">專案名稱</label>
              <input id="proj-name" autoFocus value={draft} maxLength={60} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && commitName()} className="h-8 min-w-0 flex-1 rounded-md border border-line-2 bg-panel px-2 text-[13px] outline-none focus:border-mot" />
              <IconBtn label="確定改名" onClick={commitName}><Check size={15} /></IconBtn>
            </div>
          ) : (
            <button type="button" role="menuitem" className={item} onClick={() => { setDraft(name); setRenaming(true); }} title="改名：專案名稱會出現在頂列與存成的檔名">
              <Pencil size={15} className="text-fg-2" /> 改名
            </button>
          )}
          <button type="button" role="menuitem" className={item} title="新專案：開一個新的案子，用現在的風格當起點；目前的專案會留著，可以從下面的清單切回來" onClick={async () => { setOpen(false); await newProject('未命名專案'); showToast('已開新專案；原本的專案在專案選單的「最近的專案」'); }}>
            <FilePlus2 size={15} className="text-fg-2" /> 新專案
          </button>
          <button type="button" role="menuitem" className={item} title="開啟檔案：打開別台電腦存的 .sfproj 專案檔；會開成一個新的專案，不會蓋掉目前的" onClick={() => fileRef.current?.click()}>
            <FolderOpen size={15} className="text-fg-2" /> 開啟檔案…
          </button>
          <button type="button" role="menuitem" className={item} title="存成檔案：把整個專案（場景、我的配方）存成 .sfproj，帶到別台電腦或備份時用。匯入的動畫主題與 MIDI 還沒有包進檔案" onClick={() => { setOpen(false); showToast(saveProjectFile() ? '已存成 .sfproj 檔' : '這個瀏覽器不讓網頁下載檔案'); }}>
            <Save size={15} className="text-fg-2" /> 存成檔案
          </button>
          <div className="my-1 h-px bg-line" />
          <button type="button" role="menuitem" className={item} title="存成我的配方：把現在的風格組合存起來，之後在「我的配方」一鍵套回來" onClick={() => { setOpen(false); setRecipeName(mixTitle(v, m).slice(0, 40)); setRecipeOpen(true); }}>
            <BookmarkPlus size={15} className="text-fg-2" /> 存成我的配方
          </button>
          <button type="button" role="menuitem" className={item} title="我的配方：這個專案存下的風格組合" onClick={() => { setOpen(false); set({ view: 'saved' }); }}>
            <BookOpen size={15} className="text-fg-2" /> 我的配方
          </button>
          <button type="button" role="menuitem" className={item} title="案例配方與風格圖鑑：看全部 56 個案例與 136＋68 種風格的說明" onClick={() => { setOpen(false); set({ view: 'recipes' }); }}>
            <Library size={15} className="text-fg-2" /> 案例配方與風格圖鑑
          </button>
          {recent.filter((r) => r.id !== projectId).length > 0 && (
            <>
              <div className="my-1 h-px bg-line" />
              <div className="px-2.5 pb-1 pt-1.5 text-[12px] text-fg-3">最近的專案</div>
              <div className="scroll-y max-h-[180px]">
                {recent.filter((r) => r.id !== projectId).slice(0, 12).map((r) => (
                  <button key={r.id} type="button" role="menuitem" className={item} title="切換到這個專案；目前的會先存好" onClick={async () => { setOpen(false); showToast((await switchProject(r.id)) ? `已切換到「${r.name}」` : '這個專案打不開（資料可能壞了）'); }}>
                    <span className="min-w-0 flex-1 truncate">{r.name}</span>
                    <span className="num shrink-0 text-[12px] text-fg-3">{new Date(r.updated).toLocaleDateString()}</span>
                  </button>
                ))}
              </div>
            </>
          )}
          <div className="my-1 h-px bg-line" />
          <div className="flex gap-1">
            <button type="button" className={`${item} flex-1`} title="介面主題：跟隨系統、深色、淺色輪流切換" onClick={() => set({ theme: nextTheme })}>
              <ThemeIcon size={15} className="text-fg-2" /> {theme === 'system' ? '跟隨系統' : theme === 'dark' ? '深色' : '淺色'}
            </button>
            <button type="button" className={`${item} flex-1`} title="關於、版本與快捷鍵" onClick={() => { setOpen(false); setAboutOpen(true); }}>
              <Info size={15} className="text-fg-2" /> 關於 <span className="num text-[12px] text-fg-3">v{APP_VERSION}</span>
            </button>
          </div>
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept=".sfproj,application/json"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          setOpen(false);
          const err = await openProjectFile(f);
          showToast(err ?? `已開啟「${useStore.getState().projectName}」；原本的專案留在「最近的專案」`);
        }}
      />
      <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />
      <Modal
        open={recipeOpen}
        onClose={() => setRecipeOpen(false)}
        title="存成我的配方"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setRecipeOpen(false)}>取消</Button>
            <Button variant="primary" onClick={() => { saveCurrent(recipeName.trim()); setRecipeOpen(false); }}>存下</Button>
          </div>
        }
      >
        <label htmlFor="save-name" className="mb-1.5 block text-xs text-fg-2">名稱</label>
        <input id="save-name" autoFocus value={recipeName} onChange={(e) => setRecipeName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { saveCurrent(recipeName.trim()); setRecipeOpen(false); } }} className="h-10 w-full rounded-lg border border-line-2 bg-panel-2 px-3 text-sm outline-none focus:border-mot" />
        <p className="mt-2 text-xs text-fg-3">我的配方跟著專案存；存成檔案時會一起帶走。</p>
      </Modal>
    </div>
  );
}
