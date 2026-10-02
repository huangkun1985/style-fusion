// 平台工具：下載、複製、執行環境偵測。

/** 是否在 claude.ai Artifact 的沙盒框架內（下載受限） */
export const inArtifact = (() => {
  try {
    return window.self !== window.top && /claude\.ai|claudeusercontent|anthropic/.test(document.referrer + location.host);
  } catch {
    return true;
  }
})();

export function saveBlob(blob: Blob, filename: string): boolean {
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    return true;
  } catch {
    return false;
  }
}

/** 複製文字；失敗時回傳 false，呼叫端可改為選取文字 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export const safeStorage = {
  getItem(k: string): string | null {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  setItem(k: string, v: string) {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* 儲存失敗時忽略（無痕模式等） */
    }
  },
  removeItem(k: string) {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  },
};

export function stamp() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}
