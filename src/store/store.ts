import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { sanitizeAudioPrefs } from '../audio/plan';
import { AUDIO_DEFAULT, type AudioPrefs } from '../audio/types';
import { MOTION, MOTION_MAP } from '../data/motion';
import { RECIPES, STARTERS } from '../data/recipes';
import type { Recipe, Sel } from '../data/schema';
import { VISUAL, VISUAL_MAP } from '../data/visual';
import { TUNE_DEFAULT } from '../engine/resolve';
import type { SubjectId, Tune } from '../engine/types';
import { safeStorage } from '../lib/platform';
import { decodeMix } from './share';

export type View = 'mixer' | 'library' | 'recipes' | 'saved';
export type Aspect = '16:9' | '4:3' | '1:1' | '9:16';
export type InfoTab = 'brief' | 'sound' | 'tune' | 'code' | 'prompt';
export type Kind = 'v' | 'm';
export type ThemePref = 'system' | 'dark' | 'light';

export interface SavedMix {
  id: string;
  name: string;
  v: Sel[];
  m: Sel[];
  subject: SubjectId;
  tune: Tune;
  created: number;
}

interface State {
  view: View;
  v: Sel[];
  m: Sel[];
  subject: SubjectId;
  aspect: Aspect;
  tune: Tune;
  onion: boolean;
  path: boolean;
  grid4: boolean;
  thumbsAnimate: boolean;
  motionOverride: boolean;
  quality: 0 | 1 | 2;
  browserKind: Kind;
  browserCat: string;
  search: string;
  infoTab: InfoTab;
  mobileTab: 'styles' | 'mix' | 'brief' | 'sound' | 'tune' | 'code' | 'prompt';
  locked: string[];
  saved: SavedMix[];
  detail: { kind: Kind; id: string } | null;
  exportOpen: boolean;
  shareOpen: boolean;
  starterOpen: boolean;
  welcomed: boolean;
  audio: AudioPrefs;
  theme: ThemePref;
  toast: { id: number; text: string } | null;

  set: (p: Partial<State>) => void;
  toggle: (kind: Kind, id: string) => void;
  add: (kind: Kind, id: string) => void;
  setWeight: (kind: Kind, id: string, w: number) => void;
  remove: (kind: Kind, id: string) => void;
  promote: (kind: Kind, id: string) => void;
  clear: (kind?: Kind) => void;
  setTune: (p: Partial<Tune>) => void;
  resetTune: () => void;
  setAudio: (p: Partial<AudioPrefs>) => void;
  applyRecipe: (r: Recipe) => void;
  randomize: () => void;
  toggleLock: (kind: Kind, id: string) => void;
  saveCurrent: (name: string) => void;
  loadSaved: (id: string) => void;
  deleteSaved: (id: string) => void;
  renameSaved: (id: string, name: string) => void;
  importCode: (code: string) => boolean;
  showToast: (text: string) => void;
}

const MAX_PER_KIND = 6;

