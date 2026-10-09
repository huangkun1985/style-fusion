// 3D 材質工廠：把圖像風格的「材質／填色模式」轉成 Three.js 材質，並處理描邊外殼、線框與霓虹線。
import * as THREE from 'three';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { darken, lighten, mix } from '../color';
import type { Look, Mat3D } from '../types';
import { facetColors, outlineGeometry } from './util';

export type ResolvedMat = Exclude<Mat3D, 'auto'>;

export interface Shared {
  gradient: THREE.DataTexture;
  env: THREE.Texture | null;
}

/** 材質＝auto 時，依 2D 填色模式推斷 */
export function resolveMat(look: Look): ResolvedMat {
  if (look.mat3d !== 'auto') return look.mat3d;
  switch (look.fill) {
    case 'cel':
    case 'dots':
    case 'hatch':
      return 'toon';
    case 'soft':
      return 'matte';
    case 'clay':
      return 'clay';
    case 'inflate':
    case 'gloss':
    case 'neu':
      return 'glossy';
    case 'chrome':
      return 'chrome';
    case 'iridescent':
      return 'pearl';
    case 'glass':
      return 'glass';
    case 'paper':
    case 'sticky':
      return 'paper';
    case 'silhouette':
      return 'basic';
    case 'none':
    case 'line':
      return 'wire';
    default:
      return 'flat';
  }
}

