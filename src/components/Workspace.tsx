// 2.0 版式的新區塊：場景帶、右側面板（Agent｜調整｜聲音｜規格）、Agent 手動模式、手機底部列。
import { ChevronLeft, ChevronRight, ClipboardPaste, Copy, Dices, Download, LayoutGrid, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { loopSeconds } from '../engine/renderer';
import { SUBJECTS } from '../engine/subjects';
import { themes } from '../engine/themes';
import { agentPrompt, demoTopic, extractThemeJson, recipeById, templateLine } from '../lib/agentPrompt';
import { copyText } from '../lib/platform';
import { mixSpec, useLookMove } from '../store/hooks';
import { useStore, type RightTab } from '../store/store';
import { InfoPanel } from './InfoPanel';
import { Thumb } from './Thumb';
import { Button, IconBtn } from './ui';

// ---------- 場景帶（高 64） ----------
export function SceneStrip() {
  const { move, tune, v, m } = useLookMove();
  const subject = useStore((s) => s.subject);
  const scenes = useStore((s) => s.scenes);
  const active = useStore((s) => s.activeScene);
  useStore((s) => s.themeRev);
  const L = loopSeconds(SUBJECTS[subject], move, tune);
  const idx = Math.max(0, scenes.findIndex((s) => s.id === active));
  const sc = scenes[idx];
  const generated = subject === 'custom';
  const key = `${v.map((x) => x.id + x.w).join()}|${m.map((x) => x.id + x.w).join()}|${subject}|${JSON.stringify(tune)}|${themes.rev()}`;
  return (
    <div className="flex h-16 shrink-0 gap-1" aria-label="場景帶">
      <div
        className="flex min-w-0 flex-[0_1_420px] items-center gap-2.5 overflow-hidden rounded-xl border-[1.5px] border-mot bg-mot-soft px-2.5"
        title={`場景 ${idx + 1}：${generated ? '生成的內容（匯入或 Agent 做的動畫；α2 起可以用對話修改）' : '內建模板（換風格、換動效；內容由程式畫，不能用對話修改）'}。一個專案可以有多個場景，排成一支片子`}
      >
        <span className="relative h-10 w-[60px] shrink-0 overflow-hidden rounded-md bg-stage">
          <Thumb spec={() => mixSpec(v, m, subject, tune)} specKey={key} className="size-full" />
        </span>
        <span className="flex min-w-0 flex-col leading-[18px]">
          <span className="flex min-w-0 items-center gap-1.5 text-[13px] text-fg">
            <span className="truncate">
              {idx + 1} {SUBJECTS[subject].name}
            </span>
            <span className={`shrink-0 rounded px-1.5 text-[12px] ${generated ? 'bg-mot font-bold text-on-mot' : 'border border-line-2 text-fg-2'}`}>{generated ? '生成' : '模板'}</span>
          </span>
          <span className="num text-[12px] text-fg-2">
            {L.toFixed(1)}s{sc && sc.name !== `場景 ${idx + 1}` ? `　${sc.name}` : ''}
          </span>
        </span>
      </div>
      <div
        className="flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl border border-dashed border-line-2 px-3 text-[12px] text-fg-3"
        title="加場景：把幾段動畫排成一支片子。多場景排片在 2.0 α3 開放；現在一個專案先只有一個場景"
      >
        <Plus size={14} className="shrink-0" />
        <span className="truncate">加一個場景，排成一支片子（下一階段開放）</span>
      </div>
    </div>
  );
}

// ---------- 右側面板 ----------
const TABS: { id: RightTab; label: string; tip: string }[] = [
  { id: 'agent', label: 'Agent', tip: 'Agent：選風格模板、寫一句主題，生成自己的動畫。想做自己的內容時用' },
  { id: 'tune', label: '調整', tip: '調整：速度、循環長度、線條、後期強度、自訂色板。要細調畫面時用' },
  { id: 'sound', label: '聲音', tip: '聲音：曲風、聲音方案、名曲、配樂模式、音效。要配音樂或導出聲音時用' },
  { id: 'spec', label: '規格', tip: '規格：處方（色板、緩動、節奏）、CSS／GSAP／AE 代碼、AI 提示詞。要交付給工程師或 AI 時用' },
];

export function RightPanel({ advanced, collapsible = true }: { advanced: boolean; collapsible?: boolean }) {
  const tab = useStore((s) => s.rightTab);
  const set = useStore((s) => s.set);
  const collapsed = useStore((s) => s.panelCollapsed) && collapsible;
  const cur: RightTab = advanced ? tab : 'agent';
  if (collapsed) {
    return (
      <aside aria-label="右側面板（已收起）" className="flex min-h-0 flex-col items-center gap-2 rounded-xl border border-line bg-panel py-2">
        <IconBtn label="展開右側面板：Agent、調整、聲音、規格" onClick={() => set({ panelCollapsed: false })}>
          <ChevronLeft size={16} />
        </IconBtn>
        <span className="text-[12px] text-fg-2 [writing-mode:vertical-rl]">{advanced ? TABS.find((t) => t.id === cur)?.label : 'Agent'}</span>
      </aside>
    );
  }
  return (
    <aside aria-label="右側面板" className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-line bg-panel">
      <div className="flex h-11 shrink-0 items-center gap-1 border-b border-line pl-2 pr-1.5">
        {advanced ? (
          <div role="tablist" className="flex min-w-0 flex-1 gap-0.5">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={cur === t.id}
                title={t.tip}
                onClick={() => set({ rightTab: t.id })}
                className={`h-8 flex-1 rounded-md text-[13px] transition-colors ${cur === t.id ? 'bg-raise font-semibold text-fg' : 'text-fg-2 hover:text-fg'}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-2 pl-1.5">
            <span className="text-[14px] font-bold">Agent</span>
            <AgentStatus />
          </div>
        )}
        {collapsible && (
          <IconBtn label="收起右側面板：讓舞台變寬。給客戶看畫面時用" onClick={() => set({ panelCollapsed: true })}>
            <ChevronRight size={16} />
          </IconBtn>
        )}
      </div>
      <div className="flex min-h-0 flex-1 flex-col p-3">
        {cur === 'agent' && <AgentPanel showStatus={advanced} />}
        {cur === 'tune' && <InfoPanel tab="tune" />}
        {cur === 'sound' && <InfoPanel tab="sound" />}
        {cur === 'spec' && <InfoPanel only={['brief', 'code', 'prompt']} />}
      </div>
    </aside>
  );
}

function AgentStatus() {
  return (
    <span className="flex items-center gap-1.5 text-[12px] text-fg-2" title="手動模式：這一版還沒連上你電腦上的 Claude（下一階段 α2 會接上 start.bat 的本機橋接）。現在用複製提示詞、貼回回答的方式，流程一樣">
      <span className="size-2 rounded-full bg-fg-3" aria-hidden />
      手動模式
    </span>
  );
}

// ---------- Agent（手動模式） ----------
export function AgentPanel({ showStatus }: { showStatus?: boolean }) {
  const agent = useStore((s) => s.agent);
  const setAgent = useStore((s) => s.setAgent);
  const set = useStore((s) => s.set);
  const showToast = useStore((s) => s.showToast);
  const subject = useStore((s) => s.subject);
  const r = recipeById(agent.template);
  const [specOpen, setSpecOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [paste, setPaste] = useState('');
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState<'idle' | 'ok' | 'fail'>('idle');
  const prompt = useMemo(() => agentPrompt(agent), [agent]);
  const spec = useMemo(() => prompt.slice(prompt.indexOf('【風格規格】'), prompt.indexOf('【這次要做的】')).trim(), [prompt]);
  const tv = r.v.map(([id, w]) => ({ id, w }));
  const tm = r.m.map(([id, w]) => ({ id, w }));
  const applyAnswer = () => {
    try {
      const wasCustom = useStore.getState().subject === 'custom';
      const { theme } = themes.add(extractThemeJson(paste));
      set({ subject: 'custom' });
      setErr('');
      setPaste('');
      setPasteOpen(false);
      showToast(`已放上舞台：「${theme.name}」${theme.warnings.length ? `（${theme.warnings.length} 個提醒，見「匯入主題」視窗）` : ''}${wasCustom ? '；之前的動畫在進階模式「匯入主題」裡可以切回' : '；不滿意可以按 Ctrl+Z 回到原本的模板'}`);
    } catch (e) {
      setErr(`格式不對：${(e as Error).message.split('\n')[0]}。請 AI 照提示詞的格式重新輸出。`);
    }
  };
  return (
    <div className="scroll-y gutter-stable relative -mr-1 flex min-h-0 flex-1 flex-col gap-3 pr-1 text-[13px]">
      {showStatus && <AgentStatus />}
      <p className="rounded-lg bg-panel-2 px-3 py-2 text-[12px] leading-[18px] text-fg-2">
        下一版用 start.bat 開啟並登入 Claude Code，就能直接生成。現在用手動的方式，流程一樣：選風格模板 → 改主題 → 複製提示詞給任何 AI → 把回答貼回來。
      </p>

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
          <div className="flex items-center gap-2">
            <label htmlFor="agent-sec" className="text-[12px] text-fg-2">
              長度
            </label>
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
        <h3 className="font-bold">③ 交給 AI，再貼回來</h3>
        <Button
          variant="soft"
          className="w-full"
          title="複製提示詞：整段（格式說明＋風格規格＋你的主題）複製到剪貼簿，貼給 Claude、ChatGPT 或任何 AI"
          onClick={async () => {
            const ok = await copyText(prompt);
            setCopied(ok ? 'ok' : 'fail');
            setTimeout(() => setCopied('idle'), 1600);
          }}
        >
          <Copy size={15} />
          <span className="inline-block w-[7em] text-left">{copied === 'ok' ? '已複製' : copied === 'fail' ? '請手動選取' : '複製提示詞'}</span>
        </Button>
        <Button variant="outline" className="w-full border-dashed" aria-expanded={pasteOpen} title="貼上 AI 的回答：把 AI 回覆的整段文字貼進來，App 會取出動畫檔、檢查格式、放上舞台" onClick={() => setPasteOpen(!pasteOpen)}>
          <ClipboardPaste size={15} />
          <span className="inline-block w-[7em] text-left">貼上 AI 的回答</span>
        </Button>
        {pasteOpen && (
          <div className="flex flex-col gap-2">
            <label htmlFor="agent-paste" className="sr-only">
              AI 的回答
            </label>
            <textarea
              id="agent-paste"
              rows={5}
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              placeholder="把 AI 的整段回答貼在這裡（裡面要有 ```json 區塊）"
              className="resize-y rounded-md border border-line-2 bg-panel-2 px-2 py-1.5 text-[12px] leading-[18px] outline-none focus:border-mot"
            />
            <Button variant="primary" disabled={!paste.trim()} onClick={applyAnswer} title="放上舞台：檢查格式後變成這個場景的內容（生成）。可以 Ctrl+Z 退回">
              放上舞台
            </Button>
          </div>
        )}
        <span className="min-h-[18px] text-[12px] leading-[18px] text-danger" role="alert">
          {err}
        </span>
      </section>

      <p className="mt-auto text-[12px] leading-[18px] text-fg-3">
        {subject === 'custom' ? '這個場景是生成的內容。' : `這個場景是內建模板「${SUBJECTS[subject].name}」；貼回的動畫會取代它成為生成的內容。`}
        手動模式下 App 不會把任何東西送出去；提示詞是你自己貼給 AI 的。
      </p>
    </div>
  );
}

// ---------- 手機底部列（高 64） ----------
export function MobileBar() {
  const set = useStore((s) => s.set);
  const randomize = useStore((s) => s.randomize);
  const b = 'flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl text-[14px]';
  return (
    <nav aria-label="常用動作" className="flex h-16 shrink-0 items-center gap-2 border-t border-line bg-panel px-4">
      <button type="button" className={`${b} border border-line-2 text-fg`} title="風格：挑一組風格套上" onClick={() => set({ starterOpen: true, starterFor: 'start' })}>
        <LayoutGrid size={16} /> 風格
      </button>
      <button type="button" className={`${b} border border-line-2 text-fg`} title="重抽：風格、動效、主體、音樂一起隨機；不喜歡按復原退回" onClick={() => randomize()}>
        <Dices size={16} /> 重抽
      </button>
      <button type="button" className={`${b} bg-accent font-semibold text-accent-fg`} title="導出：影片、GIF、圖片、音樂" onClick={() => set({ exportOpen: true })}>
        <Download size={16} /> 導出
      </button>
    </nav>
  );
}
