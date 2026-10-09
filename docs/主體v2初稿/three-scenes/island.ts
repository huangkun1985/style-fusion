// 場景 v2：體素小島。島上有石板小徑、小木屋（紅屋頂、煙囪冒煙）、一棵圓冠大樹與一棵針葉樹、野花與營火；
// 周圍一圈水面，島下方漂著幾塊碎石；角色換成有帽子、大眼睛、背包的體素小人，沿用跳躍路線；雲飄過、樹葉隨風搖。
import * as THREE from 'three';
import { darken, lighten, mix } from '../../../color';
import { clamp, hash, lerp, TAU, wrap } from '../../../util';
import { blocks, type Block } from '../../blocks';
import { motion3d } from '../../common';
import type { BuildCtx, SceneInst } from '../../types';

function islandBlocks() {
  const grass: Block[] = [];
  const dirt: Block[] = [];
  const stone: Block[] = [];
  const path: Block[] = [];
  for (let x = -3; x <= 3; x++)
    for (let z = -3; z <= 3; z++) {
      if (Math.abs(x) === 3 && Math.abs(z) === 3) continue;
      const onPath = (x >= -1 && x <= 1 && z === 0) || (x === 1 && z >= 0 && z <= 2);
      (onPath ? path : grass).push({ x, y: 0, z });
      dirt.push({ x, y: -1, z });
      if (Math.abs(x) <= 2 && Math.abs(z) <= 2) dirt.push({ x, y: -2, z });
      if (Math.abs(x) <= 1 && Math.abs(z) <= 1) stone.push({ x, y: -3, z });
    }
  stone.push({ x: 3, y: 1, z: 0 });
  // 小木屋
  const wall: Block[] = [];
  const roof: Block[] = [];
  for (let x = 1; x <= 2; x++) for (let z = -3; z <= -2; z++) for (let y = 1; y <= 2; y++) wall.push({ x, y, z });
  for (let x = 1; x <= 2; x++) for (let z = -3; z <= -2; z++) roof.push({ x, y: 3, z });
  for (let x = 1; x <= 2; x++) roof.push({ x, y: 4, z: -2.5 });
  const chimney: Block[] = [{ x: 2, y: 4, z: -3 }];
  // 樹
  const trunk: Block[] = [1, 2, 3].map((y) => ({ x: -2, y, z: -3 }));
  const leaves: Block[] = [];
  for (let x = -3; x <= -1; x++) for (let z = -4; z <= -2; z++) for (let y = 4; y <= 5; y++) if (!(y === 5 && x !== -2 && z !== -3)) leaves.push({ x, y, z });
  leaves.push({ x: -2, y: 6, z: -3 });
  const pineTrunk: Block[] = [1, 2].map((y) => ({ x: 3, y, z: 1 }));
  const pine: Block[] = [];
  for (const [y, r] of [[3, 1], [4, 1], [5, 0]] as [number, number][]) {
    for (let x = -r; x <= r; x++) for (let z = -r; z <= r; z++) if (r === 0 || Math.abs(x) + Math.abs(z) <= r) pine.push({ x: 3 + x, y, z: 1 + z });
  }
  const flowers: Block[] = [
    { x: 0, y: 0.62, z: -2 },
    { x: -1, y: 0.62, z: 2 },
    { x: 2, y: 0.62, z: 1 },
    { x: -2, y: 0.62, z: 0 },
  ];
  const fire: Block[] = [{ x: -2, y: 0.55, z: 1 }];
  return { grass, dirt, stone, path, wall, roof, chimney, trunk, leaves, pineTrunk, pine, flowers, fire };
}

