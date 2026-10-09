// 場景 v2：3D 角色（第三版；筆記見 docs/主體v2參考/char3d.md）。
// 第二版照「toto」做成單一色相的雕刻公仔，被評「像尖耳朵的熊、沒有審美」——把角色的身分（2D 狐貓的雙色臉）丟掉了。
// 這版的參考圖就是使用者已認可的 2D 狐貓（subjects/v2/mascot.ts），逐項做成立體：
//  ‧ 寬大的圓角矩形頭（約身高一半）；紅色頭罩、額頭中央往下的尖角缺口；奶油色的臉從眼睛上方一路到下巴與兩頰（頂點著色，邊界乾淨）；
//  ‧ 兩頰下側的鋸齒毛；大三角耳（圓角、外傾、耳內粉色）；圓亮的大眼＋兩顆高光、小鼻子、「w」嘴、腮紅；
//  ‧ 小身體＋奶油色肚子、奶油色的爪與腳；紅色大尾巴＋奶油色尾尖；頭芽（身分標記）；
//  ‧ 跳起時「^ ^」笑眼、張嘴吐舌、雙手舉起；跳躍姿態沿用 2D 版（預備、拉伸、落地擠壓、跟隨、眨眼），只在展示台上跳。
import * as THREE from 'three';
import { mix } from '../../../color';
import { mascotPose } from '../../../subjects/mascot';
import { bump, clamp, fract, smooth, TAU } from '../../../util';
import { motion3d } from '../../common';
import type { BuildCtx, SceneInst } from '../../types';
import { geoFactory } from '../../util';

const HX = 1.36; // 頭的半寬
const HY = 1.0;
const HZ = 1.02;

/** 頭表面：方向 n（單位向量）→ 表面上的點。圓角矩形（超橢球）＋口鼻微凸＋兩頰下側的鋸齒毛 */
function headSurf(n: THREE.Vector3, out = new THREE.Vector3()): THREE.Vector3 {
  const k = 2.7;
  const r = Math.pow(Math.pow(Math.abs(n.x), k) + Math.pow(Math.abs(n.y), k) + Math.pow(Math.abs(n.z), k), -1 / k);
  out.set(n.x * r * HX, n.y * r * HY, n.z * r * HZ);
  // 口鼻微凸
  const mz = Math.exp(-((n.x / 0.32) ** 2 + ((n.y + 0.22) / 0.26) ** 2)) * Math.max(0, n.z);
  out.z += 0.1 * mz;
  // 兩頰下側的鋸齒毛（三個齒，往外下方）
  const side = smooth(0.62, 0.88, Math.abs(n.x)) * smooth(-0.6, -0.1, n.z);
  const t = -n.y / 0.62;
  if (side > 0 && t > 0 && t < 1) {
    const s = fract(t * 3);
    const tooth = Math.pow(1 - s, 1.6) * Math.sin(Math.PI * t);
    out.x += Math.sign(n.x) * 0.15 * side * tooth;
    out.y -= 0.06 * side * tooth;
  }
  return out;
}
/** 頭上的奶油色臉（0..1）：方向 n */
function faceMask(n: THREE.Vector3): number {
  const ax = Math.abs(n.x);
  // 頭罩的下緣：兩個眼周往上圓起、中央往下的尖角缺口、兩側往下收到眼睛高度
  let h = 0.1 + 0.27 * Math.exp(-(((ax - 0.42) / 0.2) ** 2));
  h -= 0.4 * smooth(0.74, 0.96, ax);
  const front = smooth(-0.45, -0.12, n.z);
  return smooth(-0.012, 0.012, h - n.y) * front;
}

