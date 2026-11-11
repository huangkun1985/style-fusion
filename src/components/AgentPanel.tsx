// Agent 面板（2.0 α2）：連上本機 Claude 時直接生成與對話修改；連不上時是手動模式（複製提示詞／貼回），流程與修改卡完全相同。
// 狀態：① 場景是內建模板 → 選風格模板、初始提示詞、生成（模板不能用對話修改）；② 場景是生成的內容 → 對話＋時間點＋修改卡。
import { ArrowUp, ChevronRight, ClipboardPaste, Copy, RefreshCw, X } from 'lucide-react';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { buildModifyPrompt, FRAME_BUDGET_MS, parseAnswer } from '../agent/agent';
import { connectBridge, type BridgeInfo } from '../agent/bridge';
import { acceptChange, addStampNow, askSimplify, cancelRun, previewResult, rejectChange, retryLast, startGenerate, startModify, useAgentRun } from '../agent/session';
import { clock } from '../engine/clock';
import { SUBJECTS } from '../engine/subjects';
import { themes } from '../engine/themes';
import { agentPrompt, demoTopic, recipeById, templateLine } from '../lib/agentPrompt';
import { copyText } from '../lib/platform';
import { beginGesture, compareOriginal, endGesture } from '../store/history';
import { fieldsFor } from '../engine/content';
import type { SubjectId } from '../engine/types';
import { mixSpec } from '../store/hooks';
import { useStore } from '../store/store';
import { Thumb } from './Thumb';
import { Button } from './ui';

// ---------- 連線狀態 ----------
let bridgeInfo: BridgeInfo = { state: 'checking' };
const bridgeListeners = new Set<(b: BridgeInfo) => void>();
export function recheckBridge(refresh = false) {
  void connectBridge(refresh).then((b) => {
    bridgeInfo = b;
    bridgeListeners.forEach((f) => f(b));
  });
}
recheckBridge();
export function useBridge() {
  const [b, setB] = useState(bridgeInfo);
  useEffect(() => {
    bridgeListeners.add(setB);
    setB(bridgeInfo);
    return () => {
      bridgeListeners.delete(setB);
    };
  }, []);
  return b;
}

const STATUS: Record<BridgeInfo['state'], { dot: string; text: string; tip: string }> = {
  checking: { dot: 'bg-fg-3', text: '檢查中', tip: '正在檢查這台電腦上的 Claude Code' },
  ok: { dot: 'bg-ok', text: '已連上你的 Claude', tip: '已連上這台電腦登入的 Claude Code：按「生成」直接做動畫，對話修改也會直接送出' },
  none: { dot: 'bg-fg-3', text: '手動模式', tip: '手動模式：沒有用 start.bat／start-dev.bat 開（例如雙擊單檔或線上版），連不到本機的 Claude。用複製提示詞、貼回回答的方式，流程一樣' },
  'not-installed': { dot: 'bg-danger', text: '沒有 Claude Code', tip: '這台電腦沒有安裝 Claude Code。裝好並登入後按「重新檢查」；現在可以先用手動模式' },
  'not-logged-in': { dot: 'bg-danger', text: 'Claude Code 沒登入', tip: 'Claude Code 還沒登入：在命令提示字元執行 claude auth login，登入後按「重新檢查」；現在可以先用手動模式' },
};

export function AgentStatus() {
  const b = useBridge();
  const st = STATUS[b.state];
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-[12px] text-fg-2" title={st.tip}>
      <span className={`size-2 shrink-0 rounded-full ${st.dot}`} aria-hidden />
      <span className="truncate">{st.text}</span>
    </span>
  );
}

// ---------- 文字裡的時間可以點 ----------
const fmt = (t: number) => `${t < 10 ? '0' : ''}${t.toFixed(1)}s`;
function Linkify({ text }: { text: string }) {
  const parts = text.split(/(@?\d{1,3}(?:\.\d{1,2})?\s?s\b)/g);
  return (
    <>
      {parts.map((p, i) => {
        const m = /^@?(\d{1,3}(?:\.\d{1,2})?)\s?s$/.exec(p);
        if (!m) return <Fragment key={i}>{p}</Fragment>;
        const t = parseFloat(m[1]);
        return (
          <button key={i} type="button" title={`跳到 ${t} 秒`} onClick={() => { clock.play(false); clock.set(t); }} className="num rounded bg-raise px-1 text-[12px] text-fg hover:bg-line-2">
            {p}
          </button>
        );
      })}
    </>
  );
}

