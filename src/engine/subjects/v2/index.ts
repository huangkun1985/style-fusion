// 主體 v2：重新設計的版本。每個主體只要在這裡登錄就會出現在全域切換的 v2 裡；沒登錄的沿用 v1。
import type { SubjectId } from '../../types';
import type { Subject } from '../types';
import { abstract2 } from './abstract';
import { ball2 } from './ball';
import { char3d2 } from './char3d';
import { chart2 } from './chart';
import { geo2 } from './geo';
import { landscape2 } from './landscape';
import { mascot2 } from './mascot';
import { shapes3d2 } from './shapes3d';
import { terrain3d2 } from './terrain3d';
import { text3d2 } from './text3d';
import { type2 } from './type';
import { ui2 } from './ui';
import { voxel2 } from './voxel';
import { walk2 } from './walk';

export const SUBJECTS_V2_MAP: Partial<Record<SubjectId, Subject>> = { mascot: mascot2, ball: ball2, walk: walk2, ui: ui2, type: type2, geo: geo2, chart: chart2, landscape: landscape2, abstract: abstract2, char3d: char3d2, voxel: voxel2, shapes3d: shapes3d2, text3d: text3d2, terrain3d: terrain3d2 };
