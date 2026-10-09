// 混合托盤：目前混合的圖像／動效風格，權重、主風格、鎖定、移除。
import { Crown, Dices, Lock, LockOpen, X } from 'lucide-react';
import type { CSSProperties } from 'react';
import { MOTION_MAP } from '../data/motion';
import type { Sel } from '../data/schema';
import { VISUAL_MAP } from '../data/visual';
import { harmony } from '../lib/brief';
import { useStore, type Kind } from '../store/store';
import { Button, Kf } from './ui';

export function MixTray() {
  const v = useStore((s) => s.v);
  const m = useStore((s) => s.m);
  const randomize = useStore((s) => s.randomize);
  const clear = useStore((s) => s.clear);
  const set = useStore((s) => s.set);
  const musicLocked = useStore((s) => s.locked.includes('a:music'));
  const subjectLocked = useStore((s) => s.locked.includes('s:subject'));
  const toggleLock = useStore((s) => s.toggleLock);
  const h = harmony(v, m);
  return (
    <section aria-label="目前混合" className="rounded-xl border border-line bg-panel p-2.5">
      {/* 標題列永遠只有一行：按鈕組固定在右邊、不換行，靈感骰子的位置才不會跳；空間不夠時是左邊的搭配度被壓縮，窄螢幕則縮短按鈕文字 */}
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="shrink-0 font-display text-[15px] font-bold tracking-tight">混合配方</h2>
          <div className="hidden min-w-0 overflow-hidden whitespace-nowrap sm:block">
            <Harmony score={h.score} label={h.label} tone={h.tone} />
          </div>
        </div>
        <div className="flex shrink-0 whitespace-nowrap gap-1">
          <Button size="xs" variant="ghost" onClick={() => set({ starterOpen: true })} title="從不同主題的完整案例重新開始">
            <span className="sm:hidden">起點</span>
            <span className="hidden sm:inline">換個起點</span>
          </Button>
          <Button size="xs" variant="ghost" onClick={() => clear()}>
            清空
          </Button>
          <Button size="xs" variant="ghost" onClick={() => toggleLock('s', 'subject')} title={subjectLocked ? '主體已鎖定：靈感骰子不會換主體（點一下解除）' : '鎖定主體（角色跳躍、UI、文字…）：靈感骰子不換主體'} aria-pressed={subjectLocked}>
            {subjectLocked ? <Lock size={13} /> : <LockOpen size={13} />} <span className="hidden sm:inline">主體</span>
          </Button>
          <Button size="xs" variant="ghost" onClick={() => toggleLock('a', 'music')} title={musicLocked ? '音樂已鎖定：靈感骰子只換風格，不換音樂（點一下解除）' : '鎖定音樂：靈感骰子只換風格，不換音樂'} aria-pressed={musicLocked}>
            {musicLocked ? <Lock size={13} /> : <LockOpen size={13} />} <span className="hidden sm:inline">音樂</span>
          </Button>
          <Button size="xs" variant="outline" onClick={randomize} title="全部隨機抽卡：風格、動效、主體（UI、跳躍、文字…）、微調參數與音樂；鎖定的會保留 · 快捷鍵 R">
            <Dices size={14} /> 靈感骰子
          </Button>
        </div>
      </div>
      <Row kind="v" list={v} />
      <div className="my-1.5 h-px bg-line" />
      <Row kind="m" list={m} />
    </section>
  );
}

