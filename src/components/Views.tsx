// 風格圖鑑、案例配方、我的收藏
import { Pencil, Play, Search, Trash, Upload } from 'lucide-react';
import { useDeferredValue, useMemo, useState } from 'react';
import { MCATS, VCATS } from '../data/categories';
import { MOTION, MOTION_MAP } from '../data/motion';
import { RECIPES, USE_TAGS } from '../data/recipes';
import type { MotionStyle, Recipe, Sel, VisualStyle } from '../data/schema';
import { VISUAL, VISUAL_MAP } from '../data/visual';
import { SUBJECTS } from '../engine/subjects';
import type { SubjectId, Tune } from '../engine/types';
import { harmony } from '../lib/brief';
import { mixSpec } from '../store/hooks';
import { useStore, type Kind } from '../store/store';
import { matchStyle, StyleCard } from './StyleBrowser';
import { Thumb } from './Thumb';
import { Button, Kf, Segmented } from './ui';

export function LibraryView() {
  const kind = useStore((s) => s.browserKind);
  const set = useStore((s) => s.set);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('all');
  const dq = useDeferredValue(q.trim());
  const cats = kind === 'v' ? VCATS : MCATS;
  const all: (VisualStyle | MotionStyle)[] = kind === 'v' ? VISUAL : MOTION;
  const groups = useMemo(
    () =>
      cats
        .filter((c) => cat === 'all' || c.id === cat)
        .map((c) => ({ c, items: all.filter((s) => s.cat === c.id && matchStyle(s, dq)) }))
        .filter((g) => g.items.length),
    [cats, all, cat, dq],
  );
  return (
    <div className="scroll-y h-full">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-4 px-4 py-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="max-w-2xl">
            <h1 className="font-display text-2xl font-extrabold tracking-tight">風格圖鑑</h1>
            <p className="mt-1 text-sm leading-relaxed text-fg-2">
              {VISUAL.length} 種圖像風格、{MOTION.length} 種動效風格，每一張示例都由程式即時渲染。點卡片加入混合，點 ⓘ 看詳細說明、要點與 AE 表達式。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              id="lib-kind"
              value={kind}
              onChange={(k: Kind) => {
                set({ browserKind: k });
                setCat('all');
              }}
              options={[
                { value: 'v', label: `圖像風格 ${VISUAL.length}` },
                { value: 'm', label: `動效風格 ${MOTION.length}` },
              ]}
            />
            <label className="flex items-center gap-2 rounded-lg border border-line bg-panel-2 px-2.5">
              <Search size={15} className="text-fg-3" />
              <input id="lib-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜尋風格" className="h-8 w-40 bg-transparent text-[13px] outline-none placeholder:text-fg-3" />
            </label>
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          <button type="button" onClick={() => setCat('all')} className={`rounded-md px-2.5 py-1 text-xs ${cat === 'all' ? 'bg-fg text-bg' : 'bg-panel-2 text-fg-2 hover:text-fg'}`}>
            全部分類
          </button>
          {cats.map((c) => (
            <button key={c.id} type="button" onClick={() => setCat(c.id)} className={`rounded-md px-2.5 py-1 text-xs ${cat === c.id ? 'bg-fg text-bg' : 'bg-panel-2 text-fg-2 hover:text-fg'}`}>
              {c.name}
            </button>
          ))}
        </div>
        {groups.map(({ c, items }) => (
          <section key={c.id} aria-labelledby={`g-${c.id}`}>
            <h2 id={`g-${c.id}`} className="mb-2 flex items-baseline gap-2">
              <span className="text-[15px] font-bold">{c.name}</span>
              <span className="text-xs text-fg-3">{c.en}</span>
              <span className="num text-xs text-fg-3">· {items.length}</span>
            </h2>
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 220px), 1fr))' }}>
              {items.map((s) => (
                <StyleCard key={s.id} kind={kind} s={s} mode="solo" big />
              ))}
            </div>
          </section>
        ))}
        {groups.length === 0 && <p className="py-10 text-center text-sm text-fg-3">沒有符合的風格。</p>}
      </div>
    </div>
  );
}

