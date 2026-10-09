// 風格解析器：把多個「圖像風格」與「動效風格」按權重混合成一套完整的 Look / Move。
// 規則：
//  - 數值參數：neutral + Σ w_i (v_i - neutral) / max(1, Σw)，只有宣告了該參數的風格參與
//  - 類別參數（填色模式、背景、字體…）：權重最高者勝出，同權重時先加入者優先
//  - 後期特效：同類合併參數，不同類按固定順序串接
//  - 緩動曲線：函數級加權混合
import { FX, fxActive } from './fx';
import { blendEase, type EaseId } from './easing';
import { blendMany, lighten, mix, rgb } from './color';
import type { FxInst, FxSpec, LType, Look, LookPatch, Move, MoveNums, MovePatch, Palette, PType, Tune } from './types';
import type { MotionStyle, Sel, VisualStyle } from '../data/schema';

export const BASE_PALETTE: Palette = {
  bg: '#EEF2F7',
  bg2: '#D6E0EC',
  ink: '#1D2433',
  light: '#FFFFFF',
  card: '#FFFFFF',
  p: '#FF6B57',
  s: '#2F6BFF',
  a: '#FFC93C',
  q: '#2BB673',
  r: '#7A5A43',
};
export const PAL_KEYS = Object.keys(BASE_PALETTE) as (keyof Palette)[];

export const LOOK_DEFAULT: Look = {
  pal: BASE_PALETTE,
  mat3d: 'auto',
  light3d: 'studio',
  geo3d: 'smooth',
  bg: { type: 'vgrad' },
  fill: 'flat',
  stroke: 0,
  strokeStyle: 'solid',
  strokeColor: 'ink',
  facets: 0,
  round: 1,
  boil: 0,
  wobble: 0,
  snap: 0,
  sketch: 0,
  shadow: 'none',
  shadowD: 6,
  shadowColor: '',
  glow: 0,
  sticker: 0,
  cutout: 0,
  font: 'sans',
  upper: false,
  deco: [],
  post: [],
  detail: 1,
  tilt: 0,
  iso: 0,
  light: [-0.55, -0.83],
};

export const MOVE_NEUTRAL: MoveNums = {
  speed: 1,
  squash: 0.3,
  antic: 0.25,
  over: 0.12,
  follow: 0.4,
  arc: 0.6,
  exag: 0,
  jitter: 0,
  boil: 0,
  boilFps: 8,
  handheld: 0,
  wobble: 0,
  float: 0,
  stagger: 0.35,
  smear: 0,
  echo: 0,
  speedLines: 0,
  impact: 0,
  shake: 0,
  hitstop: 0,
  holds: 0,
  drawOn: 0,
  morph: 0,
  stutter: 0,
  ramp: 0,
  beat: 0,
  zoomPunch: 0,
  kenburns: 0,
  tilt: 0,
  whip: 0,
  parallax: 0.5,
  rigid: 0,
  noodle: 0,
  pingpong: 0,
  shimmer: 0,
  ripple: 0,
  snap: 0,
  mask: 0,
  wind: 0,
  heavy: 0,
  glitch: 0,
  typeWave: 0,
  typeScramble: 0,
  typeWriter: 0,
  orbit: 0,
  spin: 0,
  dolly: 0,
  fly: 0,
  crane: 0,
  tumble: 0,
  explode: 0,
  flip: 0,
  levitate: 0,
  truck: 0,
};
export const MOVE_KEYS = Object.keys(MOVE_NEUTRAL) as (keyof MoveNums)[];

export const TUNE_DEFAULT: Tune = {
  speed: 1,
  fps: 0,
  paletteMode: 'interleave',
  seed: 7,
  strokeMul: 1,
  fxMul: 1,
  loopMul: 1,
  custom: {},
  keepColors: true,
};

interface Item<P> {
  w: number;
  i: number;
  patch: P;
}
const score = (it: { w: number; i: number }) => it.w - it.i * 0.02;

function num<P>(items: Item<P>[], get: (p: P) => number | undefined, neutral: number): number {
  let sw = 0;
  let acc = 0;
  for (const it of items) {
    const v = get(it.patch);
    if (v === undefined || Number.isNaN(v)) continue;
    sw += it.w;
    acc += it.w * (v - neutral);
  }
  return sw > 0 ? neutral + acc / Math.max(1, sw) : neutral;
}
function cat<P, T>(items: Item<P>[], get: (p: P) => T | undefined, def: T): T {
  let best: T | undefined;
  let bs = -Infinity;
  for (const it of items) {
    const v = get(it.patch);
    if (v === undefined || it.w < 0.15) continue;
    const s = score(it);
    if (s > bs) {
      bs = s;
      best = v;
    }
  }
  return best === undefined ? def : best;
}

