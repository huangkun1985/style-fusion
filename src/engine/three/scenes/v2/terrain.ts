// 場景 v2：3D 地形飛行（第二版：改成參考圖「分層同色相剪影」的色調——谷底最深、越高越暖越亮，近黑的松樹剪影，大而低的落日與暖色霧，筆記見 docs/主體v2參考/terrain3d.md）。沿 z 軸週期性的低多邊形山谷（鏡頭每個循環剛好前進一個週期，所以無縫循環）：
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
  // 分層色：谷底是深冷色（接近 ink 的青藍），往上依序變成綠、暖橘、奶油（被落日照亮的山頂）
  const grass = mix(mix(P.q, P.s, 0.35), P.ink, 0.32);
  const slope = mix(P.q, P.a, 0.28);
  const rock = mix(P.p, P.a, 0.45);
  const snow = mix(P.light, P.a, 0.25);
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
      const dark = mix(P.ink, P.s, 0.3 + hash(cell, 34, 7) * 0.2);
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
      const trunk = paint(new THREE.CylinderGeometry(0.1 * s, 0.14 * s, 0.5 * s, 5), new THREE.Color(darken(P.ink, -0.1)));
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

  // ── 山谷裡的河、岩石與野花、遠方的山脈與雲（第一版看起來像「只有地形」的半成品）
  const extras: { clouds: THREE.Group; ridges: THREE.Group; river: THREE.Mesh | null; flow: THREE.Texture | null } = { clouds: new THREE.Group(), ridges: new THREE.Group(), river: null, flow: null };
  if (!wireMode) {
    const rc = mix(mix(P.s, P.light, 0.25), P.q, 0.1);
    const river = new THREE.Mesh(kit.track(new THREE.PlaneGeometry(2.6, DEPTH + 20)), kit.material(rc));
    river.rotation.x = -Math.PI / 2;
    river.position.set(0, 0.05, 10 - DEPTH / 2);
    river.receiveShadow = false;
    terr.add(river);
    // 水紋：半透明的白色波浪線貼圖在河面上沿流向捲動（每圈剛好一個貼圖週期，所以無縫）
    const sc = document.createElement('canvas');
    sc.width = 128;
    sc.height = 256;
    const g2 = sc.getContext('2d')!;
    g2.strokeStyle = 'rgba(255,255,255,0.75)';
    g2.lineCap = 'round';
    for (let k = 0; k < 9; k++) {
      g2.lineWidth = 2 + (k % 3);
      const x0 = 14 + ((k * 37) % 100);
      const y0 = (k * 29) % 256;
      g2.beginPath();
      g2.moveTo(x0, y0);
      g2.bezierCurveTo(x0 + 10, y0 + 16, x0 - 10, y0 + 30, x0, y0 + 46);
      g2.stroke();
    }
    const flowTex = kit.track(new THREE.CanvasTexture(sc));
    flowTex.wrapS = flowTex.wrapT = THREE.RepeatWrapping;
    flowTex.repeat.set(1, (DEPTH + 20) / 14);
    flowTex.colorSpace = THREE.SRGBColorSpace;
    const flow = new THREE.Mesh(kit.track(new THREE.PlaneGeometry(2.6, DEPTH + 20)), kit.track(new THREE.MeshBasicMaterial({ map: flowTex, transparent: true, depthWrite: false, fog: true })));
    flow.rotation.x = -Math.PI / 2;
    flow.position.set(0, 0.07, 10 - DEPTH / 2);
    terr.add(flow);
    extras.flow = flowTex;
    for (const sd of [-1, 1]) {
      const bank = new THREE.Mesh(kit.track(new THREE.PlaneGeometry(0.28, DEPTH + 20)), kit.material(mix(rc, P.ink, 0.25)));
      bank.rotation.x = -Math.PI / 2;
      bank.position.set(sd * 1.4, 0.06, 10 - DEPTH / 2);
      terr.add(bank);
    }
    extras.river = river;
    // 岩石與野花：每個週期固定的雜湊位置（所以隨地形一起無縫循環），合併成兩個網格
    const rockParts: THREE.BufferGeometry[] = [];
    const flowerParts: THREE.BufferGeometry[] = [];
    const paintAll = (geo: THREE.BufferGeometry, color: THREE.Color) => {
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
    const flowerCols = [P.a, P.p, P.light, mix(P.s, P.light, 0.3)].map((c) => new THREE.Color(c));
    for (let n = 0; n < Math.round((DEPTH / PERIOD) * 30); n++) {
      const cell = n % 30;
      const rep = Math.floor(n / 30);
      const x = (hash(cell, 41, 7) * 2 - 1) * (WIDTH / 2 - 2);
      const z = 10 - (hash(cell, 42, 7) * PERIOD + rep * PERIOD);
      const y = height(x, z);
      if (Math.abs(x) < 2.2) continue;
      const t = (y - hmin) / (hmax - hmin || 1);
      if (cell % 3 === 0 && t < 0.7) {
        const r = 0.22 + hash(cell, 43, 7) * 0.42;
        const g = new THREE.IcosahedronGeometry(r, 0);
        g.scale(1, 0.7, 1);
        g.rotateY(hash(cell, 44, 7) * 6);
        g.translate(x, y + r * 0.3, z);
        rockParts.push(paintAll(g.toNonIndexed(), new THREE.Color(mix(P.r, P.ink, 0.25 + hash(cell, 45, 7) * 0.2))));
      } else if (t < 0.4) {
        for (let k = 0; k < 4; k++) {
          const g = new THREE.BoxGeometry(0.12, 0.12, 0.12);
          g.translate(x + (hash(cell, 50 + k, 7) - 0.5) * 1.1, y + 0.09, z + (hash(cell, 60 + k, 7) - 0.5) * 1.1);
          flowerParts.push(paintAll(g.toNonIndexed(), flowerCols[(cell + k) % 4]));
        }
      }
    }
    for (const parts of [rockParts, flowerParts]) {
      if (!parts.length) continue;
      const merged = mergeGeometries(parts, false);
      if (!merged) continue;
      merged.computeVertexNormals();
      const mm = kit.material('#ffffff', { vertexColors: true });
      (mm as THREE.MeshLambertMaterial).flatShading = true;
      terr.add(new THREE.Mesh(kit.track(merged), mm));
    }
    // 遠方山脈：三層剪影，一層比一層暗、對比一層比一層強（不吃霧，顏色手動混好）
    const fogC = mix(mix(P.bg, P.a, 0.28), P.bg2, 0.3);
    const ridgeLayers = [
      { z: -150, h: 46, c: mix(fogC, P.p, 0.22), seed: 3, w: 380 },
      { z: -136, h: 36, c: mix(fogC, mix(P.s, P.ink, 0.2), 0.45), seed: 7, w: 340 },
      { z: -124, h: 26, c: mix(mix(P.s, P.ink, 0.35), fogC, 0.25), seed: 11, w: 300 },
    ];
    ridgeLayers.forEach((L) => {
      const shape = new THREE.Shape();
      shape.moveTo(-L.w / 2, -6);
      const pts = 48;
      for (let i = 0; i <= pts; i++) {
        const x = -L.w / 2 + (i / pts) * L.w;
        const peak = Math.abs(Math.sin(i * 0.9 + L.seed)) * 0.55 + Math.abs(Math.sin(i * 0.37 + L.seed * 2)) * 0.45;
        shape.lineTo(x, 2 + peak * L.h);
      }
      shape.lineTo(L.w / 2, -6);
      shape.closePath();
      const m = new THREE.Mesh(kit.track(new THREE.ShapeGeometry(shape)), kit.track(new THREE.MeshBasicMaterial({ color: new THREE.Color(L.c), fog: false })));
      m.position.set(0, -2, L.z);
      extras.ridges.add(m);
    });
    root.add(extras.ridges);
    // 雲：幾團白色圓球（不吃霧），慢慢往一側飄
    for (let i = 0; i < 5; i++) {
      const g = new THREE.Group();
      for (let k = 0; k < 4; k++) {
        const b = new THREE.Mesh(kit.track(new THREE.SphereGeometry(3.2 + (k % 2) * 1.4, 10, 8)), kit.track(new THREE.MeshBasicMaterial({ color: new THREE.Color(mix(P.light, fogC, 0.1)), fog: false, transparent: true, opacity: 0.9 })));
        b.position.set((k - 1.5) * 4, (k % 2) * 1.2, 0);
        b.scale.y = 0.6;
        g.add(b);
      }
      g.userData = { x0: hash(i, 71) * 200, y: 26 + hash(i, 72) * 18, z: -100 - hash(i, 73) * 20 };
      extras.clouds.add(g);
    }
    root.add(extras.clouds);
  }

  // ── 地平線上的落日（含光暈）
  const sun = new THREE.Mesh(
    kit.track(new THREE.CircleGeometry(30, 48)),
    kit.track(new THREE.MeshBasicMaterial({ map: kit.track(sunTexture(P.a, P.p)), transparent: true, depthWrite: false, fog: false })),
  );
  root.add(sun);
  const halo = new THREE.Mesh(kit.track(new THREE.CircleGeometry(58, 48)), kit.track(new THREE.MeshBasicMaterial({ color: new THREE.Color(mix(P.a, P.light, 0.55)), transparent: true, opacity: 0.28, depthWrite: false, fog: false })));
  if (!wireMode) root.add(halo);
  const fog = wireMode ? null : { color: mix(mix(P.bg, P.a, 0.28), P.bg2, 0.3), near: 26, far: 96 };

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
      extras.clouds.children.forEach((c) => {
        const d = c.userData as { x0: number; y: number; z: number };
        c.position.set(((d.x0 + u * 200 + 100) % 200) - 100, d.y, d.z);
      });
      extras.ridges.position.x = sway * 0.4;
      if (extras.flow) extras.flow.offset.y = -u * (PERIOD / 14) * k * 0 + u * (DEPTH + 20) / 14 / ((DEPTH + 20) / 14) * 2; // 每圈 2 個貼圖週期往前流
      sun.position.set(sway * 0.3, 20, -165);
      halo.position.set(sway * 0.3, 20, -166);
      return { pos: [sway, cy, 8], target: [sway * 0.3, 1.7 + mv.crane * 0.8 * Math.sin(TAU * u), -14], fov };
    },
  };
}
