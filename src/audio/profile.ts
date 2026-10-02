// 風格 → 音樂設定：由選中的圖像風格與動效風格推出曲風、聲音方案、音效包、速度與能量。
// 規則：權重最高且有對應的圖像風格決定曲風；動效風格調整速度、可覆寫曲風與音效包。
import type { VCat } from '../data/schema';
import { MOTION_MAP } from '../data/motion';
import type { Sel } from '../data/schema';
import { VISUAL_MAP } from '../data/visual';
import type { SubjectId } from '../engine/types';
import { GENRES } from './genres';
import { SCHEME_INFO } from './render';
import { PACK_INFO } from './sfx';
import type { GenreId, PackId, SchemeId } from './types';

interface Hint {
  genre?: GenreId;
  scheme?: SchemeId;
  pack?: PackId;
  energy?: number;
}

const CAT: Record<VCat, Required<Pick<Hint, 'genre' | 'scheme' | 'pack'>>> = {
  retro: { genre: 'chipAdventure', scheme: 'nes', pack: '8bit' },
  mono: { genre: 'jazz', scheme: 'midi', pack: 'natural' },
  cartoon: { genre: 'wonder', scheme: 'midi', pack: 'cartoon' },
  modern: { genre: 'pop', scheme: 'midi', pack: 'ui' },
  movement: { genre: 'funk', scheme: 'midi', pack: 'ui' },
  craft: { genre: 'acoustic', scheme: 'midi', pack: 'natural' },
  east: { genre: 'eastern', scheme: 'midi', pack: 'natural' },
  tech: { genre: 'house', scheme: 'midi', pack: 'scifi' },
  photo: { genre: 'citypop', scheme: 'midi', pack: 'natural' },
  dim3d: { genre: 'pop', scheme: 'midi', pack: 'ui' },
};

const H = (genre: GenreId, scheme: SchemeId, pack: PackId, energy?: number): Hint => ({ genre, scheme, pack, energy });

