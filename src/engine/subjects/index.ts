import type { SubjectId } from '../types';
import { abstract } from './abstract';
import { ball } from './ball';
import { chart } from './chart';
import { custom } from './custom';
import { char3d } from './char3d';
import { geo } from './geo';
import { landscape } from './landscape';
import { loader } from './loader';
import { logo } from './logo';
import { fireworks } from './fireworks';
import { weather } from './weather';
import { portrait } from './portrait';
import { music } from './music';
import { mascot } from './mascot';
import { product3d } from './product3d';
import { shapes3d } from './shapes3d';
import { terrain3d } from './terrain3d';
import { text3d } from './text3d';
import type { Subject } from './types';
import { SUBJECTS_V2_MAP } from './v2';
import { type } from './type';
import { ui } from './ui';
import { voxel } from './voxel';
import { walk } from './walk';

/** 主體版本：v1 是最初的設計（原樣保留），v2 是重新設計的版本；全域切換，沒有 v2 的主體沿用 v1 */
export type SubjectVer = 'v1' | 'v2';
const V1: Record<SubjectId, Subject> = { mascot, ball, ui, type, geo, landscape, walk, abstract, chart, loader, logo, fireworks, weather, portrait, music, custom, voxel, shapes3d, char3d, text3d, terrain3d, product3d };
export const SUBJECTS_V2: Partial<Record<SubjectId, Subject>> = SUBJECTS_V2_MAP;
let ver: SubjectVer = 'v2';
export const subjectVersion = () => ver;
export const setSubjectVersion = (v: SubjectVer) => {
  ver = v;
};
/** 依目前的全域版本回傳主體；用法與以前相同：SUBJECTS[id] */
export const SUBJECTS: Record<SubjectId, Subject> = new Proxy(V1, {
  get: (t, k: string) => (ver === 'v2' ? SUBJECTS_V2[k as SubjectId] : undefined) ?? t[k as SubjectId],
});
/** 2D 主體在前，真 3D 主體在後 */
export const SUBJECT_ORDER: SubjectId[] = ['mascot', 'ball', 'walk', 'ui', 'type', 'geo', 'chart', 'loader', 'logo', 'fireworks', 'weather', 'portrait', 'music', 'landscape', 'abstract', 'custom', 'shapes3d', 'char3d', 'text3d', 'terrain3d', 'product3d', 'voxel'];
