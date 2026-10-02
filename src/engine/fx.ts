// 後期特效登記表：中性參數、執行順序、對應 shader uniform。
// 圖像風格只需宣告 { fx: 'pixelate', size: 1/72 } 這類片段，混合時按權重合併。

export interface FxDef {
  id: string;
  name: string;
  order: number;
  params: Record<string, number>;
  /** 是否需要 amt > 0 才執行（多數特效） */
  gate?: 'amt' | 'size' | 'grade';
  /** P = uniform vec4 uP，Q = uniform vec4 uQ */
  map: (p: Record<string, number>) => { P: number[]; Q?: number[] };
  multi?: 'bloom' | 'blur';
}

const D = (d: FxDef) => d;

export const FX: Record<string, FxDef> = {
  wave: D({ id: 'wave', name: '波動扭曲', order: 5, params: { amt: 0, freq: 8, speed: 1 }, map: (p) => ({ P: [p.amt, p.freq, p.speed, 0] }) }),
  kaleido: D({ id: 'kaleido', name: '萬花筒', order: 6, params: { amt: 0, seg: 6 }, map: (p) => ({ P: [p.seg, 0, 0, 0] }) }),
  voronoi: D({
    id: 'voronoi',
    name: '泰森多邊形',
    order: 10,
    params: { amt: 0, cell: 0.05, border: 0.06, mode: 0, jitter: 1, glow: 0 },
    map: (p) => ({ P: [p.cell, p.border, p.mode, p.jitter], Q: [p.glow, 0, 0, 0] }),
  }),
  tri: D({ id: 'tri', name: '三角面', order: 11, params: { amt: 0, cell: 0.05, shade: 0.25 }, map: (p) => ({ P: [p.cell, p.shade, 0, 0] }) }),
  kuwahara: D({ id: 'kuwahara', name: '油畫筆觸', order: 12, params: { amt: 0, radius: 0.008 }, map: (p) => ({ P: [p.radius, 0, 0, 0] }) }),
  watercolor: D({
    id: 'watercolor',
    name: '水彩暈染',
    order: 14,
    params: { amt: 0, bleed: 1, edge: 1, gran: 0.6 },
    map: (p) => ({ P: [p.bleed, p.edge, p.gran, 0] }),
  }),
  pixelate: D({ id: 'pixelate', name: '像素化', order: 20, gate: 'size', params: { size: 0 }, map: (p) => ({ P: [p.size, 0, 0, 0] }) }),
  edges: D({
    id: 'edges',
    name: '線稿描邊',
    order: 25,
    params: { amt: 0, thresh: 0.12, width: 1, mode: 0, hatch: 0, jitter: 0 },
    map: (p) => ({ P: [p.thresh, p.width, p.mode, p.hatch], Q: [p.jitter, 0, 0, 0] }),
  }),
  grade: D({
    id: 'grade',
    name: '調色',
    order: 30,
    gate: 'grade',
    params: { hue: 0, sat: 1, contrast: 1, bright: 0, warm: 0, fade: 0, hueSpeed: 0 },
    map: (p) => ({ P: [p.hue, p.sat, p.contrast, p.bright], Q: [p.warm, p.fade, p.hueSpeed, 0] }),
  }),
  posterize: D({ id: 'posterize', name: '色調分離', order: 32, params: { amt: 0, levels: 6, dither: 0 }, map: (p) => ({ P: [p.levels, p.dither, 0, 0] }) }),
  gradmap: D({ id: 'gradmap', name: '漸變映射', order: 34, params: { amt: 0, contrast: 1 }, map: (p) => ({ P: [0, p.contrast, 0, 0] }) }),
  quantize: D({ id: 'quantize', name: '色板量化', order: 36, params: { amt: 0, dither: 0, cell: 0 }, map: (p) => ({ P: [p.dither, p.cell, 0, 0] }) }),
  grayscale: D({ id: 'grayscale', name: '灰階', order: 38, params: { amt: 0, contrast: 1, bright: 0 }, map: (p) => ({ P: [p.contrast, p.bright, 0, 0] }) }),
  threshold: D({
    id: 'threshold',
    name: '1-bit 閾值',
    order: 40,
    params: { amt: 0, level: 0.5, dither: 0, cell: 0, noise: 0 },
    map: (p) => ({ P: [p.level, p.dither, p.cell, p.noise] }),
  }),
  invert: D({ id: 'invert', name: '反相', order: 42, params: { amt: 0 }, map: () => ({ P: [0, 0, 0, 0] }) }),
  halftone: D({
    id: 'halftone',
    name: '網點印刷',
    order: 50,
    params: { amt: 0, cell: 0.012, angle: 0.785, mode: 0 },
    map: (p) => ({ P: [p.cell, p.angle, p.mode, 0] }),
  }),
  hatching: D({ id: 'hatching', name: '交叉排線', order: 51, params: { amt: 0, space: 0.016, width: 0.9 }, map: (p) => ({ P: [p.space, p.width, 0, 0] }) }),
  engrave: D({ id: 'engrave', name: '雕刻線', order: 52, params: { amt: 0, space: 0.012 }, map: (p) => ({ P: [p.space, 0, 0, 0] }) }),
  ascii: D({ id: 'ascii', name: 'ASCII 字符', order: 53, params: { amt: 0, cell: 0.02, color: 0 }, map: (p) => ({ P: [p.cell, p.color, 0, 0] }) }),
  dots: D({ id: 'dots', name: '點彩', order: 54, params: { amt: 0, cell: 0.01 }, map: (p) => ({ P: [p.cell, 0, 0, 0] }) }),
  led: D({ id: 'led', name: 'LED 點陣', order: 55, params: { amt: 0, cell: 0.018 }, map: (p) => ({ P: [p.cell, 0, 0, 0] }) }),
  bevel: D({ id: 'bevel', name: '方塊浮雕', order: 56, params: { amt: 0, cell: 0.022, strength: 1, noise: 0.3 }, map: (p) => ({ P: [p.cell, p.strength, p.noise, 0] }) }),
  studs: D({ id: 'studs', name: '積木凸點', order: 57, params: { amt: 0, cell: 0.03 }, map: (p) => ({ P: [p.cell, 0, 0, 0] }) }),
  knit: D({ id: 'knit', name: '毛線編織', order: 58, params: { amt: 0, cell: 0.03 }, map: (p) => ({ P: [p.cell, 0, 0, 0] }) }),
  stitch: D({ id: 'stitch', name: '十字繡', order: 59, params: { amt: 0, cell: 0.018 }, map: (p) => ({ P: [p.cell, 0, 0, 0] }) }),
  riso: D({ id: 'riso', name: '孔版雙色', order: 60, params: { amt: 0, misreg: 1, grain: 1 }, map: (p) => ({ P: [p.misreg, p.grain, 0, 0] }) }),
  bloom: D({ id: 'bloom', name: '泛光', order: 70, multi: 'bloom', params: { amt: 0, thresh: 0.55, radius: 1 }, map: (p) => ({ P: [p.thresh, p.radius, 0, 0] }) }),
  blur: D({ id: 'blur', name: '柔焦', order: 72, multi: 'blur', params: { amt: 0 }, map: () => ({ P: [0, 0, 0, 0] }) }),
  tiltshift: D({ id: 'tiltshift', name: '移軸微縮', order: 74, params: { amt: 0, focus: 0.14, sat: 1.35 }, map: (p) => ({ P: [p.focus, p.amt, p.sat, 0] }) }),
  mblur: D({ id: 'mblur', name: '動態模糊', order: 76, params: { amt: 0, angle: 0 }, map: (p) => ({ P: [p.amt, p.angle, 0, 0] }) }),
  chroma: D({ id: 'chroma', name: '色差', order: 80, params: { amt: 0 }, map: (p) => ({ P: [p.amt, 0, 0, 0] }) }),
  glitch: D({ id: 'glitch', name: '故障', order: 82, params: { amt: 0 }, map: (p) => ({ P: [p.amt, 0, 0, 0] }) }),
  vhs: D({ id: 'vhs', name: 'VHS 錄像', order: 84, params: { amt: 0 }, map: (p) => ({ P: [p.amt, 0, 0, 0] }) }),
  holo: D({ id: 'holo', name: '全息', order: 86, params: { amt: 0 }, map: () => ({ P: [0, 0, 0, 0] }) }),
  scanlines: D({ id: 'scanlines', name: '掃描線', order: 90, params: { amt: 0, space: 0.007 }, map: (p) => ({ P: [p.space, 0, 0, 0] }) }),
  crt: D({ id: 'crt', name: 'CRT 顯像管', order: 92, params: { amt: 0, curve: 1, scan: 0.7, mask: 0.5, vig: 0.6 }, map: (p) => ({ P: [p.curve, p.scan, p.mask, p.vig] }) }),
  paper: D({ id: 'paper', name: '紙張紋理', order: 95, params: { amt: 0, fiber: 1 }, map: (p) => ({ P: [p.amt, p.fiber, 0, 0] }) }),
  film: D({ id: 'film', name: '膠片損傷', order: 96, params: { amt: 0, scratch: 1, dust: 1, flicker: 1 }, map: (p) => ({ P: [p.scratch, p.dust, p.flicker, 0] }) }),
  vignette: D({ id: 'vignette', name: '暗角', order: 97, params: { amt: 0, soft: 0.55 }, map: (p) => ({ P: [p.amt, p.soft, 0, 0] }) }),
  grain: D({ id: 'grain', name: '顆粒', order: 99, params: { amt: 0, size: 1 }, map: (p) => ({ P: [p.amt, p.size, 0, 0] }) }),
};

export function fxActive(def: FxDef, p: Record<string, number>): boolean {
  if (def.gate === 'size') return (p.size ?? 0) > 0.0005;
  if (def.gate === 'grade') {
    return (
      Math.abs(p.hue) > 0.001 ||
      Math.abs(p.sat - 1) > 0.01 ||
      Math.abs(p.contrast - 1) > 0.01 ||
      Math.abs(p.bright) > 0.005 ||
      Math.abs(p.warm) > 0.01 ||
      Math.abs(p.fade) > 0.01 ||
      Math.abs(p.hueSpeed) > 0.001
    );
  }
  return (p.amt ?? 0) > 0.01;
}
