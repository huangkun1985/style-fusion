// 場景 v2：3D 幾何。站在圓形展示台上的一組構成：彈跳的主球與環繞的圓環、三層堆疊並錯開旋轉的方塊塔、
// 頂著小球的雙層錐體、背景慢慢翻轉的環結、沿台緣繞行的彩色小球與漂浮的小八面體；台面有同心圓刻線。
import * as THREE from 'three';
import { mascotPose } from '../../../subjects/mascot';
import { TAU } from '../../../util';
import { appear, jit3, motion3d } from '../../common';
import type { BuildCtx, SceneInst } from '../../types';
import { geoFactory } from '../../util';

export function buildShapes2({ look, kit }: BuildCtx): SceneInst {
  const P = look.pal;
  const G = geoFactory(kit.coarse);
  const root = new THREE.Group();
  const stage = new THREE.Group();
  root.add(stage);
  stage.add(kit.shadowCatcher(34));

  // ── 展示台與刻線
  const pod = kit.mesh(G.cylinder(5.6, 0.3), P.bg2, { outline: false });
  pod.position.y = -0.15;
  stage.add(pod);
  for (const r of [3.4, 4.6]) {
    const t = kit.mesh(new THREE.TorusGeometry(r, 0.03, 6, 80), P.light, { outline: false, shadow: false });
    t.rotation.x = Math.PI / 2;
    t.position.y = 0.01;
    stage.add(t);
  }
  const add = (geo: THREE.BufferGeometry, color: string, o: { outline?: boolean; shadow?: boolean } = {}) => {
    const m = kit.mesh(geo, color, o);
    stage.add(m);
    return m;
  };
  const hero = add(G.sphere(1), P.p);
  const ring = add(G.torus(1.85, 0.15), P.s);
  const tower = [add(G.box(1.5, 0.9, 1.5), P.a), add(G.box(1.1, 0.8, 1.1), P.s), add(G.box(0.74, 0.7, 0.74), P.p)];
  const coneLo = add(G.cone(0.95, 1.5), P.q);
  const coneHi = add(G.cone(0.66, 1.2), P.q);
  const coneBall = add(G.sphere(0.2), P.a);
  const knot = add(G.knot(0.5, 0.17), P.r);
  const cols = [P.p, P.s, P.a, P.q, P.r, P.light];
  const orbs = cols.map((c) => add(G.sphere(0.3), c));
  const stars = Array.from({ length: 6 }, (_, i) => add(G.octa(0.17), [P.a, P.s, P.q][i % 3], { outline: false, shadow: false }));

  const outward = (o: THREE.Object3D, ex: number, k: number) => {
    const d = new THREE.Vector3(o.position.x, 0.2, o.position.z);
    if (d.lengthSq() < 0.01) d.set(0, 1, 0);
    o.position.addScaledVector(d.normalize(), ex * k);
  };

  return {
    root,
    base: { az: -0.5, el: 0.36, dist: 14, target: [0, 1.35, 0], fov: 30 },
    update(M) {
      const mv = M.mv;
      const u = M.u;
      const m3 = motion3d(M, look);
      stage.rotation.y = m3.spinY + m3.levRotY;
      stage.position.y = m3.levY;
      const ex = m3.explode;
      const beat = 1 + mv.beat * 0.12 * M.beat();

      // 主球：沿用角色的跳躍姿態
      const pose = mascotPose(M, u);
      const a0 = appear(M, 0);
      const sy = pose.sy * (1 + mv.wobble * 0.05 * Math.sin(TAU * u * 5));
      const sxz = 1 / Math.sqrt(sy);
      const j0 = jit3(M, 1);
      hero.position.set((pose.x / 56) * 0.9 + j0.x, sy + pose.y / 56 + j0.y + M.fl(1, 0.3), 0);
      hero.scale.set(sxz, sy, sxz).multiplyScalar(Math.max(0.001, a0) * beat);
      hero.rotation.set(m3.tumble, 0, j0.r);
      outward(hero, ex, 0.6);

      // 圓環
      const a1 = appear(M, 1);
      const turns = 1 + Math.round(mv.spin * 2);
      ring.position.copy(hero.position);
      ring.rotation.set(Math.PI / 2.4, 0, TAU * u * turns + m3.tumble);
      ring.scale.setScalar(Math.max(0.001, a1) * (1 + (sy - 1) * 0.2));

      // 方塊塔：三層，各自分段旋轉、錯開時間
      const a2 = appear(M, 2);
      let y = 0;
      tower.forEach((t, i) => {
        const h = [0.9, 0.8, 0.7][i];
        let rot = 0;
        for (const t0 of [0.3, 0.45, 0.6]) rot += M.tw(t0 + i * 0.025, t0 + 0.08 + i * 0.025, mv.holds > 0.4 ? 'o' : 'io') * (Math.PI / 2) * (i % 2 ? -1 : 1);
        const j = jit3(M, 2 + i);
        t.position.set(-3.4 + j.x, y + h / 2 + (i === 2 ? M.fl(2, 0.12) : 0), 0.3);
        t.rotation.set(0, rot + m3.tumble + i * 0.4, j.r);
        t.scale.setScalar(Math.max(0.001, a2 * (1 - i * 0.04)) * beat);
        outward(t, ex, 1.2);
        y += h;
      });

      // 雙層錐體與頂球
      const a3 = appear(M, 3);
      const j3 = jit3(M, 3);
      const sway = Math.sin(TAU * u * 2) * 0.06 * (1 + mv.wobble);
      coneLo.position.set(3.5 + j3.x, 0.75, 0.2);
      coneLo.rotation.set(0, TAU * u, sway);
      coneLo.scale.set(1, 1 - 0.1 * mv.squash * Math.max(0, M.beat(8) * mv.beat), 1).multiplyScalar(Math.max(0.001, a3));
      coneHi.position.set(3.5 + j3.x + sway * 0.8, 1.9, 0.2);
      coneHi.rotation.set(0, -TAU * u, sway * 1.4);
      coneHi.scale.setScalar(Math.max(0.001, a3));
      coneBall.position.set(3.5 + j3.x + sway * 1.5, 2.88 + 0.06 * Math.sin(TAU * u * 3), 0.2);
      coneBall.scale.setScalar(Math.max(0.001, a3));
      [coneLo, coneHi, coneBall].forEach((o) => outward(o, ex, 1.2));

      // 環結：背景慢慢翻轉
      const a4 = appear(M, 4);
      knot.position.set(0, 3.2 + M.fl(4, 0.35), -3.2);
      knot.rotation.set(TAU * u + m3.tumble, TAU * u * 2, 0);
      knot.scale.setScalar(Math.max(0.001, a4));
      outward(knot, ex, 1.0);

      // 繞行小球與小八面體
      orbs.forEach((o, i) => {
        const a = appear(M, 5 + i, 0.1, 0.26);
        const ang = TAU * (u + i / orbs.length);
        o.position.set(Math.cos(ang) * 4.5, 0.32 + 0.28 * Math.sin(TAU * (u * 2 + i / orbs.length)), Math.sin(ang) * 2.7);
        o.scale.setScalar(Math.max(0.001, a));
        outward(o, ex, 0.8);
      });
      stars.forEach((s, i) => {
        const a = TAU * (u * 0.5 + i / stars.length);
        s.position.set(Math.cos(a) * 3.0, 3.6 + 0.5 * Math.sin(a * 2 + i), Math.sin(a) * 1.8 - 1.6);
        s.rotation.set(a * 3, a * 2, 0);
        s.scale.setScalar(Math.max(0.001, appear(M, 3 + (i % 3), 0.12, 0.3)));
      });
    },
  };
}
