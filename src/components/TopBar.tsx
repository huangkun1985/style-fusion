import { BookmarkPlus, Download, Info, Monitor, Moon, Share2, Sun } from 'lucide-react';
import { useState } from 'react';
import { mixTitle } from '../lib/brief';
import { useStore, type View } from '../store/store';
import { APP_VERSION, AboutModal } from './About';
import { Button, IconBtn, Modal } from './ui';

const NAV: { id: View; label: string }[] = [
  { id: 'mixer', label: '混合器' },
  { id: 'library', label: '風格圖鑑' },
  { id: 'recipes', label: '案例配方' },
  { id: 'saved', label: '我的收藏' },
];

export function Logo() {
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden>
      <rect x="4" y="9" width="12" height="12" rx="2.5" transform="rotate(45 10 15)" fill="var(--vis)" opacity="0.9" />
      <rect x="14" y="9" width="12" height="12" rx="2.5" transform="rotate(45 20 15)" fill="var(--mot)" style={{ mixBlendMode: 'screen' }} opacity="0.92" />
    </svg>
  );
}

export function TopBar() {
  const view = useStore((s) => s.view);
  const set = useStore((s) => s.set);
  const saved = useStore((s) => s.saved.length);
  const theme = useStore((s) => s.theme);
  const v = useStore((s) => s.v);
  const m = useStore((s) => s.m);
  const saveCurrent = useStore((s) => s.saveCurrent);
  const [saveOpen, setSaveOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [name, setName] = useState('');
  const nextTheme = theme === 'system' ? 'dark' : theme === 'dark' ? 'light' : 'system';
  const ThemeIcon = theme === 'system' ? Monitor : theme === 'dark' ? Moon : Sun;
  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-panel px-4 py-2">
      <div className="flex items-center gap-2.5">
        <Logo />
        <div className="leading-none">
          <h1 className="font-display text-[17px] font-extrabold tracking-tight">Style Fusion</h1>
          <div className="mt-0.5 text-[11px] text-fg-3">動效設計風格混合器</div>
        </div>
      </div>
      <nav className="order-3 flex w-full gap-1 overflow-x-auto sm:order-none sm:w-auto" aria-label="主要">
        {NAV.map((n) => (
          <button
            key={n.id}
            type="button"
            aria-current={view === n.id ? 'page' : undefined}
            onClick={() => set({ view: n.id })}
            className={`relative shrink-0 rounded-md px-3 py-1.5 text-sm transition-colors ${view === n.id ? 'bg-raise text-fg' : 'text-fg-2 hover:text-fg'}`}
          >
            {n.label}
            {n.id === 'saved' && saved > 0 && <span className="num ml-1 text-[11px] text-fg-3">{saved}</span>}
          </button>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-1">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setName(mixTitle(v, m).slice(0, 40));
            setSaveOpen(true);
          }}
          title="收藏目前的混合"
        >
          <BookmarkPlus size={15} />
          <span className="hidden md:inline">收藏</span>
        </Button>
        <Button size="sm" variant="ghost" onClick={() => set({ shareOpen: true })} title="配方碼與分享">
          <Share2 size={15} />
          <span className="hidden md:inline">分享</span>
        </Button>
        <Button size="sm" variant="primary" onClick={() => set({ exportOpen: true })}>
          <Download size={15} />
          導出
        </Button>
        <IconBtn label={`關於與版本（v${APP_VERSION}）`} onClick={() => setAboutOpen(true)}>
          <Info size={16} />
        </IconBtn>
        <IconBtn label={`主題：${theme === 'system' ? '跟隨系統' : theme === 'dark' ? '深色' : '淺色'}`} onClick={() => set({ theme: nextTheme })}>
          <ThemeIcon size={16} />
        </IconBtn>
      </div>
      <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />
      <Modal
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        title="收藏目前的混合"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setSaveOpen(false)}>
              取消
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                saveCurrent(name.trim());
                setSaveOpen(false);
              }}
            >
              收藏
            </Button>
          </div>
        }
      >
        <label htmlFor="save-name" className="mb-1.5 block text-xs text-fg-2">
          名稱
        </label>
        <input
          id="save-name"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              saveCurrent(name.trim());
              setSaveOpen(false);
            }
          }}
          className="h-10 w-full rounded-lg border border-line-2 bg-panel-2 px-3 text-sm outline-none focus:border-mot"
        />
        <p className="mt-2 text-xs text-fg-3">收藏存在這個瀏覽器裡；要帶到別台電腦，請用「分享」裡的配方碼。</p>
      </Modal>
    </header>
  );
}
