import { Box, ChartColumn, Circle, Cuboid, Footprints, Ghost, Mountain, Mountain as TerrainIcon, Shapes, Smartphone, Sparkles, Type, type LucideIcon } from 'lucide-react';
import type { SubjectId } from '../engine/types';

export const SUBJECT_ICON: Record<SubjectId, LucideIcon> = {
  mascot: Ghost,
  ball: Circle,
  walk: Footprints,
  ui: Smartphone,
  type: Type,
  geo: Shapes,
  chart: ChartColumn,
  landscape: Mountain,
  abstract: Sparkles,
  voxel: Box,
  shapes3d: Cuboid,
  char3d: Ghost,
  text3d: Type,
  terrain3d: TerrainIcon,
};
