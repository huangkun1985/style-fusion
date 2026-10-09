// 場景：3D 產品展示——無線耳機充電盒（新主體；筆記見 docs/主體v2參考/product3d.md）。
// 第二版：第一版（方塊盒＋球與膠囊拼的耳機、灰台紅環）被評「醜、建模偷懶、配色醜」。這版照參考圖逐項重建（img2threejs 流程）：
//  ‧ 盒體與盒蓋是「沿圓角矩形輪廓放樣」的連續殼體（像車床，但截面是圓角矩形）：底部大圓角、外壁、薄唇邊、內壁、內底；蓋子同理，內面有兩個橢圓凹位；
//  ‧ 正面唇邊中央的指扣凹槽、接縫下方的指示燈、盒內後方的銀色磁鐵件；
//  ‧ 耳機：蛋形頭＋頂部黑色膠囊出音孔＋斜裝的蘑菇形矽膠耳塞（車床，有外翻邊與中孔）＋沿曲線掃出的彎柄＋亮銀金屬環＋底蓋小孔＋柄側感應點；
//  ‧ 配色照參考圖的邏輯：整個畫面只有一個色相——產品是 p 的淡色、展示台是 p 的近黑深色、發光邊是 p 的亮色（背景在主體的 2D 層畫）。
// 動作照真實產品：轉盤一圈＝一個循環；轉到正面時蓋子磁吸彈開 → 指示燈亮 → 耳機沿槽拉出、轉向鏡頭懸浮 → 吸回 → 蓋子闔上。
import * as THREE from 'three';
import { darken, mix } from '../../../color';
import { LID_MAX, PRODUCT_T, budLift, lidAngle } from '../../../subjects/productTiming';
import { TAU, clamp, lerp } from '../../../util';
import { motion3d } from '../../common';
import type { BuildCtx, SceneInst } from '../../types';

const W = 3.0; // 盒寬
const D = 1.42; // 盒深
const RC = 0.6; // 俯視圓角
const HB = 1.3; // 盒體高
const HL = 0.52; // 盒蓋高
const RB = 0.46; // 盒底（正面看）圓角
const RT = 0.26; // 蓋頂圓角
const WALL = 0.085; // 殼厚
const CAV = 0.42; // 盒體內腔深
const BX = 0.64; // 耳機左右位置

/** 圓角矩形輪廓（x,z 成對），內縮 ins；每個角 K 段 */
function rrect(ins: number, K: number): number[] {
  const w = W / 2 - ins;
  const d = D / 2 - ins;
  const r = Math.max(0.04, RC - ins);
  const out: number[] = [];
  const corners: [number, number, number][] = [
    [w - r, d - r, 0],
    [-w + r, d - r, Math.PI / 2],
    [-w + r, -d + r, Math.PI],
    [w - r, -d + r, Math.PI * 1.5],
  ];
  for (const [cx, cz, a0] of corners)
    for (let k = 0; k <= K; k++) {
      const a = a0 + (k / K) * (Math.PI / 2);
      out.push(cx + Math.cos(a) * r, cz + Math.sin(a) * r);
    }
  return out;
}