const FRESNEL_VS = `
varying vec3 vN; varying vec3 vV;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const FRESNEL_FS = `
uniform vec3 uColor; uniform float uPower; uniform float uBase; uniform float uInvert;
varying vec3 vN; varying vec3 vV;
void main(){
  float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), uPower);
  float a = mix(uBase + f * (1.0 - uBase), uBase + (1.0 - f) * (1.0 - uBase), uInvert);
  vec3 c = uColor * (0.55 + 0.9 * mix(f, 1.0 - f, uInvert));
  gl_FragColor = vec4(c * a, a);
}`;

const NO_OUTLINE: ResolvedMat[] = ['wire', 'neon', 'holo', 'xray', 'glass', 'basic'];

export class MatKit {
  readonly mat: ResolvedMat;
  readonly lowpoly: boolean;
  readonly coarse: boolean;
  readonly outline: number;
  /** 逐面著色（紙雕、低多邊形）：幾何需要先經過 prep() */
  readonly faceted: boolean;
  private tracked: { dispose(): void }[] = [];
  private lines: { m: LineMaterial; base: number }[] = [];
  private hullMat: THREE.Material | null = null;

  constructor(
    readonly look: Look,
    private shared: Shared,
  ) {
    this.mat = resolveMat(look);
    this.lowpoly = look.geo3d === 'lowpoly';
    this.coarse = this.lowpoly || this.mat === 'wire' || this.mat === 'neon';
    this.faceted = this.mat === 'paper' || (this.lowpoly && this.mat === 'flat');
    this.outline = look.stroke > 0.3 && !NO_OUTLINE.includes(this.mat) ? 0.035 + Math.min(4, look.stroke) * 0.012 : 0;
  }

  track<T extends { dispose(): void }>(o: T): T {
    this.tracked.push(o);
    return o;
  }
  dispose() {
    for (const t of this.tracked) t.dispose();
    this.tracked = [];
    this.lines = [];
  }
  /** 粗線材質需要知道畫布解析度 */
  setResolution(w: number, h: number) {
    for (const { m, base } of this.lines) {
      m.resolution.set(w, h);
      m.linewidth = base * Math.min(2.2, Math.max(0.55, h / 560));
    }
  }

  material(color: string, opts: { vertexColors?: boolean } = {}): THREE.Material {
    const sh = this.shared;
    const c = new THREE.Color(color);
    const flat = this.lowpoly;
    const env = sh.env ?? undefined;
    const vc = !!opts.vertexColors;
    let m: THREE.Material;
    switch (this.mat) {
      case 'toon':
        m = new THREE.MeshToonMaterial({ color: c, gradientMap: sh.gradient, vertexColors: vc });
        break;
      case 'matte':
        m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.82, metalness: 0, flatShading: flat, envMap: env, envMapIntensity: 0.45, vertexColors: vc });
        break;
      case 'clay':
        m = new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.92, metalness: 0, sheen: 1, sheenRoughness: 0.7, sheenColor: new THREE.Color(lighten(color, 0.25)), flatShading: flat, envMap: env, envMapIntensity: 0.5, vertexColors: vc });
        break;
      case 'glossy':
        m = new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.2, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08, flatShading: flat, envMap: env, envMapIntensity: 1.1, vertexColors: vc });
        break;
      case 'chrome':
        m = new THREE.MeshStandardMaterial({ color: new THREE.Color(mix(color, '#ffffff', 0.6)), roughness: 0.05, metalness: 1, flatShading: flat, envMap: env, envMapIntensity: 1.6, vertexColors: vc });
        break;
      case 'gold':
        m = new THREE.MeshStandardMaterial({ color: new THREE.Color(mix('#d9a521', color, 0.18)), roughness: 0.2, metalness: 1, flatShading: flat, envMap: env, envMapIntensity: 1.5, vertexColors: vc });
        break;
      case 'glass':
        m = new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.4, clearcoat: 1, clearcoatRoughness: 0.03, ior: 1.5, side: THREE.DoubleSide, depthWrite: false, flatShading: flat, envMap: env, envMapIntensity: 1.9, vertexColors: vc });
        break;
      case 'pearl':
        m = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(mix(color, '#ffffff', 0.5)), roughness: 0.16, metalness: 0.25, iridescence: 1, iridescenceIOR: 1.7, iridescenceThicknessRange: [200, 620], clearcoat: 1, flatShading: flat, envMap: env, envMapIntensity: 1.3, vertexColors: vc });
        break;
      case 'paper':
        m = new THREE.MeshLambertMaterial({ color: c, flatShading: true, vertexColors: true });
        break;
      case 'basic':
        m = new THREE.MeshBasicMaterial({ color: new THREE.Color(this.look.pal.ink) });
        break;
      case 'holo':
      case 'xray': {
        const inv = this.mat === 'xray';
        m = new THREE.ShaderMaterial({
          vertexShader: FRESNEL_VS,
          fragmentShader: FRESNEL_FS,
          uniforms: { uColor: { value: c }, uPower: { value: inv ? 1.4 : 2.2 }, uBase: { value: inv ? 0.1 : 0.14 }, uInvert: { value: inv ? 1 : 0 } },
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
        (m as THREE.ShaderMaterial).premultipliedAlpha = true;
        break;
      }
      case 'wire':
      case 'neon':
        m = new THREE.MeshBasicMaterial({
          color: new THREE.Color(this.mat === 'wire' ? this.look.pal.bg : darken(color, 0.78)),
          polygonOffset: true,
          polygonOffsetFactor: 1,
          polygonOffsetUnits: 1,
        });
        break;
      default:
        m = new THREE.MeshLambertMaterial({ color: c, flatShading: flat, vertexColors: this.faceted || vc });
    }
    return this.track(m);
  }

  /** 依材質準備幾何（逐面著色） */
  prep(geo: THREE.BufferGeometry): THREE.BufferGeometry {
    const g = this.faceted ? facetColors(geo, this.mat === 'paper' ? 0.1 : 0.06) : geo;
    return this.track(g);
  }

  private hull(): THREE.Material {
    if (!this.hullMat) this.hullMat = this.track(new THREE.MeshBasicMaterial({ color: new THREE.Color(this.look.pal.ink), side: THREE.BackSide }));
    return this.hullMat;
  }

  /** 粗線（螢幕像素寬）。positions 為成對端點；geo 為 EdgesGeometry 來源，二選一 */
  fatLines(src: THREE.BufferGeometry | number[], color: string, width: number): LineSegments2 {
    const lg = new LineSegmentsGeometry();
    if (Array.isArray(src)) lg.setPositions(src);
    else lg.fromEdgesGeometry(new THREE.EdgesGeometry(src, 10));
    const lm = new LineMaterial({ color: new THREE.Color(color), linewidth: width, worldUnits: false });
    lm.resolution.set(640, 360);
    this.lines.push({ m: lm, base: width });
    this.track(lg);
    this.track(lm);
    return new LineSegments2(lg, lm);
  }

  /** 一個完整的物件：本體 + 描邊／線條。回傳的 Group 可直接擺位與縮放 */
  mesh(geo: THREE.BufferGeometry, color: string, o: { outline?: boolean; shadow?: boolean; receive?: boolean } = {}): THREE.Group {
    const g = new THREE.Group();
    geo = this.prep(geo);
    const body = new THREE.Mesh(geo, this.material(color));
    body.castShadow = o.shadow !== false && this.mat !== 'glass' && this.mat !== 'holo' && this.mat !== 'xray';
    body.receiveShadow = o.receive !== false && this.mat !== 'wire' && this.mat !== 'neon';
    g.add(body);
    if (this.mat === 'wire') g.add(this.fatLines(geo, this.look.strokeColor === 'fill' ? color : this.look.pal.ink, 1.7));
    else if (this.mat === 'neon') g.add(this.fatLines(geo, lighten(color, 0.25), 2.6));
    else if (this.mat === 'holo') g.add(this.fatLines(geo, lighten(color, 0.2), 1.1));
    if (this.outline > 0 && o.outline !== false) {
      const hull = new THREE.Mesh(this.track(outlineGeometry(geo, this.outline)), this.hull());
      g.add(hull);
    }
    return g;
  }

  /** 地面接觸陰影（只收陰影，不畫地面） */
  shadowCatcher(size: number): THREE.Mesh {
    // 接觸陰影平面和展示台頂面在 y=0 共面，會「深度打架」（z-fighting）：相機一動，陰影就一塊一塊忽有忽無。
    // 抬高一點點並加 polygonOffset 讓它穩定地畫在上面
    const mat = new THREE.ShadowMaterial({ opacity: this.mat === 'wire' || this.mat === 'neon' ? 0 : 0.24, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const m = new THREE.Mesh(this.track(new THREE.PlaneGeometry(size, size)), this.track(mat));
    m.position.y = 0.012;
    m.rotation.x = -Math.PI / 2;
    m.receiveShadow = true;
    return m;
  }
}
