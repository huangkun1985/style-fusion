import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles.css';
import { startHistory } from './store/history';
import { bootPersistence } from './store/persist';
import { useStore } from './store/store';

// 開發模式的除錯入口（正式版會被摘除）：在主控台用 __sf.audio / __sf.clock / __sf.store / __sf.themes 檢查內部狀態
if (import.meta.env.DEV) {
  void Promise.all([import('./audio/engine'), import('./engine/clock'), import('./store/store'), import('./engine/themes'), import('./engine/themeTemplates'), import('./store/history'), import('./store/persist')]).then(([a, c, s, th, tt, h, ps]) => {
    (window as unknown as { __sf: unknown }).__sf = { audio: a.audioEngine, clock: c.clock, store: s.useStore, history: h, persist: ps, themes: th.themes, templates: tt };
  });
}

// 線上版（npm run build:web）才註冊離線快取；單檔版與開發模式不用
if (import.meta.env.MODE === 'web' && 'serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  });
}

// 先載入專案（IndexedDB 是非同步的），再開始記錄復原歷史、再畫出介面；這樣開機時的載入不會變成一步「復原」，
// 之後從連結載入的配方（App 裡處理）則是一般的一步，可以復原（審查 R-21）。
void (async () => {
  let note: string | null = null;
  try {
    note = await bootPersistence();
  } catch (e) {
    console.error('載入專案失敗', e);
  }
  startHistory();
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  );
  if (note) setTimeout(() => useStore.getState().showToast(note), 600);
})();