function StampChip({ t, label, onRemove }: { t: number; label: string; onRemove?: () => void }) {
  return (
    <span className="num flex h-6 shrink-0 items-center gap-1.5 rounded-md bg-mot-soft pl-2 pr-1 text-[12px] text-mot">
      <span className="size-[7px] rotate-45 bg-mot" aria-hidden />
      <button type="button" title={`跳到 ${t} 秒`} onClick={() => { clock.play(false); clock.set(t); }}>{fmt(t)}</button>
      {label && <span className="max-w-[9em] truncate">{label}</span>}
      {onRemove && (
        <button type="button" aria-label="移除這個時間點" onClick={onRemove} className="flex size-5 items-center justify-center">
          <X size={12} />
        </button>
      )}
    </span>
  );
}

// ---------- 主面板 ----------
export function AgentPanel({ showStatus }: { showStatus?: boolean }) {
  const bridge = useBridge();
  const subject = useStore((s) => s.subject);
  const connected = bridge.state === 'ok';
  const generated = subject === 'custom';
  const ver = useStore((s) => s.subjectVer);
  const fields = fieldsFor(subject, ver);
  const [regen, setRegen] = useState(false);
  // 版面：上面是自己捲的內容；生成的場景另外有固定在面板底部的輸入框（設計圖的位置），修改卡出現、收起時輸入框不會動
  return (
    <div className="relative flex min-h-0 flex-1 flex-col gap-2 text-[13px]">
    <div className="scroll-y gutter-stable relative -mr-1 flex min-h-0 flex-1 flex-col gap-3 pr-1">
      {showStatus && <AgentStatus />}
      {(bridge.state === 'none' || bridge.state === 'not-installed' || bridge.state === 'not-logged-in') && (
        <div className="flex items-start gap-2 rounded-lg bg-panel-2 px-3 py-2 text-[12px] leading-[18px] text-fg-2">
          <span className="flex-1">
            {bridge.state === 'none'
              ? '用 start.bat 開啟並登入 Claude Code，就能直接生成。現在用手動的方式，流程一樣：複製提示詞給任何 AI → 把回答貼回來。'
              : bridge.state === 'not-installed'
                ? '這台電腦沒有安裝 Claude Code。裝好並登入後按「重新檢查」。現在可以先用手動的方式。'
                : 'Claude Code 還沒登入：在命令提示字元執行 claude auth login，登入後按「重新檢查」。現在可以先用手動的方式。'}
          </span>
          {bridge.state !== 'none' && (
            <Button size="xs" variant="soft" onClick={() => recheckBridge(true)} title="重新檢查 Claude Code 有沒有裝好、登入">
              <RefreshCw size={12} /> 重新檢查
            </Button>
          )}
        </div>
      )}
      {generated ? (
        <>
          <details open={regen} onToggle={(e) => setRegen((e.target as HTMLDetailsElement).open)} className="rounded-lg border border-line">
            <summary className="flex h-9 cursor-pointer items-center px-2.5 text-[12px] text-fg-2 hover:text-fg" title="重新生成：換一個主題或風格模板，做一段新的動畫（目前的內容在復原歷史裡）">
              重新生成（換主題或風格模板）
            </summary>
            <div className="flex flex-col gap-3 p-2.5 pt-0">
              <GenerateForm connected={connected} />
            </div>
          </details>
          <ChatLog />
          <RunStatus />
          <PendingCard />
        </>
      ) : (
        <>
          <div className="flex flex-col gap-2 rounded-lg border border-line-2 bg-panel-2 px-3 py-2 text-[12px] leading-[18px] text-fg-2">
            <span>
              「{SUBJECTS[subject].name}」是內建模板，不能用對話修改；{fields.length ? '可以直接改下面的字、' : '可以'}換風格、換動效。要可以用對話修改的版本，請在下面生成一個新的。
            </span>
            {fields.length > 0 && <TemplateContent subject={subject} />}
          </div>
          <GenerateForm connected={connected} />
          <RunStatus />
          <PendingCard />
        </>
      )}
    </div>
    {generated && <ChatInput connected={connected} />}
    </div>
  );
}

