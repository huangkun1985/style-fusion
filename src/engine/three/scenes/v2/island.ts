// 場景 v2：體素小島（第二版）。圓形的島有小丘、小徑與籬笆、紅屋頂小木屋（煙囪冒煙）、風車（扇葉轉動）、池塘與瀑布（水塊往下掉）、
// 圓冠大樹、金黃小樹與針葉樹、花與蘑菇、營火；一座浮空小島；飛鳥繞島、雲飄過、碎石漂浮；體素小人沿用跳躍路線。
import * as THREE from 'three';
import { darken, lighten, mix } from '../../../color';
import { clamp, hash, lerp, TAU, wrap } from '../../../util';
import { blocks, type Block } from '../../blocks';
import { motion3d } from '../../common';
import type { BuildCtx, SceneInst } from '../../types';

const RAD2 = 33; // 島的半徑平方（x²+z² ≤ 33，約 11×11 的圓島）
const inIsle = (x: number, z: number, layer = 0) => x * x + z * z <= RAD2 - layer * 7.5;

function islandBlocks() {
  const grassA: Block[] = [];
  const grassB: Block[] = [];
  const dirt: Block[] = [];
  const stone: Block[] = [];
  const path: Block[] = [];
  const sand: Block[] = [];
  const water: Block[] = [];
  const POND = (x: number, z: number) => x >= 2 && x <= 4 && z >= 1 && z <= 3 && !(x === 4 && z === 3);
  const HILL = (x: number, z: number) => Math.max(0, 2 - Math.round(Math.hypot(x + 3, z + 3) * 0.75)); // 左後的小丘
  for (let x = -5; x <= 5; x++)
    for (let z = -5; z <= 5; z++) {
      if (!inIsle(x, z)) continue;
      const onPath = (x >= -2 && x <= 2 && z === 0) || (x === 2 && z >= 0 && z <= 1);
      const pond = POND(x, z);
      const edgePond = !pond && (POND(x + 1, z) || POND(x - 1, z) || POND(x, z + 1) || POND(x, z - 1));
      const top = pond ? -1 : HILL(x, z);
      for (let y = Math.min(0, top); y <= top; y++) {
        const g = (x + z) % 2 === 0 ? grassA : grassB;
        if (pond) sand.push({ x, y: -1, z });
        else (onPath && y === 0 ? path : edgePond && y === 0 ? sand : g).push({ x, y, z });
      }
      if (pond) water.push({ x, y: 0, z });
      // 下方的土與石頭，越往下越窄
      for (let layer = 1; layer <= 5; layer++) {
        if (!inIsle(x, z, layer)) continue;
        (layer <= 2 ? dirt : stone).push({ x, y: -layer, z });
      }
    }
  stone.push({ x: 0, y: -6, z: 0 }, { x: 1, y: -6, z: 0 });
  // 小木屋（右後）
  const wall: Block[] = [];
  const roof: Block[] = [];
  for (let x = 1; x <= 2; x++) for (let z = -4; z <= -3; z++) for (let y = 1; y <= 2; y++) wall.push({ x, y, z });
  for (let x = 1; x <= 2; x++) for (let z = -4; z <= -3; z++) roof.push({ x, y: 3, z });
  for (let x = 1; x <= 2; x++) roof.push({ x, y: 4, z: -3.5 });
  const chimney: Block[] = [{ x: 2, y: 4, z: -4 }];
  const door: Block[] = [{ x: 1, y: 1, z: -2.5 }];
  // 風車（左前）：塔身與屋頂，扇葉另外做
  const tower: Block[] = [];
  for (let y = 1; y <= 3; y++) tower.push({ x: -4, y, z: 0 });
  const towerRoof: Block[] = [{ x: -4, y: 4, z: 0 }, { x: -4, y: 5, z: 0 }];
  // 樹
  const trunk: Block[] = [1, 2, 3].map((y) => ({ x: -3, y: y + 1, z: -3 })); // 長在小丘上
  const leaves: Block[] = [];
  for (let x = -4; x <= -2; x++) for (let z = -4; z <= -2; z++) for (let y = 5; y <= 6; y++) if (!(y === 6 && x !== -3 && z !== -3)) leaves.push({ x, y, z });
  leaves.push({ x: -3, y: 7, z: -3 });
  const trunk2: Block[] = [1, 2].map((y) => ({ x: 4, y, z: -1 }));
  const leaves2: Block[] = [];
  for (let x = 3; x <= 5; x++) for (let z = -2; z <= 0; z++) if (!(Math.abs(x - 4) + Math.abs(z + 1) > 2)) leaves2.push({ x, y: 3, z });
  leaves2.push({ x: 4, y: 4, z: -1 });
  const pineTrunk: Block[] = [1, 2].map((y) => ({ x: -1, y, z: -5 }));
  const pine: Block[] = [];
  for (const [y, r] of [[3, 1], [4, 1], [5, 0]] as [number, number][]) for (let x = -r; x <= r; x++) for (let z = -r; z <= r; z++) if (r === 0 || Math.abs(x) + Math.abs(z) <= r) pine.push({ x: -1 + x, y, z: -5 + z });
  const pineTrunk2: Block[] = [{ x: 5, y: 1, z: -3 }];
  const pine2: Block[] = [{ x: 5, y: 2, z: -3 }, { x: 5, y: 3, z: -3 }, { x: 5, y: 4, z: -3 }, { x: 4, y: 2, z: -3 }, { x: 5, y: 2, z: -2 }, { x: 5, y: 2, z: -4 }];
  // 籬笆：沿小徑兩側
  const fence: Block[] = [];
  for (let x = -2; x <= 2; x += 2) fence.push({ x, y: 0.5, z: -1 }, { x, y: 0.5, z: 1 });
  // 花與蘑菇
  const flowers: Block[] = [];
  const flowerCells: [number, number][] = [[0, -2], [-1, 2], [-2, 4], [3, 4], [5, 0], [-1, -4], [1, 3], [-3, 2], [2, -2], [0, 4]];
  flowerCells.forEach(([x, z]) => inIsle(x, z) && flowers.push({ x, y: 0.62, z }));
  const shroomStem: Block[] = [{ x: 3, y: 0.55, z: -3 }, { x: -2, y: 0.55, z: -1 }];
  const shroomCap: Block[] = [{ x: 3, y: 0.95, z: -3 }, { x: -2, y: 0.95, z: -1 }];
  const fire: Block[] = [{ x: -2, y: 0.55, z: 2 }];
  const logs: Block[] = [{ x: -1.4, y: 0.3, z: 2.4 }, { x: -2.6, y: 0.3, z: 1.6 }];
  // 浮空小島（右前方），有一棵小樹
  const isletTop: Block[] = [];
  const isletDirt: Block[] = [];
  for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) {
    isletTop.push({ x: 8 + x, y: 2, z: 3 + z });
    if (Math.abs(x) + Math.abs(z) <= 1) isletDirt.push({ x: 8 + x, y: 1, z: 3 + z });
  }
  isletDirt.push({ x: 8, y: 0, z: 3 });
  const isletTrunk: Block[] = [{ x: 8, y: 3, z: 3 }, { x: 8, y: 4, z: 3 }];
  const isletLeaves: Block[] = [{ x: 8, y: 5, z: 3 }, { x: 7, y: 5, z: 3 }, { x: 9, y: 5, z: 3 }, { x: 8, y: 5, z: 2 }, { x: 8, y: 5, z: 4 }, { x: 8, y: 6, z: 3 }];
  return { grassA, grassB, dirt, stone, path, sand, water, wall, roof, chimney, door, tower, towerRoof, trunk, leaves, trunk2, leaves2, pineTrunk, pine, pineTrunk2, pine2, fence, flowers, shroomStem, shroomCap, fire, logs, isletTop, isletDirt, isletTrunk, isletLeaves };
}

