// 方塊群（體素島、雲）：用 InstancedMesh 一次畫上百個方塊，並處理描邊與線框。
import * as THREE from 'three';
import type { MatKit } from './materials';

export interface Block {
  x: number;
  y: number;
  z: number;
}

const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
/** 把「實心方塊」清單變成查表用的集合（只收整格大小的方塊） */
export function solidSet(...lists: Block[][]): Set<string> {
  const s = new Set<string>();
  for (const l of lists) for (const b of l) s.add(key(b.x, b.y, b.z));
  return s;
}

const FACES: { n: [number, number, number]; v: [number, number, number][] }[] = [
  { n: [1, 0, 0], v: [[0.5, -0.5, 0.5], [0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5]] },
  { n: [-1, 0, 0], v: [[-0.5, -0.5, -0.5], [-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, 0.5, -0.5]] },
  { n: [0, 1, 0], v: [[-0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5], [-0.5, 0.5, -0.5]] },
  { n: [0, -1, 0], v: [[-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [-0.5, -0.5, 0.5]] },
  { n: [0, 0, 1], v: [[-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]] },
  { n: [0, 0, -1], v: [[0.5, -0.5, -0.5], [-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5]] },
];

/** 只留「露在外面」的面（相鄰格子有實心方塊的那一面不畫）：半透明材質下內部的面不會一層層疊成白霧 */
function shellGeometry(list: Block[], scale: number, solid: Set<string>): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  for (const b of list) {
    for (const f of FACES) {
      if (scale === 1 && solid.has(key(b.x + f.n[0], b.y + f.n[1], b.z + f.n[2]))) continue;
      const q = f.v.map(([x, y, z]) => [x * scale + b.x, y * scale + b.y, z * scale + b.z]);
      for (const i of [0, 1, 2, 0, 2, 3]) {
        pos.push(...q[i]);
        nor.push(...f.n);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
}

/**
 * opts.solid（選用，v2 體素島才傳）：場景裡所有實心方塊的位置。玻璃材質時改畫「只有外殼」的合併網格，
 * 不然每個方塊的六個面都畫、半透明一層層疊加，整座島會糊成一團白。其他材質與 v1 都照舊。
 */
export function blocks(kit: MatKit, list: Block[], color: string, scale = 1, opts: { solid?: Set<string> } = {}): THREE.Object3D {
  const out = new THREE.Group();
  if (!list.length) return out;
  const mat = kit.mat;
  if (mat === 'glass' && opts.solid) {
    const mesh = new THREE.Mesh(kit.track(shellGeometry(list, scale, opts.solid)), kit.material(color));
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    out.add(mesh);
    return out;
  }
  const base = kit.prep(new THREE.BoxGeometry(1, 1, 1));
  const material =
    mat === 'holo' || mat === 'xray'
      ? kit.track(new THREE.MeshLambertMaterial({ color, transparent: true, opacity: 0.26, depthWrite: false }))
      : kit.material(color);
  const inst = new THREE.InstancedMesh(base, material, list.length);
  const m4 = new THREE.Matrix4();
  list.forEach((b, i) => {
    m4.makeScale(scale, scale, scale).setPosition(b.x, b.y, b.z);
    inst.setMatrixAt(i, m4);
  });
  inst.castShadow = mat !== 'glass' && mat !== 'holo' && mat !== 'xray';
  inst.receiveShadow = mat !== 'wire' && mat !== 'neon';
  out.add(inst);

  if (kit.outline > 0) {
    const hull = new THREE.InstancedMesh(
      kit.track(new THREE.BoxGeometry(1 + kit.outline * 2, 1 + kit.outline * 2, 1 + kit.outline * 2)),
      kit.track(new THREE.MeshBasicMaterial({ color: kit.look.pal.ink, side: THREE.BackSide })),
      list.length,
    );
    list.forEach((b, i) => {
      m4.makeScale(scale, scale, scale).setPosition(b.x, b.y, b.z);
      hull.setMatrixAt(i, m4);
    });
    out.add(hull);
  }

  if (mat === 'wire' || mat === 'neon' || mat === 'holo' || mat === 'xray') {
    const ep = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)).attributes.position;
    const pos: number[] = [];
    for (const b of list) for (let i = 0; i < ep.count; i++) pos.push(ep.getX(i) * scale + b.x, ep.getY(i) * scale + b.y, ep.getZ(i) * scale + b.z);
    out.add(kit.fatLines(pos, mat === 'wire' ? kit.look.pal.ink : color, mat === 'neon' ? 2.4 : 1.4));
  }
  return out;
}
