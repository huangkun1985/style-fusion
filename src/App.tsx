import { useEffect } from 'react';
import { InfoPanel } from './components/InfoPanel';
import { MixTray } from './components/MixTray';
import { ExportModal, ShareModal, StyleDetailModal } from './components/Modals';
import { Stage, toggleStageFullscreen } from './components/Stage';
import { StyleBrowser } from './components/StyleBrowser';
import { TopBar } from './components/TopBar';
import { AudioBridge } from './components/AudioBridge';
import { StarterModal } from './components/Starter';
import { ThemeModal } from './components/ThemeModal';
import { Toast, Segmented } from './components/ui';
import { MobileBar, RightPanel, SceneStrip } from './components/Workspace';
import { Timeline } from './components/Timeline';
import { redo, undo } from './store/history';
import { LibraryView, RecipesView, SavedView } from './components/Views';
import { clock } from './engine/clock';
import { preloadFonts } from './engine/fonts';
import { thumbs } from './engine/thumbs';
import { mixSpec } from './store/hooks';
import { onStorageFail } from './lib/platform';
import { toggleSound } from './lib/sound';
import { useMedia } from './lib/useMedia';
import { useStore } from './store/store';

function MixerView() {
  const xl = useMedia('(min-width: 1280px)');
  const lg = useMedia('(min-width: 1024px)');
  const md = useMedia('(min-width: 768px)');
  const mode = useStore((s) => s.uiMode);
  const collapsed = useStore((s) => s.panelCollapsed);
  const mobileTab = useStore((s) => s.mobileTab);
  const set = useStore((s) => s.set);
  // 手機（< 768）只有簡潔模式
  const advanced = mode === 'advanced' && md;
  const right = collapsed ? '48px' : '360px';
  if (lg && !advanced) {
    // 簡潔模式：舞台＋播放列＋場景帶 ｜ Agent
    return (
      <div className="grid h-full min-h-0 grid-rows-[minmax(0,1fr)] gap-3 px-4 pb-4 pt-3" style={{ gridTemplateColumns: `minmax(0,1fr) ${right}` }}>
        <section className="flex min-h-0 flex-col gap-3" aria-label="舞台">
          <Stage fill simple />
          <SceneStrip />
        </section>
        <RightPanel advanced={false} />
      </div>
    );
  }
  if (xl && advanced) {
    // 進階模式：素材庫 ｜ 舞台＋混合配方＋場景帶 ｜ Agent／調整／聲音／規格
    return (
      <div className="grid h-full min-h-0 grid-rows-[minmax(0,1fr)] gap-3 px-4 pb-4 pt-3" style={{ gridTemplateColumns: `296px minmax(0,1fr) ${right}` }}>
        <aside className="flex min-h-0 flex-col rounded-xl border border-line bg-panel p-3" aria-label="素材庫">
          <StyleBrowser />
        </aside>
        <section className="flex min-h-0 flex-col gap-3" aria-label="舞台">
          <Stage fill />
          {/* 混合配方固定高度、裡面自己捲：風格加減時托盤不會變高，舞台與播放列就不會上下跳 */}
          <div className="scroll-y gutter-stable h-[176px] shrink-0 rounded-xl">
            <MixTray />
          </div>
          <Timeline />
        </section>
        <RightPanel advanced />
      </div>
    );
  }
  if (lg && advanced) {
    // 1024–1279 的進階模式：素材庫 ｜ 可以捲動的一欄（舞台、混合配方、場景帶、右側面板）
    return (
      <div className="grid h-full min-h-0 grid-cols-[288px_minmax(0,1fr)] grid-rows-[minmax(0,1fr)] gap-3 px-4 pb-4 pt-3">
        <aside className="flex min-h-0 flex-col rounded-xl border border-line bg-panel p-3" aria-label="素材庫">
          <StyleBrowser />
        </aside>
        <section className="scroll-y flex min-h-0 flex-col gap-3 pr-1" aria-label="舞台">
          {/* 這一欄可以捲動：每一塊都不能被壓縮，否則舞台會被擠成 0 高、蓋住下面的內容 */}
          <div className="shrink-0">
            <Stage />
          </div>
          <div className="shrink-0">
            <MixTray />
          </div>
          <Timeline />
          <div className="flex h-[760px] shrink-0 flex-col">
            <RightPanel advanced collapsible={false} />
          </div>
        </section>
      </div>
    );
  }
  // 窄螢幕（< 1024）：單欄。手機與平板直式預設簡潔；平板（≥ 768）可以切進階
  return (
    <div className="scroll-y h-full">
      <div className="flex flex-col gap-3 px-4 py-3">
        {md ? (
          <Stage simple={!advanced} />
        ) : (
          // 手機：舞台與播放列貼在頂端，下面的場景帶與 Agent 對話自己捲
          <div className="sticky top-0 z-10 -mx-4 -mt-3 bg-bg px-4 pb-1 pt-3">
            <Stage simple compact />
          </div>
        )}
        {advanced ? <Timeline /> : <SceneStrip />}
        {advanced ? (
          <>
            <MixTray />
            <Segmented
              id="mobile-tab"
              value={mobileTab}
              onChange={(t) => set({ mobileTab: t })}
              className="scroll-x w-full [&>button]:flex-1"
              options={[
                { value: 'styles', label: '素材庫' },
                { value: 'brief', label: '處方' },
                { value: 'sound', label: '聲音' },
                { value: 'tune', label: '調整' },
                { value: 'code', label: '代碼' },
                { value: 'prompt', label: '提示詞' },
              ]}
            />
            <div className="flex h-[72vh] flex-col rounded-xl border border-line bg-panel p-3">
              {mobileTab === 'styles' || mobileTab === 'mix' ? <StyleBrowser cols={2} /> : <InfoPanel tab={mobileTab} />}
            </div>
          </>
        ) : (
          <div className="flex h-[70vh] min-h-[480px] flex-col">
            <RightPanel advanced={false} collapsible={false} />
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const view = useStore((s) => s.view);
  const theme = useStore((s) => s.theme);
  const thumbsAnimate = useStore((s) => s.thumbsAnimate);
  const motionOverride = useStore((s) => s.motionOverride);
  const phone = !useMedia('(min-width: 640px)');

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

  // 本機儲存寫不進去（空間已滿、被瀏覽器禁止）：提示一次，不要默默失敗、重新整理才發現東西不見
  useEffect(() => {
    let told = false;
    return onStorageFail((key) => {
      if (told) return;
      told = true;
      const what = key === 'sf-themes-v1' ? '匯入的主題' : key === 'sf-midi-v1' ? '匯入的 MIDI' : '專案與設定';
      useStore.getState().showToast(`瀏覽器的本機儲存空間已滿或被禁止，${what}這次沒有存下來；可以刪掉幾個匯入的主題，或用專案選單的「存成檔案」備份`);
    });
  }, []);

  useEffect(() => {
    preloadFonts(() => thumbs.invalidate());
    // 網址帶 #mix=配方碼 時自動載入
    const m = location.hash.match(/mix=([\w.\-]+)/);
    if (m) {
      const ok = useStore.getState().importCode(m[1]);
      // 從連結載入是一般的一步：按 Ctrl+Z 可以回到原本的混合（審查 R-21）
      if (ok) useStore.getState().showToast('已從連結載入配方；按 Ctrl+Z 可以回到原本的');
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
      // 復原／重做：Ctrl+Z、Ctrl+Shift+Z、Ctrl+Y（Mac 用 ⌘）。焦點在文字框裡時留給文字框自己的復原
      if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'z' || e.key === 'Z' || e.key === 'y' || e.key === 'Y')) {
        if (t?.closest('input:not([type="range"]):not([type="checkbox"]):not([type="radio"]), textarea, [contenteditable]')) return;
        e.preventDefault();
        if (e.key === 'y' || e.key === 'Y' || e.shiftKey) redo();
        else undo();
        return;
      }
      if (t?.closest('input, textarea, select, [contenteditable]') || e.metaKey || e.ctrlKey || e.altKey) return;
      // 焦點在按鈕或連結上時，空白鍵留給它原本的「點擊」行為
      if (e.code === 'Space' && t?.closest('button, a, [role="radio"]')) return;
      const s = useStore.getState();
      // 任何彈出視窗（起點選擇、匯入主題、關於、導出、分享、風格詳情…）開著時，快捷鍵不作用在背後的舞台
      if (s.view !== 'mixer' || s.detail || s.exportOpen || s.shareOpen || s.starterOpen || s.themeOpen || document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      if (e.key === 'Escape' && s.wall) {
        s.set({ wall: false });
        return;
      }
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
      else if (e.key === 'f' || e.key === 'F') toggleStageFullscreen();
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
      {phone && view === 'mixer' && <MobileBar />}
      <StyleDetailModal />
      <ExportModal />
      <ShareModal />
      <StarterModal />
      <ThemeModal />
      <AudioBridge />
      <Toast />
    </div>
  );
}
