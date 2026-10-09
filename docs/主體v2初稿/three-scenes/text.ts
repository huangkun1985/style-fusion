// 場景 v2：3D 文字。MOTION 六個字母逐字落下、落地擠壓、波浪、翻轉、爆開，再逐字退場；
// 字母站在一條長長的展示台上，後方一面大圓牆框住標題，台面有一條細線，周圍有三個慢慢旋轉的小幾何體。
import * as THREE from 'three';
import { mix } from '../../../color';
import { lerp, TAU } from '../../../util';
import { jit3, motion3d } from '../../common';
import type { BuildCtx, SceneInst } from '../../types';
import { geoFactory, GLYPHS, glyphGeometry } from '../../util';

const WORD = 'MOTION';
const H = 1.9;

export function buildText2({ look, kit }: BuildCtx): SceneInst {
  const P = look.pal;
  const G = geoFactory(kit.coarse);
  const root = new THREE.Group();
  const stage = new THREE.Group();
  root.add(stage);
  stage.add(kit.shadowCatcher(40));
  const gap = 0.16;
  const widths = WORD.split('').map((c) => (GLYPHS[c]?.w ?? 1) * H);
  const total = widths.reduce((s, w) => s + w, 0) + gap * H * (WORD.length - 1);

  // ── 展示台、細線與背景大圓牆
  const plinth = kit.mesh(G.box(total + 2.6, 0.34, 3.2), P.bg2, { outline: false });
  plinth.position.y = -0.17;
  stage.add(plinth);
  const bar = kit.mesh(G.box(total + 1.6, 0.05, 0.08), P.ink, { outline: false, shadow: false });
  bar.position.set(0, 0.03, 1.35);
  stage.add(bar);
  const wall = new THREE.Mesh(kit.track(new THREE.CircleGeometry(3.7, 64)), kit.material(mix(P.card, P.bg2, 0.45)));
  wall.position.set(0, 1.55, -2.6);
  wall.receiveShadow = true;
  stage.add(wall);
  const wallRing = new THREE.Mesh(kit.track(new THREE.RingGeometry(3.7, 3.84, 64)), kit.track(new THREE.MeshBasicMaterial({ color: new THREE.Color(P.ink), side: THREE.DoubleSide })));
  wallRing.position.set(0, 1.55, -2.58);
  if (kit.mat !== 'wire' && kit.mat !== 'neon') stage.add(wallRing);

  let cursor = -total / 2;
  const letters = WORD.split('').map((ch, i) => {
    const holder = new THREE.Group();
    const geo = glyphGeometry(ch, 0.46, !kit.coarse, kit.coarse);
    const mesh = kit.mesh(geo, i === 3 ? P.a : i % 2 ? P.s : P.p);
    mesh.scale.setScalar(H);
    holder.add(mesh);
    const x = cursor + widths[i] / 2;
    cursor += widths[i] + gap * H;
    stage.add(holder);
    return { holder, x, w: widths[i] };
  });

  // ── 三個慢慢旋轉的小幾何體
  const deco = [
    { m: kit.mesh(G.sphere(0.34), P.a, { outline: false }), x: -4.6, y: 3.9, z: -1.2 },
    { m: kit.mesh(G.box(0.5), P.s, { outline: false }), x: 4.8, y: 4.1, z: -1.0 },
    { m: kit.mesh(G.octa(0.38), P.q, { outline: false }), x: 4.2, y: 0.9, z: 1.6 },
  ];
  deco.forEach((d) => stage.add(d.m));

  return {
    root,
    base: { az: -0.18, el: 0.2, dist: 17, target: [0, 1.4, 0], fov: 30 },
    update(M) {
      const mv = M.mv;
      const u = M.u;
      const m3 = motion3d(M, look);
      const tw = mv.typeWriter > 0.5;
      stage.rotation.y = m3.spinY + m3.levRotY;
      stage.position.y = m3.levY;
      deco.forEach((d, i) => {
        d.m.position.set(d.x, d.y + Math.sin(TAU * (u * 2 + i / 3)) * 0.18, d.z);
        d.m.rotation.set(TAU * u * (i + 1), TAU * u * 2, 0);
      });
      letters.forEach((L, i) => {
        const st = M.stag(i) * 1.5;
        let p: number;
        let out: number;
        if (tw) {
          p = u > 0.06 + i * 0.055 ? 1 : 0;
          out = u > 0.8 + (WORD.length - 1 - i) * 0.025 ? 1 : 0;
        } else {
          p = M.tw(0.04 + st, 0.22 + st, 'o');
          out = M.tw(0.8 + M.stag(i), 0.95 + M.stag(i), 'i');
        }
        const visible = p > 0.001 && out < 0.999;
        L.holder.visible = visible;
        if (!visible) return;
        const j = jit3(M, 10 + i);
        const land = tw ? 0 : Math.max(0, 1 - Math.abs(u - (0.22 + st)) / 0.04);
        const sq = land * mv.squash * 0.35;
        const beat = mv.beat > 0.01 ? mv.beat * 0.14 * M.beat() * (i % 2 ? 1 : 0.6) : 0;
        const sy = 1 - sq * 0.8 + beat;
        const sx = 1 + sq * 0.5 + beat;
        const grow = tw ? 1 : lerp(0.5, 1, p);
        const fallY = tw ? 0 : lerp(8, 0, p) - out * 8;
        const wave = mv.typeWave * 0.4 * Math.sin(TAU * (u * 2 - i * 0.12));
        const spreadX = (i - (WORD.length - 1) / 2) * m3.explode * 0.8;
        L.holder.position.set(L.x + spreadX + j.x, (H / 2) * sy * grow + fallY + wave + M.fl(i + 3, 0.2) + j.y, m3.explode * (i % 2 ? 1 : -1) * 1.2);
        L.holder.scale.set(sx * grow, sy * grow, grow);
        const flip = mv.flip * TAU * M.tw(0.5 + st * 0.3, 0.7 + st * 0.3, 'io');
        L.holder.rotation.set(flip + m3.tumble, 0, (tw ? 0 : (1 - p) * (i % 2 ? -0.6 : 0.6) + out * (i % 2 ? 0.5 : -0.5)) + j.r);
      });
    },
  };
}
