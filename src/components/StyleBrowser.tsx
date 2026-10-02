// 左側風格庫：圖像／動效分頁、搜尋、分類、即時縮圖卡片（三種縮圖模式）。
import { Check, ChevronDown, Info, Search } from 'lucide-react';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { MCATS, VCATS } from '../data/categories';
import { MOTION } from '../data/motion';
import type { MotionStyle, VisualStyle } from '../data/schema';
import { VISUAL } from '../data/visual';
import { is3D } from '../engine/types';
import { suggestions } from '../lib/brief';
import { styleSpec, type ThumbMode } from '../store/hooks';
import { useStore, type Kind } from '../store/store';
import { Thumb } from './Thumb';
import { Segmented } from './ui';

type Style = VisualStyle | MotionStyle;

export function matchStyle(s: Style, q: string) {
  if (!q) return true;
  const t = q.toLowerCase();
  return s.name.toLowerCase().includes(t) || s.en.toLowerCase().includes(t) || s.desc.includes(q) || s.kw.toLowerCase().includes(t) || s.id.includes(t);
}

export function StyleBrowser({ cols = 2 }: { cols?: number }) {
  const kind = useStore((s) => s.browserKind);
  const cat = useStore((s) => s.browserCat);
  const search = useStore((s) => s.search);
  const set = useStore((s) => s.set);
  const v = useStore((s) => s.v);
  const m = useStore((s) => s.m);
  const [mode, setMode] = useState<ThumbMode>('solo');
  const [catOpen, setCatOpen] = useState(false);
  const stripRef = useRef<HTMLDivElement>(null);
  // 收合時，讓目前選中的分類捲到看得見的位置
  useEffect(() => {
    const el = stripRef.current?.querySelector('[aria-pressed="true"]');
    if (el && !catOpen) (el as HTMLElement).scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [cat, kind, catOpen]);
  const q = useDeferredValue(search.trim());
  const cats = kind === 'v' ? VCATS : MCATS;
  const all: Style[] = kind === 'v' ? VISUAL : MOTION;
  const sug = useMemo(() => suggestions(v, m, 10), [v, m]);
  const list = useMemo(() => {
    if (cat === 'rec') return kind === 'v' ? sug.visual : sug.motion;
    return all.filter((s) => (cat === 'all' || s.cat === cat) && matchStyle(s, q));
  }, [all, cat, q, kind, sug]);
  const hasRec = (kind === 'v' ? sug.visual : sug.motion).length > 0;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex items-center gap-2">
        <Segmented
          id="browser-kind"
          value={kind}
          onChange={(k: Kind) => set({ browserKind: k, browserCat: 'all' })}
          className="flex-1 [&>button]:flex-1"
          options={[
            { value: 'v', label: `圖像風格 ${VISUAL.length}` },
            { value: 'm', label: `動效風格 ${MOTION.length}` },
          ]}
        />
      </div>
      <label className="flex items-center gap-2 rounded-lg border border-line bg-panel-2 px-2.5 focus-within:border-line-2">
        <Search size={15} className="text-fg-3" />
        <input
          id="style-search"
          value={search}
          onChange={(e) => set({ search: e.target.value, browserCat: 'all' })}
          placeholder="搜尋：像素、glitch、彈簧、水墨…"
          className="h-8 min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-fg-3"
        />
      </label>
      <div className="flex items-start gap-1">
        <div ref={stripRef} className={`min-w-0 flex-1 gap-1 ${catOpen ? 'flex flex-wrap' : 'scroll-x hide-scrollbar flex flex-nowrap'}`} role="group" aria-label="風格分類">
          <CatChip on={cat === 'all'} onClick={() => set({ browserCat: 'all' })} label="全部" n={all.length} />
          {hasRec && <CatChip on={cat === 'rec'} onClick={() => set({ browserCat: 'rec', search: '' })} label="✦ 推薦搭配" accent />}
          {cats.map((c) => (
            <CatChip key={c.id} on={cat === c.id} onClick={() => set({ browserCat: c.id, search: '' })} label={c.name} n={all.filter((s) => s.cat === c.id).length} accent3d={c.id === 'dim3d' || c.id === 'cam3d'} />
          ))}
        </div>
        <button
          type="button"
          aria-expanded={catOpen}
          aria-label={catOpen ? '收合分類' : '展開全部分類'}
          title={catOpen ? '收合分類，讓縮圖有更多空間' : '展開全部分類'}
          onClick={() => setCatOpen(!catOpen)}
          className="flex size-7 shrink-0 items-center justify-center rounded-md bg-panel-2 text-fg-2 hover:text-fg"
        >
          <ChevronDown size={15} className={catOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
        </button>
      </div>
      <Segmented
        id="thumb-mode"
        size="sm"
        value={mode}
        onChange={setMode}
        className="w-full [&>button]:flex-1"
        options={[
          { value: 'solo', label: '示範', title: '縮圖：每個風格單獨套在最適合它的主體上' },
          { value: 'subject', label: '目前主體', title: '縮圖：套在你目前選的主體上' },
          { value: 'stack', label: '疊加預覽', title: '縮圖：預覽「加入目前混合」後的樣子' },
        ]}
      />
      <ReducedMotionNote />
      <div className="scroll-y -mr-1 min-h-0 flex-1 pr-1">
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {list.map((s) => (
            <StyleCard key={s.id} kind={kind} s={s} mode={mode} />
          ))}
        </div>
        {list.length === 0 && <p className="py-8 text-center text-sm text-fg-3">找不到符合「{search}」的風格，換個關鍵字試試。</p>}
      </div>
    </div>
  );
}

function ReducedMotionNote() {
  const override = useStore((s) => s.motionOverride);
  const set = useStore((s) => s.set);
  const reduce = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduce || override) return null;
  return (
    <div className="flex items-center justify-between gap-2 rounded-md bg-mot-soft px-2 py-1 text-[11px] text-fg-2">
      <span className="truncate">已依系統設定停用縮圖動畫</span>
      <button type="button" className="shrink-0 font-semibold text-mot underline" onClick={() => set({ motionOverride: true })}>
        播放縮圖
      </button>
    </div>
  );
}

