// 場景 v2：3D 角色「跳跳豆」。豆形身體（下寬上窄）、大眼睛加高光與眉毛、肚皮與腮紅、兩顆小耳朵、發光觸角、
// 小手小腳；站在圓形展示台上，落地揚起塵土球，周圍漂浮著慢慢旋轉的小星塊。跳躍姿態沿用 2D 版（預備、拉伸、落地擠壓、觸角跟隨、眨眼）。
import * as THREE from 'three';
import { bump, clamp, fract, TAU } from '../../../util';
import { mascotPose } from '../../../subjects/mascot';
import { motion3d } from '../../common';
import type { BuildCtx, SceneInst } from '../../types';
import { geoFactory } from '../../util';

/** 豆形：把球的下半部撐寬、上半部收窄一點，輪廓更有「重量」 */
function bean(geo: THREE.BufferGeometry, rx: number, ry: number, rz: number): THREE.BufferGeometry {
  const g = geo.clone();
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const w = 1 - 0.09 * y;
    p.setXYZ(i, x * rx * w, y * ry, z * rz * w);
  }
  p.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

export function buildCharacter2({ look, kit }: BuildCtx): SceneInst {
  const P = look.pal;
  const G = geoFactory(kit.coarse);
  const root = new THREE.Group();
  root.add(kit.shadowCatcher(34));

  // ── 展示台
  const pad = kit.mesh(G.cylinder(2.7, 0.22), P.bg2, { outline: false });
  pad.position.y = -0.11;
  root.add(pad);
  const padRing = kit.mesh(new THREE.TorusGeometry(2.55, 0.035, 8, 64), P.light, { outline: false, shadow: false });
  padRing.rotation.x = Math.PI / 2;
  padRing.position.y = 0.01;
  root.add(padRing);

  const ell = (rx: number, ry: number, rz: number) => {
    const g = G.sphere(1);
    g.scale(rx, ry, rz);
    return g;
  };
  const hero = new THREE.Group();
  root.add(hero);
  const squash = new THREE.Group();
  hero.add(squash);

  // ── 腳（不參與擠壓）
  const feet = [-1, 1].map((s) => {
    const f = kit.mesh(ell(0.46, 0.26, 0.56), P.s);
    f.position.set(s * 0.52, 0.26, 0.26);
    hero.add(f);
    return f;
  });
  // ── 身體、肚皮、耳朵
  const body = kit.mesh(bean(G.sphere(1), 1.12, 1.06, 1.0), P.p);
  body.position.y = 1.06;
  squash.add(body);
  const belly = kit.mesh(ell(0.62, 0.52, 0.18), P.light, { outline: false });
  belly.position.set(0, 0.8, 0.82);
  squash.add(belly);
  const ears = [-1, 1].map((s) => {
    const e = kit.mesh(ell(0.2, 0.28, 0.14), P.p, { outline: false });
    e.position.set(s * 0.86, 1.96, 0.0);
    e.rotation.z = -s * 0.45;
    squash.add(e);
    return e;
  });
  void ears;
  // ── 臉：眼睛（白、瞳、高光）、眉毛、腮紅、嘴
  const eyes = [-1, 1].map((s) => {
    const g = new THREE.Group();
    const white = kit.mesh(ell(0.28, 0.34, 0.16), P.light, { outline: false });
    const pupil = kit.mesh(ell(0.15, 0.19, 0.12), P.ink, { outline: false });
    pupil.position.z = 0.1;
    const shine = kit.mesh(G.sphere(0.055), P.light, { outline: false, shadow: false });
    shine.position.set(-0.05, 0.08, 0.22);
    g.add(white, pupil, shine);
    g.position.set(s * 0.44, 1.34, 0.88);
    squash.add(g);
    return { g, pupil, s };
  });
  const brows = [-1, 1].map((s) => {
    const b = kit.mesh(G.capsule(0.035, 0.22), P.ink, { outline: false });
    b.rotation.z = Math.PI / 2 - s * 0.12;
    b.position.set(s * 0.44, 1.78, 0.9);
    squash.add(b);
    return { b, s };
  });
  [-1, 1].forEach((s) => {
    const c = kit.mesh(ell(0.22, 0.13, 0.07), P.a, { outline: false });
    c.position.set(s * 0.72, 0.98, 0.78);
    c.rotation.y = s * 0.7;
    squash.add(c);
  });
  const smile = kit.mesh(new THREE.TorusGeometry(0.2, 0.038, 8, 20, Math.PI), P.ink, { outline: false });
  smile.position.set(0, 0.92, 1.0);
  smile.rotation.z = Math.PI;
  squash.add(smile);
  const mouth = kit.mesh(ell(0.19, 0.14, 0.06), P.ink, { outline: false });
  mouth.position.set(0, 0.84, 1.02);
  squash.add(mouth);
  // ── 手臂與手
  const arms = [-1, 1].map((s) => {
    const pivot = new THREE.Group();
    pivot.position.set(s * 1.05, 1.18, 0);
    const arm = kit.mesh(G.capsule(0.18, 0.38), P.p);
    arm.position.y = -0.36;
    const hand = kit.mesh(G.sphere(0.2), P.light);
    hand.position.y = -0.74;
    pivot.add(arm, hand);
    squash.add(pivot);
    return { pivot, s };
  });
  // ── 觸角：三節加發光燈泡
  const ant = new THREE.Group();
  ant.position.set(0, 2.08, 0);
  squash.add(ant);
  const links: THREE.Group[] = [];
  let parent: THREE.Object3D = ant;
  for (let i = 0; i < 3; i++) {
    const l = new THREE.Group();
    if (i > 0) l.position.y = 0.32;
    const seg = kit.mesh(G.cylinder(0.045, 0.32), P.ink, { outline: false });
    seg.position.y = 0.16;
    l.add(seg);
    parent.add(l);
    links.push(l);
    parent = l;
  }
  const tip = kit.mesh(G.sphere(0.2), P.a);
  tip.position.y = 0.42;
  links[2].add(tip);
  const glow = new THREE.Mesh(kit.track(new THREE.SphereGeometry(0.34, 16, 12)), kit.track(new THREE.MeshBasicMaterial({ color: new THREE.Color(P.a), transparent: true, opacity: 0.22, depthWrite: false })));
  glow.position.y = 0.42;
  if (kit.mat !== 'wire' && kit.mat !== 'neon') links[2].add(glow);

  // ── 落地的塵土球
  const puffs = Array.from({ length: 6 }, (_, i) => {
    const m = kit.mesh(G.sphere(0.28), P.light, { outline: false, shadow: false });
    m.visible = false;
    root.add(m);
    return { m, a: (i / 6) * TAU };
  });
  // ── 周圍漂浮的小星塊
  const motes = Array.from({ length: 7 }, (_, i) => {
    const m = kit.mesh(i % 2 ? G.octa(0.16) : G.ico(0.15), [P.a, P.s, P.q][i % 3], { outline: false, shadow: false });
    root.add(m);
    return { m, i };
  });

  return {
    root,
    base: { az: 0, el: 0.2, dist: 12.8, target: [0, 1.95, 0], fov: 30 },
    update(M) {
      const mv = M.mv;
      const u = M.u;
      const m3 = motion3d(M, look);
      const s = mascotPose(M, u);
      const lag = 0.03 + 0.05 * mv.follow;
      const s2 = mascotPose(M, fract(u - lag + 1));
      const j = M.jit(1);

      hero.position.set((s.x / 56) * 1.15 + j.x * 0.03, Math.max(0, s.y) / 56 + M.fl(1, 0.25) + j.y * 0.03, 0);
      hero.rotation.set(m3.tumble, (s.face > 0 ? 0.55 : -0.55) + m3.spinY, -s.lean * 0.9 + j.r);
      const sy = s.sy;
      squash.scale.set(1 / Math.sqrt(sy), sy, 1 / Math.sqrt(sy));

      // 觸角跟隨與燈泡脈動
      let th = (s2.x - s.x) * 0.012 * mv.follow - s.lean * 0.9 * mv.follow;
      th += s.land * 0.5 * mv.follow * Math.sin(s.land * 9);
      th += mv.wind * 0.3 * Math.sin(TAU * u * 3) + mv.float * 0.08 * Math.sin(TAU * u * 2);
      links.forEach((l, i) => (l.rotation.z = -th * (0.45 + i * 0.25)));
      glow.scale.setScalar(1 + 0.12 * Math.sin(TAU * u * 4) + s.land * 0.4);

      // 眨眼、眉毛、嘴巴、手臂
      const blink = Math.max(bump(0.01, 0.055, u), bump(0.49, 0.535, u));
      eyes.forEach((e) => {
        e.g.scale.y = 1 - 0.92 * blink;
        e.pupil.position.x = s.face * 0.06;
      });
      const crouch = clamp(1 - sy) * 3;
      brows.forEach((b) => {
        b.b.position.y = 1.78 + s.air * 0.12 - crouch * 0.03;
        b.b.rotation.z = Math.PI / 2 - b.s * (0.12 + 0.3 * clamp(s.land + (1 - sy) * 2));
      });
      const open = clamp(s.air * 1.4 + s.land * 0.6) * (1 + mv.exag);
      mouth.scale.setScalar(open > 0.15 ? 0.7 + 0.5 * open : 0.001);
      smile.scale.setScalar(open > 0.15 ? 0.001 : 1);
      const armUp = clamp(s.air * 1.2 + s2.air * 0.4);
      arms.forEach((a) => (a.pivot.rotation.z = a.s * (0.3 + 1.6 * armUp) + a.s * Math.sin(TAU * u * 6) * 0.08 * mv.follow));
      const fd = 0.1 * s2.air;
      feet.forEach((f) => (f.position.y = 0.26 + fd));

      // 塵土：落地後約 0.2 圈內向外擴散
      const t = HOP_LAND.map((l) => fract(u - l + 1)).find((d) => d < 0.2);
      puffs.forEach((p, i) => {
        if (t === undefined) {
          p.m.visible = false;
          return;
        }
        const k = t / 0.2;
        const lx = HOP_X[HOP_LAND.findIndex((l) => fract(u - l + 1) === t)];
        p.m.visible = true;
        p.m.position.set(lx + Math.cos(p.a) * (0.7 + k * 1.5), 0.2 + k * 0.4, Math.sin(p.a) * (0.5 + k * 1.1));
        p.m.scale.setScalar(Math.max(0.001, (1 - k) * (0.6 + 0.4 * Math.sin(i)) * 1.2));
      });
      // 小星塊緩慢繞行
      motes.forEach(({ m, i }) => {
        const a = TAU * (u * (0.5 + (i % 3) * 0.25) + i / 7);
        m.position.set(Math.cos(a) * (3.6 + (i % 2) * 0.8), 2.2 + Math.sin(a * 2 + i) * 0.9, Math.sin(a) * 2.2 - 1);
        m.rotation.set(a * 2, a * 3, 0);
      });
      root.position.y = m3.levY;
    },
  };
}

const HOP_LAND = [0.06 + 0.72 * (0.48 - 0.06), 0.54 + 0.72 * (0.96 - 0.54)];
const HOP_X = [1.15 * (70 / 56), -1.15 * (70 / 56)];
