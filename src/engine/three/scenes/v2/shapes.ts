// 場景 v2：3D 幾何（第二版，藍本是 Dribbble 的「粉彩 3D 抽象形體構圖」——大小不一的圓柱、球、環、膠囊與方塊疊成一組雕塑，筆記見 docs/主體v2參考/shapes3d.md）。
// 參考圖共通的好看原因：形體種類很少（圓柱、球、環、膠囊、方塊）但尺度對比大；顏色是同一組粉彩（強調色的淡色、冷色的淡色、奶油）；
// 疊放有「重力感」——物件靠在彼此身上，不是散落一地；整組擺在一個低矮的展示台上；沒有多餘小東西。
// 動畫：主球沿用角色的跳躍姿態，環立著慢慢自轉，方塊分段旋轉，膠囊輕輕滾動，三顆小球在上空緩慢浮動。
import * as THREE from 'three';
import { mix } from '../../../color';
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

  // 粉彩色：由色板角色與 light 混出（越淡越像參考圖的粉彩）
  const tint = (c: string, t: number) => mix(c, P.light, t);
  const cA = tint(P.p, 0.3); // 主球（暖）
  const cB = tint(P.s, 0.5); // 冷色
  const cC = tint(P.a, 0.35); // 黃
  const cD = tint(P.light, 0); // 奶油
  const cE = tint(P.q, 0.5);

  // ── 展示台：低矮寬的圓柱，邊緣一圈細環
  const pod = kit.mesh(G.cylinder(5.4, 0.34), tint(P.bg2, 0.25), { outline: false });
  pod.position.y = -0.17;
  stage.add(pod);
  const podRing = kit.mesh(new THREE.TorusGeometry(5.4, 0.04, 6, 80), P.light, { outline: false, shadow: false });
  podRing.rotation.x = Math.PI / 2;
  podRing.position.y = 0.01;
  stage.add(podRing);

  const add = (geo: THREE.BufferGeometry, color: string, o: { outline?: boolean; shadow?: boolean } = {}) => {
    const m = kit.mesh(geo, color, o);
    stage.add(m);
    return m;
  };
  const hero = add(G.sphere(1), cA);
  const padA = add(G.cylinder(1.45, 0.9), cB); // 左：矮粗圓柱
  const padB = add(G.cylinder(1.0, 2.3), cD); // 右：高圓柱
  const capTop = add(G.sphere(0.62), cC); // 高圓柱頂上的球
  const ring = add(G.torus(1.9, 0.27), cC); // 立著的環（背後）
  const pill = add(G.capsule(0.46, 1.5), cE); // 躺著的膠囊
  const cube = add(G.box(1.15, 1.15, 1.15), cA); // 右前小方塊
  const cone = add(G.cone(0.6, 1.3), cB); // 小圓錐
  const floaters = [cA, cB, cC].map((c) => add(G.sphere(0.3), c, { shadow: false }));

  const outward = (o: THREE.Object3D, ex: number, k: number) => {
    const d = new THREE.Vector3(o.position.x, 0.2, o.position.z);
    if (d.lengthSq() < 0.01) d.set(0, 1, 0);
    o.position.addScaledVector(d.normalize(), ex * k);
  };

  return {
    root,
    base: { az: -0.42, el: 0.3, dist: 14.5, target: [0, 1.5, 0], fov: 30 },
    update(M) {
      const mv = M.mv;
      const u = M.u;
      const m3 = motion3d(M, look);
      stage.rotation.y = m3.spinY + m3.levRotY;
      stage.position.y = m3.levY;
      const ex = m3.explode;
      const beat = 1 + mv.beat * 0.12 * M.beat();

      // 左：矮粗圓柱（底座）
      const aPad = appear(M, 2);
      padA.position.set(-3.0, 0.45, 0.3);
      padA.scale.setScalar(Math.max(0.001, aPad) * beat);
      outward(padA, ex, 1.2);

      // 主球：沿用角色的跳躍姿態，在底座與高圓柱之間的空地上彈跳
      const pose = mascotPose(M, u);
      const a0 = appear(M, 0);
      const sy = pose.sy * (1 + mv.wobble * 0.05 * Math.sin(TAU * u * 5));
      const sxz = 1 / Math.sqrt(sy);
      const j0 = jit3(M, 1);
      hero.position.set((pose.x / 56) * 0.7 + 0.2 + j0.x, sy + pose.y / 56 + j0.y + M.fl(1, 0.3), 0.4);
      hero.scale.set(sxz, sy, sxz).multiplyScalar(Math.max(0.001, a0) * beat);
      hero.rotation.set(m3.tumble, 0, j0.r);
      outward(hero, ex, 0.6);

      // 右：高圓柱與頂球
      const aB = appear(M, 3);
      const j3 = jit3(M, 3);
      padB.position.set(3.1 + j3.x, 1.15, -0.4);
      padB.scale.setScalar(Math.max(0.001, aB));
      capTop.position.set(3.1 + j3.x, 2.3 + 0.62 + 0.05 * Math.sin(TAU * u * 3), -0.4);
      capTop.scale.setScalar(Math.max(0.001, aB));
      [padB, capTop].forEach((o) => outward(o, ex, 1.2));

      // 立著的環（背後）：繞垂直軸慢慢自轉
      const a1 = appear(M, 1);
      const turns = 1 + Math.round(mv.spin * 2);
      ring.position.set(0.3, 2.1 + M.fl(4, 0.2), -2.4);
      ring.rotation.set(0, TAU * u * turns + m3.tumble, 0);
      ring.scale.setScalar(Math.max(0.001, a1));
      outward(ring, ex, 1.0);

      // 膠囊：躺在前方，輕輕前後滾動
      const a4 = appear(M, 4);
      pill.position.set(-0.9, 0.46, 2.4);
      pill.rotation.set(0, 0.35, Math.PI / 2 + Math.sin(TAU * u * 2) * 0.08 * (1 + mv.wobble));
      pill.scale.setScalar(Math.max(0.001, a4));
      outward(pill, ex, 1.0);

      // 方塊：右前，分段各轉 90°
      const a5 = appear(M, 5);
      let rot = 0;
      for (const t0 of [0.3, 0.45, 0.6]) rot += M.tw(t0, t0 + 0.08, mv.holds > 0.4 ? 'o' : 'io') * (Math.PI / 2);
      const j5 = jit3(M, 5);
      cube.position.set(2.6 + j5.x, 0.58, 2.4);
      cube.rotation.set(0, rot + m3.tumble + 0.5, j5.r);
      cube.scale.setScalar(Math.max(0.001, a5) * beat);
      outward(cube, ex, 1.1);

      // 小圓錐
      const a6 = appear(M, 6);
      cone.position.set(-4.4, 0.65, 1.8);
      cone.rotation.set(0, TAU * u, Math.sin(TAU * u * 2) * 0.06);
      cone.scale.setScalar(Math.max(0.001, a6));
      outward(cone, ex, 1.0);

      // 三顆小球在上空緩慢浮動
      floaters.forEach((f, i) => {
        const a = appear(M, 6 + i, 0.1, 0.26);
        const ang = TAU * (u + i / floaters.length);
        f.position.set(Math.cos(ang) * 3.4, 4.4 + 0.3 * Math.sin(TAU * (u * 2 + i / 3)), Math.sin(ang) * 1.6 - 0.8);
        f.scale.setScalar(Math.max(0.001, a));
        outward(f, ex, 0.8);
      });
    },
  };
}