function CatChip({ on, onClick, label, n, accent, accent3d }: { on: boolean; onClick: () => void; label: string; n?: number; accent?: boolean; accent3d?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`shrink-0 whitespace-nowrap rounded-md px-2 py-1 text-xs transition-colors ${on ? 'bg-fg text-bg' : accent ? 'bg-mot-soft text-mot hover:brightness-110' : accent3d ? 'bg-vis-soft text-vis hover:brightness-110' : 'bg-panel-2 text-fg-2 hover:text-fg'}`}
    >
      {label}
      {n !== undefined && <span className={`num ml-1 ${on ? 'opacity-60' : 'text-fg-3'}`}>{n}</span>}
    </button>
  );
}

/** 是否為真 3D 風格（有 3D 材質，或示範主體是 3D） */
export function is3dStyle(kind: Kind, s: Style): boolean {
  if (kind === 'm') return (s as MotionStyle).cat === 'cam3d';
  const v = s as VisualStyle;
  return (v.look.mat3d ?? 'auto') !== 'auto' || (!!v.demo && is3D(v.demo));
}

export function StyleCard({ kind, s, mode, big }: { kind: Kind; s: Style; mode: ThumbMode; big?: boolean }) {
  const sel = useStore((st) => st[kind].find((x) => x.id === s.id));
  const toggle = useStore((st) => st.toggle);
  const set = useStore((st) => st.set);
  const subject = useStore((st) => st.subject);
  const v = useStore((st) => st.v);
  const m = useStore((st) => st.m);
  const tune = useStore((st) => st.tune);
  const tone = kind === 'v' ? 'var(--vis)' : 'var(--mot)';
  const specKey = `${mode}|${subject}|${mode === 'stack' ? JSON.stringify([v, m, tune]) : ''}`;
  return (
    <div
      className={`group relative overflow-hidden rounded-lg border bg-panel-2 transition-colors ${sel ? '' : 'border-line hover:border-line-2'}`}
      style={sel ? { borderColor: tone, boxShadow: `0 0 0 1px ${tone}` } : undefined}
    >
      <button type="button" aria-pressed={!!sel} onClick={() => toggle(kind, s.id)} className="block w-full text-left" title={`${s.desc}\n（點擊${sel ? '移出' : '加入'}混合）`}>
        <div className="relative aspect-[16/10] w-full bg-stage">
          <Thumb spec={() => styleSpec(kind, s.id, mode, { v, m, subject, tune })} specKey={specKey} />
          {is3dStyle(kind, s) && <span className="pointer-events-none absolute bottom-1 right-1 rounded bg-black/60 px-1 text-[10px] font-bold tracking-wider text-white">3D</span>}
        </div>
        <div className={big ? 'p-3' : 'px-2 py-1.5'}>
          <div className={`truncate font-medium ${big ? 'text-[15px]' : 'text-[13px]'}`}>{s.name}</div>
          <div className="truncate text-[11px] text-fg-3">{s.en}</div>
          {big && <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-fg-2">{s.desc}</p>}
        </div>
      </button>
      {sel && (
        <span className="num absolute left-1.5 top-1.5 flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: tone, color: '#111' }}>
          <Check size={11} strokeWidth={3} />
          {Math.round(sel.w * 100)}%
        </span>
      )}
      <button
        type="button"
        aria-label={`${s.name} 詳情`}
        title="詳情"
        onClick={() => set({ detail: { kind, id: s.id } })}
        className="absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-md bg-black/55 text-white opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100"
      >
        <Info size={13} />
      </button>
    </div>
  );
}