// ---------- 生成表單：① 風格模板 ② 初始提示詞 ③ 生成／複製 ----------
function GenerateForm({ connected }: { connected: boolean }) {
  const agent = useStore((s) => s.agent);
  const setAgent = useStore((s) => s.setAgent);
  const set = useStore((s) => s.set);
  const effort = useStore((s) => s.agentEffort);
  const running = useAgentRun((s) => s.running);
  const r = recipeById(agent.template);
  const [specOpen, setSpecOpen] = useState(false);
  const prompt = useMemo(() => agentPrompt(agent), [agent]);
  const spec = useMemo(() => prompt.slice(prompt.indexOf('【風格規格】'), prompt.indexOf('【這次要做的】')).trim(), [prompt]);
  const tv = r.v.map(([id, w]) => ({ id, w }));
  const tm = r.m.map(([id, w]) => ({ id, w }));
  return (
    <>
      <section className="flex flex-col gap-2">
        <h3 className="font-bold">① 風格模板</h3>
        <div className="flex items-center gap-2.5 rounded-xl border-[1.5px] border-mot bg-mot-soft p-2">
          <span className="relative h-10 w-16 shrink-0 overflow-hidden rounded-md bg-stage">
            <Thumb spec={() => mixSpec(tv, tm, r.subject)} specKey={`agent-${r.id}`} className="size-full" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col leading-[18px]">
            <span className="truncate font-medium">{r.name}</span>
            <span className="truncate text-[12px] text-fg-2">{templateLine(r)}</span>
          </span>
          <Button size="sm" variant="soft" title="換一個風格模板：決定生成時的色板、線條、動效與幀率。舞台上的內容不變，只換風格" onClick={() => set({ starterOpen: true, starterFor: 'agent' })}>
            換一個
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="font-bold">
          ② 初始提示詞 <span className="text-[12px] font-normal text-fg-2">已依模板帶好，需要才改</span>
        </h3>
        <div className="flex flex-col gap-2 rounded-xl border border-line-2 bg-panel-2 p-2.5">
          <label htmlFor="agent-topic" className="text-[12px] text-fg-2">
            主題（最常改的地方：換成你要的內容；空著就用模板的示範）
          </label>
          <textarea
            id="agent-topic"
            rows={2}
            maxLength={300}
            value={agent.topic}
            placeholder={demoTopic(r)}
            onChange={(e) => setAgent({ topic: e.target.value })}
            className="resize-none rounded-md border border-mot/50 bg-mot-soft px-2 py-1.5 leading-5 text-fg outline-none placeholder:text-fg-2 focus:border-mot"
          />
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="agent-sec" className="text-[12px] text-fg-2">長度</label>
            <input
              id="agent-sec"
              type="number"
              min={2}
              max={30}
              value={agent.seconds}
              onChange={(e) => setAgent({ seconds: Math.round(Math.min(30, Math.max(2, Number(e.target.value) || 8))) })}
              className="num h-8 w-16 rounded-md border border-line-2 bg-panel px-2 outline-none focus:border-mot"
              title="長度：動畫一個循環幾秒（2–30）"
            />
            <span className="text-[12px] text-fg-2">秒</span>
            {connected && (
              <div role="radiogroup" aria-label="思考深度" className="ml-auto flex rounded-md border border-line bg-panel p-0.5">
                {(['low', 'high'] as const).map((e) => (
                  <button
                    key={e}
                    type="button"
                    role="radio"
                    aria-checked={effort === e}
                    title={e === 'low' ? '快：約 40 秒。大部分情況用這個' : '仔細：約 60 秒，想得比較多。快的結果不滿意時用'}
                    onClick={() => set({ agentEffort: e })}
                    className={`h-6 w-10 rounded text-[12px] ${effort === e ? 'bg-raise text-fg' : 'text-fg-2 hover:text-fg'}`}
                  >
                    {e === 'low' ? '快' : '仔細'}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            aria-expanded={specOpen}
            onClick={() => setSpecOpen(!specOpen)}
            className="flex h-8 items-center justify-between rounded-md px-1 text-[12px] text-fg-2 hover:text-fg"
            title="風格規格：由風格模板自動算出的色板、線條、動效、幀率與構圖要求，會自動附在提示詞裡。要改風格請換模板"
          >
            風格規格（自動附上，點開看內容）
            <ChevronRight size={14} className={`transition-transform ${specOpen ? 'rotate-90' : ''}`} />
          </button>
          {specOpen && <pre className="scroll-y max-h-[200px] whitespace-pre-wrap rounded-md bg-panel p-2 text-[12px] leading-[18px] text-fg-2">{spec}</pre>}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="font-bold">{connected ? '③ 生成' : '③ 交給 AI，再貼回來'}</h3>
        {connected ? (
          <Button variant="primary" className="h-10 w-full" disabled={!!running} onClick={() => startGenerate()} title="生成：把初始提示詞送給你的 Claude，大約 40～60 秒後動畫出現在舞台上（先預覽，按套用才算數）">
            生成
          </Button>
        ) : (
          null
        )}
        {connected ? (
          <span className="text-[12px] leading-[18px] text-fg-3">提示詞與動畫內容會送到你自己的 Claude 帳號（這台電腦登入的 Claude Code），並使用你的用量；App 不會上傳到其他地方。</span>
        ) : (
          <ManualBox prompt={prompt} kind="generate" />
        )}
      </section>
    </>
  );
}

// ---------- 手動模式：複製提示詞、貼回回答 ----------
function ManualBox({ prompt, kind, pasteOnly, onDone }: { prompt: string; kind: 'generate' | 'modify'; pasteOnly?: boolean; onDone?: () => void }) {
  const [pasteOpen, setPasteOpen] = useState(!!pasteOnly);
  const [paste, setPaste] = useState('');
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState<'idle' | 'ok' | 'fail'>('idle');
  const apply = () => {
    try {
      previewResult(parseAnswer(paste), kind);
      setErr('');
      setPaste('');
      setPasteOpen(pasteOnly ? true : false);
      onDone?.();
    } catch (e) {
      setErr(`格式不對：${(e as Error).message.split('\n')[0]}。請 AI 照提示詞的格式重新輸出。`);
    }
  };
  return (
    <div className="flex flex-col gap-2">
      {!pasteOnly && (
      <Button
        variant="soft"
        className="w-full"
        title="複製提示詞：整段（格式說明＋內容＋你的意見）複製到剪貼簿，貼給 Claude、ChatGPT 或任何 AI"
        onClick={async () => {
          const ok = await copyText(prompt);
          setCopied(ok ? 'ok' : 'fail');
          setTimeout(() => setCopied('idle'), 1600);
        }}
      >
        <Copy size={15} />
        <span className="inline-block w-[7em] text-left">{copied === 'ok' ? '已複製' : copied === 'fail' ? '請手動選取' : '複製提示詞'}</span>
      </Button>
      )}
      {!pasteOnly && (
      <Button variant="outline" className="w-full border-dashed" aria-expanded={pasteOpen} title="貼上 AI 的回答：把 AI 回覆的整段文字貼進來，App 會取出動畫檔、檢查格式、放上舞台預覽" onClick={() => setPasteOpen(!pasteOpen)}>
        <ClipboardPaste size={15} />
        <span className="inline-block w-[7em] text-left">貼上 AI 的回答</span>
      </Button>
      )}
      {pasteOpen && (
        <div className="flex flex-col gap-2">
          <label htmlFor={`paste-${kind}`} className="sr-only">AI 的回答</label>
          <textarea id={`paste-${kind}`} rows={5} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="把 AI 的整段回答貼在這裡（裡面要有 ```json 區塊）" className="resize-y rounded-md border border-line-2 bg-panel-2 px-2 py-1.5 text-[12px] leading-[18px] outline-none focus:border-mot" />
          <div className="flex gap-2">
            <Button variant="soft" className="flex-1" disabled={!paste.trim()} onClick={apply} title="放上舞台預覽：檢查格式後出現修改卡，按套用才算數">
              放上舞台預覽
            </Button>
            {pasteOnly && <Button variant="ghost" onClick={() => onDone?.()}>取消</Button>}
          </div>
        </div>
      )}
      <span className="min-h-[18px] text-[12px] leading-[18px] text-danger" role="alert">{err}</span>
    </div>
  );
}

// ---------- 等待中 ----------
function RunStatus() {
  const running = useAgentRun((s) => s.running);
  const error = useAgentRun((s) => s.error);
  const last = useAgentRun((s) => s.last);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => tick((x) => x + 1), 500);
    return () => window.clearInterval(id);
  }, [running]);
  if (!running && !error) return null;
  if (!running)
    return (
      <div className="flex items-center gap-2 rounded-lg border border-danger/40 px-3 py-2 text-[12px] leading-[18px] text-danger" role="alert">
        <span className="flex-1">{error}</span>
        {last && <Button size="xs" variant="soft" onClick={() => retryLast()}>再試一次</Button>}
      </div>
    );
  const sec = Math.floor((Date.now() - running.startedAt) / 1000);
  const what = running.kind === 'generate' ? '生成' : '修改';
  const phase = running.phase === 'retry' ? '格式不對，自動重問中' : running.phase === 'writing' ? `寫入中 ${running.chars.toLocaleString()} 字` : '思考中';
  return (
    <div className="flex items-center gap-2 rounded-lg border border-line-2 bg-panel-2 px-3 py-2 text-[12px]" role="status">
      <span className="size-2 shrink-0 animate-pulse rounded-full bg-mot" aria-hidden />
      <span className="min-w-0 flex-1 leading-[18px]">
        正在{what}… <span className="num inline-block w-[3.5em]">{sec} 秒</span>
        <span className="text-fg-2">{phase}；通常需要 {running.kind === 'generate' ? '40～60' : '20～30'} 秒。舞台照常可以用</span>
      </span>
      <Button size="xs" variant="outline" onClick={() => cancelRun()} title="取消：停掉這次請求（Claude Code 也會停下來）">取消</Button>
    </div>
  );
}

// ---------- 修改卡 ----------
function PendingCard() {
  const p = useAgentRun((s) => s.pending);
  const canRetry = useAgentRun((s) => !!s.last) && useBridge().state === 'ok';
  const previewing = useStore((s) => s.hist.previewing);
  const comparing = useStore((s) => s.hist.comparing);
  useEffect(() => {
    if (!comparing) return;
    const up = () => compareOriginal(false);
    window.addEventListener('pointerup', up);
    window.addEventListener('blur', up);
    return () => {
      window.removeEventListener('pointerup', up);
      window.removeEventListener('blur', up);
    };
  }, [comparing]);
  if (!p || !previewing) return null;
  const over = p.frameMs > FRAME_BUDGET_MS;
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line-2 bg-panel-2 p-3">
      <div className="flex items-baseline justify-between">
        <span className="font-bold">{p.kind === 'generate' ? '生成結果' : '修改建議'}</span>
        <span className="text-[12px] text-fg-2">還沒套用</span>
      </div>
      <p className="leading-5"><Linkify text={p.summary} /></p>
      <div className="grid grid-cols-[80px_minmax(0,1fr)] gap-y-1 text-[12px] text-fg-2">
        {p.kind === 'modify' && (
          <>
            <span>動到的時間</span>
            <span className="num text-fg">{p.range ? <Linkify text={`${p.range[0].toFixed(1)}s – ${p.range[1].toFixed(1)}s`} /> : '整段'}</span>
            <span>改了幾個值</span>
            <span className="num text-fg">{p.changed}</span>
          </>
        )}
        <span>每幀耗時</span>
        <span className={`num ${over ? 'text-danger' : 'text-fg'}`}>{p.frameMs ? `${p.frameMs.toFixed(1)} ms　${over ? `超過 ${FRAME_BUDGET_MS} ms` : '合格'}` : '—'}</span>
        {p.ms > 0 && (
          <>
            <span>花了</span>
            <span className="num text-fg">{Math.round(p.ms / 1000)} 秒{p.retried ? '（格式不對，自動重問過一次）' : ''}</span>
          </>
        )}
      </div>
      <div className="mt-1 grid grid-cols-[1.3fr_1fr_1fr] gap-2">
        <Button variant="primary" onClick={() => acceptChange()} title="套用：接受這次的結果，變成一步可以復原的動作（Ctrl+Z 可以退回）">套用</Button>
        <button
          type="button"
          onPointerDown={(e) => { e.preventDefault(); compareOriginal(true); }}
          onKeyDown={(e) => e.key === 'Enter' && !e.repeat && compareOriginal(true)}
          onKeyUp={(e) => e.key === 'Enter' && compareOriginal(false)}
          title="比較：按住時舞台換回原本的，放開回到這次的結果（鍵盤：按住 Enter）"
          className={`h-9 select-none rounded-md text-[13px] ${comparing ? 'bg-mot-soft text-fg ring-1 ring-mot' : 'bg-raise text-fg hover:bg-line-2/70'}`}
        >
          {comparing ? '原本的' : '比較'}
        </button>
        <Button variant="outline" onClick={() => rejectChange()} title="放棄：不要這次的結果，舞台回到原本的">放棄</Button>
      </div>
      <div className="flex gap-2">
        {canRetry && (
          <Button size="xs" variant="ghost" onClick={() => retryLast()} title="再試一次：同樣的要求再送一次，換一個結果">
            <RefreshCw size={12} /> 再試一次
          </Button>
        )}
        {over && (
          <Button size="xs" variant="ghost" onClick={() => askSimplify()} title={`請 Agent 簡化：每幀超過 ${FRAME_BUDGET_MS} ms 會讓播放與導出變慢，請 Agent 在外觀不變的前提下減少圖層`}>
            請 Agent 簡化
          </Button>
        )}
      </div>
    </div>
  );
}

// ---------- 對話（生成的場景）：紀錄在捲動區，輸入框固定在面板底部 ----------
function ChatLog() {
  const chat = useStore((s) => s.chat);
  useStore((s) => s.themeRev);
  const theme = themes.current();
  return (
    <section className="flex flex-col gap-2" aria-label="和 Agent 的對話">
      {chat.length === 0 && (
        <p className="rounded-lg bg-panel-2 px-3 py-2 text-[12px] leading-[18px] text-fg-2">
          這是生成的內容{theme ? `「${theme.name}」` : ''}，可以用對話修改。播到不滿意的地方按「附上時間點」，再說要改什麼，例如「這裡煙太快，慢一半」。
        </p>
      )}
      {chat.map((m, i) =>
        m.role === 'user' ? (
          <div key={i} className="flex max-w-[92%] flex-col gap-1 self-end rounded-[12px_12px_2px_12px] bg-raise px-3 py-2">
            {m.stamps && <div className="flex flex-wrap gap-1">{m.stamps.map((s, j) => <StampChip key={j} t={s.t} label={s.label} />)}</div>}
            <span className="whitespace-pre-wrap leading-5">{m.text}</span>
          </div>
        ) : m.role === 'agent' ? (
          <div key={i} className="flex flex-col gap-1 text-fg">
            <span className="leading-5"><Linkify text={m.text} /></span>
            <span className="text-[12px] text-fg-3">{m.change === 'applied' ? '已套用' : m.change === 'discarded' ? '已放棄' : '還沒決定'}{m.ms ? `　${Math.round(m.ms / 1000)} 秒` : ''}</span>
          </div>
        ) : (
          <span key={i} className="text-[12px] text-fg-3">{m.text}</span>
        ),
      )}
    </section>
  );
}

function ChatInput({ connected }: { connected: boolean }) {
  const chat = useStore((s) => s.chat);
  const stamps = useStore((s) => s.stamps);
  const running = useAgentRun((s) => s.running);
  const [text, setText] = useState('');
  const [now, setNow] = useState(0);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [copied, setCopied] = useState<'idle' | 'ok' | 'fail'>('idle');
  useEffect(() => {
    const id = window.setInterval(() => {
      const L = themes.current()?.loop ?? 1;
      setNow(Math.round((((clock.t % L) + L) % L) * 10) / 10);
    }, 250);
    return () => window.clearInterval(id);
  }, []);
  const send = () => {
    const t = text.trim();
    if (!t || running) return;
    startModify(t);
    setText('');
  };
  const manualPrompt = useMemo(() => (connected || !text.trim() ? '' : buildModifyPrompt(text.trim(), stamps, chat)), [connected, text, stamps, chat]);
  const removeStamp = (i: number) => useStore.setState({ stamps: stamps.filter((_, j) => j !== i) });
  return (
    <div className="flex shrink-0 flex-col gap-1.5 rounded-xl border border-line-2 bg-panel-2 p-2">
      {/* 時間點那一列一直佔著位置（沒有時是一行說明），加標籤時輸入框不會長高 */}
      <div className="scroll-x hide-scrollbar flex h-6 flex-nowrap gap-1">
        {stamps.length ? stamps.map((s, i) => <StampChip key={i} t={s.t} label={s.label} onRemove={() => removeStamp(i)} />) : <span className="px-1 text-[12px] leading-6 text-fg-3">還沒有附時間點</span>}
      </div>
      <label htmlFor="agent-say" className="sr-only">對 Agent 說</label>
      <textarea
        id="agent-say"
        rows={2}
        value={text}
        maxLength={1000}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (connected && e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            send();
          }
        }}
        placeholder={connected ? '說說這段動畫要改哪裡（Enter 送出，Shift+Enter 換行）' : '寫下要改的地方，再按「複製提示詞」貼給任何 AI'}
        className="resize-none bg-transparent px-1 py-0.5 leading-5 outline-none placeholder:text-fg-3"
      />
      <div className="flex items-center gap-1.5">
        <button type="button" onClick={() => addStampNow()} className="flex h-8 shrink-0 items-center gap-1.5 rounded-md px-1.5 text-[12px] text-fg-2 hover:bg-raise hover:text-fg" title="附上時間點：把播放頭現在的時間變成一個標籤，Agent 會知道「這裡」指的是哪一刻">
          <span className="size-[7px] rotate-45 bg-fg-2" aria-hidden />
          附上 <span className="num inline-block w-[3.2em]">{fmt(now)}</span>
        </button>
        <span className="flex-1" />
        {connected ? (
          <button type="button" aria-label="送出" title="送出：把修改意見與時間點送給 Agent（約 20～30 秒）" disabled={!text.trim() || !!running} onClick={send} className="flex h-8 w-9 items-center justify-center rounded-md bg-raise text-fg disabled:opacity-40">
            <ArrowUp size={16} />
          </button>
        ) : (
          <>
            <Button
              size="sm"
              variant="soft"
              disabled={!manualPrompt}
              title="複製提示詞：整段（格式說明＋目前的動畫＋你的意見與時間點）複製起來，貼給任何 AI。先寫下要改的地方才能按"
              onClick={async () => {
                const ok = await copyText(manualPrompt);
                setCopied(ok ? 'ok' : 'fail');
                setTimeout(() => setCopied('idle'), 1600);
              }}
            >
              <Copy size={14} /> <span className="inline-block w-[4.5em] text-left">{copied === 'ok' ? '已複製' : copied === 'fail' ? '手動選取' : '複製提示詞'}</span>
            </Button>
            <Button size="sm" variant="outline" aria-expanded={pasteOpen} title="貼回：把 AI 的整段回覆貼進來，檢查後放上舞台預覽" onClick={() => setPasteOpen(!pasteOpen)}>
              <ClipboardPaste size={14} /> 貼回
            </Button>
          </>
        )}
      </div>
      {pasteOpen && (
        // 浮層蓋在對話上面，不推動版面
        <div className="absolute inset-x-0 bottom-0 z-20 rounded-xl border border-line-2 bg-panel p-2 shadow-[var(--shadow)]">
          <ManualBox prompt="" kind="modify" pasteOnly onDone={() => setPasteOpen(false)} />
        </div>
      )}
    </div>
  );
}

