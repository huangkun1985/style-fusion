// 場景：3D 文字。MOTION 六個字母逐字落下、落地擠壓、波浪、翻轉、爆開，再逐字退場。
import * as THREE from 'three';
import { lerp, TAU } from '../../util';
import { jit3, motion3d } from '../common';
import type { BuildCtx, SceneInst } from '../types';
import { GLYPHS, glyphGeometry } from '../util';

const WORD = 'MOTION';
const H = 1.9;

export function buildText({ look, kit }: BuildCtx): SceneInst {
  const P = look.pal;
  const root = new THREE.Group();
  const stage = new THREE.Group();
  root.add(stage);
  stage.add(kit.shadowCatcher(40));
  const gap = 0.16;
  const widths = WORD.split('').map((c) => (GLYPHS[c]?.w ?? 1) * H);
  const total = widths.reduce((s, w) => s + w, 0) + gap * H * (WORD.length - 1);
  let cursor = -total / 2;
  const letters = WORD.split('').map((ch, i) => {
    const holder = new THREE.Group();
    const geo = glyphGeometry(ch, 0.42, !kit.coarse, kit.coarse);
    const mesh = kit.mesh(geo, i === 3 ? P.a : i % 2 ? P.s : P.p);
    mesh.scale.setScalar(H);
    holder.add(mesh);
    const x = cursor + widths[i] / 2;
    cursor += widths[i] + gap * H;
    stage.add(holder);
    return { holder, x, w: widths[i] };
  });

  return {
    root,
    base: { az: -0.18, el: 0.2, dist: 16.5, target: [0, 1.15, 0], fov: 30 },
    update(M) {
      const mv = M.mv;
      const u = M.u;
      const m3 = motion3d(M, look);
      const tw = mv.typeWriter > 0.5;
      stage.rotation.y = m3.spinY + m3.levRotY;
      stage.position.y = m3.levY;
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