function Harmony({ score, label, tone }: { score: number; label: string; tone: 'good' | 'mid' | 'wild' | 'idle' }) {
  if (score < 0) return <span className="text-[11px] text-fg-3">{label}</span>;
  const color = tone === 'good' ? 'var(--ok)' : tone === 'mid' ? 'var(--mot)' : 'var(--danger)';
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-fg-2" title={label}>
      <span className="relative h-1.5 w-14 overflow-hidden rounded-full bg-line-2">
        <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${score}%`, background: color }} />
      </span>
      <span className="num" style={{ color }}>
        搭配度 {score}
      </span>
      <span className="hidden text-fg-3 xl:inline">· {label.split('：')[0]}</span>
    </span>
  );
}

function Row({ kind, list }: { kind: Kind; list: Sel[] }) {
  const label = kind === 'v' ? '圖像' : '動效';
  const set = useStore((s) => s.set);
  return (
    <div className="flex items-start gap-2">
      <div className="flex w-12 shrink-0 items-center gap-1.5 pt-1.5 text-xs font-semibold" style={{ color: kind === 'v' ? 'var(--vis)' : 'var(--mot)' }}>
        <Kf kind={kind} />
        {label}
      </div>
      <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
        {list.length === 0 && (
          <button type="button" className="rounded-md border border-dashed border-line-2 px-2.5 py-1 text-xs text-fg-3 hover:text-fg" onClick={() => set({ browserKind: kind, mobileTab: 'styles' })}>
            ＋ 從風格庫加入{label}風格
          </button>
        )}
        {list.map((x, i) => (
          <Chip key={x.id} kind={kind} sel={x} first={i === 0} />
        ))}
      </div>
    </div>
  );
}

function Chip({ kind, sel, first }: { kind: Kind; sel: Sel; first: boolean }) {
  const st = kind === 'v' ? VISUAL_MAP[sel.id] : MOTION_MAP[sel.id];
  const setWeight = useStore((s) => s.setWeight);
  const remove = useStore((s) => s.remove);
  const promote = useStore((s) => s.promote);
  const toggleLock = useStore((s) => s.toggleLock);
  const locked = useStore((s) => s.locked.includes(`${kind}:${sel.id}`));
  const set = useStore((s) => s.set);
  if (!st) return null;
  const pct = Math.round(sel.w * 100);
  const tone = kind === 'v' ? 'vis' : 'mot';
  return (
    <div className={`group flex items-center gap-1 rounded-lg border bg-panel-2 py-0.5 pl-1.5 pr-0.5 ${first ? (kind === 'v' ? 'border-vis/50' : 'border-mot/50') : 'border-line'}`}>
      <button
        type="button"
        onClick={() => (first ? set({ detail: { kind, id: sel.id } }) : promote(kind, sel.id))}
        title={first ? '主風格：決定填色、背景、字體等類別參數（點擊看詳情）' : '設為主風格'}
        className={`flex size-5 items-center justify-center rounded ${first ? '' : 'opacity-35 hover:opacity-100'}`}
        style={{ color: kind === 'v' ? 'var(--vis)' : 'var(--mot)' }}
      >
        <Crown size={13} />
      </button>
      <button type="button" className="max-w-[10em] shrink-0 truncate text-[13px] hover:underline" onClick={() => set({ detail: { kind, id: sel.id } })}>
        {st.name}
      </button>
      <input
        id={`w-${kind}-${sel.id}`}
        aria-label={`${st.name} 強度`}
        type="range"
        min={0.05}
        max={1.5}
        step={0.05}
        value={sel.w}
        onChange={(e) => setWeight(kind, sel.id, parseFloat(e.target.value))}
        className={`sf-range ${tone} w-16`}
        style={{ '--p': `${((sel.w - 0.05) / 1.45) * 100}%` } as CSSProperties}
      />
      <span className="num w-8 text-right text-[11px] text-fg-3">{pct}%</span>
      <button type="button" title={locked ? '已鎖定：靈感骰子不會換掉它' : '鎖定（靈感骰子保留）'} onClick={() => toggleLock(kind, sel.id)} className={`flex size-6 items-center justify-center rounded ${locked ? 'text-fg' : 'text-fg-3 opacity-60 hover:opacity-100'}`}>
        {locked ? <Lock size={12} /> : <LockOpen size={12} />}
      </button>
      <button type="button" aria-label={`移除 ${st.name}`} onClick={() => remove(kind, sel.id)} className="flex size-6 items-center justify-center rounded text-fg-3 hover:bg-raise hover:text-fg">
        <X size={13} />
      </button>
    </div>
  );
}