/** 量化類後期（8-bit、16-bit、積木…）把畫面對應到固定調色板，會把使用者的顏色換掉；
 *  這裡把使用者的顏色（含明暗）加進調色板，並拿掉原調色板裡最接近的顏色，總數不超過 16 */
function withMine(list: string[], mine: Partial<Palette>): string[] {
  const own = [...new Set(Object.values(mine).filter((c): c is string => !!c && c.startsWith('#')))].slice(0, 5);
  if (!list.length || !own.length) return list.slice();
  const shades = list.length >= 12 ? [-0.16, 0, 0.14, 0.28] : [0];
  const extra: string[] = [];
  for (const c of own) for (const k of shades) extra.push(k === 0 ? c : lighten(c, k));
  const out = list.map((c) => ({ c, mine: false }));
  const dist = (a: string, b: string) => {
    const x = rgb(a);
    const y = rgb(b);
    return (x[0] - y[0]) ** 2 + (x[1] - y[1]) ** 2 + (x[2] - y[2]) ** 2;
  };
  for (const e of extra) {
    if (out.length < 16) out.push({ c: e, mine: true });
    else {
      let bi = -1;
      for (let i = 0; i < out.length; i++) if (!out[i].mine && (bi < 0 || dist(out[i].c, e) < dist(out[bi].c, e))) bi = i;
      if (bi >= 0) out[bi] = { c: e, mine: true };
    }
  }
  return out.map((x) => x.c);
}

/** base：主體自帶的色板（自訂主題的 palette），蓋過風格的色板，但仍可被使用者的自訂色板蓋過 */
export function resolveLook(sel: Sel[], lib: Record<string, VisualStyle>, tune: Tune = TUNE_DEFAULT, base?: Partial<Palette>): Look {
  const items: Item<LookPatch>[] = [];
  sel.forEach((s, i) => {
    const st = lib[s.id];
    if (st && s.w > 0) items.push({ w: s.w, i, patch: st.look });
  });

  // ----- 色板 -----
  const palItems = items.filter((it) => it.patch.pal && it.w >= 0.1).sort((a, b) => score(b) - score(a));
  let pal: Palette = { ...BASE_PALETTE };
  if (palItems.length) {
    const full = (it: Item<LookPatch>): Palette => ({ ...BASE_PALETTE, ...it.patch.pal });
    if (tune.paletteMode === 'blend' && palItems.length > 1) {
      for (const k of PAL_KEYS) pal[k] = blendMany(palItems.map((it) => ({ c: full(it)[k], w: it.w })));
    } else {
      const P1 = full(palItems[0]);
      pal = { ...P1 };
      if (tune.paletteMode === 'interleave' && palItems.length > 1) {
        const p2 = palItems[1].patch.pal!;
        if (p2.p) pal.s = p2.p;
        if (p2.q) pal.q = p2.q;
        if (p2.a && palItems[1].w >= 0.6) pal.a = p2.a;
        if (palItems.length > 2) {
          const p3 = palItems[2].patch.pal!;
          if (p3.p) pal.r = p3.p;
        }
      }
      const w1 = palItems[0].w;
      if (palItems.length === 1 && w1 < 0.999) {
        for (const k of PAL_KEYS) pal[k] = mix(BASE_PALETTE[k], P1[k], w1);
      }
    }
  }
  // 優先使用我的顏色：主題自帶的色板與自訂色板蓋過風格的色板；關閉時完全以風格為準
  const mine: Partial<Palette> = tune.keepColors === false ? {} : { ...base, ...tune.custom };
  pal = { ...pal, ...mine };

  // ----- 後期鏈 -----
  const groups = new Map<string, { w: number; i: number; spec: FxSpec }[]>();
  for (const it of items) {
    for (const spec of it.patch.post ?? []) {
      if (!FX[spec.fx]) continue;
      if (!groups.has(spec.fx)) groups.set(spec.fx, []);
      groups.get(spec.fx)!.push({ w: it.w, i: it.i, spec });
    }
  }
  const post: FxInst[] = [];
  for (const [fx, g] of groups) {
    const def = FX[fx];
    const p: Record<string, number> = {};
    for (const key of Object.keys(def.params)) {
      const neutral = def.params[key];
      p[key] = num(
        g.map((x) => ({ w: x.w, i: x.i, patch: x.spec })),
        (spec) => (key === 'amt' ? ((spec.amt as number | undefined) ?? 1) : (spec[key] as number | undefined)),
        neutral,
      );
    }
    if ('amt' in p) p.amt *= tune.fxMul;
    if (fx === 'pixelate') p.size *= tune.fxMul;
    const dom = [...g].sort((a, b) => score(b) - score(a));
    const c = dom.find((x) => x.spec.c)?.spec.c ?? [];
    const palList = withMine(dom.find((x) => x.spec.pal)?.spec.pal ?? [], mine);
    if (fxActive(def, p)) post.push({ fx, p, c: c.slice(), pal: palList });
  }
  post.sort((a, b) => FX[a.fx].order - FX[b.fx].order);

  // ----- 裝飾 -----
  const decoMap = new Map<string, number>();
  for (const it of items) for (const d of it.patch.deco ?? []) decoMap.set(d, Math.min(1, (decoMap.get(d) ?? 0) + it.w));

  const D = LOOK_DEFAULT;
  return {
    pal,
    bg: cat(items, (p) => p.bg, D.bg),
    fill: cat(items, (p) => p.fill, D.fill),
    mat3d: cat(items, (p) => p.mat3d, D.mat3d),
    light3d: cat(items, (p) => p.light3d, D.light3d),
    geo3d: cat(items, (p) => p.geo3d, D.geo3d),
    stroke: num(items, (p) => p.stroke, D.stroke) * tune.strokeMul,
    strokeStyle: cat(items, (p) => p.strokeStyle, D.strokeStyle),
    strokeColor: cat(items, (p) => p.strokeColor, D.strokeColor),
    facets: cat(items, (p) => p.facets, D.facets),
    round: num(items, (p) => p.round, D.round),
    boil: num(items, (p) => p.boil, D.boil),
    wobble: num(items, (p) => p.wobble, D.wobble),
    snap: num(items, (p) => p.snap, D.snap),
    sketch: num(items, (p) => p.sketch, D.sketch),
    shadow: cat(items, (p) => p.shadow, D.shadow),
    shadowD: num(items, (p) => p.shadowD, D.shadowD),
    shadowColor: cat(items, (p) => p.shadowColor, D.shadowColor),
    glow: num(items, (p) => p.glow, D.glow),
    sticker: num(items, (p) => p.sticker, D.sticker),
    cutout: num(items, (p) => p.cutout, D.cutout),
    font: cat(items, (p) => p.font, D.font),
    upper: cat(items, (p) => p.upper, D.upper),
    deco: [...decoMap].map(([id, a]) => ({ id, a })),
    post,
    detail: num(items, (p) => p.detail, D.detail),
    tilt: num(items, (p) => p.tilt, D.tilt),
    iso: num(items, (p) => p.iso, D.iso),
    light: cat(items, (p) => p.light, D.light),
  };
}

