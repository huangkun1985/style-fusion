// 2.0 版式的新區塊：場景帶、右側面板（Agent｜調整｜聲音｜規格）、手機底部列。Agent 面板本身在 AgentPanel.tsx。
import { ChevronLeft, ChevronRight, Dices, Download, LayoutGrid } from 'lucide-react';
import { useStore, type RightTab } from '../store/store';
import { AgentPanel, AgentStatus } from './AgentPanel';
import { InfoPanel } from './InfoPanel';
import { IconBtn } from './ui';

// 場景帶在 SceneStrip.tsx（α3 多場景）
export { SceneStrip } from './SceneStrip';

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

// ---------- 手機底部列（高 64） ----------
export function MobileBar() {
  const set = useStore((s) => s.set);
  const randomize = useStore((s) => s.randomize);
  const b = 'flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl text-[14px]';
  return (
    <nav aria-label="常用動作" className="flex h-16 shrink-0 items-center gap-2 border-t border-line bg-panel px-4">
      <button type="button" className={`${b} border border-line-2 text-fg`} title="風格：打開風格牆，一次看 9 種風格，點一格就套用" onClick={() => set({ wall: !useStore.getState().wall })}>
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
