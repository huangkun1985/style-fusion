// 風格牆（2.0 α3，F7）：舞台換成 3×3，同一段內容（目前的主體或生成的內容）套 9 種風格同時在動。
// 第 1 格是目前的；點其他格＝換成那個風格（一步可以復原）；滑過出現「加進混合」（保留目前的、多混一個）。
// 九格共用縮圖排程器（有時間預算），不另外開渲染迴圈；3D 縮圖比較重，混合的篩選裡最多 3 格。
import { useMemo, useRef } from 'react';
import { MOTION_MAP } from '../data/motion';
import { VISUAL_MAP } from '../data/visual';
import { themes } from '../engine/themes';
import { wallPicks, type WallFilter } from '../lib/styleWall';
import { mixSpec } from '../store/hooks';
import { useStore } from '../store/store';
import { Thumb } from './Thumb';

const FILTERS: { id: WallFilter; label: string; tip: string }[] = [
  { id: 'all', label: '全部', tip: '全部：從所有圖像風格隨機排 8 個。沒有方向、想看看各種可能時用' },
  { id: 'near', label: '和現在相近', tip: '和現在相近：色板接近目前風格的。方向對了、想微調時用' },
  { id: 'contrast', label: '對比強的', tip: '對比強的：色板和類別都跟現在差很多的。想跳出目前的感覺時用' },
  { id: '3d', label: '3D', tip: '3D：真 3D 的材質（黏土、鉻金屬、玻璃…）。3D 縮圖比較重，第一次要等一下' },
];

export function StyleWall() {
  const v = useStore((s) => s.v);
  const m = useStore((s) => s.m);
  const subject = useStore((s) => s.subject);
  const tune = useStore((s) => s.tune);
  const filter = useStore((s) => s.wallFilter);
  const batch = useStore((s) => s.wallBatch);
  const set = useStore((s) => s.set);
  const add = useStore((s) => s.add);
  useStore((s) => s.themeRev);
  // 挑選以「打開風格牆時」的混合為準：按了「加進混合」，8 格不會在游標底下重排
  const base = useRef(v);
  const picks = useMemo(() => wallPicks(base.current, filter, batch), [filter, batch]);
  const tv = themes.rev();
  const mk = `${m.map((x) => x.id + x.w).join()}|${subject}|${JSON.stringify(tune)}|${tv}`;
  const cur = v.map((x) => VISUAL_MAP[x.id]?.name).filter(Boolean).join(' ＋ ') || '沒有圖像風格';
  const apply = (id: string) => {
    set({ v: [{ id, w: 1 }], wall: false });
    useStore.getState().showToast(`已換成「${VISUAL_MAP[id]?.name}」；不喜歡按 Ctrl+Z 退回`);
  };
  return (
    <div className="absolute inset-0 z-10 flex flex-col gap-2 bg-bg p-0.5" role="region" aria-label="風格牆">
      <div className="flex h-8 shrink-0 items-center gap-1.5">
        <span className="hidden shrink-0 pr-1 text-[14px] font-bold sm:inline">風格牆</span>
        <div role="radiogroup" aria-label="篩選" className="scroll-x hide-scrollbar flex min-w-0 gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={filter === f.id}
              title={f.tip}
              onClick={() => set({ wallFilter: f.id })}
              className={`h-7 shrink-0 rounded-full border px-3 text-[12px] transition-colors ${filter === f.id ? 'border-mot bg-mot-soft text-mot' : 'border-line-2 text-fg-2 hover:text-fg'}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <span className="min-w-0 flex-1 truncate text-right text-[12px] text-fg-3 max-xl:hidden">同一段內容，9 種風格同時播放。點一格就套用。</span>
        <span className="flex-1 xl:hidden" />
        <button type="button" title="換一批：同樣的篩選，換 8 個風格" onClick={() => set({ wallBatch: batch + 1 })} className="h-8 shrink-0 rounded-lg border border-line-2 px-3 text-[13px] text-fg hover:bg-raise">
          換一批
        </button>
        <button type="button" title="回到舞台：不換風格，回到原本的畫面（Esc）" onClick={() => set({ wall: false })} className="h-8 shrink-0 rounded-lg border border-line-2 px-3 text-[13px] text-fg hover:bg-raise">
          回到舞台
        </button>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-3 grid-rows-3 gap-1.5 sm:gap-2.5">
        <div className="relative min-h-0 overflow-hidden rounded-[10px] bg-stage ring-2 ring-mot" title={`目前的風格：${cur}`}>
          <Thumb spec={() => mixSpec(v, m, subject, tune)} specKey={`wall-cur|${v.map((x) => x.id + x.w).join()}|${mk}`} className="size-full" />
          <span className="absolute bottom-1.5 left-1.5 max-w-[calc(100%-12px)] truncate rounded-md bg-black/70 px-2 text-[12px] leading-5 text-white">{cur}　目前</span>
        </div>
        {picks.map((id) => {
          const st = VISUAL_MAP[id];
          return (
            <div key={id} className="group relative min-h-0 overflow-hidden rounded-[10px] bg-panel-2">
              <button type="button" onClick={() => apply(id)} title={`套用「${st?.name}」：換掉目前的圖像風格（動效、主體、內容不變）。${st?.desc ?? ''}`} className="absolute inset-0 size-full">
                <Thumb spec={() => mixSpec([{ id, w: 1 }], m, subject, tune)} specKey={`wall|${id}|${mk}`} className="size-full" />
              </button>
              <span className="pointer-events-none absolute bottom-1.5 left-1.5 max-w-[calc(100%-12px)] truncate rounded-md bg-black/70 px-2 text-[12px] leading-5 text-white">
                {st?.name}
                {st?.cat === 'dim3d' ? '　3D' : ''}
              </span>
              {/* 滑過才出現；浮在畫面上，不推動任何東西 */}
              <button
                type="button"
                onClick={() => {
                  add('v', id);
                  useStore.getState().showToast(`已把「${st?.name}」加進混合（和原本的風格一起混）`);
                }}
                title="加進混合：保留目前的風格，再多混一個。想要兩種風格的折衷時用"
                className="absolute right-1.5 top-1.5 h-7 rounded-md bg-black/70 px-2 text-[12px] text-white opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100"
              >
                ＋ 加進混合
              </button>
            </div>
          );
        })}
        {Array.from({ length: Math.max(0, 8 - picks.length) }, (_, i) => (
          <div key={`empty${i}`} className="flex items-center justify-center rounded-[10px] bg-panel-2 text-[12px] text-fg-3">沒有更多了</div>
        ))}
      </div>
      <span className="sr-only">動效：{m.map((x) => MOTION_MAP[x.id]?.name).join('、')}</span>
    </div>
  );
}
