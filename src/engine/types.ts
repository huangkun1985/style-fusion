import type { EaseFn, EaseId } from './easing';

// ---------- 色板 ----------
/**
 * 角色語意：
 * p 主角色（角色身體／主按鈕） s 次要 a 點綴（腮紅／提示） q 自然（草地／樹） r 大地（樹幹／山）
 * bg/bg2 背景漸層 ink 線條與文字 light 高光／眼白 card UI 卡片底
 */
export interface Palette {
  bg: string;
  bg2: string;
  ink: string;
  light: string;
  card: string;
  p: string;
  s: string;
  a: string;
  q: string;
  r: string;
}
export type Role = keyof Palette;

export type FillMode =
  | 'flat'
  | 'gradient'
  | 'soft'
  | 'cel'
  | 'dots'
  | 'hatch'
  | 'line'
  | 'none'
  | 'glass'
  | 'neu'
  | 'chrome'
  | 'iridescent'
  | 'gloss'
  | 'inflate'
  | 'clay'
  | 'crayon'
  | 'marker'
  | 'wash'
  | 'jianzhi'
  | 'puppet'
  | 'silhouette'
  | 'offset';
export type StrokeStyle = 'solid' | 'sketch' | 'brush' | 'dashed' | 'glow' | 'chalk' | 'pencil';
export type StrokeColor = 'ink' | 'darker' | 'lighter' | 'fill' | 'light' | 'accent';
export type ShadowType = 'none' | 'soft' | 'hard' | 'long' | 'extrude' | 'paper';
export type FontId =
  | 'sans'
  | 'grotesk'
  | 'round'
  | 'serif'
  | 'mono'
  | 'pixel'
  | 'term'
  | 'display'
  | 'deco'
  | 'neon'
  | 'script'
  | 'cond'
  | 'groovy'
  | 'brush';

export interface BgSpec {
  type: string;
  [k: string]: unknown;
}

/** 後期特效定義（風格資料中使用） */
export interface FxSpec {
  fx: string;
  /** 顏色參數（依特效而定，例如 ink/paper） */
  c?: string[];
  /** 量化用色板 */
  pal?: string[];
  [k: string]: unknown;
}
/** 解析後的後期特效實例 */
export interface FxInst {
  fx: string;
  p: Record<string, number>;
  c: string[];
  pal: string[];
}

/** 3D 材質：auto 依填色模式推斷 */
export type Mat3D =
  | 'auto'
  | 'flat'
  | 'matte'
  | 'clay'
  | 'toon'
  | 'glossy'
  | 'chrome'
  | 'gold'
  | 'glass'
  | 'pearl'
  | 'holo'
  | 'xray'
  | 'wire'
  | 'neon'
  | 'paper'
  | 'basic';
/** 3D 燈光方案 */
export type Light3D = 'studio' | 'sunny' | 'soft' | 'dramatic' | 'neon' | 'flat';
/** 3D 幾何精細度：smooth 光滑、lowpoly 低多邊形 */
export type Geo3D = 'smooth' | 'lowpoly';

export interface LookPatch {
  pal?: Partial<Palette>;
  mat3d?: Mat3D;
  light3d?: Light3D;
  geo3d?: Geo3D;
  bg?: BgSpec;
  fill?: FillMode;
  stroke?: number;
  strokeStyle?: StrokeStyle;
  strokeColor?: StrokeColor;
  facets?: number;
  round?: number;
  boil?: number;
  wobble?: number;
  snap?: number;
  sketch?: number;
  shadow?: ShadowType;
  shadowD?: number;
  shadowColor?: string;
  glow?: number;
  sticker?: number;
  font?: FontId;
  upper?: boolean;
  deco?: string[];
  post?: FxSpec[];
  detail?: number;
  tilt?: number;
  iso?: number;
  light?: [number, number];
}

export interface Look {
  pal: Palette;
  mat3d: Mat3D;
  light3d: Light3D;
  geo3d: Geo3D;
  bg: BgSpec;
  fill: FillMode;
  stroke: number;
  strokeStyle: StrokeStyle;
  strokeColor: StrokeColor;
  facets: number;
  round: number;
  boil: number;
  wobble: number;
  snap: number;
  sketch: number;
  shadow: ShadowType;
  shadowD: number;
  shadowColor: string;
  glow: number;
  sticker: number;
  font: FontId;
  upper: boolean;
  deco: { id: string; a: number }[];
  post: FxInst[];
  detail: number;
  tilt: number;
  iso: number;
  light: [number, number];
}

// ---------- 動效 ----------
export type PType = 'dust' | 'spark' | 'star' | 'confetti' | 'bubble' | 'leaf' | 'pixel' | 'heart' | 'ink' | 'snow';
export type LType = 'flow' | 'network' | 'spiro' | 'contour' | 'rings' | 'grid' | 'orbit' | 'rays' | 'swarm' | 'liquid';

export interface MoveNums {
  speed: number;
  squash: number;
  antic: number;
  over: number;
  follow: number;
  arc: number;
  exag: number;
  jitter: number;
  boil: number;
  boilFps: number;
  handheld: number;
  wobble: number;
  float: number;
  stagger: number;
  smear: number;
  echo: number;
  speedLines: number;
  impact: number;
  shake: number;
  hitstop: number;
  holds: number;
  drawOn: number;
  morph: number;
  stutter: number;
  ramp: number;
  beat: number;
  zoomPunch: number;
  kenburns: number;
  tilt: number;
  whip: number;
  parallax: number;
  rigid: number;
  noodle: number;
  pingpong: number;
  shimmer: number;
  ripple: number;
  snap: number;
  mask: number;
  wind: number;
  heavy: number;
  glitch: number;
  typeWave: number;
  typeScramble: number;
  typeWriter: number;
  // ----- 3D 鏡頭與物件（只有 3D 主體會用到） -----
  orbit: number;
  spin: number;
  dolly: number;
  fly: number;
  crane: number;
  tumble: number;
  explode: number;
  flip: number;
  levitate: number;
  truck: number;
}

export interface MovePatch extends Partial<MoveNums> {
  ease?: EaseId;
  fps?: number;
  bpm?: number;
  parts?: Partial<Record<PType, number>>;
  lines?: Partial<Record<LType, number>>;
}

export interface Move extends MoveNums {
  ease: EaseFn;
  easeParts: { id: EaseId; w: number }[];
  easeW: number;
  fps: number;
  bpm: number;
  parts: { t: PType; a: number }[];
  lines: { t: LType; a: number }[];
}

// ---------- 主體 ----------
export type SubjectId =
  | 'mascot'
  | 'ball'
  | 'ui'
  | 'type'
  | 'geo'
  | 'landscape'
  | 'walk'
  | 'abstract'
  | 'chart'
  | 'voxel'
  | 'shapes3d'
  | 'char3d'
  | 'text3d'
  | 'terrain3d';

/** 真 3D（Three.js）主體 */
export const SUBJECTS_3D: SubjectId[] = ['voxel', 'shapes3d', 'char3d', 'text3d', 'terrain3d'];
export const is3D = (id: SubjectId) => SUBJECTS_3D.includes(id);

export interface Tune {
  speed: number;
  fps: number; // 0 = 依風格
  paletteMode: 'interleave' | 'dominant' | 'blend';
  seed: number;
  strokeMul: number;
  fxMul: number;
  loopMul: number;
  custom: Partial<Palette>;
}
