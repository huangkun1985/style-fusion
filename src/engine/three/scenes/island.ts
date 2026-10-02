// 場景：體素小島。方塊角色在島上跳躍，雲飄過，樹葉隨風搖。
import * as THREE from 'three';
import { darken, lighten, mix } from '../../color';
import { clamp, hash, lerp, TAU, wrap } from '../../util';
import { blocks, type Block } from '../blocks';
import { motion3d } from '../common';
import type { BuildCtx, SceneInst } from '../types';

function islandBlocks() {
  const grass: Block[] = [];
  const dirt: Block[] = [];
  const stone: Block[] = [];
  for (let x = -3; x <= 3; x++)
    for (let z = -3; z <= 3; z++) {
      if (Math.abs(x) === 3 && Math.abs(z) === 3) continue;
      grass.push({ x, y: 0, z });
      dirt.push({ x, y: -1, z });
      if (Math.abs(x) <= 2 && Math.abs(z) <= 2) dirt.push({ x, y: -2, z });
      if (Math.abs(x) <= 1 && Math.abs(z) <= 1) stone.push({ x, y: -3, z });
    }
  stone.push({ x: 2, y: 1, z: 2 }, { x: 3, y: 1, z: 0 });
  const trunk: Block[] = [1, 2, 3].map((y) => ({ x: -2, y, z: -2 }));
  const leaves: Block[] = [];
  for (let x = -3; x <= -1; x++) for (let z = -3; z <= -1; z++) for (let y = 4; y <= 5; y++) if (!(y === 5 && x !== -2 && z !== -2)) leaves.push({ x, y, z });
  leaves.push({ x: -2, y: 6, z: -2 });
  const flowers: Block[] = [
    { x: 1, y: 0.62, z: -2 },
    { x: -1, y: 0.62, z: 2 },
    { x: 2, y: 0.62, z: -1 },
  ];
  return { grass, dirt, stone, trunk, leaves, flowers };
}