export function buildCharacter2({ look, kit }: BuildCtx): SceneInst {
  const P = look.pal;
  const G = geoFactory(kit.coarse);
  const fine = !kit.coarse;
  const root = new THREE.Group();

  // ── 顏色（與 2D 版同一套對應）
  const red = P.p;
  const cream = mix(P.light, P.p, 0.06);
  const pink = mix(P.p, P.light, 0.5);
  const ink = P.ink;
  const tongueC = mix(mix(P.p, P.a, 0.4), P.light, 0.35);
  const leaf = P.s;

  // ── 展示台：中性、低矮
  const pad = kit.mesh(G.cylinder(2.7, 0.26), mix(P.light, P.ink, 0.1), { outline: false });
  pad.position.y = -0.13;
  root.add(pad);
  root.add(kit.shadowCatcher(12));

  const hero = new THREE.Group();
  root.add(hero);
  const squash = new THREE.Group();
  hero.add(squash);
  const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, color: string, o: { outline?: boolean; shadow?: boolean } = {}) => {
    const m = kit.mesh(geo, color, o);
    parent.add(m);
    return m;
  };
  const ell = (rx: number, ry: number, rz: number) => {
    const g = G.sphere(1);
    g.scale(rx, ry, rz);
    return g;
  };
  /** 雙色物件：以白色建立，再用頂點著色畫出兩個顏色（低多邊形／紙雕的逐面明暗會乘上去） */
  const VC_OK = !['basic', 'wire', 'neon', 'holo', 'xray'].includes(kit.mat);
  const twoTone = (parent: THREE.Object3D, geo: THREE.BufferGeometry, a: string, b: string, maskAt: (x: number, y: number, z: number) => number, o: { outline?: boolean } = {}) => {
    if (!VC_OK) return add(parent, geo, a, o);
    const grp = add(parent, geo, '#ffffff', o);
    const body = grp.children[0] as THREE.Mesh;
    const g = body.geometry;
    const pos = g.attributes.position;
    const old = g.getAttribute('color') as THREE.BufferAttribute | undefined;
    const ca = new THREE.Color(a);
    const cb = new THREE.Color(b);
    const c = new THREE.Color();
    const arr = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      c.copy(ca).lerp(cb, clamp(maskAt(pos.getX(i), pos.getY(i), pos.getZ(i))));
      const k = old ? old.getX(i) : 1;
      arr[i * 3] = c.r * k;
      arr[i * 3 + 1] = c.g * k;
      arr[i * 3 + 2] = c.b * k;
    }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    const mat = body.material as THREE.MeshStandardMaterial & { sheenColor?: THREE.Color };
    mat.vertexColors = true;
    if (mat.sheenColor) mat.sheenColor.set(mix(a, P.light, 0.3));
    mat.needsUpdate = true;
    return grp;
  };
  const dir = new THREE.Vector3();

  // ════ 腳（不參與擠壓）：奶油色橢圓
  const feet = [-1, 1].map((s) => {
    const f = add(hero, ell(0.3, 0.17, 0.38), cream);
    f.position.set(s * 0.36, 0.15, 0.14);
    return f;
  });

  // ════ 身體：紅色小蛋形＋奶油色肚子
  const bodyGeo = new THREE.SphereGeometry(1, fine ? 48 : 12, fine ? 36 : 9);
  bodyGeo.scale(0.72, 0.66, 0.62);
  const torso = twoTone(squash, bodyGeo, red, cream, (x, y, z) => {
    const e = (x / 0.42) ** 2 + ((y + 0.1) / 0.52) ** 2;
    return smooth(1.05, 0.95, e) * smooth(0.05, 0.2, z);
  });
  torso.position.y = 0.7;

  // ════ 尾巴：紅色大尾巴（越往尾端越粗）＋奶油色尾尖，從身後往一側捲上來
  const tail = new THREE.Group();
  tail.position.set(0.25, 0.55, -0.42);
  squash.add(tail);
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.45, 0.1, -0.25),
    new THREE.Vector3(0.85, 0.55, -0.2),
    new THREE.Vector3(0.9, 1.1, -0.05),
  ]);
  const TUB = fine ? 40 : 10;
  const RAD = fine ? 18 : 6;
  const tailGeo = new THREE.TubeGeometry(curve, TUB, 0.2, RAD, false);
  {
    const pos = tailGeo.attributes.position;
    for (let i = 0; i <= TUB; i++) {
      const t = i / TUB;
      const c = curve.getPoint(t);
      const k = 0.55 + 1.15 * Math.sin(Math.PI * Math.min(1, t * 0.8 + 0.1)) + 0.3 * t;
      for (let j = 0; j <= RAD; j++) {
        const idx = i * (RAD + 1) + j;
        pos.setXYZ(idx, c.x + (pos.getX(idx) - c.x) * k, c.y + (pos.getY(idx) - c.y) * k, c.z + (pos.getZ(idx) - c.z) * k);
      }
    }
    tailGeo.computeVertexNormals();
  }
  const tipStart = curve.getPoint(0.72);
  twoTone(tail, tailGeo, red, cream, (x, y) => smooth(tipStart.y - 0.05, tipStart.y + 0.08, y) * smooth(0.5, 0.7, x), { outline: true });
  const tipCap = add(tail, ell(0.3, 0.3, 0.3), cream);
  tipCap.position.copy(curve.getPoint(1));

  // ════ 手臂：紅色短臂＋奶油色圓爪。用「爪子的目標位置」驅動（肩膀指向爪子、手臂長度跟著變）：
  // 頭很寬大，手臂不能往上舉（會舉進臉頰裡）；跳起時爪子張到兩側前方、臉頰下緣的外面（和 2D 版一樣）
  const PAW_REST = new THREE.Vector3(0.3, 0.56, 0.6); // 站著：爪子在肚子前
  const PAW_UP = new THREE.Vector3(1.24, 0.8, 0.72); // 跳起：兩側前方、臉頰下緣外
  const arms = [-1, 1].map((s) => {
    const sh = new THREE.Group();
    sh.position.set(s * 0.56, 1.02, 0.12);
    const arm = add(sh, G.capsule(0.13, 0.24), red, { outline: false });
    const paw = add(sh, ell(0.2, 0.18, 0.2), cream);
    squash.add(sh);
    return { sh, arm, paw, s };
  });
  const tmpV = new THREE.Vector3();
  const DOWN = new THREE.Vector3(0, -1, 0);

  // ════ 頭
  const head = new THREE.Group();
  head.position.y = 1.86;
  squash.add(head);
  const headGeo = new THREE.SphereGeometry(1, fine ? 140 : 14, fine ? 104 : 10);
  {
    const pos = headGeo.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      dir.set(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize();
      headSurf(dir, v);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    headGeo.computeVertexNormals();
  }
  twoTone(head, headGeo, red, cream, (x, y, z) => faceMask(dir.set(x / HX, y / HY, z / HZ).normalize()));
  /** 頭表面上的點（略往外 off）與該處的法線方向 */
  const onHead = (nx: number, ny: number, off = 0) => {
    const n = new THREE.Vector3(nx, ny, Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny))).normalize();
    const p = headSurf(n);
    return { p: p.addScaledVector(n, off), n };
  };
  const faceTo = (o: THREE.Object3D, n: THREE.Vector3) => o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);

  // 耳朵：圓角三角形擠出（外紅、內粉），外傾
  const earShape = (w: number, h: number) => {
    const s = new THREE.Shape();
    s.moveTo(-w / 2, 0);
    s.quadraticCurveTo(-w * 0.32, h * 0.55, -w * 0.08, h * 0.95);
    s.quadraticCurveTo(0, h * 1.04, w * 0.08, h * 0.95);
    s.quadraticCurveTo(w * 0.32, h * 0.55, w / 2, 0);
    s.quadraticCurveTo(0, -h * 0.08, -w / 2, 0);
    return s;
  };
  const ears = [-1, 1].map((s) => {
    const g = new THREE.Group();
    g.position.set(s * 0.78, 0.62, -0.08);
    g.rotation.set(-0.12, 0, -s * 0.36);
    const og = new THREE.ExtrudeGeometry(earShape(1.0, 1.15), { depth: 0.16, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.06, bevelSegments: fine ? 4 : 1, curveSegments: fine ? 16 : 4 });
    og.translate(0, 0, -0.08);
    add(g, og, red);
    const ig = new THREE.ExtrudeGeometry(earShape(0.56, 0.78), { depth: 0.04, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2, curveSegments: fine ? 14 : 4 });
    const inner = add(g, ig, pink, { outline: false, shadow: false });
    inner.position.set(0, 0.12, 0.13);
    head.add(g);
    return { g, s };
  });

  // 眼睛：圓亮的大眼＋大小兩顆高光；跳起時換成「^」笑眼
  const eyes = [-1, 1].map((s) => {
    const { p, n } = onHead(s * 0.37, 0.05, -0.045);
    const g = new THREE.Group();
    g.position.copy(p);
    faceTo(g, n);
    const ball = add(g, ell(0.2, 0.25, 0.11), ink, { outline: false });
    const h1 = add(g, G.sphere(0.055), P.light, { outline: false, shadow: false });
    h1.position.set(0.06, 0.1, 0.09);
    const h2 = add(g, G.sphere(0.025), P.light, { outline: false, shadow: false });
    h2.position.set(-0.06, -0.07, 0.08);
    const happy = add(g, new THREE.TorusGeometry(0.13, 0.03, 8, 20, Math.PI), ink, { outline: false, shadow: false });
    happy.position.set(0, -0.04, 0.06);
    head.add(g);
    return { g, open: [ball, h1, h2], happy };
  });
  // 鼻子：小而深的圓角三角
  {
    const { p, n } = onHead(0, -0.12, -0.02);
    const nose = add(head, ell(0.1, 0.065, 0.07), ink, { outline: false });
    nose.position.copy(p);
    faceTo(nose, n);
  }
  // 嘴：閉嘴是「w」（兩個小弧）；張嘴是深色半橢圓＋舌頭
  const mouthPos = onHead(0, -0.3, -0.01);
  const wMouth = new THREE.Group();
  wMouth.position.copy(mouthPos.p);
  faceTo(wMouth, mouthPos.n);
  head.add(wMouth);
  [-1, 1].forEach((s) => {
    const arc = add(wMouth, new THREE.TorusGeometry(0.075, 0.022, 6, 14, Math.PI), ink, { outline: false, shadow: false });
    arc.rotation.z = Math.PI;
    arc.position.set(s * 0.075, 0.03, 0.01);
  });
  const openMouth = new THREE.Group();
  openMouth.position.copy(onHead(0, -0.3, -0.01).p);
  faceTo(openMouth, mouthPos.n);
  head.add(openMouth);
  // 笑嘴：上緣平（兩端微翹）、下緣圓
  const smileShape = new THREE.Shape();
  smileShape.moveTo(-0.26, 0.03);
  smileShape.quadraticCurveTo(0, -0.01, 0.26, 0.03);
  smileShape.bezierCurveTo(0.24, -0.2, -0.24, -0.2, -0.26, 0.03);
  const mouthIn = add(openMouth, new THREE.ExtrudeGeometry(smileShape, { depth: 0.05, bevelEnabled: false, curveSegments: fine ? 18 : 6 }), ink, { outline: false, shadow: false });
  mouthIn.position.z = -0.02;
  const tongueShape = new THREE.Shape();
  tongueShape.absellipse(0, -0.11, 0.12, 0.06, 0, Math.PI * 2, false, 0);
  const tongue = add(openMouth, new THREE.ExtrudeGeometry(tongueShape, { depth: 0.02, bevelEnabled: false, curveSegments: fine ? 18 : 6 }), tongueC, { outline: false, shadow: false });
  tongue.position.z = 0.035;
  // 腮紅
  [-1, 1].forEach((s) => {
    const { p, n } = onHead(s * 0.66, -0.1, -0.035);
    const c = add(head, ell(0.15, 0.09, 0.05), pink, { outline: false, shadow: false });
    c.position.copy(p);
    faceTo(c, n);
  });
  // 頭芽
  const sprout = new THREE.Group();
  sprout.position.copy(onHead(0.02, 0.97, -0.05).p);
  head.add(sprout);
  const stem = add(sprout, G.cylinder(0.035, 0.34), leaf, { outline: false });
  stem.position.y = 0.17;
  [-1, 1].forEach((s) => {
    const l = add(sprout, ell(0.19, 0.11, 0.07), leaf);
    l.position.set(s * 0.17, 0.4, 0);
    l.rotation.z = s * 0.45;
  });

  // ════ 落地的塵土（淡淡的小雲，只在台面上）
  const puffs = Array.from({ length: 6 }, (_, i) => {
    const m = kit.mesh(G.sphere(0.18), mix(P.light, P.ink, 0.05), { outline: false, shadow: false });
    m.visible = false;
    root.add(m);
    return { m, a: (i / 6) * TAU + 0.3 };
  });

  const HXJ = 0.62; // 跳躍的水平幅度（只在展示台上）
  return {
    root,
    base: { az: 0, el: 0.14, dist: 12.8, target: [0, 2.25, 0], fov: 30 },
    update(M) {
      const mv = M.mv;
      const u = M.u;
      const m3 = motion3d(M, look);
      const s = mascotPose(M, u);
      const lag = 0.03 + 0.05 * mv.follow;
      const s2 = mascotPose(M, fract(u - lag + 1));
      const j = M.jit(1);

      hero.position.set((s.x / 56) * HXJ + j.x * 0.03, (Math.max(0, s.y) / 56) * 0.6 + M.fl(1, 0.25) + j.y * 0.03, 0);
      hero.rotation.set(m3.tumble, (s.face > 0 ? 0.32 : -0.32) + m3.spinY, -s.lean * 0.8 + j.r);
      const sy = s.sy;
      squash.scale.set(1 / Math.sqrt(sy), sy, 1 / Math.sqrt(sy));

      // 跟隨：頭、耳、頭芽、尾巴慢半拍
      let th = (s2.x - s.x) * 0.012 * mv.follow - s.lean * 0.9 * mv.follow;
      th += s.land * 0.5 * mv.follow * Math.sin(s.land * 9);
      th += mv.wind * 0.3 * Math.sin(TAU * u * 3) + mv.float * 0.08 * Math.sin(TAU * u * 2);
      sprout.rotation.z = -th * 0.9;
      head.rotation.z = -th * 0.2;
      head.rotation.x = -0.06 * s2.air + 0.05 * s.land;
      tail.rotation.set(0.2 * s2.air - 0.12 * s.land, Math.sin(TAU * u * 4) * 0.2 * mv.follow, -0.15 * s2.air);
      ears.forEach((e) => (e.g.rotation.z = -e.s * (0.36 + 0.14 * s2.air) + th * 0.7 * e.s));

      // 表情：地面上睜眼（會眨）、閉嘴「w」；空中「^ ^」笑眼、張嘴吐舌
      const joy = clamp(s.air * 1.6 + s.land * 0.5);
      const happy = joy > 0.35;
      const blink = Math.max(bump(0.01, 0.055, u), bump(0.49, 0.535, u));
      eyes.forEach((e) => {
        e.open.forEach((o) => (o.visible = !happy));
        e.happy.visible = happy;
        e.g.scale.y = happy ? 1 : 1 - 0.9 * blink;
      });
      wMouth.visible = !happy;
      openMouth.visible = happy;
      openMouth.scale.setScalar(0.8 + 0.3 * joy * (1 + mv.exag * 0.4));
      // 手：地面上爪子放在肚子前；空中往兩側上方舉起
      const up = clamp(s.air * 1.2 + s2.air * 0.4);
      arms.forEach((a) => {
        tmpV.copy(PAW_REST).lerp(PAW_UP, up);
        tmpV.x *= a.s;
        tmpV.sub(a.sh.position); // 肩膀 → 爪子
        const len = Math.max(0.3, tmpV.length());
        a.sh.quaternion.setFromUnitVectors(DOWN, tmpV.normalize());
        a.arm.position.y = -len / 2;
        a.arm.scale.set(1, len / 0.5, 1);
        a.paw.position.y = -len;
      });
      feet.forEach((f) => (f.position.y = 0.15 + 0.08 * s2.air));

      // 塵土：落地後約 0.18 圈內向外擴散、變淡
      const landAt = HOP_LAND.map((l) => fract(u - l + 1));
      const t = landAt.find((d) => d < 0.18);
      const li = landAt.findIndex((d) => d < 0.18);
      puffs.forEach((p, i) => {
        if (t === undefined) {
          p.m.visible = false;
          return;
        }
        const k = t / 0.18;
        p.m.visible = true;
        p.m.position.set(HOP_X[li] * HXJ + Math.cos(p.a) * (0.5 + k * 1.0), 0.12 + k * 0.25, Math.sin(p.a) * (0.4 + k * 0.7));
        p.m.scale.setScalar(Math.max(0.001, (1 - k) * (0.6 + 0.3 * Math.sin(i * 1.7))));
      });
      root.position.y = m3.levY;
    },
  };
}

const HOP_LAND = [0.06 + 0.72 * (0.48 - 0.06), 0.54 + 0.72 * (0.96 - 0.54)];
const HOP_X = [70 / 56, -70 / 56];
