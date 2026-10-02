// 3D 工具：輪廓外殼、逐面著色、幾何工廠、自訂字形（M O T I N）。
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { hash } from '../util';

/** 沿平滑法線外推的輪廓幾何（反向渲染成描邊）；對方塊、字形、球體都適用 */
export function outlineGeometry(geo: THREE.BufferGeometry, width: number): THREE.BufferGeometry {
  let g = geo.clone();
  for (const name of Object.keys(g.attributes)) if (name !== 'position') g.deleteAttribute(name);
  g.clearGroups();
  g = mergeVertices(g, 1e-3);
  g.computeVertexNormals();
  const p = g.attributes.position;
  const n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) + n.getX(i) * width, p.getY(i) + n.getY(i) * width, p.getZ(i) + n.getZ(i) * width);
  p.needsUpdate = true;
  return g;
}

/** 轉成非索引幾何，並給每個三角面一個細微的亮度差（紙雕、低多邊形的切面感） */
export function facetColors(geo: THREE.BufferGeometry, amount = 0.1, seed = 1): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let t = 0; t < n / 3; t++) {
    const k = 1 + (hash(t, seed, 9) - 0.5) * 2 * amount;
    for (let v = 0; v < 3; v++) {
      const i = (t * 3 + v) * 3;
      col[i] = col[i + 1] = col[i + 2] = k;
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

export interface GeoFactory {
  sphere(r: number): THREE.BufferGeometry;
  box(w: number, h?: number, d?: number): THREE.BufferGeometry;
  torus(R: number, r: number): THREE.BufferGeometry;
  knot(r: number, tube: number): THREE.BufferGeometry;
  cone(r: number, h: number): THREE.BufferGeometry;
  capsule(r: number, len: number): THREE.BufferGeometry;
  cylinder(r: number, h: number): THREE.BufferGeometry;
  ico(r: number): THREE.BufferGeometry;
  octa(r: number): THREE.BufferGeometry;
}

/** coarse＝低多邊形或線框時用較少的分段 */
export function geoFactory(coarse: boolean): GeoFactory {
  return {
    sphere: (r) => (coarse ? new THREE.IcosahedronGeometry(r, 1) : new THREE.SphereGeometry(r, 40, 28)),
    box: (w, h = w, d = w) => (coarse ? new THREE.BoxGeometry(w, h, d) : new RoundedBoxGeometry(w, h, d, 5, Math.min(w, h, d) * 0.12)),
    torus: (R, r) => new THREE.TorusGeometry(R, r, coarse ? 6 : 24, coarse ? 14 : 72),
    knot: (r, tube) => new THREE.TorusKnotGeometry(r, tube, coarse ? 48 : 160, coarse ? 5 : 16, 2, 3),
    cone: (r, h) => new THREE.ConeGeometry(r, h, coarse ? 6 : 40, 1),
    capsule: (r, len) => new THREE.CapsuleGeometry(r, len, coarse ? 2 : 8, coarse ? 8 : 24),
    cylinder: (r, h) => new THREE.CylinderGeometry(r, r, h, coarse ? 8 : 32, 1),
    ico: (r) => new THREE.IcosahedronGeometry(r, 0),
    octa: (r) => new THREE.OctahedronGeometry(r, 0),
  };
}

// ---------- 自訂粗體無襯線字形（單位高度 1） ----------
interface Glyph {
  w: number;
  build(): THREE.Shape;
}
const poly = (pts: number[][]) => {
  const s = new THREE.Shape();
  pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  s.closePath();
  return s;
};
const ellipseRing = (rx: number, ry: number, ix: number, iy: number, seg: number) => {
  const s = new THREE.Shape();
  s.absellipse(rx, 0.5, rx, ry, 0, Math.PI * 2, false, 0);
  const h = new THREE.Path();
  h.absellipse(rx, 0.5, ix, iy, 0, Math.PI * 2, true, 0);
  s.holes.push(h);
  void seg;
  return s;
};

export const GLYPHS: Record<string, Glyph> = {
  M: {
    w: 1.1,
    build: () =>
      poly([
        [0, 0],
        [0.25, 0],
        [0.25, 0.58],
        [0.55, 0.06],
        [0.85, 0.58],
        [0.85, 0],
        [1.1, 0],
        [1.1, 1],
        [0.86, 1],
        [0.55, 0.46],
        [0.24, 1],
        [0, 1],
      ]),
  },
  O: { w: 1, build: () => ellipseRing(0.5, 0.5, 0.25, 0.27, 48) },
  T: {
    w: 0.95,
    build: () =>
      poly([
        [0.35, 0],
        [0.6, 0],
        [0.6, 0.78],
        [0.95, 0.78],
        [0.95, 1],
        [0, 1],
        [0, 0.78],
        [0.35, 0.78],
      ]),
  },
  I: {
    w: 0.27,
    build: () =>
      poly([
        [0, 0],
        [0.27, 0],
        [0.27, 1],
        [0, 1],
      ]),
  },
  N: {
    w: 1,
    build: () =>
      poly([
        [0, 0],
        [0.25, 0],
        [0.25, 0.55],
        [0.75, 0],
        [1, 0],
        [1, 1],
        [0.75, 1],
        [0.75, 0.45],
        [0.25, 1],
        [0, 1],
      ]),
  },
};

export function glyphGeometry(ch: string, depth: number, bevel: boolean, coarse: boolean): THREE.BufferGeometry {
  const g = GLYPHS[ch] ?? GLYPHS.I;
  const geo = new THREE.ExtrudeGeometry(g.build(), {
    depth,
    bevelEnabled: bevel,
    bevelThickness: 0.05,
    bevelSize: 0.035,
    bevelSegments: coarse ? 1 : 4,
    curveSegments: coarse ? 8 : 28,
  });
  geo.translate(-g.w / 2, -0.5, -depth / 2);
  return geo;
}
