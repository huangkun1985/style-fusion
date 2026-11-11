// Agent 本機橋接（2.0 α2，F4）：讓 App 透過這台電腦上「已經登入的 Claude Code」生成與修改動畫，不用 API 金鑰。
// 以 Vite 外掛的形式掛在開發伺服器（start-dev.bat → vite）與預覽伺服器（start.bat → vite preview）上；
// 單檔雙擊（file://）與線上版沒有這個伺服器，App 會自動改用手動模式（複製提示詞／貼回）。
//
// 安全：
// - 只認 Host 是 127.0.0.1／localhost 的請求（擋 DNS rebinding）；POST 還要 Origin 也是本機、帶一次性的通行碼標頭。
// - 通行碼由 GET /__sf/agent/hello 發給「同源」的網頁：別的網站跨站讀不到回應（沒有 CORS 標頭），也送不出帶自訂標頭的請求（預檢不會通過）。
// - Claude Code 以無畫面模式執行：不給任何工具（--tools ""）、不讀 MCP 設定、不存對話、在空的暫存資料夾裡；
//   CLAUDE*／ANTHROPIC* 環境變數全部拿掉（避免繼承呼叫端的設定或金鑰）。網頁斷線就停掉子行程。
// - hello 只回「有沒有裝、有沒有登入、版本」，不回帳號資訊。
import { spawn, execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Plugin } from 'vite';

const BASE = '/__sf/agent/';
const MAX_BODY = 600_000;
const MAX_RUNS = 2;
const RUN_TIMEOUT = 5 * 60_000;
const TOKEN = randomBytes(24).toString('hex');
const EFFORTS = new Set(['low', 'medium', 'high']);

const LOCAL_HOST = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i;
const LOCAL_ORIGIN = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i;

function cleanEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) if (!/^(CLAUDE|ANTHROPIC)/i.test(k)) env[k] = v;
  return env;
}

interface Status {
  installed: boolean;
  loggedIn: boolean;
  version: string;
  at: number;
}
let status: Status | null = null;

function run(cmd: string, args: string[], timeout = 15_000): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { env: cleanEnv(), timeout, windowsHide: true }, (err, stdout) => {
      const code = err ? (typeof (err as { code?: unknown }).code === 'number' ? ((err as { code: number }).code) : -1) : 0;
      resolve({ code, out: String(stdout ?? '') });
    });
  });
}

async function checkStatus(force = false): Promise<Status> {
  if (status && !force && Date.now() - status.at < 60_000) return status;
  const v = await run('claude', ['--version']);
  if (v.code !== 0) return (status = { installed: false, loggedIn: false, version: '', at: Date.now() });
  const version = (v.out.match(/\d+\.\d+\.\d+/) ?? [''])[0];
  const a = await run('claude', ['auth', 'status']);
  let loggedIn = false;
  try {
    loggedIn = JSON.parse(a.out).loggedIn === true;
  } catch {
    loggedIn = false;
  }
  return (status = { installed: true, loggedIn, version, at: Date.now() });
}