/** 沿圓角矩形放樣：profile 是 [內縮, 高度] 的序列；起點／終點可封口（扇形補到中心） */
function loft(profile: [number, number][], K: number, capStart: boolean, capEnd: boolean): THREE.BufferGeometry {
  const rings = profile.map(([ins, y]) => {
    const c = rrect(ins, K);
    const ring: number[] = [];
    for (let i = 0; i < c.length; i += 2) ring.push(c[i], y, c[i + 1]);
    return ring;
  });
  const n = rings[0].length / 3;
  const pos: number[] = [];
  rings.forEach((r) => pos.push(...r));
  const idx: number[] = [];
  for (let i = 0; i < rings.length - 1; i++)
    for (let j = 0; j < n; j++) {
      const a = i * n + j;
      const b = i * n + ((j + 1) % n);
      const c = (i + 1) * n + j;
      const d = (i + 1) * n + ((j + 1) % n);
      idx.push(a, c, b, b, c, d);
    }
  if (capStart) {
    const ci = pos.length / 3;
    pos.push(0, profile[0][1], 0);
    for (let j = 0; j < n; j++) idx.push(ci, j, (j + 1) % n);
  }
  if (capEnd) {
    const ci = pos.length / 3;
    const base = (rings.length - 1) * n;
    pos.push(0, profile[profile.length - 1][1], 0);
    for (let j = 0; j < n; j++) idx.push(ci, base + ((j + 1) % n), base + j);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** 底部圓角（凸向外）：從底面 (內縮 r, y=0) 轉到外壁 (內縮 0, y=r) */
function bottomRound(r: number, steps: number): [number, number][] {
  const out: [number, number][] = [];
  for (let k = 0; k <= steps; k++) {
    const a = (k / steps) * (Math.PI / 2);
    out.push([r * (1 - Math.sin(a)), r * (1 - Math.cos(a))]);
  }
  return out;
}
/** 頂部圓角（凸向外）：從外壁 (內縮 0, y=h−r) 轉到頂面 (內縮 r, y=h) */
function topRound(r: number, h: number, steps: number): [number, number][] {
  const out: [number, number][] = [];
  for (let k = 0; k <= steps; k++) {
    const a = (k / steps) * (Math.PI / 2);
    out.push([r * (1 - Math.cos(a)), h - r + r * Math.sin(a)]);
  }
  return out;
}

export function buildProduct({ look, kit }: BuildCtx): SceneInst {
  const P = look.pal;
  const fine = !kit.coarse;
  const K = fine ? 10 : 3;
  const root = new THREE.Group();
  const stage = new THREE.Group();
  root.add(stage);

  // ── 顏色：一個色相（照參考圖的邏輯）
  const shell = mix(P.p, P.light, 0.3); // 產品：p 的淡色
  const shellIn = mix(P.p, P.light, 0.18); // 內腔、凹位：略深
  const tipC = mix(P.p, P.light, 0.42); // 矽膠耳塞：更淡
  const vent = darken(mix(P.p, P.ink, 0.85), 0.35); // 出音孔：近黑
  const metal = mix(P.light, P.ink, 0.22); // 金屬環、磁鐵件
  const pod = darken(mix(P.p, P.ink, 0.8), 0.72); // 展示台：p 的近黑深色
  const podTop = darken(mix(P.p, P.ink, 0.7), 0.6);
  const glow = mix(P.p, P.light, 0.3); // 發光邊

  const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, color: string, o: { outline?: boolean; shadow?: boolean } = {}) => {
    const m = kit.mesh(geo, color, o);
    parent.add(m);
    return m;
  };

  // ════ 展示台：上層薄圓台＋下層寬圓台，下層邊緣一圈亮光、上層邊緣一圈細光
  const seg = fine ? 96 : 16;
  const top = add(root, new THREE.CylinderGeometry(2.75, 2.8, 0.2, seg), podTop, { outline: false });
  top.position.y = -0.1;
  const low = add(root, new THREE.CylinderGeometry(3.35, 3.4, 0.42, seg), pod, { outline: false });
  low.position.y = -0.41;
  const glowMat = kit.track(new THREE.MeshBasicMaterial({ color: new THREE.Color(glow) }));
  const haloMat = kit.track(new THREE.MeshBasicMaterial({ color: new THREE.Color(P.p), transparent: true, opacity: 0.35, depthWrite: false }));
  const ringA = new THREE.Mesh(kit.track(new THREE.TorusGeometry(3.36, 0.03, 8, seg * 2)), glowMat);
  ringA.rotation.x = Math.PI / 2;
  ringA.position.y = -0.2;
  root.add(ringA);
  const ringHalo = new THREE.Mesh(kit.track(new THREE.TorusGeometry(3.36, 0.11, 8, seg * 2)), haloMat);
  ringHalo.rotation.x = Math.PI / 2;
  ringHalo.position.y = -0.2;
  root.add(ringHalo);
  const ringB = new THREE.Mesh(kit.track(new THREE.TorusGeometry(2.76, 0.012, 6, seg * 2)), glowMat);
  ringB.rotation.x = Math.PI / 2;
  ringB.position.y = 0.0;
  root.add(ringB);
  root.add(kit.shadowCatcher(7));
  // 展示台是深色布景：降低環境貼圖的反射，不然光滑材質會反射成灰色
  for (const m of [top, low])
    m.traverse((o) => {
      const mat = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (mat && 'envMapIntensity' in mat) mat.envMapIntensity = 0.12;
    });
  // 背後的紫色邊光（像參考圖的輪廓光）
  const rim = new THREE.PointLight(new THREE.Color(glow), 9, 14, 2);
  rim.position.set(0, 3.2, -3.4);
  root.add(rim);

  // ════ 盒體：底部大圓角 → 外壁 → 唇邊 → 內壁 → 內底（一個連續殼體）
  const baseProfile: [number, number][] = [
    ...bottomRound(RB, fine ? 8 : 3),
    [0, HB - 0.03],
    [0.012, HB],
    [WALL - 0.012, HB],
    [WALL, HB - 0.03],
    [WALL + 0.02, HB - CAV],
    [WALL + 0.12, HB - CAV - 0.02],
  ];
  add(stage, loft(baseProfile, K, true, true), shell);
  // 內腔的顏色：在內底上蓋一片略深的面（只有開蓋時看得到）
  const floor = add(stage, loft([[WALL + 0.14, HB - CAV - 0.015]], K, false, true), shellIn, { outline: false, shadow: false });
  // 指扣凹槽：正面唇邊中央一道淺槽（略深色的細長圓角條）
  const notch = add(stage, new THREE.CapsuleGeometry(0.03, 0.62, 4, 12), shellIn, { outline: false, shadow: false });
  notch.rotation.z = Math.PI / 2;
  notch.position.set(0, HB - 0.045, D / 2 + 0.003);
  notch.scale.set(1, 1, 0.4);
  // 磁鐵件：盒內後方中央的銀色條
  const mag = add(stage, new THREE.CapsuleGeometry(0.09, 0.34, 4, 12), metal, { outline: false });
  mag.rotation.z = Math.PI / 2;
  mag.position.set(0, HB - CAV + 0.12, -D / 2 + 0.3);
  // 指示燈
  const ledOn = new THREE.Color(mix(P.light, P.q, 0.15));
  const ledOff = new THREE.Color(darken(shell, 0.1));
  const ledMat = kit.track(new THREE.MeshBasicMaterial({ color: ledOff.clone() }));
  const led = new THREE.Mesh(kit.track(new THREE.SphereGeometry(0.035, 12, 8)), ledMat);
  led.position.set(0, HB * 0.6, D / 2 + 0.002);
  stage.add(led);

  // ════ 盒蓋：以背面上緣為鉸鏈；內頂面 → 內壁 → 唇邊 → 外壁 → 頂部圓角 → 頂面
  const hinge = new THREE.Group();
  hinge.position.set(0, HB, -D / 2 + 0.06);
  stage.add(hinge);
  const lidG = new THREE.Group();
  lidG.position.set(0, 0, D / 2 - 0.06);
  hinge.add(lidG);
  const lidProfile: [number, number][] = [
    [WALL + 0.1, HL - 0.13],
    [WALL + 0.01, HL - 0.15],
    [WALL, 0.03],
    [WALL - 0.012, 0],
    [0.012, 0],
    [0, 0.03],
    ...topRound(RT, HL, fine ? 7 : 2),
  ];
  add(lidG, loft(lidProfile, K, true, true), shell);
  // 蓋內兩個橢圓凹位（收耳機頭）：略深的橢圓面＋一圈細邊
  for (const sx of [-1, 1]) {
    const pocket = add(lidG, new THREE.SphereGeometry(1, fine ? 32 : 8, fine ? 12 : 4), shellIn, { outline: false, shadow: false });
    pocket.scale.set(0.5, 0.05, 0.4);
    pocket.position.set(sx * BX, HL - 0.15, 0.02);
  }

  // ════ 耳機（帶柄）
  const buds = [-1, 1].map((sx) => {
    const g = new THREE.Group(); // 原點＝頭的中心
    // 頭：蛋形（後上方較飽滿）
    const tipDir = new THREE.Vector3(-sx * 0.78, -0.3, 0.55).normalize();
    const headGeo = new THREE.SphereGeometry(0.4, fine ? 44 : 10, fine ? 30 : 7);
    const hp = headGeo.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < hp.count; i++) {
      v.set(hp.getX(i), hp.getY(i), hp.getZ(i));
      // 豆子形：朝耳塞方向拉長（頭與耳塞連成一體），朝下（柄）略收
      const k = v.clone().normalize().dot(tipDir);
      if (k > 0) v.addScaledVector(tipDir, 0.16 * k * k);
      v.y *= v.y > 0 ? 0.95 : 0.85;
      v.z *= 0.9;
      hp.setXYZ(i, v.x, v.y, v.z);
    }
    headGeo.computeVertexNormals();
    add(g, headGeo, shell);
    // 出音孔：頭頂外側的黑色膠囊
    const vn = new THREE.Vector3(sx * 0.4, 0.78, 0.4).normalize(); // 頭頂朝前上外側（參考圖從正面看得到）
    const ventM = add(g, new THREE.CapsuleGeometry(0.04, 0.13, 4, 10), vent, { outline: false, shadow: false });
    ventM.position.copy(vn.clone().multiplyScalar(0.375));
    ventM.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vn);
    ventM.rotateX(Math.PI / 2);
    ventM.rotateZ(0.5 * sx);
    ventM.scale.set(1, 1, 0.35);
    // 耳塞：蘑菇形矽膠（外翻邊＋中孔），斜裝在頭的內側
    const tipPts = [
      [0.1, -0.02],
      [0.12, 0.06],
      [0.16, 0.1],
      [0.215, 0.15],
      [0.235, 0.21],
      [0.225, 0.26],
      [0.18, 0.285],
      [0.11, 0.285],
      [0.085, 0.26],
      [0.08, 0.18],
    ].map(([r, h]) => new THREE.Vector2(r, h));
    const tipGeo = new THREE.LatheGeometry(tipPts, fine ? 36 : 8);
    const tipM = add(g, tipGeo, tipC);
    tipM.position.copy(tipDir.clone().multiplyScalar(0.3));
    tipM.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tipDir);
    // 耳塞中孔的深色
    const hole = add(g, new THREE.CircleGeometry(0.08, fine ? 20 : 6), vent, { outline: false, shadow: false });
    hole.position.copy(tipDir.clone().multiplyScalar(0.3 + 0.27));
    hole.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tipDir);
    // 柄：從頭的底部彎出、往下
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(sx * 0.05, -0.12, -0.05),
      new THREE.Vector3(sx * 0.07, -0.42, 0.0),
      new THREE.Vector3(sx * 0.05, -0.78, 0.04),
      new THREE.Vector3(sx * 0.02, -1.1, 0.06),
    ]);
    add(g, new THREE.TubeGeometry(curve, fine ? 24 : 6, 0.1, fine ? 18 : 6, false), shell);
    const end = curve.getPoint(1);
    const tan = curve.getTangent(1);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), tan);
    const ring = add(g, new THREE.CylinderGeometry(0.104, 0.104, 0.07, fine ? 24 : 6), metal, { outline: false });
    ring.position.copy(end).addScaledVector(tan, 0.03);
    ring.quaternion.copy(q);
    const cap = add(g, new THREE.CylinderGeometry(0.096, 0.09, 0.03, fine ? 24 : 6), shell, { outline: false, shadow: false });
    cap.position.copy(end).addScaledVector(tan, 0.08);
    cap.quaternion.copy(q);
    const mic = add(g, new THREE.SphereGeometry(0.018, 8, 6), vent, { outline: false, shadow: false });
    mic.position.copy(end).addScaledVector(tan, 0.096);
    // 柄側的感應點
    const sens = add(g, new THREE.SphereGeometry(0.022, 8, 6), shellIn, { outline: false, shadow: false });
    const sp = curve.getPoint(0.55);
    sens.position.set(sp.x - sx * 0.1, sp.y, sp.z);
    sens.scale.set(0.4, 1.2, 1);
    stage.add(g);
    return { g, sx };
  });

  return {
    root,
    base: { az: 0.0, el: 0.2, dist: 9.8, target: [0, 1.3, 0], fov: 30 },
    update(M) {
      const u = M.u;
      const m3 = motion3d(M, look);
      // 轉盤：一圈＝一個循環；u=0.5 時正面朝鏡頭
      stage.rotation.y = TAU * (u - 0.5) + m3.spinY + m3.levRotY;
      stage.position.y = m3.levY;

      const ang = lidAngle(M);
      hinge.rotation.x = -ang;
      const open = clamp(ang / LID_MAX);
      ledMat.color.copy(ledOff).lerp(ledOn, clamp(open * 1.6) * (1 - M.seg(0.76, 0.8)));
      floor.visible = open > 0.005;

      const lift = budLift(M);
      const hover = M.seg(PRODUCT_T.rise + 0.11, PRODUCT_T.back);
      for (const { g, sx } of buds) {
        // 先沿槽直直往上拉出（前 45%），之後才往外、往前移並轉向鏡頭（像參考圖那樣展示耳塞）
        const pull = clamp(lift / 0.45);
        const turn = clamp((lift - 0.35) / 0.65);
        const bob = Math.sin(TAU * hover * 1.5 + (sx > 0 ? 0.6 : 0)) * 0.06 * lift;
        g.position.set(sx * lerp(BX, 1.55, turn), HB - 0.04 + pull * 1.3 + turn * 0.25 + bob, -0.02 + turn * 0.7);
        // 收在盒裡：頭往外傾、耳塞朝中間；升起後轉向鏡頭並傾斜展示耳塞
        g.rotation.set(lerp(0.12, -0.3, turn), lerp(0, -sx * 0.85, turn), lerp(-sx * 0.22, sx * 0.55, turn) + Math.sin(TAU * hover + sx) * 0.05 * lift);
      }
    },
  };
}