const VISUAL: Record<string, Hint> = {
  // 像素與復古（保留晶片音色；其中有些改用追蹤器，聽起來比較厚）
  pixel8: H('chipAdventure', 'nes', '8bit'),
  pixel16: H('chipAdventure', 'xm', '8bit'),
  gameboy: H('kawaii', 'gb', '8bit'),
  pico8: H('chipAdventure', 'nes', '8bit'),
  cga: H('chipDark', 'nes', '8bit'),
  onebit: H('kawaii', 'gb', '8bit'),
  minecraft: H('cpop', 'midi', 'natural', 0.3),
  ascii: H('techno', 'xm', 'scifi'),
  crt: H('synthwave', 'fm', '8bit'),
  vhs: H('vapor', 'midi', 'natural'),
  arcade: H('chipDark', 'nes', '8bit', 1),
  ps1: H('lofi', 'xm', 'natural'),
  teletext: H('techno', 'nes', '8bit'),
  led: H('techno', 'sid', 'scifi'),
  glitch: H('cyber', 'xm', 'scifi'),
  // 黑白與單色
  noir: H('jazz', 'midi', 'natural'),
  inkline: H('acoustic', 'midi', 'natural', 0.5),
  halftone: H('funk', 'midi', 'cartoon'),
  engraving: H('classical', 'midi', 'natural'),
  silhouette: H('cinematic', 'midi', 'natural'),
  duotone: H('rnb', 'midi', 'ui'),
  blueprint: H('house', 'midi', 'ui'),
  pencil: H('acoustic', 'midi', 'natural', 0.45),
  charcoal: H('ballad', 'midi', 'natural'),
  chalk: H('bossa', 'midi', 'natural'),
  xerox: H('rock', 'midi', 'natural'),
  cyanotype: H('cpop', 'midi', 'natural', 0.4),
  // 卡通
  disney: H('wonder', 'midi', 'cartoon'),
  anime: H('jpop', 'midi', 'cartoon', 0.9),
  pastoral: H('acoustic', 'midi', 'natural', 0.45),
  rubberhose: H('ragtime', 'midi', 'cartoon'),
  ustoon: H('pop', 'midi', 'cartoon', 0.85),
  comic: H('rock', 'midi', 'cartoon', 1),
  manga: H('jpop', 'midi', 'cartoon', 0.9),
  kawaii: H('kpop', 'midi', 'cartoon'),
  clay: H('acoustic', 'midi', 'natural'),
  storybook: H('wonder', 'midi', 'natural', 0.4),
  crayon: H('pop', 'xm', 'cartoon'),
  // 現代
  flat: H('pop', 'midi', 'ui'),
  minimal: H('cpop', 'midi', 'ui', 0.3),
  material: H('pop', 'midi', 'ui'),
  glass: H('rnb', 'midi', 'ui'),
  neumorph: H('lofi', 'midi', 'ui'),
  gradient: H('house', 'midi', 'ui'),
  darkui: H('trap', 'midi', 'ui'),
  corporate: H('pop', 'midi', 'ui', 0.6),
  skeuo: H('jazz', 'midi', 'ui'),
  // 流派
  bauhaus: H('house', 'xm', 'ui'),
  swiss: H('techno', 'midi', 'ui'),
  memphis: H('disco', 'midi', 'cartoon', 0.9),
  brutalism: H('rock', 'midi', 'ui'),
  y2k: H('kpop', 'midi', 'cartoon'),
  vaporwave: H('vapor', 'midi', 'natural'),
  synthwave: H('synthwave', 'fm', 'scifi'),
  popart: H('disco', 'midi', 'cartoon', 0.9),
  artdeco: H('jazz', 'midi', 'natural'),
  artnouveau: H('classical', 'midi', 'natural'),
  destijl: H('house', 'xm', 'ui'),
  constructivism: H('cinematic', 'midi', 'natural'),
  pointillism: H('cpop', 'xm', 'natural'),
  impressionism: H('classical', 'midi', 'natural', 0.4),
  cubism: H('jazz', 'xm', 'natural'),
  stainedglass: H('cinematic', 'midi', 'natural'),
  psychedelic: H('rock', 'midi', 'cartoon'),
  oilpaint: H('classical', 'midi', 'natural', 0.45),
  // 手工
  watercolor: H('cpop', 'midi', 'natural'),
  papercut: H('acoustic', 'xm', 'natural'),
  collage: H('hiphop', 'midi', 'natural'),
  riso: H('lofi', 'xm', 'natural'),
  crossstitch: H('acoustic', 'xm', 'natural', 0.5),
  knit: H('acoustic', 'midi', 'natural', 0.45),
  brick: H('chipAdventure', 'xm', '8bit'),
  origami: H('ballad', 'xm', 'natural'),
  sticker: H('kpop', 'midi', 'cartoon'),
  doodle: H('kawaii', 'xm', 'cartoon'),
  // 東方
  inkwash: H('eastern', 'midi', 'natural', 0.35),
  ukiyoe: H('eastern', 'midi', 'natural'),
  jianzhi: H('eastern', 'midi', 'natural', 0.7),
  dunhuang: H('eastern', 'midi', 'natural', 0.4),
  guochao: H('hiphop', 'midi', 'cartoon', 0.85),
  shadowpuppet: H('eastern', 'xm', 'natural'),
  // 科技
  cyberpunk: H('cyber', 'fm', 'scifi'),
  neon: H('synthwave', 'sid', 'scifi'),
  hologram: H('house', 'midi', 'scifi'),
  hud: H('techno', 'xm', 'scifi'),
  terminal: H('techno', 'nes', '8bit'),
  matrix: H('cyber', 'xm', 'scifi'),
  wireframe: H('techno', 'sid', 'scifi'),
  dataviz: H('house', 'midi', 'ui'),
  scifi: H('cinematic', 'midi', 'scifi'),
  circuit: H('techno', 'nes', 'scifi'),
  // 鏡頭
  film: H('lofi', 'midi', 'natural'),
  silentfilm: H('ragtime', 'midi', 'natural'),
  polaroid: H('acoustic', 'midi', 'natural'),
  tiltshift: H('pop', 'midi', 'cartoon'),
  dreamy: H('cpop', 'midi', 'natural', 0.4),
  lomo: H('rock', 'midi', 'natural', 0.7),
  infrared: H('vapor', 'fm', 'natural'),
  sepia: H('classical', 'midi', 'natural'),
  // 3D
  voxel: H('cpop', 'midi', 'natural', 0.35),
  lowpoly: H('acoustic', 'midi', 'natural'),
  isometric: H('pop', 'midi', 'ui'),
  toon3d: H('wonder', 'midi', 'cartoon'),
  extrude: H('disco', 'midi', 'cartoon'),
  chrome: H('house', 'midi', 'scifi'),
  inflate: H('kpop', 'midi', 'cartoon'),
  clay3d: H('acoustic', 'midi', 'natural'),
  plastic3d: H('kpop', 'xm', 'cartoon'),
  glass3d: H('rnb', 'midi', 'scifi'),
  gold3d: H('cinematic', 'midi', 'natural', 0.7),
  cel3d: H('jpop', 'midi', 'cartoon', 0.9),
  holo3d: H('house', 'midi', 'scifi'),
  wire3d: H('techno', 'xm', 'ui'),
  blueprint3d: H('house', 'xm', 'ui'),
  neon3d: H('synthwave', 'fm', 'scifi'),
  paper3d: H('classical', 'xm', 'natural'),
  pearl3d: H('citypop', 'midi', 'scifi'),
  matte3d: H('ballad', 'midi', 'ui', 0.3),
  xray3d: H('trap', 'midi', 'scifi'),
  dither3d: H('chipDark', 'gb', '8bit'),
  lowpoly3d: H('bossa', 'midi', 'natural'),
  synthwave3d: H('synthwave', 'sid', 'scifi'),
  halftone3d: H('rock', 'midi', 'cartoon', 0.9),
  watercolor3d: H('cpop', 'midi', 'natural', 0.4),
};