export function buildIsland2({ look, kit }: BuildCtx): SceneInst {
  const P = look.pal;
  const root = new THREE.Group();
  const world = new THREE.Group();
  root.add(world);
  const B = islandBlocks();
  const flat = kit.mat === 'wire' || kit.mat === 'neon';
  world.add(blocks(kit, B.grass, P.q));
  world.add(blocks(kit, B.path, lighten(mix(P.r, P.light, 0.5), 0)));
  world.add(blocks(kit, B.dirt, P.r));
  world.add(blocks(kit, B.stone, mix(P.r, '#8a8f98', 0.6)));
  world.add(blocks(kit, B.wall, mix(P.light, P.a, 0.3)));
  world.add(blocks(kit, B.roof, P.p));
  world.add(blocks(kit, B.chimney, darken(P.r, 0.1)));
  world.add(blocks(kit, B.trunk, darken(P.r, 0.12)));
  const leavesG = new THREE.Group();
  leavesG.add(blocks(kit, B.leaves, darken(P.q, 0.14)));
  world.add(leavesG);
  world.add(blocks(kit, B.pineTrunk, darken(P.r, 0.15)));
  const pineG = new THREE.Group();
  pineG.add(blocks(kit, B.pine, darken(P.q, 0.28)));
  world.add(pineG);
  world.add(blocks(kit, B.flowers, P.a, 0.24));
  const fire = blocks(kit, B.fire, P.p, 0.4);
  world.add(fire);

  // 水面（半透明的大方塊）與漂浮的碎石
  if (!flat) {
    const water = new THREE.Mesh(kit.track(new THREE.BoxGeometry(18, 0.2, 18)), kit.track(new THREE.MeshLambertMaterial({ color: new THREE.Color(P.s), transparent: true, opacity: 0.55 })));
    water.position.y = -1.6;
    world.add(water);
  }
  const rocks = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const cells: Block[] = [{ x: 0, y: 0, z: 0 }];
    const g = new THREE.Group();
    g.add(blocks(kit, cells, mix(P.r, '#8a8f98', 0.6), 0.5 + (i % 2) * 0.25));
    g.userData = { a: (i / 4) * TAU + 0.5, r: 4.6 + (i % 2) * 0.8, y: -3.4 - (i % 3) * 0.5 };
    rocks.add(g);
  }
  world.add(rocks);

  // 炊煙
  const smoke: THREE.Object3D[] = [];
  for (let i = 0; i < 3; i++) {
    const g = new THREE.Group();
    g.add(blocks(kit, [{ x: 0, y: 0, z: 0 }], P.light, 0.32));
    world.add(g);
    smoke.push(g);
  }

  // 角色：有帽子、大眼睛、背包
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
  part(torso, 0.4, 0.5, 0.18, 1.0, P.a, 0, -0.26);
  const armL = new THREE.Group();
  const armR = new THREE.Group();
  armL.position.set(-0.43, 1.28, 0);
  armR.position.set(0.43, 1.28, 0);
  part(armL, 0.22, 0.62, 0.26, -0.28, P.p);
  part(armR, 0.22, 0.62, 0.26, -0.28, P.p);
  const head = new THREE.Group();
  head.position.set(0, 1.66, 0);
  part(head, 0.6, 0.58, 0.58, 0, skin);
  part(head, 0.14, 0.18, 0.04, 0.0, P.ink, -0.14, 0.31);
  part(head, 0.14, 0.18, 0.04, 0.0, P.ink, 0.14, 0.31);
  part(head, 0.05, 0.05, 0.04, 0.05, P.light, -0.11, 0.335);
  part(head, 0.05, 0.05, 0.04, 0.05, P.light, 0.17, 0.335);
  part(head, 0.12, 0.06, 0.04, -0.16, P.p, 0, 0.31);
  part(head, 0.66, 0.2, 0.66, 0.3, P.a);
  part(head, 0.7, 0.07, 0.34, 0.2, P.a, 0, 0.32);
  part(head, 0.12, 0.12, 0.12, 0.46, P.light);
  torso.add(armL, armR, head);
  hero.add(legL, legR, torso);
  world.add(hero);

  // 雲
  const clouds = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const cells: Block[] = [];
    const n = 3 + (i % 2);
    for (let k = 0; k < n; k++) cells.push({ x: k * 0.9, y: (k % 2) * 0.2, z: (k % 2) * 0.6 });
    const g = new THREE.Group();
    g.add(blocks(kit, cells, lighten(P.light, 0), 0.9));
    g.userData = { x0: hash(i, 3) * 12, y: 5.2 + hash(i, 4) * 1.5, z: -4 + hash(i, 5) * 6 };
    clouds.add(g);
  }
  world.add(clouds);

  return {
    root,
    base: { az: -0.6, el: 0.46, dist: 25, target: [0, 1.6, 0], fov: 30 },
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
      hero.position.set(x + j.x * 0.02, 0.5 + Math.max(0, y) + j.y * 0.01, 0.9);
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
      pineG.position.x = mv.wind * 0.08 * Math.sin(TAU * u * 3 + 1);
      fire.scale.setScalar(1 + 0.18 * Math.sin(TAU * u * 9));
      smoke.forEach((s, i) => {
        const w = (u * 3 + i / 3) % 1;
        s.position.set(2.1 + Math.sin(w * 5) * 0.2, 4.7 + w * 1.6, -3 + w * 0.2);
        s.scale.setScalar(Math.max(0.001, 1 - w) * (0.6 + w));
      });
      rocks.children.forEach((g) => {
        const d = g.userData as { a: number; r: number; y: number };
        const a = d.a + TAU * u * 0.5;
        g.position.set(Math.cos(a) * d.r, d.y + Math.sin(TAU * u * 2 + d.a) * 0.15, Math.sin(a) * d.r);
        g.rotation.set(a, a * 0.7, 0);
      });
      clouds.children.forEach((g) => {
        const d = g.userData as { x0: number; y: number; z: number };
        g.position.set(wrap(d.x0 + u * 12, 12) - 6, d.y, d.z);
      });
      world.position.y = M.fl(9, 0.02) - 0.2 + m3.levY;
      world.rotation.y = m3.spinY;
    },
  };
}
