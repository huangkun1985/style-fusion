// Stage3D：Three.js 舞台。管理渲染器、鏡頭、場景快取，並把 3D 動效參數（環繞、變焦、升降…）套到鏡頭上。
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { ThreeLike } from '../env';
import type { MotionCtx } from '../motion';
import type { Look } from '../types';
import { TAU } from '../util';
import { buildRig } from './common';
import { MatKit, resolveMat, type Shared } from './materials';
import { buildCharacter } from './scenes/character';
import { buildIsland } from './scenes/island';
import { buildShapes } from './scenes/shapes';
import { buildTerrain } from './scenes/terrain';
import { buildText } from './scenes/text';
import type { BuildCtx, CamOverride, Scene3DId, SceneInst } from './types';

interface Built {
  key: string;
  inst: SceneInst;
  root: THREE.Group;
  kit: MatKit;
  last: number;
}

const BUILDERS: Record<Scene3DId, (c: BuildCtx) => SceneInst> = {
  island: buildIsland,
  shapes: buildShapes,
  text: buildText,
  character: buildCharacter,
  terrain: buildTerrain,
};

const MAX_CACHE = 26;

export class Stage3D implements ThreeLike {
  readonly canvas = document.createElement('canvas');
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private persp = new THREE.PerspectiveCamera(30, 16 / 9, 0.1, 400);
  private ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
  private shared: Shared;
  private cache = new Map<string, Built>();
  private current: Built | null = null;
  private w = 0;
  private h = 0;
  private tick = 0;
  private lost = false;

  constructor() {
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.lost = true;
    });
    const grad = new THREE.DataTexture(new Uint8Array([70, 150, 255]), 3, 1, THREE.RedFormat);
    grad.minFilter = THREE.NearestFilter;
    grad.magFilter = THREE.NearestFilter;
    grad.generateMipmaps = false;
    grad.needsUpdate = true;
    let env: THREE.Texture | null = null;
    try {
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      pmrem.dispose();
    } catch {
      env = null;
    }
    this.shared = { gradient: grad, env };
  }

  private key(look: Look, id: Scene3DId): string {
    const P = look.pal;
    return [id, resolveMat(look), look.light3d, look.geo3d, look.stroke > 0.3 ? 1 : 0, look.strokeColor === 'fill' ? 1 : 0, P.p, P.s, P.a, P.q, P.r, P.light, P.ink, P.bg, P.bg2].join('|');
  }

  private get(id: Scene3DId, look: Look, small: boolean): Built {
    const key = this.key(look, id);
    let b = this.cache.get(key);
    if (!b) {
      const kit = new MatKit(look, this.shared);
      const inst = BUILDERS[id]({ look, kit, small });
      const root = new THREE.Group();
      root.add(buildRig(look, small), inst.root);
      b = { key, inst, root, kit, last: 0 };
      this.cache.set(key, b);
      if (this.cache.size > MAX_CACHE) this.evict();
    }
    b.last = ++this.tick;
    return b;
  }

  private evict() {
    let oldest: Built | null = null;
    for (const b of this.cache.values()) if (b !== this.current && (!oldest || b.last < oldest.last)) oldest = b;
    if (!oldest) return;
    this.cache.delete(oldest.key);
    oldest.root.traverse((o) => {
      const l = o as THREE.DirectionalLight;
      if (l.isDirectionalLight) l.shadow.map?.dispose();
    });
    oldest.kit.dispose();
  }

  render(look: Look, M: MotionCtx, w: number, h: number, _time: number, id: Scene3DId): HTMLCanvasElement {
    if (this.lost) return this.canvas;
    if (w !== this.w || h !== this.h) {
      this.w = w;
      this.h = h;
      this.renderer.setSize(w, h, false);
      this.persp.aspect = w / h;
      for (const b of this.cache.values()) b.kit.setResolution(w, h);
    }
    const built = this.get(id, look, w * h < 180000);
    if (this.current !== built) {
      if (this.current) this.scene.remove(this.current.root);
      this.scene.add(built.root);
      this.current = built;
      built.kit.setResolution(w, h);
    }
    const f = built.inst.fog;
    this.scene.fog = f ? new THREE.Fog(f.color, f.near, f.far) : null;
    const ov: CamOverride = built.inst.update(M) ?? {};
    this.placeCamera(built.inst, look, M, ov);
    this.renderer.render(this.scene, look.iso > 0.5 ? this.ortho : this.persp);
    return this.canvas;
  }

  private placeCamera(inst: SceneInst, look: Look, M: MotionCtx, ov: CamOverride) {
    const mv = M.mv;
    const u = M.u;
    const b = inst.base;
    const aspect = this.w / this.h;
    let fov = ov.fov ?? b.fov;
    const target = new THREE.Vector3(...(ov.target ?? b.target));
    const pos = new THREE.Vector3();
    let dist = 1;
    if (ov.pos) {
      pos.set(...ov.pos);
      dist = pos.distanceTo(target);
    } else {
      let az = b.az + 0.16 * Math.sin(TAU * u);
      let el = b.el;
      if (mv.orbit > 0.02) az += mv.orbit > 0.6 ? TAU * u : mv.orbit * 0.9 * Math.sin(TAU * u);
      if (mv.crane > 0.02) el += mv.crane * 0.45 * Math.sin(TAU * u);
      if (look.iso > 0.5) el = 0.62;
      const fit = Math.max(1, 1.5 / aspect);
      dist = b.dist * fit;
      if (mv.dolly > 0.02) {
        // 滑動變焦：鏡頭前後移動，同時反向調整視角，讓主體大小不變、背景透視變形
        const k = 1 + 0.55 * mv.dolly * (0.5 - 0.5 * Math.cos(TAU * u));
        dist *= k;
        fov = (2 * Math.atan(Math.tan((fov * Math.PI) / 360) / k) * 180) / Math.PI;
      }
      if (mv.truck > 0.02) target.x += mv.truck * 2.2 * Math.sin(TAU * u);
      pos.set(target.x + Math.sin(az) * Math.cos(el) * dist, target.y + Math.sin(el) * dist, target.z + Math.cos(az) * Math.cos(el) * dist);
    }
    if (look.iso > 0.5) {
      const hh = dist * Math.tan((fov * Math.PI) / 360) * 0.95;
      this.ortho.left = -hh * aspect;
      this.ortho.right = hh * aspect;
      this.ortho.top = hh;
      this.ortho.bottom = -hh;
      this.ortho.position.copy(pos);
      this.ortho.lookAt(target);
      this.ortho.updateProjectionMatrix();
    } else {
      this.persp.fov = fov;
      this.persp.position.copy(pos);
      this.persp.lookAt(target);
      this.persp.updateProjectionMatrix();
    }
  }

  dispose() {
    for (const b of this.cache.values()) b.kit.dispose();
    this.cache.clear();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