interface MotionHint {
  tempo?: number;
  pack?: PackId;
  genre?: GenreId;
  energy?: number;
}
const MOTION: Record<string, MotionHint> = {
  'ui-micro': { pack: 'ui' },
  'material-motion': { pack: 'ui' },
  'ios-spring': { pack: 'ui' },
  shimmer: { pack: 'ui', tempo: 0.9 },
  stagger: { pack: 'ui' },
  parallax: { tempo: 0.9 },
  jelly: { pack: 'cartoon' },
  'data-grow': { pack: 'ui' },
  ripple: { pack: 'ui' },
  disney12: { pack: 'cartoon' },
  'rubberhose-m': { genre: 'ragtime', pack: 'cartoon' },
  'limited-anime': { genre: 'jpop', tempo: 1.0 },
  looney: { pack: 'cartoon', tempo: 1.1, energy: 1.1 },
  smear: { pack: 'cartoon' },
  overlap: { tempo: 0.95 },
  slowinout: { tempo: 0.9 },
  stopmotion: { pack: 'natural' },
  'claymation-m': { pack: 'natural' },
  'cutout-m': { pack: 'natural' },
  'pixel-anim': { pack: '8bit' },
  puppet: { pack: 'natural', tempo: 0.9 },
  drawon: { tempo: 0.95 },
  flowfield: { tempo: 0.85, pack: 'natural' },
  contour: { tempo: 0.85 },
  elastic: { pack: 'cartoon' },
  bounce: { pack: 'cartoon' },
  floaty: { genre: 'ambient', tempo: 0.8, energy: 0.6 },
  slowmo: { genre: 'ambient', tempo: 0.75, energy: 0.6 },
  mechanical: { genre: 'techno', pack: 'scifi' },
  heavy: { tempo: 0.85, pack: 'natural', energy: 1.1 },
  wind: { pack: 'natural', tempo: 0.9 },
  kinetic: { tempo: 1.05 },
  typewriter: { pack: '8bit' },
  scramble: { pack: 'scifi' },
  beat: { tempo: 1.05, energy: 1.1 },
  'glitch-m': { pack: 'scifi', energy: 1.05 },
  impact: { energy: 1.15 },
  zoompunch: { energy: 1.1 },
  'orbit-cam': { tempo: 0.9 },
  turntable: { tempo: 0.9 },
  'dolly-zoom': { tempo: 0.85 },
  flythrough: { tempo: 1.0 },
  'crane-shot': { tempo: 0.85 },
  tumble: { pack: 'natural' },
  'explode-view': { pack: 'scifi' },
  flip3d: { pack: 'cartoon' },
  levitate: { genre: 'ambient', tempo: 0.8, energy: 0.6 },
  truck: { tempo: 0.95 },
};

