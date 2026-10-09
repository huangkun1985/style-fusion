import { AudioLines, Box, ChartColumn, Circle, CircleCheck, CloudSunRain, UserRound, Hexagon, PartyPopper, Cuboid, Footprints, Ghost, Headphones, Mountain, Mountain as TerrainIcon, Puzzle, Shapes, Smartphone, Sparkles, Type, type LucideIcon } from 'lucide-react';
import type { SubjectId } from '../engine/types';

export const SUBJECT_ICON: Record<SubjectId, LucideIcon> = {
  mascot: Ghost,
  ball: Circle,
  walk: Footprints,
  ui: Smartphone,
  type: Type,
  geo: Shapes,
  chart: ChartColumn,
  loader: CircleCheck,
  logo: Hexagon,
  fireworks: PartyPopper,
  weather: CloudSunRain,
  portrait: UserRound,
  music: AudioLines,
  landscape: Mountain,
  abstract: Sparkles,
  custom: Puzzle,
  voxel: Box,
  shapes3d: Cuboid,
  char3d: Ghost,
  text3d: Type,
  terrain3d: TerrainIcon,
  product3d: Headphones,
};