export function buildIsland2({ look, kit }: BuildCtx): SceneInst {
  const P = look.pal;
  const root = new THREE.Group();
  const world = new THREE.Group();
  root.add(world);
  const B = islandBlocks();
  const grass = P.q;
  world.add(blocks(kit, B.grassA, lighten(grass, 0.03)));
  world.add(blocks(kit, B.grassB, darken(grass, 0.04)));
  world.add(blocks(kit, B.path, mix(P.r, P.light, 0.55)));
  world.add(blocks(kit, B.sand, mix(P.a, P.light, 0.5)));
  world.add(blocks(kit, B.dirt, P.r));
  world.add(blocks(kit, B.stone, mix(P.r, '#8a8f98', 0.6)));
  // 池塘水面：略低的藍色方塊，緩慢起伏
  const waterG = new THREE.Group();
  waterG.add(blocks(kit, B.water, mix(P.s, P.light, 0.15), 0.94));
  world.add(waterG);
  world.add(blocks(kit, B.wall, mix(P.light, P.a, 0.3)));
  world.add(blocks(kit, B.roof, P.p));
  world.add(blocks(kit, B.chimney, darken(P.r, 0.1)));
  world.add(blocks(kit, B.door, darken(P.r, 0.25), 0.9));
  world.add(blocks(kit, B.tower, mix(P.light, P.r, 0.2)));
  world.add(blocks(kit, B.towerRoof, mix(P.p, P.ink, 0.15)));
  world.add(blocks(kit, B.trunk, darken(P.r, 0.12)));
  const leavesG = new THREE.Group();
  leavesG.add(blocks(kit, B.leaves, darken(grass, 0.14)));
  world.add(leavesG);
  const leaves2G = new THREE.Group();
  leaves2G.add(blocks(kit, B.leaves2, lighten(P.a, -0.1)));
  world.add(leaves2G);
  world.add(blocks(kit, B.trunk2, darken(P.r, 0.1)));
  world.add(blocks(kit, B.pineTrunk, darken(P.r, 0.15)));
  world.add(blocks(kit, B.pineTrunk2, darken(P.r, 0.15)));
  const pineG = new THREE.Group();
  pineG.add(blocks(kit, B.pine, darken(grass, 0.28)));
  pineG.add(blocks(kit, B.pine2, darken(grass, 0.24), 0.82));
  world.add(pineG);
  world.add(blocks(kit, B.fence, darken(P.r, -0.05), 0.4));
  const flowerCols = [P.a, P.p, P.light, mix(P.s, P.light, 0.3)];
  flowerCols.forEach((c, k) => world.add(blocks(kit, B.flowers.filter((_, i) => i % 4 === k), c, 0.24)));
  world.add(blocks(kit, B.shroomStem, P.light, 0.3));
  world.add(blocks(kit, B.shroomCap, P.p, 0.5));
  world.add(blocks(kit, B.logs, darken(P.r, 0.1), 0.3));
  const fire = blocks(kit, B.fire, P.a, 0.4);
  world.add(fire);
  // 浮空小島
  const islet = new THREE.Group();
  islet.add(blocks(kit, B.isletTop, grass));
  islet.add(blocks(kit, B.isletDirt, P.r));
  islet.add(blocks(kit, B.isletTrunk, darken(P.r, 0.12)));
  islet.add(blocks(kit, B.isletLeaves, darken(grass, 0.12)));
  world.add(islet);

  // 風車扇葉：四片，繞前面的軸轉（每圈轉整數圈，所以無縫循環）
  const mill = new THREE.Group();
  mill.position.set(-4, 3.2, 0.62);
  for (let k = 0; k < 4; k++) {
    const arm = new THREE.Group();
    arm.rotation.z = (k * Math.PI) / 2;
    const bar = kit.mesh(new THREE.BoxGeometry(0.14, 1.9, 0.1), darken(P.r, 0.2), { outline: false });
    bar.position.y = 1.05;
    const sail = kit.mesh(new THREE.BoxGeometry(0.52, 1.2, 0.06), P.light, { outline: false });
    sail.position.set(0.3, 1.25, 0.03);
    arm.add(bar, sail);
    mill.add(arm);
  }
  const hub = kit.mesh(new THREE.BoxGeometry(0.34, 0.34, 0.3), P.p, { outline: false });
  mill.add(hub);
  world.add(mill);

  // 瀑布：從池塘邊沿落下的小水塊（循環往下）
  const falls: THREE.Object3D[] = [];
  for (let i = 0; i < 7; i++) {
    const g = new THREE.Group();
    g.add(blocks(kit, [{ x: 0, y: 0, z: 0 }], mix(P.s, P.light, 0.35), 0.5));
    world.add(g);
    falls.push(g);
  }

  // 飛鳥（人字隊形，繞島飛行）
  const birds: THREE.Object3D[] = [];
  for (let i = 0; i < 3; i++) {
    const g = new THREE.Group();
    const wingL = kit.mesh(new THREE.BoxGeometry(0.5, 0.06, 0.2), P.ink, { outline: false, shadow: false });
    const wingR = kit.mesh(new THREE.BoxGeometry(0.5, 0.06, 0.2), P.ink, { outline: false, shadow: false });
    wingL.position.x = -0.25;
    wingR.position.x = 0.25;
    g.add(wingL, wingR);
    g.userData = { wingL, wingR, i };
    world.add(g);
    birds.push(g);
  }

  // 漂浮的碎石
  const rocks = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const g = new THREE.Group();
    g.add(blocks(kit, [{ x: 0, y: 0, z: 0 }], mix(P.r, '#8a8f98', 0.6), 0.4 + (i % 3) * 0.2));
    g.userData = { a: (i / 5) * TAU + 0.5, r: 6.2 + (i % 2) * 1.0, y: -4.2 - (i % 3) * 0.7 };
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
    const n = 3 + (i % 3);
    for (let k = 0; k < n; k++) cells.push({ x: k * 0.9, y: (k % 2) * 0.2, z: (k % 2) * 0.6 });
    const g = new THREE.Group();
    g.add(blocks(kit, cells, lighten(P.light, 0), 0.9));
    g.userData = { x0: hash(i, 3) * 16, y: 6.2 + hash(i, 4) * 2.2, z: -9 + hash(i, 5) * 5 };
    clouds.add(g);
  }
  world.add(clouds);

  return {
    root,
    base: { az: -0.6, el: 0.44, dist: 28, target: [1.6, 0.8, 0], fov: 30 },
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
      hero.position.set(x + j.x * 0.02, 0.5 + Math.max(0, y) + j.y * 0.01, 0.0);
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
      leaves2G.position.x = mv.wind * 0.1 * Math.sin(TAU * u * 3 + 2);
      waterG.position.y = -0.04 + 0.03 * Math.sin(TAU * u * 4);
      mill.rotation.z = -TAU * u * (2 + Math.round(mv.spin * 2));
      islet.position.y = 0.25 * Math.sin(TAU * u * 2) + M.fl(7, 0.05);
      falls.forEach((f, i) => {
        const w = (u * 2 + i / falls.length) % 1;
        f.position.set(5.2, -w * 6.5, 2.0 + 0.0);
        f.scale.setScalar(Math.max(0.001, 1 - w * 0.5) * (0.8 + 0.2 * Math.sin(i * 2)));
      });
      birds.forEach((b) => {
        const d = b.userData as { wingL: THREE.Object3D; wingR: THREE.Object3D; i: number };
        const a = TAU * (u + d.i * 0.035);
        const r = 9.5 + d.i * 0.7;
        b.position.set(Math.cos(a) * r, 5.4 + 0.6 * Math.sin(TAU * u * 2 + d.i) - d.i * 0.2, Math.sin(a) * r * 0.7 - 1);
        b.rotation.y = -a + Math.PI;
        const f = Math.sin(TAU * (u * 12 + d.i * 0.2));
        d.wingL.rotation.z = f * 0.5;
        d.wingR.rotation.z = -f * 0.5;
      });
      leavesG.position.x = mv.wind * 0.12 * Math.sin(TAU * u * 3);
      pineG.position.x = mv.wind * 0.08 * Math.sin(TAU * u * 3 + 1);
      fire.scale.setScalar(1 + 0.18 * Math.sin(TAU * u * 9));
      smoke.forEach((s, i) => {
        const w = (u * 3 + i / 3) % 1;
        s.position.set(2.1 + Math.sin(w * 5) * 0.2, 5.0 + w * 1.6, -4 + w * 0.2);
        s.scale.setScalar(Math.max(0.001, 1 - w) * (0.6 + w));
      });
      rocks.children.forEach((g) => {
        const d = g.userData as { a: number; r: number; y: number };
        const a = d.a + TAU * u * 0.5;
        g.position.set(Math.cos(a) * d.r, d.y + Math.sin(TAU * u * 2 + d.a) * 0.15, Math.sin(a) * d.r * 0.8);
        g.rotation.set(a, a * 0.7, 0);
      });
      clouds.children.forEach((g) => {
        const d = g.userData as { x0: number; y: number; z: number };
        g.position.set(wrap(d.x0 + u * 16, 16) - 8, d.y, d.z);
      });
      world.position.y = M.fl(9, 0.02) - 0.2 + m3.levY;
      world.rotation.y = m3.spinY;
    },
  };
}
