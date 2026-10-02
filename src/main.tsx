import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles.css';

// 開發模式的除錯入口（正式版會被摘除）：在主控台用 __sf.audio / __sf.clock / __sf.store 檢查內部狀態
if (import.meta.env.DEV) {
  void Promise.all([import('./audio/engine'), import('./engine/clock'), import('./store/store')]).then(([a, c, s]) => {
    (window as unknown as { __sf: unknown }).__sf = { audio: a.audioEngine, clock: c.clock, store: s.useStore };
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
