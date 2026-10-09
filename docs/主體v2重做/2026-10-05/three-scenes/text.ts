// 場景 v2：3D 文字（第二版，對齊 2D 文字標誌的設計：奶油色正面的粗體字，字後面疊出強調色與深色兩層厚度，筆記見 docs/主體v2參考/text3d.md）。
// MOTION 六個字母逐字落下、落地擠壓、波浪、翻轉、爆開，再逐字退場；字母站在一條低矮的展示台上，台面一條細線，沒有背景牆（第一版的大圓牆在很多材質下很突兀）。
// 擠出的做法：每個字母是三個同形狀的網格——奶油色正面、往後偏移的強調色層、再往後的深色層——像 2D 版的疊層擠出。
import * as THREE from 'three';
import { darken, mix } from '../../../color';
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
  // 每個字母一個飽和的顏色（不要白膜：近白的正面在標準材質下會變成灰灰的石膏），背後兩層是同一色相的深色
  const faceCols = [P.p, P.a, P.s, P.q, P.p, P.s];
  let cursor = -total / 2;
  const letters = WORD.split('').map((ch, i) => {
    const holder = new THREE.Group();
    const geo = glyphGeometry(ch, 0.34, !kit.coarse, kit.coarse);
    const fc = faceCols[i % faceCols.length];
    const face = kit.mesh(geo, fc);
    face.scale.setScalar(H);
    holder.add(face);
    // 背後兩層：和正面「前後相接、不重疊」的薄片（之前讓它們互相穿插，側面出現鋸齒條紋、相機一動就閃）
    const lgeo = glyphGeometry(ch, 0.2, false, kit.coarse);
    [darken(fc, 0.18), darken(mix(fc, P.ink, 0.35), 0.1)].forEach((c, k) => {
      const l = kit.mesh(lgeo, c, { outline: k === 1, receive: false });
      l.scale.setScalar(H);
      l.position.set(0.17 * (k + 1) * H * 0.55, -0.1 * (k + 1) * H * 0.55, -(0.27 + 0.2 * k) * H);
      holder.add(l);
    });
    const x = cursor + widths[i] / 2;
    cursor += widths[i] + gap * H;
    stage.add(holder);
    return { holder, x, w: widths[i] };
  });

  // ── 周圍的裝飾：後方立著的大環、台前一條粗圓角底線、兩圈繞行的彩色小形體（球、八面體、環、錐、方塊）
  const tintC = (c: string, t: number) => mix(c, P.light, t);
  const backRing = kit.mesh(G.torus(3.3, 0.12), tintC(P.s, 0.3), { outline: false });
  backRing.position.set(0, 3.55, -3.4);
  stage.add(backRing);
  const backRing2 = kit.mesh(G.torus(2.4, 0.09), tintC(P.a, 0.2), { outline: false });
  backRing2.position.set(0.4, 3.55, -3.0);
  stage.add(backRing2);
  const underline = kit.mesh(G.capsule(0.13, total * 0.7), P.a, { outline: false });
  underline.rotation.z = Math.PI / 2;
  underline.position.set(0, 0.16, 1.5);
  stage.add(underline);
  const dotL = kit.mesh(G.sphere(0.24), P.p, { outline: false });
  const dotR = kit.mesh(G.sphere(0.24), P.s, { outline: false });
  stage.add(dotL, dotR);
  const shapesList: THREE.BufferGeometry[] = [G.sphere(0.3), G.octa(0.36), G.torus(0.28, 0.1), G.cone(0.26, 0.55), G.box(0.46), G.ico(0.32), G.sphere(0.2), G.octa(0.26), G.torus(0.2, 0.07), G.box(0.34)];
  const cols = [P.a, tintC(P.s, 0.3), P.p, tintC(P.q, 0.35), tintC(P.a, 0.4)];
  const deco = shapesList.map((g, i) => ({ m: kit.mesh(g, cols[i % cols.length], { outline: false, shadow: i % 2 === 0 }), i }));
  deco.forEach((d) => stage.add(d.m));

  return {
    root,
    base: { az: -0.28, el: 0.2, dist: 17, target: [0, 2.2, 0], fov: 30 },
    update(M) {
      const mv = M.mv;
      const u = M.u;
      const m3 = motion3d(M, look);
      const tw = mv.typeWriter > 0.5;
      stage.rotation.y = m3.spinY + m3.levRotY;
      stage.position.y = m3.levY;
      backRing.rotation.set(0, 0.25 + 0.1 * Math.sin(TAU * u), TAU * u);
      backRing2.rotation.set(0.3, -0.2, -TAU * u * 2);
      dotL.position.set(-total * 0.35 - 0.5, 0.16 + 0.1 * Math.sin(TAU * u * 2), 1.5);
      dotR.position.set(total * 0.35 + 0.5, 0.16 + 0.1 * Math.sin(TAU * u * 2 + 2), 1.5);
      deco.forEach(({ m, i }) => {
        const a = TAU * (u * (i % 2 ? 1 : -1) * (1 + (i % 3)) * 0 + (i / deco.length) + u * (i % 2 ? 1 : 2) * 0.5);
        const rx = 4.2 + (i % 3) * 1.3;
        m.position.set(Math.cos(a) * rx, 3.5 + (i % 4) * 0.55 + Math.sin(TAU * (u * 2 + i / 5)) * 0.25, Math.sin(a) * 2.4 - 1.2);
        m.rotation.set(TAU * u * (1 + (i % 3)), TAU * u * 2, i);
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