function SelChips({ v, m }: { v: Sel[]; m: Sel[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {v.map((x) => (
        <span key={x.id} className="flex items-center gap-1 rounded bg-vis-soft px-1.5 py-0.5 text-[11px] text-vis">
          <Kf kind="v" />
          {VISUAL_MAP[x.id]?.name}
        </span>
      ))}
      {m.map((x) => (
        <span key={x.id} className="flex items-center gap-1 rounded bg-mot-soft px-1.5 py-0.5 text-[11px] text-mot">
          <Kf kind="m" />
          {MOTION_MAP[x.id]?.name}
        </span>
      ))}
    </div>
  );
}

function RecipeCard({ r }: { r: Recipe }) {
  const apply = useStore((s) => s.applyRecipe);
  const v = useMemo(() => r.v.map(([id, w]) => ({ id, w })), [r]);
  const m = useMemo(() => r.m.map(([id, w]) => ({ id, w })), [r]);
  const h = harmony(v, m);
  return (
    <article className="group flex flex-col overflow-hidden rounded-xl border border-line bg-panel-2">
      <button type="button" onClick={() => apply(r)} className="relative block aspect-[16/10] w-full bg-stage" title="套用到混合器">
        <Thumb spec={() => mixSpec(v, m, r.subject)} specKey={r.id} />
        <span className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all group-hover:bg-black/30 group-hover:opacity-100">
          <span className="flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-sm font-semibold text-accent-fg">
            <Play size={14} /> 套用
          </span>
        </span>
      </button>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-[15px] font-bold leading-snug">{r.name}</h3>
          {h.score >= 0 && <span className="num shrink-0 text-[11px] text-fg-3">搭配度 {h.score}</span>}
        </div>
        <p className="text-[13px] leading-relaxed text-fg-2">{r.desc}</p>
        <SelChips v={v} m={m} />
        <div className="mt-auto flex flex-wrap items-center gap-1 pt-1 text-[11px] text-fg-3">
          <span>{SUBJECTS[r.subject].name}</span>
          {r.use.map((u) => (
            <span key={u} className="rounded border border-line px-1.5 py-0.5">
              {u}
            </span>
          ))}
        </div>
      </div>
    </article>
  );
}

export function RecipesView() {
  const [tag, setTag] = useState('all');
  const list = RECIPES.filter((r) => tag === 'all' || r.use.includes(tag));
  return (
    <div className="scroll-y h-full">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-4 px-4 py-5">
        <div className="max-w-2xl">
          <h1 className="font-display text-2xl font-extrabold tracking-tight">案例配方</h1>
          <p className="mt-1 text-sm leading-relaxed text-fg-2">
            {RECIPES.length} 組圖像 × 動效的成套搭配，先看方向再動手。前兩組是你提到的例子：「像素風＋黑白＋UI」與「極簡＋複雜線條＋定格」。點縮圖即可套用並繼續微調。
          </p>
        </div>
        <div className="flex flex-wrap gap-1" role="group" aria-label="用途篩選">
          {['all', ...USE_TAGS].map((t) => (
            <button key={t} type="button" aria-pressed={tag === t} onClick={() => setTag(t)} className={`rounded-md px-2.5 py-1 text-xs ${tag === t ? 'bg-fg text-bg' : 'bg-panel-2 text-fg-2 hover:text-fg'}`}>
              {t === 'all' ? '全部用途' : t}
            </button>
          ))}
        </div>
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))' }}>
          {list.map((r) => (
            <RecipeCard key={r.id} r={r} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function SavedView() {
  const saved = useStore((s) => s.saved);
  const loadSaved = useStore((s) => s.loadSaved);
  const deleteSaved = useStore((s) => s.deleteSaved);
  const renameSaved = useStore((s) => s.renameSaved);
  const importCode = useStore((s) => s.importCode);
  const showToast = useStore((s) => s.showToast);
  const [code, setCode] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  return (
    <div className="scroll-y h-full">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-5 px-4 py-5">
        <div className="max-w-2xl">
          <h1 className="font-display text-2xl font-extrabold tracking-tight">我的收藏</h1>
          <p className="mt-1 text-sm leading-relaxed text-fg-2">在混合器按「收藏」就會存到這裡（存在這個瀏覽器）。換電腦時，用配方碼帶走。</p>
        </div>
        <div className="flex max-w-2xl flex-col gap-2 rounded-xl border border-line bg-panel p-3">
          <label htmlFor="import-code" className="text-[13px] font-medium">
            貼上配方碼
          </label>
          <div className="flex gap-2">
            <input id="import-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="SF1.xxxxxxxx" className="num h-9 min-w-0 flex-1 rounded-lg border border-line-2 bg-panel-2 px-3 text-xs outline-none focus:border-mot" />
            <Button
              variant="soft"
              onClick={() => {
                if (importCode(code)) {
                  setCode('');
                  showToast('已載入配方');
                } else showToast('配方碼格式不正確，請確認是以 SF1. 開頭的完整字串');
              }}
            >
              <Upload size={15} /> 載入
            </Button>
          </div>
        </div>
        {saved.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line-2 p-10 text-center text-sm text-fg-3">還沒有收藏。到混合器調出喜歡的組合後，按右上角「收藏」。</div>
        ) : (
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))' }}>
            {saved.map((s) => (
              <article key={s.id} className="flex flex-col overflow-hidden rounded-xl border border-line bg-panel-2">
                <button type="button" onClick={() => loadSaved(s.id)} className="block aspect-[16/10] w-full bg-stage" title="載入到混合器">
                  <Thumb spec={() => mixSpec(s.v, s.m, s.subject as SubjectId, s.tune as Tune)} specKey={s.id} />
                </button>
                <div className="flex flex-col gap-2 p-3">
                  {editing === s.id ? (
                    <input
                      id={`rename-${s.id}`}
                      autoFocus
                      defaultValue={s.name}
                      onBlur={(e) => {
                        renameSaved(s.id, e.target.value.trim() || s.name);
                        setEditing(null);
                      }}
                      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                      className="h-8 rounded-md border border-line-2 bg-panel px-2 text-sm outline-none"
                    />
                  ) : (
                    <h3 className="text-[15px] font-bold">{s.name}</h3>
                  )}
                  <SelChips v={s.v} m={s.m} />
                  <div className="flex items-center gap-1 pt-1">
                    <Button size="xs" variant="soft" onClick={() => loadSaved(s.id)}>
                      <Play size={13} /> 載入
                    </Button>
                    <Button size="xs" variant="ghost" onClick={() => setEditing(s.id)}>
                      <Pencil size={13} /> 改名
                    </Button>
                    {confirm === s.id ? (
                      <span className="ml-auto flex items-center gap-1 text-xs">
                        確定刪除？
                        <Button size="xs" variant="danger" onClick={() => deleteSaved(s.id)}>
                          刪除
                        </Button>
                        <Button size="xs" variant="ghost" onClick={() => setConfirm(null)}>
                          取消
                        </Button>
                      </span>
                    ) : (
                      <Button size="xs" variant="ghost" className="ml-auto" onClick={() => setConfirm(s.id)}>
                        <Trash size={13} /> 刪除
                      </Button>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
