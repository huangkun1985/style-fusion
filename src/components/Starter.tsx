// 起點選擇器：第一次開啟時（或按「換個起點」）從不同主題的完整案例裡挑一個。
import { Dices, Volume2 } from 'lucide-react';
import { useMemo } from 'react';
import { RECIPES, STARTERS } from '../data/recipes';
import type { Recipe } from '../data/schema';
import { MOTION_MAP } from '../data/motion';
import { VISUAL_MAP } from '../data/visual';
import { audioEngine } from '../audio/engine';
import { SUBJECTS } from '../engine/subjects';
import { is3D } from '../engine/types';
import { toggleSound } from '../lib/sound';
import { mixSpec } from '../store/hooks';
import { useStore } from '../store/store';
import { Thumb } from './Thumb';
import { Button, Kf, Modal } from './ui';

function useStarters() {
  return useMemo(
    () =>
      STARTERS.map((s) => ({ theme: s.theme, recipe: RECIPES.find((r) => r.id === s.recipe) }))
        .filter((s): s is { theme: string; recipe: Recipe } => !!s.recipe)
        .map((s) => ({
          ...s,
          v: s.recipe.v.map(([id, w]) => ({ id, w })),
          m: s.recipe.m.map(([id, w]) => ({ id, w })),
        })),
    [],
  );
}

export function StarterModal() {
  const open = useStore((s) => s.starterOpen);
  const set = useStore((s) => s.set);
  const apply = useStore((s) => s.applyRecipe);
  const audioOn = useStore((s) => s.audio.on);
  const list = useStarters();
  const close = () => set({ starterOpen: false, welcomed: true });
  // 在點擊手勢內順便喚醒 AudioContext，這樣套用後音樂能立刻響起
  const pick = (r: Recipe) => {
    if (audioOn) void audioEngine.unlock();
    apply(r);
  };
  return (
    <Modal
      open={open}
      onClose={close}
      wide
      title="選一個起點"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label htmlFor="starter-sound" className="flex cursor-pointer items-center gap-2 text-[13px] text-fg-2">
            <input id="starter-sound" type="checkbox" checked={audioOn} onChange={(e) => void toggleSound(e.target.checked)} className="size-4 accent-[var(--mot)]" />
            <Volume2 size={15} />
            附帶音樂與音效
          </label>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => pick(list[Math.floor(Math.random() * list.length)].recipe)}>
              <Dices size={15} /> 隨機一個
            </Button>
            <Button variant="ghost" onClick={close}>
              略過，保留目前的混合
            </Button>
          </div>
        </div>
      }
    >
      <p className="mb-4 max-w-3xl text-sm leading-relaxed text-fg-2">
        每個起點都是一組完整的「圖像風格 × 動效風格 × 主體」，涵蓋復古遊戲、經典卡通、3D 渲染、東方水墨、設計海報等不同方向。選一個開始，之後可以隨意增減風格、調強度。
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {list.map(({ theme, recipe, v, m }) => (
          <button
            key={recipe.id}
            type="button"
            onClick={() => pick(recipe)}
            className="group flex flex-col overflow-hidden rounded-xl border border-line bg-panel-2 text-left transition-colors hover:border-mot"
          >
            <div className="relative aspect-[16/10] w-full bg-stage">
              <Thumb spec={() => mixSpec(v, m, recipe.subject)} specKey={recipe.id} />
              <span className="absolute left-2 top-2 rounded-md bg-black/65 px-2 py-0.5 text-[11px] font-semibold text-white">{theme}</span>
              {is3D(recipe.subject) && <span className="absolute bottom-1.5 right-1.5 rounded bg-black/65 px-1 text-[10px] font-bold tracking-wider text-white">3D</span>}
            </div>
            <div className="flex flex-1 flex-col gap-1.5 p-3">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-[15px] font-bold leading-snug">{recipe.name}</h3>
                <span className="shrink-0 text-[11px] text-fg-3">{SUBJECTS[recipe.subject].name}</span>
              </div>
              <p className="line-clamp-2 text-xs leading-relaxed text-fg-2">{recipe.desc}</p>
              <div className="mt-auto flex flex-wrap gap-1 pt-1">
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
            </div>
          </button>
        ))}
      </div>
    </Modal>
  );
}
