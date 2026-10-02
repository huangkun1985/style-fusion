import type { LookPatch, MovePatch, SubjectId } from '../engine/types';

export type VCat = 'retro' | 'mono' | 'cartoon' | 'modern' | 'movement' | 'craft' | 'east' | 'tech' | 'photo' | 'dim3d';
export type MCat = 'ui' | 'classic' | 'handmade' | 'lines' | 'physics' | 'type' | 'camera' | 'fx' | 'cam3d';

export interface VisualStyle {
  id: string;
  name: string;
  en: string;
  cat: VCat;
  desc: string;
  tips: string[];
  /** 英文關鍵詞（AI 提示詞用） */
  kw: string;
  demo?: SubjectId;
  pairs?: string[];
  look: LookPatch;
}

export interface MotionStyle {
  id: string;
  name: string;
  en: string;
  cat: MCat;
  desc: string;
  tips: string[];
  kw: string;
  demo?: SubjectId;
  pairs?: string[];
  /** 建議時長／節奏 */
  dur?: string;
  /** After Effects 表達式片段 */
  ae?: string;
  move: MovePatch;
}

export interface Recipe {
  id: string;
  name: string;
  desc: string;
  use: string[];
  v: [string, number][];
  m: [string, number][];
  subject: SubjectId;
}

export interface Sel {
  id: string;
  w: number;
}
