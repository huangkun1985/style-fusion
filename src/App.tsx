import { useEffect } from 'react';
import { InfoPanel } from './components/InfoPanel';
import { MixTray } from './components/MixTray';
import { ExportModal, ShareModal, StyleDetailModal } from './components/Modals';
import { Stage } from './components/Stage';
import { StyleBrowser } from './components/StyleBrowser';
import { TopBar } from './components/TopBar';
import { AudioBridge } from './components/AudioBridge';
import { StarterModal } from './components/Starter';
import { Toast, Segmented } from './components/ui';
import { LibraryView, RecipesView, SavedView } from './components/Views';
import { clock } from './engine/clock';
import { preloadFonts } from './engine/fonts';
import { thumbs } from './engine/thumbs';
import { mixSpec } from './store/hooks';
import { toggleSound } from './lib/sound';
import { useMedia } from './lib/useMedia';
import { useStore } from './store/store';

function MixerView() {
  const xl = useMedia('(min-width: 1280px)');
  const lg = useMedia('(min-width: 1024px)');
  const mobileTab = useStore((s) => s.mobileTab);
  const set = useStore((s) => s.set);
  if (xl) {
    return (
      <div className="grid h-full min-h-0 grid-cols-[288px_minmax(0,1fr)_340px] gap-3 px-4 py-3 2xl:grid-cols-[320px_minmax(0,1fr)_380px]">
        <aside className="flex min-h-0 flex-col rounded-xl border border-line bg-panel p-3" aria-label="風格庫">
          <StyleBrowser />
        </aside>
        <section className="flex min-h-0 flex-col gap-3" aria-label="舞台">
          <Stage fill />
          <MixTray />
        </section>
        <aside className="flex min-h-0 flex-col rounded-xl border border-line bg-panel p-3" aria-label="風格處方">
          <InfoPanel />
        </aside>
      </div>
    );
  }
  if (lg) {
    return (
      <div className="grid h-full min-h-0 grid-cols-[288px_minmax(0,1fr)] gap-3 px-4 py-3">
        <aside className="flex min-h-0 flex-col rounded-xl border border-line bg-panel p-3" aria-label="風格庫">
          <StyleBrowser />
        </aside>
        <section className="scroll-y flex min-h-0 flex-col gap-3 pr-1" aria-label="舞台">
          <Stage />
          <MixTray />
          <div className="flex h-[760px] shrink-0 flex-col rounded-xl border border-line bg-panel p-3">
            <InfoPanel />
          </div>
        </section>
      </div>
    );
  }
  return (
    <div className="scroll-y h-full">
      <div className="flex flex-col gap-3 px-4 py-3">
        <Stage />
        <MixTray />
        <Segmented
          id="mobile-tab"
          value={mobileTab}
          onChange={(t) => set({ mobileTab: t })}
          className="scroll-x w-full [&>button]:flex-1"
          options={[
            { value: 'styles', label: '風格庫' },
            { value: 'brief', label: '處方' },
            { value: 'sound', label: '聲音' },
            { value: 'tune', label: '微調' },
            { value: 'code', label: '代碼' },
            { value: 'prompt', label: '提示詞' },
          ]}
        />
        <div className="flex h-[72vh] flex-col rounded-xl border border-line bg-panel p-3">
          {mobileTab === 'styles' || mobileTab === 'mix' ? <StyleBrowser cols={2} /> : <InfoPanel tab={mobileTab} />}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const view = useStore((s) => s.view);
  const theme = useStore((s) => s.theme);
  const thumbsAnimate = useStore((s) => s.thumbsAnimate);
  const motionOverride = useStore((s) => s.motionOverride);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    thumbs.animate = thumbsAnimate && (!reduce || motionOverride);
    thumbs.invalidate();
  }, [thumbsAnimate, motionOverride]);

  useEffect(() => {
    preloadFonts(() => thumbs.invalidate());
    // 網址帶 #mix=配方碼 時自動載入
    const m = location.hash.match(/mix=([\w.\-]+)/);
    if (m) {
      const ok = useStore.getState().importCode(m[1]);
      if (ok) useStore.getState().showToast('已從連結載入配方');
      history.replaceState(null, '', location.pathname + location.search);
    } else if (!useStore.getState().welcomed) {
      useStore.getState().set({ starterOpen: true });
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches && !useStore.getState().motionOverride) clock.play(false);
  }, []);

  // 閒置時預熱 3D（載入 Three.js、編譯常用材質），第一次點到 3D 風格才不會頓一下
  useEffect(() => {
    const id = window.setTimeout(() => {
      const subs = ['char3d', 'shapes3d', 'text3d', 'terrain3d'] as const;
      const ids = ['clay3d', 'toon3d', 'glass3d', 'chrome', 'gold3d', 'neon3d', 'holo3d', 'wire3d', 'pearl3d', 'plastic3d'];
      thumbs.prewarm(ids.map((v, i) => mixSpec([{ id: v, w: 1 }], [], subs[i % subs.length])));
    }, 2500);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target instanceof Element ? e.target : null;
      if (t?.closest('input, textarea, select, [contenteditable]') || e.metaKey || e.ctrlKey || e.altKey) return;
      // 焦點在按鈕或連結上時，空白鍵留給它原本的「點擊」行為
      if (e.code === 'Space' && t?.closest('button, a, [role="radio"]')) return;
      const s = useStore.getState();
      if (s.view !== 'mixer' || s.detail || s.exportOpen || s.shareOpen) return;
      if (e.code === 'Space') {
        e.preventDefault();
        clock.play();
      } else if (e.key === 'ArrowLeft') clock.step(-1 / 24);
      else if (e.key === 'ArrowRight') clock.step(1 / 24);
      else if (e.key === 'o' || e.key === 'O') s.set({ onion: !s.onion });
      else if (e.key === 'p' || e.key === 'P') s.set({ path: !s.path });
      else if (e.key === 'g' || e.key === 'G') s.set({ grid4: !s.grid4 });
      else if (e.key === 'm' || e.key === 'M') void toggleSound();
      else if (e.key === 'r' || e.key === 'R') s.randomize();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <main className="min-h-0 flex-1">
        {view === 'mixer' && <MixerView />}
        {view === 'library' && <LibraryView />}
        {view === 'recipes' && <RecipesView />}
        {view === 'saved' && <SavedView />}
      </main>
      <StyleDetailModal />
      <ExportModal />
      <ShareModal />
      <StarterModal />
      <AudioBridge />
      <Toast />
    </div>
  );
}
