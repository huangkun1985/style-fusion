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

  // ---------- 真實音效庫（2.0 β，F11b）：代抓 Freesound 的搜尋頁與試聽檔（網頁不能直接跨站讀） ----------
  if ((path === 'sfx-search' || path === 'sfx-fetch') && req.method === 'POST') {
    if (!LOCAL_ORIGIN.test(String(req.headers.origin ?? ''))) return deny(res, 403, 'origin');
    if (req.headers['x-sf-token'] !== TOKEN) return deny(res, 403, 'token');
    let body: { q?: unknown; license?: unknown; url?: unknown };
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      return deny(res, 400, 'body');
    }
    if (path === 'sfx-search') {
      const q = typeof body.q === 'string' ? body.q.trim().slice(0, 120) : '';
      if (!q) return deny(res, 400, 'query');
      const lic = body.license === 'by' || body.license === 'any' ? body.license : 'cc0';
      try {
        const rows = await freesoundSearch(q, lic);
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ rows }));
      } catch (e) {
        deny(res, 502, `freesound: ${(e as Error).message}`.slice(0, 200));
      }
      return;
    }
    const url = typeof body.url === 'string' ? body.url : '';
    // 只代抓 Freesound 的試聽檔（不當成任意網址的代理）
    if (!/^https:\/\/cdn\.freesound\.org\/previews\/\d+\/[\w.-]+\.(mp3|ogg)$/.test(url)) return deny(res, 400, 'url');
    try {
      const r = await fetchWithTimeout(url, 60_000);
      if (!r.ok) return deny(res, 502, `freesound ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length > 8_000_000) return deny(res, 413, 'too large');
      res.setHeader('Content-Type', url.endsWith('.ogg') ? 'audio/ogg' : 'audio/mpeg');
      res.end(buf);
    } catch (e) {
      deny(res, 502, `freesound: ${(e as Error).message}`.slice(0, 200));
    }
    return;
  }

  return deny(res, 404, 'not found');
}

// ---------- Freesound（照 sound skill 的做法讀搜尋結果頁；Freesound 改版就要跟著改） ----------
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) style-fusion-local' };
const FS_LICENSE: Record<string, string | null> = { cc0: '"Creative Commons 0"', by: '("Attribution" OR "Creative Commons 0")', any: null };
const FS_LIC_SHORT: Record<string, string> = { 'Creative Commons 0': 'CC0', Attribution: 'BY', 'Attribution NonCommercial': 'BY-NC', 'Sampling+': 'Sampling+' };

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { headers: UA, signal: ctl.signal });
  } finally {
    clearTimeout(timer);
  }
}

const unescape = (s: string) => s.replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

export interface FsRow {
  id: string;
  title: string;
  dur: number;
  author: string;
  license: string;
  downloads: number;
  rating: number | null;
  votes: number;
  desc: string;
  preview: string;
  page: string;
}

export function parseFreesound(html: string): FsRow[] {
  const rows: FsRow[] = [];
  for (const blk of html.split('class="bw-search__result"').slice(1)) {
    const g = (k: string) => (blk.match(new RegExp(`data-${k}="([^"]*)"`)) ?? [, ''])[1] ?? '';
    const lic = blk.match(/title="License: ([^"]+)"/);
    const rt = blk.match(/aria-label="Average rating of ([\d.]+)"/);
    const rn = blk.match(/bw-rating__count[^>]*>\((\d+)\)/);
    const desc = blk.match(/<div class="max-h-60px[^"]*"\s*>\s*([\s\S]*?)\s*<\/div>/);
    const id = g('sound-id');
    const user = g('username');
    const mp3 = g('mp3').replace('-lq.mp3', '-hq.mp3');
    if (!id || !mp3) continue;
    rows.push({
      id,
      title: unescape(g('title')),
      dur: Number(g('duration')) || 0,
      author: user,
      license: lic ? (FS_LIC_SHORT[lic[1]] ?? lic[1]) : '?',
      downloads: Number(g('num-downloads')) || 0,
      rating: rt ? Number(rt[1]) : null,
      votes: rn ? Number(rn[1]) : 0,
      desc: desc ? unescape(desc[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim().slice(0, 160) : '',
      preview: mp3,
      page: user ? `https://freesound.org/people/${encodeURIComponent(user)}/sounds/${id}/` : `https://freesound.org/s/${id}/`,
    });
  }
  return rows;
}

/** 搜兩頁（依相關度），再依下載數排序（sound skill 的做法：伺服器端依下載數排，會讓不相干的熱門音效勝出） */
async function freesoundSearch(q: string, lic: string): Promise<FsRow[]> {
  const params = (page: number) => {
    const u = new URLSearchParams({ q, s: 'Automatic by relevance', page: String(page) });
    if (FS_LICENSE[lic]) u.set('f', `license:${FS_LICENSE[lic]}`);
    return u.toString();
  };
  const pages = await Promise.all([1, 2].map((p) => fetchWithTimeout(`https://freesound.org/search/?${params(p)}`, 30_000).then((r) => (r.ok ? r.text() : ''))));
  const seen = new Set<string>();
  const rows = pages.flatMap(parseFreesound).filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
  rows.sort((a, b) => b.downloads - a.downloads);
  return rows.slice(0, 20);
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
