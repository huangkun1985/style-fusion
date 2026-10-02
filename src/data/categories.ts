import type { MCat, VCat } from './schema';

export const VCATS: { id: VCat; name: string; en: string }[] = [
  { id: 'dim3d', name: '3D 渲染（真 3D）', en: '3D Render' },
  { id: 'retro', name: '像素與復古', en: 'Pixel & Retro' },
  { id: 'mono', name: '黑白與單色', en: 'Monochrome' },
  { id: 'cartoon', name: '卡通與動畫', en: 'Cartoon' },
  { id: 'modern', name: '現代與 UI', en: 'Modern & UI' },
  { id: 'movement', name: '藝術與設計流派', en: 'Art Movements' },
  { id: 'craft', name: '手工與材質', en: 'Craft & Material' },
  { id: 'east', name: '東方美學', en: 'Eastern' },
  { id: 'tech', name: '科技與未來', en: 'Tech & Sci-fi' },
  { id: 'photo', name: '鏡頭與膠片', en: 'Lens & Film' },
];

export const MCATS: { id: MCat; name: string; en: string }[] = [
  { id: 'cam3d', name: '3D 鏡頭與物件', en: '3D Camera & Objects' },
  { id: 'ui', name: 'UI 與產品', en: 'UI & Product' },
  { id: 'classic', name: '經典動畫原則', en: 'Classic Principles' },
  { id: 'handmade', name: '手作與定格', en: 'Handmade' },
  { id: 'lines', name: '線條與幾何', en: 'Lines & Geometry' },
  { id: 'physics', name: '物理與自然', en: 'Physics & Nature' },
  { id: 'type', name: '文字與排版', en: 'Typography' },
  { id: 'camera', name: '鏡頭與轉場', en: 'Camera' },
  { id: 'fx', name: '節奏與特效', en: 'Rhythm & FX' },
];

export const VCAT_NAME = Object.fromEntries(VCATS.map((c) => [c.id, c.name])) as Record<VCat, string>;
export const MCAT_NAME = Object.fromEntries(MCATS.map((c) => [c.id, c.name])) as Record<MCat, string>;
