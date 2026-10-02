// 場景：3D 地形飛行。沿 z 軸週期性的低多邊形山谷，鏡頭每個循環剛好前進一個週期，所以能無縫循環。
import * as THREE from 'three';
import { darken, lighten, mix } from '../../color';
import { smooth, TAU } from '../../util';
import { motion3d } from '../common';
import type { BuildCtx, SceneInst } from '../types';

const PERIOD = 26;
const WIDTH = 46;
const DEPTH = 120;
const NX = 46;
const NZ = 120;

function height(x: number, z: number): number {
  const corridor = smooth(1.6, 8.5, Math.abs(x));
  const amp = 0.55 + Math.abs(x) / 11;
  let h = 1.7 * Math.sin(TAU * (z / PERIOD) + x * 0.32 + 1.3) * Math.cos(x * 0.21);
  h += 1.1 * Math.sin(TAU * ((2 * z) / PERIOD) - x * 0.5 + 0.4);
  h += 0.7 * Math.sin(TAU * ((3 * z) / PERIOD) + x * 0.9);
  return (h * 0.5 + 0.9) * corridor * amp * 1.3;
}

function sunTexture(a: string, b: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, a);
  gr.addColorStop(1, b);
  g.fillStyle = gr;
  g.beginPath();
  g.arc(128, 128, 126, 0, TAU);
  g.fill();
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 7; i++) g.fillRect(0, 130 + i * 18, 256, 2 + i * 1.8);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildTerrain({ look, kit }: BuildCtx): SceneInst {
  const P = look.pal;
  const root = new THREE.Group();
  const terr = new THREE.Group();
  root.add(terr);
  const wireMode = kit.mat === 'wire' || kit.mat === 'neon';

  // 取樣高度
  const xs = Array.from({ length: NX + 1 }, (_, i) => -WIDTH / 2 + (i / NX) * WIDTH);
  const zs = Array.from({ length: NZ + 1 }, (_, j) => 10 - (j / NZ) * DEPTH);
  const H = zs.map((z) => xs.map((x) => height(x, z)));
  let hmin = Infinity;
  let hmax = -Infinity;
  for (const row of H) for (const h of row) {
    hmin = Math.min(hmin, h);
    hmax = Math.max(hmax, h);
  }
  const colorAt = (h: number) => {
    const t = (h - hmin) / (hmax - hmin || 1);
    if (t < 0.28) return mix(darken(P.q, 0.1), P.q, t / 0.28);
    if (t < 0.62) return mix(P.q, P.r, (t - 0.28) / 0.34);
    return mix(P.r, lighten(P.light, 0), Math.min(1, (t - 0.62) / 0.3));
  };

  if (wireMode) {
    // 線框地形：只畫格線，用背景色的實心面遮住背面的線
    const pos: number[] = [];
    for (let j = 0; j <= NZ; j++)
      for (let i = 0; i <= NX; i++) {
        if (i < NX) pos.push(xs[i], H[j][i], zs[j], xs[i + 1], H[j][i + 1], zs[j]);
        if (j < NZ) pos.push(xs[i], H[j][i], zs[j], xs[i], H[j + 1][i], zs[j + 1]);
      }
    const surf = new THREE.PlaneGeometry(WIDTH, DEPTH, NX, NZ);
    surf.rotateX(-Math.PI / 2);
    surf.translate(0, 0, 10 - DEPTH / 2);
    const sp = surf.attributes.position;
    for (let k = 0; k < sp.count; k++) {
      const ix = Math.round(((sp.getX(k) + WIDTH / 2) / WIDTH) * NX);
      const iz = Math.round(((10 - sp.getZ(k)) / DEPTH) * NZ);
      sp.setY(k, H[iz][ix] - 0.02);
    }
    surf.computeVertexNormals();
    terr.add(new THREE.Mesh(kit.track(surf), kit.material(P.bg)));
    terr.add(kit.fatLines(pos, kit.mat === 'neon' ? lighten(P.s, 0.15) : P.ink, kit.mat === 'neon' ? 2.2 : 1.5));
  } else {
    // 實心低多邊形：每個三角形一個顏色
    const pos: number[] = [];
    const col: number[] = [];
    const tri = (a: [number, number], b: [number, number], c: [number, number]) => {
      const hs = [a, b, c].map(([i, j]) => H[j][i]);
      const hm = (hs[0] + hs[1] + hs[2]) / 3;
      const color = new THREE.Color(colorAt(hm));
      // 順序改成 a, c, b：從上方看是逆時針，法線朝上
      for (const [i, j] of [a, c, b]) {
        pos.push(xs[i], H[j][i], zs[j]);
        col.push(color.r, color.g, color.b);
      }
    };
    for (let j = 0; j < NZ; j++)
      for (let i = 0; i < NX; i++) {
        if ((i + j) % 2) {
          tri([i, j], [i, j + 1], [i + 1, j]);
          tri([i + 1, j], [i, j + 1], [i + 1, j + 1]);
        } else {
          tri([i, j], [i, j + 1], [i + 1, j + 1]);
          tri([i, j], [i + 1, j + 1], [i + 1, j]);
        }
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    const mat = kit.material('#ffffff', { vertexColors: true });
    (mat as THREE.MeshLambertMaterial).flatShading = true;
    const mesh = new THREE.Mesh(kit.track(g), mat);
    terr.add(mesh);
  }

  // 地平線上的太陽
  const sun = new THREE.Mesh(
    kit.track(new THREE.CircleGeometry(24, 48)),
    kit.track(new THREE.MeshBasicMaterial({ map: kit.track(sunTexture(P.a, P.p)), transparent: true, depthWrite: false })),
  );
  root.add(sun);
  const fog = wireMode ? null : { color: mix(P.bg, P.bg2, 0.5), near: 30, far: 100 };

  return {
    root,
    fog,
    base: { az: 0, el: 0.1, dist: 22, target: [0, 1.5, -10], fov: 48 },
    update(M) {
      const mv = M.mv;
      const u = M.u;
      const m3 = motion3d(M, look);
      const k = 1 + Math.round(mv.fly * 2);
      terr.position.z = (PERIOD * k * u) % PERIOD;
      const sway = Math.sin(TAU * u) * 0.9 + mv.truck * 3.2 * Math.sin(TAU * u);
      const cy = 3.1 + 0.25 * Math.sin(TAU * u * 2) + mv.crane * 1.8 * Math.sin(TAU * u) + m3.levY * 2;
      const fov = 48 * (1 + mv.dolly * 0.5 * (0.5 - 0.5 * Math.cos(TAU * u)));
      sun.position.set(sway * 0.3, 18, -125);
      return { pos: [sway, cy, 8], target: [sway * 0.3, 1.7 + mv.crane * 0.8 * Math.sin(TAU * u), -14], fov };
    },
  };
}
