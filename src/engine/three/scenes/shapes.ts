// 場景：3D 幾何。彈跳的主球、環繞的圓環、分段旋轉的方塊、錐體、環結與繞行小球。
import * as THREE from 'three';
import { mascotPose } from '../../subjects/mascot';
import { TAU } from '../../util';
import { appear, jit3, motion3d } from '../common';
import type { BuildCtx, SceneInst } from '../types';
import { geoFactory } from '../util';

export function buildShapes({ look, kit }: BuildCtx): SceneInst {
  const P = look.pal;
  const G = geoFactory(kit.coarse);
  const root = new THREE.Group();
  const stage = new THREE.Group();
  root.add(stage);
  stage.add(kit.shadowCatcher(34));
  const add = (geo: THREE.BufferGeometry, color: string) => {
    const o = kit.mesh(geo, color);
    stage.add(o);
    return o;
  };
  const hero = add(G.sphere(1), P.p);
  const ring = add(G.torus(1.85, 0.15), P.s);
  const cube = add(G.box(1.25), P.a);
  const cone = add(G.cone(0.85, 1.7), P.q);
  const knot = add(G.knot(0.5, 0.17), P.r);
  const cols = [P.p, P.s, P.a, P.q, P.r, P.light];
  const orbs = cols.map((c) => add(G.sphere(0.32), c));

  const outward = (o: THREE.Object3D, ex: number, k: number) => {
    const d = new THREE.Vector3(o.position.x, 0.2, o.position.z);
    if (d.lengthSq() < 0.01) d.set(0, 1, 0);
    o.position.addScaledVector(d.normalize(), ex * k);
  };

  return {
    root,
    base: { az: -0.5, el: 0.36, dist: 13, target: [0, 1.35, 0], fov: 30 },
    update(M) {
      const mv = M.mv;
      const u = M.u;
      const m3 = motion3d(M, look);
      stage.rotation.y = m3.spinY + m3.levRotY;
      stage.position.y = m3.levY;
      const ex = m3.explode;
      const beat = 1 + mv.beat * 0.12 * M.beat();

      // 主球：沿用角色的跳躍姿態（預備、拉伸、落地擠壓）
      const pose = mascotPose(M, u);
      const a0 = appear(M, 0);
      const sy = pose.sy * (1 + mv.wobble * 0.05 * Math.sin(TAU * u * 5));
      const sxz = 1 / Math.sqrt(sy);
      const j0 = jit3(M, 1);
      hero.position.set((pose.x / 56) * 0.9 + j0.x, sy + pose.y / 56 + j0.y + M.fl(1, 0.3), 0);
      hero.scale.set(sxz, sy, sxz).multiplyScalar(Math.max(0.001, a0) * beat);
      hero.rotation.set(m3.tumble, 0, j0.r);
      outward(hero, ex, 0.6);

      // 圓環：繞著主球旋轉
      const a1 = appear(M, 1);
      const turns = 1 + Math.round(mv.spin * 2);
      ring.position.copy(hero.position);
      ring.rotation.set(Math.PI / 2.4, 0, TAU * u * turns + m3.tumble);
      ring.scale.setScalar(Math.max(0.001, a1) * (1 + (sy - 1) * 0.2));

      // 方塊：三段分段旋轉
      const a2 = appear(M, 2);
      let rot = 0;
      for (const t0 of [0.3, 0.45, 0.6]) rot += M.tw(t0, t0 + 0.08, mv.holds > 0.4 ? 'o' : 'io') * (Math.PI / 2);
      const j2 = jit3(M, 2);
      cube.position.set(-3.2 + j2.x, 1.25 + M.fl(2, 0.3) + j2.y, 0.3);
      cube.rotation.set(0.45 + mv.flip * Math.PI * M.tw(0.55, 0.7, 'io'), rot + m3.tumble, j2.r);
      cube.scale.setScalar(Math.max(0.001, a2) * beat);
      outward(cube, ex, 1.2);

      // 錐體：站在地上輕輕搖
      const a3 = appear(M, 3);
      const j3 = jit3(M, 3);
      cone.position.set(3.3 + j3.x, 0.85, 0.2);
      cone.rotation.set(0, TAU * u, Math.sin(TAU * u * 2) * 0.08 * (1 + mv.wobble));
      cone.scale.set(1, 1 - 0.12 * mv.squash * Math.max(0, M.beat(8) * mv.beat), 1).multiplyScalar(Math.max(0.001, a3));
      outward(cone, ex, 1.2);

      // 環結：背景裡慢慢翻轉
      const a4 = appear(M, 4);
      knot.position.set(0, 3.1 + M.fl(4, 0.35), -3);
      knot.rotation.set(TAU * u + m3.tumble, TAU * u * 2, 0);
      knot.scale.setScalar(Math.max(0.001, a4));
      outward(knot, ex, 1.0);

      // 繞行小球：錯峰彈出
      orbs.forEach((o, i) => {
        const a = appear(M, 5 + i, 0.1, 0.26);
        const ang = TAU * (u + i / orbs.length);
        o.position.set(Math.cos(ang) * 3.9, 0.35 + 0.3 * Math.sin(TAU * (u * 2 + i / orbs.length)), Math.sin(ang) * 2.4);
        o.scale.setScalar(Math.max(0.001, a));
        outward(o, ex, 0.8);
      });
    },
  };
}
