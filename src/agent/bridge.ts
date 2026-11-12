// 網頁這一端的本機橋接用戶端（伺服器在 scripts/agent-bridge.ts）。
// 只有用 start.bat／start-dev.bat 開（http://127.0.0.1 或 localhost）才可能連得上；雙擊單檔、線上版一律是手動模式。

export type BridgeState = 'checking' | 'ok' | 'none' | 'not-installed' | 'not-logged-in';
export interface BridgeInfo {
  state: BridgeState;
  version?: string;
}

let token = '';
let cached: BridgeInfo | null = null;
let pending: Promise<BridgeInfo> | null = null;

const localPage = () => typeof location !== 'undefined' && /^https?:$/.test(location.protocol) && /^(127\.0\.0\.1|localhost|\[::1\])$/.test(location.hostname);

/** 檢查橋接：連得上、Claude Code 有沒有裝、有沒有登入。結果會快取；refresh=true 重新問（例如使用者剛登入） */
export function connectBridge(refresh = false): Promise<BridgeInfo> {
  // 網址加 ?agent=manual 可以強制用手動模式（想自己挑 AI、或測試時用）
  const forced = typeof location !== 'undefined' && new URLSearchParams(location.search).get('agent') === 'manual';
  if (!localPage() || forced) return Promise.resolve((cached = { state: 'none' }));
  if (cached && !refresh && cached.state !== 'checking') return Promise.resolve(cached);
  if (pending && !refresh) return pending;
  pending = (async () => {
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 20_000);
      const r = await fetch(`./__sf/agent/hello${refresh ? '?refresh=1' : ''}`, { signal: ctl.signal, cache: 'no-store' });
      clearTimeout(timer);
      if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) return (cached = { state: 'none' });
      const o = (await r.json()) as { token?: string; installed?: boolean; loggedIn?: boolean; version?: string };
      if (typeof o.token !== 'string') return (cached = { state: 'none' });
      token = o.token;
      return (cached = { state: !o.installed ? 'not-installed' : !o.loggedIn ? 'not-logged-in' : 'ok', version: o.version });
    } catch {
      return (cached = { state: 'none' });
    } finally {
      pending = null;
    }
  })();
  return pending;
}

/** 本機伺服器的其他端點（真實音效庫）：帶通行碼 POST JSON。連不上（不是 start.bat 開的）丟出 AgentError('none') */
export async function bridgePost(path: string, body: unknown, signal?: AbortSignal): Promise<Response> {
  if (!token) {
    const info = await connectBridge(true);
    if (info.state === 'none' || !token) throw new AgentError('none', '只有用 start.bat（或 start-dev.bat）開的時候才能搜尋與下載真實音效');
  }
  let r: Response;
  try {
    r = await fetch(`./__sf/agent/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-SF-Token': token }, body: JSON.stringify(body), signal });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new AgentError('aborted', '已取消');
    throw new AgentError('network', '連不到本機的伺服器（start.bat 的視窗還開著嗎？）');
  }
  if (!r.ok) {
    let code = String(r.status);
    try {
      code = ((await r.json()) as { error?: string }).error ?? code;
    } catch {
      /* 不是 JSON */
    }
    if (code === 'token') {
      cached = null;
      token = '';
    }
    throw new AgentError(code, code.startsWith('freesound') ? `Freesound 連不上或回應錯誤（${code}）。可以等一下再試` : (CODE_MSG[code] ?? `伺服器回應 ${code}`));
  }
  return r;
}

export class AgentError extends Error {
  constructor(
    public code: string,
    msg: string,
  ) {
    super(msg);
  }
}

const CODE_MSG: Record<string, string> = {
  token: '連線的通行碼過期了（伺服器可能重新啟動過），請重新整理頁面',
  origin: '請求被擋下來了：只接受從這台電腦開的頁面',
  'not-installed': '這台電腦沒有安裝 Claude Code',
  'not-logged-in': 'Claude Code 還沒登入：請在命令提示字元執行 claude auth login，登入後按「重新檢查」',
  busy: '已經有兩個請求在跑，請等一下',
};

/** 送出一段提示詞，逐字收到回覆（onDelta），最後回傳全文。signal 中斷＝取消（伺服器會停掉 Claude Code） */
export async function runAgent(prompt: string, opts: { effort: 'low' | 'medium' | 'high'; signal?: AbortSignal; onDelta?: (text: string) => void }): Promise<{ text: string; ms: number }> {
  if (!token) await connectBridge(true);
  let r: Response;
  try {
    r = await fetch('./__sf/agent/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-SF-Token': token },
      body: JSON.stringify({ prompt, effort: opts.effort }),
      signal: opts.signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new AgentError('aborted', '已取消');
    throw new AgentError('network', '連不到本機的伺服器（start.bat 的視窗還開著嗎？）');
  }
  if (!r.ok) {
    let code = String(r.status);
    try {
      code = ((await r.json()) as { error?: string }).error ?? code;
    } catch {
      /* 不是 JSON */
    }
    if (code === 'token') cached = null;
    throw new AgentError(code, CODE_MSG[code] ?? `伺服器回應 ${r.status}`);
  }
  const reader = r.body!.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let text = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        if (!line.trim()) continue;
        const o = JSON.parse(line) as { t: string; text?: string; msg?: string; code?: string; ms?: number };
        if (o.t === 'delta' && o.text) {
          text += o.text;
          opts.onDelta?.(o.text);
        } else if (o.t === 'done') return { text: o.text || text, ms: o.ms ?? 0 };
        else if (o.t === 'error') throw new AgentError(o.code ?? 'error', o.msg ?? '發生錯誤');
      }
    }
  } catch (e) {
    if (e instanceof AgentError) throw e;
    if ((e as Error).name === 'AbortError') throw new AgentError('aborted', '已取消');
    throw new AgentError('stream', '連線中斷了');
  }
  throw new AgentError('stream', '回覆沒有正常結束');
}