/** 第一次開啟時隨機挑一個起點案例，避免每個人看到的都是同一個畫面 */
function randomStarter(): Recipe {
  const pool = STARTERS.map((s) => RECIPES.find((r) => r.id === s.recipe)).filter((r): r is Recipe => !!r);
  return pool[Math.floor(Math.random() * pool.length)] ?? RECIPES[0];
}
const FIRST = randomStarter();
const pickOne = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
const round2 = (x: number) => Math.round(x * 20) / 20;

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      view: 'mixer',
      v: FIRST.v.map(([id, w]) => ({ id, w })),
      m: FIRST.m.map(([id, w]) => ({ id, w })),
      subject: FIRST.subject,
      aspect: '16:9',
      tune: { ...TUNE_DEFAULT },
      onion: false,
      path: false,
      grid4: false,
      thumbsAnimate: true,
      motionOverride: false,
      quality: 0,
      browserKind: 'v',
      browserCat: 'all',
      search: '',
      infoTab: 'brief',
      mobileTab: 'styles',
      locked: [],
      saved: [],
      detail: null,
      exportOpen: false,
      shareOpen: false,
      starterOpen: false,
      welcomed: false,
      audio: { ...AUDIO_DEFAULT },
      theme: 'system',
      toast: null,

      set: (p) => set(p),
      toggle: (kind, id) => {
        const list = get()[kind];
        if (list.some((x) => x.id === id)) get().remove(kind, id);
        else get().add(kind, id);
      },
      add: (kind, id) => {
        const list = get()[kind];
        if (list.some((x) => x.id === id)) return;
        let next = [...list, { id, w: 1 }];
        if (next.length > MAX_PER_KIND) {
          next = next.slice(next.length - MAX_PER_KIND);
          get().showToast(`最多同時混合 ${MAX_PER_KIND} 個${kind === 'v' ? '圖像' : '動效'}風格，已移除最早加入的一個`);
        }
        set({ [kind]: next } as Partial<State>);
      },
      setWeight: (kind, id, w) => set({ [kind]: get()[kind].map((x) => (x.id === id ? { ...x, w } : x)) } as Partial<State>),
      remove: (kind, id) =>
        set({
          [kind]: get()[kind].filter((x) => x.id !== id),
          locked: get().locked.filter((k) => k !== `${kind}:${id}`),
        } as Partial<State>),
      promote: (kind, id) => {
        const list = get()[kind];
        const it = list.find((x) => x.id === id);
        if (!it) return;
        set({ [kind]: [{ ...it, w: Math.max(it.w, 1) }, ...list.filter((x) => x.id !== id)] } as Partial<State>);
      },
      clear: (kind) => {
        if (!kind || kind === 'v') set({ v: [] });
        if (!kind || kind === 'm') set({ m: [] });
      },
      setTune: (p) => set({ tune: { ...get().tune, ...p } }),
      resetTune: () => set({ tune: { ...TUNE_DEFAULT, seed: get().tune.seed } }),
      setAudio: (p) => set({ audio: sanitizeAudioPrefs({ ...get().audio, ...p }) }),
      applyRecipe: (r) => {
        set({
          v: r.v.map(([id, w]) => ({ id, w })),
          m: r.m.map(([id, w]) => ({ id, w })),
          subject: r.subject,
          view: 'mixer',
          locked: [],
          starterOpen: false,
          welcomed: true,
        });
        get().showToast(`已套用配方「${r.name}」`);
      },
      randomize: () => {
        const { v, m, locked } = get();
        const keepV = v.filter((x) => locked.includes(`v:${x.id}`));
        const keepM = m.filter((x) => locked.includes(`m:${x.id}`));
        const nv: Sel[] = [...keepV];
        const used = new Set(nv.map((x) => x.id));
        const fullLooks = VISUAL.filter((s) => s.look.pal && !used.has(s.id));
        if (!nv.length) {
          const s = pickOne(fullLooks);
          nv.push({ id: s.id, w: 1 });
          used.add(s.id);
        }
        if (Math.random() < 0.6 && nv.length < 3) {
          const pool = VISUAL.filter((s) => !used.has(s.id) && s.cat !== VISUAL_MAP[nv[0].id]?.cat);
          const s = pickOne(pool);
          nv.push({ id: s.id, w: round2(0.45 + Math.random() * 0.5) });
        }
        const nm: Sel[] = [...keepM];
        const usedM = new Set(nm.map((x) => x.id));
        const target = Math.max(nm.length, Math.random() < 0.55 ? 2 : 1);
        const hints = nv.flatMap((x) => VISUAL_MAP[x.id]?.pairs ?? []).filter((id) => MOTION_MAP[id] && !usedM.has(id));
        while (nm.length < target) {
          const id = hints.length && Math.random() < 0.5 ? pickOne(hints) : pickOne(MOTION.filter((s) => !usedM.has(s.id))).id;
          if (usedM.has(id)) continue;
          usedM.add(id);
          nm.push({ id, w: nm.length === 0 ? 1 : round2(0.5 + Math.random() * 0.5) });
        }
        set({ v: nv, m: nm });
      },
      toggleLock: (kind, id) => {
        const k = `${kind}:${id}`;
        const l = get().locked;
        set({ locked: l.includes(k) ? l.filter((x) => x !== k) : [...l, k] });
      },
      saveCurrent: (name) => {
        const s = get();
        const mix: SavedMix = {
          id: Math.random().toString(36).slice(2, 10),
          name: name || '未命名配方',
          v: s.v,
          m: s.m,
          subject: s.subject,
          tune: s.tune,
          created: Date.now(),
        };
        set({ saved: [mix, ...s.saved] });
        get().showToast(`已收藏「${mix.name}」`);
      },
      loadSaved: (id) => {
        const it = get().saved.find((x) => x.id === id);
        if (!it) return;
        set({ v: it.v, m: it.m, subject: it.subject, tune: { ...TUNE_DEFAULT, ...it.tune }, view: 'mixer' });
        get().showToast(`已載入「${it.name}」`);
      },
      deleteSaved: (id) => set({ saved: get().saved.filter((x) => x.id !== id) }),
      renameSaved: (id, name) => set({ saved: get().saved.map((x) => (x.id === id ? { ...x, name } : x)) }),
      importCode: (code) => {
        const mix = decodeMix(code);
        if (!mix) return false;
        set({ v: mix.v, m: mix.m, subject: mix.s, tune: { ...TUNE_DEFAULT, ...(mix.t ?? {}) }, view: 'mixer' });
        return true;
      },
      showToast: (text) => {
        const id = Date.now();
        set({ toast: { id, text } });
        setTimeout(() => {
          if (get().toast?.id === id) set({ toast: null });
        }, 2600);
      },
    }),
    {
      name: 'style-fusion-v1',
      version: 1,
      storage: createJSONStorage(() => safeStorage),
      partialize: (s) => ({
        v: s.v,
        m: s.m,
        subject: s.subject,
        aspect: s.aspect,
        tune: s.tune,
        saved: s.saved,
        thumbsAnimate: s.thumbsAnimate,
        motionOverride: s.motionOverride,
        onion: s.onion,
        path: s.path,
        theme: s.theme,
        quality: s.quality,
        locked: s.locked,
        browserKind: s.browserKind,
        welcomed: s.welcomed,
        audio: s.audio,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<State>;
        const v = (p.v ?? current.v).filter((x) => VISUAL_MAP[x.id]);
        const m = (p.m ?? current.m).filter((x) => MOTION_MAP[x.id]);
        return { ...current, ...p, v, m, tune: { ...TUNE_DEFAULT, ...(p.tune ?? {}) }, audio: { ...sanitizeAudioPrefs(p.audio), on: false } };
      },
    },
  ),
);