export function resolveMove(sel: Sel[], lib: Record<string, MotionStyle>, tune: Tune = TUNE_DEFAULT): Move {
  const items: Item<MovePatch>[] = [];
  sel.forEach((s, i) => {
    const st = lib[s.id];
    if (st && s.w > 0) items.push({ w: s.w, i, patch: st.move });
  });
  const nums = {} as MoveNums;
  for (const k of MOVE_KEYS) nums[k] = num(items, (p) => p[k], MOVE_NEUTRAL[k]);

  const easeParts: { id: EaseId; w: number }[] = items.filter((it) => it.patch.ease).map((it) => ({ id: it.patch.ease!, w: it.w }));
  const easeW = Math.min(1, easeParts.reduce((s, p) => s + p.w, 0));

  let fps = 0;
  for (const it of items) {
    const f = it.patch.fps;
    if (f && f > 0 && it.w >= 0.3) fps = fps === 0 ? f : Math.min(fps, f);
  }
  if (tune.fps > 0) fps = tune.fps;
  if (tune.fps < 0) fps = 0;

  const acc = <T extends string>(get: (p: MovePatch) => Partial<Record<T, number>> | undefined) => {
    const m = new Map<T, number>();
    for (const it of items) {
      const rec = get(it.patch);
      if (!rec) continue;
      for (const [t, a] of Object.entries(rec) as [T, number][]) m.set(t, Math.min(1.5, (m.get(t) ?? 0) + a * it.w));
    }
    return [...m].map(([t, a]) => ({ t, a }));
  };

  // 剪紙／機械等「剛性」風格會壓低擠壓變形
  nums.squash *= 1 - Math.min(1, nums.rigid) * 0.9;
  nums.wobble *= 1 - Math.min(1, nums.rigid) * 0.8;
  nums.speed *= tune.speed;

  return {
    ...nums,
    ease: blendEase(easeParts, 'cubic'),
    easeParts,
    easeW,
    fps,
    bpm: cat(items, (p) => p.bpm, 120),
    parts: acc<PType>((p) => p.parts),
    lines: acc<LType>((p) => p.lines),
  };
}