export function buildIsland({ look, kit }: BuildCtx): SceneInst {
  const P = look.pal;
  const root = new THREE.Group();
  const world = new THREE.Group();
  root.add(world);
  const B = islandBlocks();
  world.add(blocks(kit, B.grass, P.q));
  world.add(blocks(kit, B.dirt, P.r));
  world.add(blocks(kit, B.stone, mix(P.r, '#8a8f98', 0.6)));
  world.add(blocks(kit, B.trunk, darken(P.r, 0.12)));
  const leavesG = new THREE.Group();
  leavesG.add(blocks(kit, B.leaves, darken(P.q, 0.14)));
  world.add(leavesG);
  world.add(blocks(kit, B.flowers, P.a, 0.24));

  // 角色
  const skin = mix(P.light, P.a, 0.35);
  const hero = new THREE.Group();
  const part = (parent: THREE.Object3D, w: number, h: number, d: number, y: number, color: string, x = 0, z = 0) => {
    const m = kit.mesh(new THREE.BoxGeometry(w, h, d), color);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };
  const legL = new THREE.Group();
  const legR = new THREE.Group();
  legL.position.set(-0.15, 0.62, 0);
  legR.position.set(0.15, 0.62, 0);
  part(legL, 0.28, 0.62, 0.3, -0.31, P.s);
  part(legR, 0.28, 0.62, 0.3, -0.31, P.s);
  const torso = new THREE.Group();
  part(torso, 0.62, 0.72, 0.36, 0.98, P.p);
  const armL = new THREE.Group();
  const armR = new THREE.Group();
  armL.position.set(-0.43, 1.28, 0);
  armR.position.set(0.43, 1.28, 0);
  part(armL, 0.22, 0.62, 0.26, -0.28, P.p);
  part(armR, 0.22, 0.62, 0.26, -0.28, P.p);
  const head = new THREE.Group();
  head.position.set(0, 1.62, 0);
  part(head, 0.56, 0.56, 0.56, 0, skin);
  part(head, 0.1, 0.1, 0.04, 0.03, P.ink, -0.12, 0.29);
  part(head, 0.1, 0.1, 0.04, 0.03, P.ink, 0.12, 0.29);
  part(head, 0.6, 0.14, 0.6, 0.27, darken(P.r, 0.2));
  torso.add(armL, armR, head);
  hero.add(legL, legR, torso);
  world.add(hero);

  // 雲
  const clouds = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const cells: Block[] = [];
    const n = 3 + (i % 2);
    for (let k = 0; k < n; k++) cells.push({ x: k * 0.9, y: 0, z: (k % 2) * 0.6 });
    const g = new THREE.Group();
    g.add(blocks(kit, cells, lighten(P.light, 0), 0.9));
    g.userData = { x0: hash(i, 3) * 12, y: 4.8 + hash(i, 4) * 1.5, z: -4 + hash(i, 5) * 6 };
    clouds.add(g);
  }
  world.add(clouds);

  return {
    root,
    base: { az: -0.6, el: 0.48, dist: 19, target: [0, 1.1, 0], fov: 30 },
    update(M) {
      const mv = M.mv;
      const u = M.u;
      const m3 = motion3d(M, look);
      const hops = [
        { a: 0.1, b: 0.42, x0: -1.4, x1: 1.4 },
        { a: 0.6, b: 0.92, x0: 1.4, x1: -1.4 },
      ];
      let x = u < 0.1 || u > 0.92 ? -1.4 : u > 0.42 && u < 0.6 ? 1.4 : 0;
      let y = 0;
      let sy = 1;
      let air = 0;
      let face = u > 0.42 && u < 0.92 ? -1 : 1;
      for (const hp of hops) {
        if (u < hp.a || u > hp.b) continue;
        const v = (u - hp.a) / (hp.b - hp.a);
        face = Math.sign(hp.x1 - hp.x0);
        if (v < 0.22) {
          x = hp.x0;
          sy = 1 - (0.08 + 0.25 * mv.antic) * M.io(v / 0.22) * (0.4 + 0.6 * Math.min(1, mv.squash + 0.2));
        } else if (v < 0.72) {
          const k = (v - 0.22) / 0.5;
          x = lerp(hp.x0, hp.x1, lerp(M.io(k), k, clamp(mv.arc)));
          y = (1.3 + 0.4 * mv.exag) * (1 - 0.35 * mv.heavy) * lerp(4 * k * (1 - k), k < 0.5 ? M.out(2 * k) : M.out(2 - 2 * k), mv.easeW);
          sy = 1 + 0.25 * mv.squash * Math.abs(1 - 2 * k);
          air = Math.sin(Math.PI * k);
        } else {
          const k = (v - 0.72) / 0.28;
          x = hp.x1;
          sy = 1 - 0.3 * mv.squash * Math.exp(-k * 6) * Math.cos(k * Math.PI * 2.2);
        }
      }
      const j = M.jit(5);
      hero.position.set(x + j.x * 0.02, 0.5 + Math.max(0, y) + j.y * 0.01, 0.4);
      hero.rotation.y = (face > 0 ? Math.PI / 2 : -Math.PI / 2) - 0.35;
      hero.rotation.z = j.r;
      torso.scale.set(1 / Math.sqrt(sy), sy, 1 / Math.sqrt(sy));
      legL.scale.y = sy;
      legR.scale.y = sy;
      const swing = air * 1.2 + Math.sin(TAU * u * 4) * 0.05 * (1 - air);
      armL.rotation.set(-swing * 1.6, 0, -air * 0.4);
      armR.rotation.set(-swing * 1.6, 0, air * 0.4);
      legL.rotation.x = air * 0.5;
      legR.rotation.x = -air * 0.3;
      head.rotation.x = -air * 0.15 * mv.follow;
      leavesG.position.x = mv.wind * 0.12 * Math.sin(TAU * u * 3);
      clouds.children.forEach((g) => {
        const d = g.userData as { x0: number; y: number; z: number };
        g.position.set(wrap(d.x0 + u * 12, 12) - 6, d.y, d.z);
      });
      world.position.y = M.fl(9, 0.02) - 0.2 + m3.levY;
      world.rotation.y = m3.spinY;
    },
  };
}
