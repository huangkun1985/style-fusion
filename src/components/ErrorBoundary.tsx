// 最後一道防線：任何渲染錯誤都不該讓整頁變成空白，並提供「重設本機資料」的出口（舊版或損壞的儲存資料是常見原因）。
import { Component, type ErrorInfo, type ReactNode } from 'react';

const STORE_KEY = 'style-fusion-v1';

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('畫面發生錯誤', error, info.componentStack);
  }

  private reset = () => {
    try {
      localStorage.removeItem(STORE_KEY);
    } catch {
      /* 儲存空間不可用就直接重新載入 */
    }
    location.reload();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div role="alert" className="flex h-full items-center justify-center p-6">
        <div className="max-w-md rounded-2xl border border-line bg-panel p-6 text-center shadow-lg">
          <h1 className="font-display text-lg font-bold">畫面發生錯誤</h1>
          <p className="mt-2 text-sm leading-relaxed text-fg-2">多半是舊版或損壞的本機資料造成的。先重新載入；如果還是一樣，就清除本機資料（收藏的配方也會一起清掉）。</p>
          <p className="num mt-3 break-words rounded-lg bg-panel-2 px-3 py-2 text-left text-[11px] text-fg-3">{error.message}</p>
          <div className="mt-4 flex justify-center gap-2">
            <button type="button" onClick={() => location.reload()} className="rounded-lg bg-mot px-4 py-2 text-sm font-semibold text-on-mot">
              重新載入
            </button>
            <button type="button" onClick={this.reset} className="rounded-lg border border-line-2 px-4 py-2 text-sm text-fg-2 hover:text-fg">
              清除本機資料並重設
            </button>
          </div>
        </div>
      </div>
    );
  }
}