const SUBJECT_PACK: Partial<Record<SubjectId, PackId>> = {
  ui: 'ui',
  chart: 'ui',
  type: 'ui',
  text3d: 'ui',
  mascot: 'cartoon',
  char3d: 'cartoon',
  ball: 'cartoon',
  walk: 'natural',
  landscape: 'natural',
  terrain3d: 'scifi',
  shapes3d: 'ui',
  voxel: 'natural',
  geo: 'ui',
  abstract: 'scifi',
};

export interface MusicProfile {
  genre: GenreId;
  scheme: SchemeId;
  pack: PackId;
  tempoMul: number;
  energyMul: number;
  /** 給介面看的推導說明 */
  reasons: string[];
}

export function profileFor(v: Sel[], m: Sel[], subject: SubjectId): MusicProfile {
  const reasons: string[] = [];
  const vs = [...v].filter((x) => VISUAL_MAP[x.id] && x.w > 0.05).sort((a, b) => b.w - a.w);
  const dom = vs[0];
  let genre: GenreId = 'kawaii';
  let scheme: SchemeId = 'midi';
  let pack: PackId | undefined;
  let energy = 1;
  if (dom) {
    const st = VISUAL_MAP[dom.id];
    const cat = CAT[st.cat];
    const h = VISUAL[dom.id] ?? {};
    genre = h.genre ?? cat.genre;
    scheme = h.scheme ?? cat.scheme;
    pack = h.pack ?? cat.pack;
    energy = h.energy ?? 0.8;
    reasons.push(`主圖像風格「${st.name}」→ ${GENRES[genre].name}，用 ${SCHEME_INFO[scheme].name} 演奏`);
    // 第二個圖像風格：若主風格沒有明確的音效包，借用它的
    const second = vs[1];
    if (second && second.w >= 0.5) {
      const sh = VISUAL[second.id] ?? CAT[VISUAL_MAP[second.id].cat];
      if (sh.pack && sh.pack !== pack) {
        reasons.push(`「${VISUAL_MAP[second.id].name}」讓音效偏向${PACK_INFO[sh.pack].name}風`);
        if (second.w >= dom.w * 0.9) pack = sh.pack;
      }
      if (sh.energy) energy = (energy + sh.energy) / 2;
    }
  } else reasons.push('尚未選擇圖像風格，使用預設的可愛流行');

  const ms = [...m].filter((x) => MOTION_MAP[x.id] && x.w > 0.05).sort((a, b) => b.w - a.w);
  let tempo = 1;
  let wsum = 0;
  let tsum = 0;
  let energyMul = 1;
  for (const x of ms) {
    const h = MOTION[x.id];
    if (!h) continue;
    if (h.tempo) {
      tsum += (h.tempo - 1) * x.w;
      wsum += x.w;
    }
    if (h.energy) energyMul *= 1 + (h.energy - 1) * Math.min(1, x.w);
  }
  tempo = 1 + tsum / Math.max(1, wsum);
  const top = ms[0];
  if (top) {
    const h = MOTION[top.id];
    if (h?.genre && top.w >= 0.6) {
      genre = h.genre;
      reasons.push(`主動效風格「${MOTION_MAP[top.id].name}」把曲風改成${GENRES[genre].name}`);
    }
    if (h?.pack) {
      pack = h.pack;
      reasons.push(`動效「${MOTION_MAP[top.id].name}」→ 改用${PACK_INFO[h.pack].name}音效`);
    }
  }
  if (!pack) pack = SUBJECT_PACK[subject] ?? 'ui';
  if (tempo < 0.97 || tempo > 1.03) reasons.push(`動效讓速度 ${tempo < 1 ? '放慢' : '加快'} ${Math.abs(Math.round((tempo - 1) * 100))}%`);
  return { genre, scheme, pack, tempoMul: tempo, energyMul: energy * energyMul, reasons };
}
