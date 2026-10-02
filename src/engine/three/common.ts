// 3D 場景共用：動效參數換算、抖動、燈光。
import * as THREE from 'three';
import { darken, lighten } from '../color';
import type { MotionCtx } from '../motion';
import type { Look } from '../types';
import { TAU } from '../util';
import type { Motion3D } from './types';

/** 把 MoveNums 的 3D 參數換成每幀的數值（皆為 u 的週期函數，確保無縫循環） */
export function motion3d(M: MotionCtx, look: Look): Motion3D {
  const mv = M.mv;
  const u = M.u;
  const spinY = mv.spin > 0.6 ? TAU * u * Math.round(mv.spin + 0.2) : mv.spin * 0.55 * Math.sin(TAU * u);
  return {
    spinY,
    levY: mv.levitate * 0.28 * Math.sin(TAU * u * 2),
    levRotY: mv.levitate * 0.2 * Math.sin(TAU * u),
    explode: mv.explode * (0.5 - 0.5 * Math.cos(TAU * u)),
    tumble: mv.tumble * TAU * u,
    look,
  };
}

/** 定格抖動換到 3D 單位 */
export function jit3(M: MotionCtx, id: number, k = 1) {
  const j = M.jit(id, k);
  return { x: j.x * 0.03, y: j.y * 0.03, r: j.r };
}

/** 每個物件的進場／退場（0..1） */
export function appear(M: MotionCtx, i: number, a = 0.04, b = 0.2): number {
  const s = M.stag(i) * 1.4;
  return M.tw(a + s, b + s, 'o') * (1 - M.tw(0.86 + s * 0.5, 0.98, 'i'));
}

/** 燈光方案：回傳含燈光的群組 */
export function buildRig(look: Look, small: boolean): THREE.Group {
  const g = new THREE.Group();
  const P = look.pal;
  const sky = new THREE.Color(lighten(P.light, 0));
  const ground = new THREE.Color(darken(P.bg2, 0.3));
  const size = small ? 512 : 1024;
  const dir = (color: string | number, intensity: number, pos: [number, number, number], shadow: boolean) => {
    const l = new THREE.DirectionalLight(color, intensity);
    l.position.set(...pos);
    if (shadow) {
      l.castShadow = true;
      l.shadow.mapSize.set(size, size);
      const c = l.shadow.camera;
      c.left = -9;
      c.right = 9;
      c.top = 9;
      c.bottom = -9;
      c.near = 1;
      c.far = 40;
      l.shadow.bias = -0.0012;
      l.shadow.normalBias = 0.03;
      l.shadow.radius = 3;
    }
    g.add(l);
    return l;
  };
  const hemi = (i: number, s: THREE.Color = sky, gr: THREE.Color = ground) => g.add(new THREE.HemisphereLight(s, gr, i));
  const point = (color: string, intensity: number, pos: [number, number, number]) => {
    const l = new THREE.PointLight(color, intensity, 24, 2);
    l.position.set(...pos);
    g.add(l);
  };
  switch (look.light3d) {
    case 'sunny':
      hemi(1.05, new THREE.Color('#cfe6ff'), new THREE.Color(darken(P.q, 0.25)));
      dir('#fff0cf', 2.8, [7, 10, 5], true);
      break;
    case 'soft':
      hemi(1.45);
      dir('#ffffff', 1.25, [4, 9, 7], true);
      break;
    case 'dramatic':
      hemi(0.22);
      dir('#ffffff', 3.6, [-6, 6, 3], true);
      dir(P.s, 2.2, [6, 3, -5], false);
      break;
    case 'neon':
      hemi(0.28);
      point(P.p, 80, [-5, 3.5, 4]);
      point(P.s, 80, [5, 2.5, 4]);
      point(P.a, 45, [0, 5, -4]);
      dir('#ffffff', 0.8, [3, 8, 5], true);
      break;
    case 'flat':
      hemi(1.25);
      dir('#ffffff', 0.55, [3, 8, 6], false);
      break;
    default:
      hemi(0.85);
      dir('#ffffff', 2.3, [5, 9, 6], true);
      dir('#bcd6ff', 0.9, [-6, 4, -5], false);
  }
  return g;
}
