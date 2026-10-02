// 場景：3D 角色。2D 小怪獸的立體版，沿用同一套跳躍姿態：預備、拉伸、落地擠壓、觸角跟隨、眨眼。
import * as THREE from 'three';
import { bump, clamp, fract, TAU } from '../../util';
import { mascotPose } from '../../subjects/mascot';
import { motion3d } from '../common';
import type { BuildCtx, SceneInst } from '../types';
import { geoFactory } from '../util';

export function buildCharacter({ look, kit }: BuildCtx): SceneInst {
  const P = look.pal;
  const G = geoFactory(kit.coarse);
  const root = new THREE.Group();
  root.add(kit.shadowCatcher(34));
  const ell = (rx: number, ry: number, rz: number) => {
    const g = G.sphere(1);
    g.scale(rx, ry, rz);
    return g;
  };
  const hero = new THREE.Group();
  root.add(hero);
  const squash = new THREE.Group();
  hero.add(squash);

  // 腳（不參與擠壓）
  const feet = [-1, 1].map((s) => {
    const f = kit.mesh(ell(0.42, 0.24, 0.5), P.s);
    f.position.set(s * 0.5, 0.24, 0.22);
    hero.add(f);
    return f;
  });
  // 身體與五官
  const body = kit.mesh(ell(1.1, 1.0, 1.0), P.p);
  body.position.y = 1.0;
  squash.add(body);
  const eyes = [-1, 1].map((s) => {
    const g = new THREE.Group();
    const white = kit.mesh(ell(0.24, 0.29, 0.14), P.light, { outline: false });
    const pupil = kit.mesh(ell(0.12, 0.15, 0.1), P.ink, { outline: false });
    pupil.position.z = 0.1;
    g.add(white, pupil);
    g.position.set(s * 0.4, 1.22, 0.86);
    squash.add(g);
    return { g, pupil, s };
  });
  const cheeks = [-1, 1].map((s) => {
    const c = kit.mesh(ell(0.2, 0.12, 0.07), P.a, { outline: false });
    c.position.set(s * 0.66, 0.86, 0.72);
    c.rotation.y = s * 0.7;
    squash.add(c);
    return c;
  });
  void cheeks;
  const smile = kit.mesh(new THREE.TorusGeometry(0.18, 0.035, 8, 20, Math.PI), P.ink, { outline: false });
  smile.position.set(0, 0.74, 0.93);
  smile.rotation.z = Math.PI;
  squash.add(smile);
  const mouth = kit.mesh(ell(0.17, 0.12, 0.06), P.ink, { outline: false });
  mouth.position.set(0, 0.68, 0.95);
  squash.add(mouth);
  // 手臂
  const arms = [-1, 1].map((s) => {
    const pivot = new THREE.Group();
    pivot.position.set(s * 1.02, 1.12, 0);
    const arm = kit.mesh(G.capsule(0.17, 0.42), P.p);
    arm.position.y = -0.38;
    pivot.add(arm);
    squash.add(pivot);
    return { pivot, s };
  });
  // 觸角：三節 + 球
  const ant = new THREE.Group();
  ant.position.set(0, 1.95, 0);
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
  const tip = kit.mesh(G.sphere(0.17), P.a);
  tip.position.y = 0.4;
  links[2].add(tip);

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

      // 觸角跟隨
      let th = (s2.x - s.x) * 0.012 * mv.follow - s.lean * 0.9 * mv.follow;
      th += s.land * 0.5 * mv.follow * Math.sin(s.land * 9);
      th += mv.wind * 0.3 * Math.sin(TAU * u * 3) + mv.float * 0.08 * Math.sin(TAU * u * 2);
      links.forEach((l, i) => (l.rotation.z = -th * (0.45 + i * 0.25)));

      // 眨眼、嘴巴、手臂
      const blink = Math.max(bump(0.01, 0.055, u), bump(0.49, 0.535, u));
      eyes.forEach((e) => {
        e.g.scale.y = 1 - 0.92 * blink;
        e.pupil.position.x = s.face * 0.06;
      });
      const open = clamp(s.air * 1.4) * (1 + mv.exag);
      mouth.scale.setScalar(open > 0.15 ? 0.7 + 0.5 * open : 0.001);
      smile.scale.setScalar(open > 0.15 ? 0.001 : 1);
      const armUp = clamp(s.air * 1.2 + s2.air * 0.4);
      arms.forEach((a) => (a.pivot.rotation.z = a.s * (0.25 + 1.7 * armUp) + a.s * Math.sin(TAU * u * 6) * 0.08 * mv.follow));
      const fd = 0.1 * s2.air;
      feet.forEach((f) => (f.position.y = 0.24 + fd));
      root.position.y = m3.levY;
    },
  };
}
