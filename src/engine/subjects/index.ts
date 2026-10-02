import type { SubjectId } from '../types';
import { abstract } from './abstract';
import { ball } from './ball';
import { chart } from './chart';
import { char3d } from './char3d';
import { geo } from './geo';
import { landscape } from './landscape';
import { mascot } from './mascot';
import { shapes3d } from './shapes3d';
import { terrain3d } from './terrain3d';
import { text3d } from './text3d';
import type { Subject } from './types';
import { type } from './type';
import { ui } from './ui';
import { voxel } from './voxel';
import { walk } from './walk';

export const SUBJECTS: Record<SubjectId, Subject> = { mascot, ball, ui, type, geo, landscape, walk, abstract, chart, voxel, shapes3d, char3d, text3d, terrain3d };
/** 2D 主體在前，真 3D 主體在後 */
export const SUBJECT_ORDER: SubjectId[] = ['mascot', 'ball', 'walk', 'ui', 'type', 'geo', 'chart', 'landscape', 'abstract', 'shapes3d', 'char3d', 'text3d', 'terrain3d', 'voxel'];