const deny = (res: ServerResponse, code: number, msg: string) => {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({ error: msg }));
};

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error('too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

let active = 0;

async function handle(req: IncomingMessage, res: ServerResponse, next: () => void) {
  const url = req.url ?? '';
  if (!url.startsWith(BASE)) return next();
  res.setHeader('Cache-Control', 'no-store');
  // 只服務本機的網址（擋 DNS rebinding：別的網域就算解析到 127.0.0.1，Host 也不會是 localhost）
  if (!LOCAL_HOST.test(req.headers.host ?? '')) return deny(res, 403, 'host');
  const path = url.slice(BASE.length).split('?')[0];

  if (path === 'hello' && req.method === 'GET') {
    const site = req.headers['sec-fetch-site'];
    if (site && site !== 'same-origin' && site !== 'none') return deny(res, 403, 'origin');
    const st = await checkStatus(url.includes('refresh=1'));
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ token: TOKEN, installed: st.installed, loggedIn: st.loggedIn, version: st.version }));
    return;
  }

  if (path === 'run' && req.method === 'POST') {
    if (!LOCAL_ORIGIN.test(String(req.headers.origin ?? ''))) return deny(res, 403, 'origin');
    if (req.headers['x-sf-token'] !== TOKEN) return deny(res, 403, 'token');
    if (!String(req.headers['content-type'] ?? '').startsWith('application/json')) return deny(res, 415, 'type');
    if (active >= MAX_RUNS) return deny(res, 429, 'busy');
    let body: { prompt?: unknown; effort?: unknown };
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      return deny(res, 400, 'body');
    }
    const prompt = typeof body.prompt === 'string' ? body.prompt : '';
    if (!prompt.trim()) return deny(res, 400, 'prompt');
    const effort = typeof body.effort === 'string' && EFFORTS.has(body.effort) ? body.effort : 'low';
    const st = await checkStatus();
    if (!st.installed) return deny(res, 503, 'not-installed');
    if (!st.loggedIn) {
      const again = await checkStatus(true);
      if (!again.loggedIn) return deny(res, 401, 'not-logged-in');
    }

    active++;
    const dir = mkdtempSync(join(tmpdir(), 'sf-agent-'));
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const send = (o: unknown) => {
      if (!res.writableEnded) res.write(JSON.stringify(o) + '\n');
    };
    const t0 = Date.now();
    send({ t: 'start' });
    const child = spawn(
      'claude',
      ['-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--tools', '', '--strict-mcp-config', '--no-session-persistence', '--effort', effort],
      { cwd: dir, env: cleanEnv(), windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] },
    );
    let finished = false;
    let text = '';
    let errText = '';
    let buf = '';
    const finish = (o: Record<string, unknown>) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      send({ ...o, ms: Date.now() - t0 });
      res.end();
      active--;
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        /* 暫存資料夾刪不掉就算了 */
      }
    };
    const kill = () => {
      if (child.exitCode === null) child.kill();
    };
    const timer = setTimeout(() => {
      kill();
      finish({ t: 'error', code: 'timeout', msg: '超過 5 分鐘沒有完成，已停止' });
    }, RUN_TIMEOUT);
    // 網頁關掉、按取消（中斷連線）：停掉子行程
    res.on('close', () => {
      if (!finished) {
        kill();
        finish({ t: 'error', code: 'aborted', msg: '已取消' });
      }
    });
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line) continue;
        let o: { type?: string; event?: { type?: string; delta?: { type?: string; text?: string } }; is_error?: boolean; result?: string; usage?: unknown };
        try {
          o = JSON.parse(line);
        } catch {
          continue;
        }
        if (o.type === 'stream_event' && o.event?.type === 'content_block_delta' && o.event.delta?.type === 'text_delta' && o.event.delta.text) {
          text += o.event.delta.text;
          send({ t: 'delta', text: o.event.delta.text });
        } else if (o.type === 'result') {
          if (o.is_error) finish({ t: 'error', code: 'claude', msg: String(o.result ?? 'Claude 回報錯誤').slice(0, 400) });
          else finish({ t: 'done', text: typeof o.result === 'string' && o.result ? o.result : text, usage: o.usage });
        }
      }
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (c: string) => {
      errText = (errText + c).slice(-2000);
    });
    child.on('error', (e) => finish({ t: 'error', code: 'spawn', msg: `沒辦法啟動 Claude Code：${e.message}` }));
    child.on('close', (code) => {
      if (!finished) finish({ t: 'error', code: 'exit', msg: `Claude Code 結束了（代碼 ${code}）${errText ? '：' + errText.trim().split('\n').slice(-2).join(' ') : ''}`.slice(0, 400) });
    });
    child.stdin.end(prompt, 'utf8');
    return;
  }

  return deny(res, 404, 'not found');
}

export function agentBridge(): Plugin {
  const mw = (req: IncomingMessage, res: ServerResponse, next: () => void) => void handle(req, res, next).catch(() => deny(res, 500, 'error'));
  return {
    name: 'sf-agent-bridge',
    configureServer(server) {
      server.middlewares.use(mw);
    },
    configurePreviewServer(server) {
      server.middlewares.use(mw);
    },
  };
}
