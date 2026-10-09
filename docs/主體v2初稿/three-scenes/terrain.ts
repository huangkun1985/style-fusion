// 場景 v2：3D 地形飛行。沿 z 軸週期性的低多邊形山谷（鏡頭每個循環剛好前進一個週期，所以無縫循環）：
// 五段高度配色（谷底草地、坡面、岩石、雪線與雪頂），山坡上散佈松樹（整片合併成一個網格，隨地形一起前進），
// 遠處的霧與落日（有光暈與橫條紋）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { darken, lighten, mix } from '../../../color';
import { hash, smooth, TAU } from '../../../util';
import { motion3d } from '../../common';
import type { BuildCtx, SceneInst } from '../../types';

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
  const halo = g.createRadialGradient(128, 128, 90, 128, 128, 128);
  halo.addColorStop(0, 'rgba(255,255,255,0.0)');
  halo.addColorStop(1, 'rgba(255,255,255,0)');
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, a);
  gr.addColorStop(1, b);
  g.fillStyle = gr;
  g.beginPath();
  g.arc(128, 128, 112, 0, TAU);
  g.fill();
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 7; i++) g.fillRect(0, 134 + i * 17, 256, 2 + i * 1.8);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildTerrain2({ look, kit }: BuildCtx): SceneInst {
  const P = look.pal;
  const root = new THREE.Group();
  const terr = new THREE.Group();
  root.add(terr);
  const wireMode = kit.mat === 'wire' || kit.mat === 'neon';

  const xs = Array.from({ length: NX + 1 }, (_, i) => -WIDTH / 2 + (i / NX) * WIDTH);
  const zs = Array.from({ length: NZ + 1 }, (_, j) => 10 - (j / NZ) * DEPTH);
  const H = zs.map((z) => xs.map((x) => height(x, z)));
  let hmin = Infinity;
  let hmax = -Infinity;
  for (const row of H) for (const h of row) {
    hmin = Math.min(hmin, h);
    hmax = Math.max(hmax, h);
  }
  // 五段高度配色：谷底草 → 坡面 → 岩 → 雪線 → 雪頂
  const grass = P.q;
  const slope = mix(P.q, P.r, 0.45);
  const rock = mix(P.r, darken(P.ink, -0.2), 0.4);
  const snow = lighten(P.light, 0);
  const colorAt = (h: number, jitter: number) => {
    const t = (h - hmin) / (hmax - hmin || 1) + jitter * 0.03;
    if (t < 0.2) return mix(darken(grass, 0.12), grass, t / 0.2);
    if (t < 0.45) return mix(grass, slope, (t - 0.2) / 0.25);
    if (t < 0.7) return mix(slope, rock, (t - 0.45) / 0.25);
    if (t < 0.84) return mix(rock, snow, (t - 0.7) / 0.14);
    return snow;
  };

  if (wireMode) {
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
    const pos: number[] = [];
    const col: number[] = [];
    const tri = (a: [number, number], b: [number, number], c: [number, number], k: number) => {
      const hs = [a, b, c].map(([i, j]) => H[j][i]);
      const hm = (hs[0] + hs[1] + hs[2]) / 3;
      const color = new THREE.Color(colorAt(hm, hash(k, 3, 9) - 0.5));
      for (const [i, j] of [a, c, b]) {
        pos.push(xs[i], H[j][i], zs[j]);
        col.push(color.r, color.g, color.b);
      }
    };
    let k = 0;
    for (let j = 0; j < NZ; j++)
      for (let i = 0; i < NX; i++) {
        if ((i + j) % 2) {
          tri([i, j], [i, j + 1], [i + 1, j], k++);
          tri([i + 1, j], [i, j + 1], [i + 1, j + 1], k++);
        } else {
          tri([i, j], [i, j + 1], [i + 1, j + 1], k++);
          tri([i, j], [i + 1, j + 1], [i + 1, j], k++);
        }
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    const mat = kit.material('#ffffff', { vertexColors: true });
    (mat as THREE.MeshLambertMaterial).flatShading = true;
    const mesh = new THREE.Mesh(kit.track(g), mat);
    mesh.receiveShadow = false;
    terr.add(mesh);

    // ── 松樹：每個週期固定的雜湊位置（所以隨地形一起無縫循環），只種在低處與緩坡
    const parts: THREE.BufferGeometry[] = [];
    const heightAt = (x: number, z: number) => height(x, z);
    const trees = Math.round((DEPTH / PERIOD) * 26);
    for (let n = 0; n < trees; n++) {
      const cell = n % 26;
      const rep = Math.floor(n / 26);
      const x = (hash(cell, 31, 7) * 2 - 1) * (WIDTH / 2 - 3);
      if (Math.abs(x) < 3.2) continue;
      const z = 10 - (hash(cell, 32, 7) * PERIOD + rep * PERIOD);
      const y = heightAt(x, z);
      if ((y - hmin) / (hmax - hmin) > 0.55) continue;
      const s = 0.7 + hash(cell, 33, 7) * 0.7;
      const dark = darken(P.q, 0.25 + hash(cell, 34, 7) * 0.12);
      const c = new THREE.Color(dark);
      const paint = (geo: THREE.BufferGeometry, color: THREE.Color) => {
        const n3 = geo.attributes.position.count;
        const arr = new Float32Array(n3 * 3);
        for (let q = 0; q < n3; q++) {
          arr[q * 3] = color.r;
          arr[q * 3 + 1] = color.g;
          arr[q * 3 + 2] = color.b;
        }
        geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
        return geo;
      };
      const trunk = paint(new THREE.CylinderGeometry(0.1 * s, 0.14 * s, 0.5 * s, 5), new THREE.Color(darken(P.r, 0.2)));
      trunk.translate(x, y + 0.25 * s, z);
      const c1 = paint(new THREE.ConeGeometry(0.62 * s, 1.1 * s, 6), c);
      c1.translate(x, y + 0.9 * s, z);
      const c2 = paint(new THREE.ConeGeometry(0.46 * s, 0.9 * s, 6), c);
      c2.translate(x, y + 1.55 * s, z);
      parts.push(trunk.toNonIndexed(), c1.toNonIndexed(), c2.toNonIndexed());
    }
    if (parts.length) {
      const merged = mergeGeometries(parts, false);
      if (merged) {
        merged.computeVertexNormals();
        const tm = kit.material('#ffffff', { vertexColors: true });
        (tm as THREE.MeshLambertMaterial).flatShading = true;
        terr.add(new THREE.Mesh(kit.track(merged), tm));
      }
    }
  }

  // ── 地平線上的落日（含光暈）
  const sun = new THREE.Mesh(
    kit.track(new THREE.CircleGeometry(24, 48)),
    kit.track(new THREE.MeshBasicMaterial({ map: kit.track(sunTexture(P.a, P.p)), transparent: true, depthWrite: false })),
  );
  root.add(sun);
  const halo = new THREE.Mesh(kit.track(new THREE.CircleGeometry(40, 48)), kit.track(new THREE.MeshBasicMaterial({ color: new THREE.Color(P.a), transparent: true, opacity: 0.16, depthWrite: false })));
  if (!wireMode) root.add(halo);
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
      halo.position.set(sway * 0.3, 18, -126);
      return { pos: [sway, cy, 8], target: [sway * 0.3, 1.7 + mv.crane * 0.8 * Math.sin(TAU * u), -14], fov };
    },
  };
}