// ---------- 內建模板的內容欄位（α3 F9） ----------
function TemplateContent({ subject }: { subject: SubjectId }) {
  const ver = useStore((s) => s.subjectVer);
  const content = useStore((s) => s.content);
  const fields = fieldsFor(subject, ver);
  const setField = (key: string, value: string, def: string) => {
    const k = `${subject}.${key}`;
    const next = { ...useStore.getState().content };
    if (!value.trim() || value === def) delete next[k];
    else next[k] = value;
    useStore.setState({ content: next });
  };
  return (
    <div className="grid grid-cols-[56px_minmax(0,1fr)] items-center gap-x-2 gap-y-1.5">
      {fields.map((f) => {
        const id = `content-${subject}-${f.key}`;
        const v = content[`${subject}.${f.key}`] ?? '';
        return (
          <Fragment key={f.key}>
            <label htmlFor={id} className="text-fg-2" title={f.tip}>{f.label}</label>
            <input
              id={id}
              value={v}
              placeholder={f.def}
              maxLength={f.max * 2}
              title={`${f.tip}。空著就用預設的「${f.def.trim()}」`}
              onFocus={() => beginGesture()}
              onBlur={() => endGesture()}
              onChange={(e) => setField(f.key, Array.from(e.target.value).slice(0, f.max).join(''), f.def)}
              className="h-8 min-w-0 rounded-md border border-line-2 bg-panel px-2 text-[13px] text-fg outline-none placeholder:text-fg-3 focus:border-mot"
            />
          </Fragment>
        );
      })}
    </div>
  );
}
