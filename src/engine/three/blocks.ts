// 方塊群（體素島、雲）：用 InstancedMesh 一次畫上百個方塊，並處理描邊與線框。
import * as THREE from 'three';
import type { MatKit } from './materials';

export interface Block {
  x: number;
  y: number;
  z: number;
}

export function blocks(kit: MatKit, list: Block[], color: string, scale = 1): THREE.Object3D {
  const out = new THREE.Group();
  if (!list.length) return out;
  const mat = kit.mat;
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
