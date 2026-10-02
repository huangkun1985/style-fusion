// 3D 鏡頭與物件動效：只有真 3D 主體（3D 幾何、3D 角色、3D 文字、3D 地形、3D 體素）會用到這些參數。
import type { MotionStyle } from './schema';

const M = (s: MotionStyle) => s;

export const MOTION_3D: MotionStyle[] = [
  M({
    id: 'orbit-cam',
    name: '環繞運鏡',
    en: 'Orbit Camera',
    cat: 'cam3d',
    desc: '攝影機繞著主體轉一整圈，讓每個角度都被看見，是展示 3D 物件的標準運鏡。',
    tips: ['一圈剛好等於一個循環才能無縫', '仰角固定在 15–25°', '速度均勻，用線性或正弦'],
    kw: '360 degree orbiting camera around subject, turntable camera move, smooth circular dolly',
    dur: '6–10s 一圈',
    demo: 'shapes3d',
    pairs: ['clay3d', 'glass3d', 'matte3d', 'pearl3d', 'holo3d'],
    ae: `// 攝影機繞 Null 旋轉：把攝影機設為 Null 的子圖層，Null 的 Y Rotation：
loopTime = 8;
linear(time % loopTime, 0, loopTime, 0, 360)`,
    move: { orbit: 1, ease: 'sine', float: 0.15 },
  }),
  M({
    id: 'turntable',
    name: '轉盤旋轉',
    en: 'Turntable Spin',
    cat: 'cam3d',
    desc: '物件放在轉盤上勻速旋轉、鏡頭不動，產品展示與角色轉面圖都用它。',
    tips: ['勻速、無緩動', '旋轉軸固定在物件中心', '整圈剛好一個循環'],
    kw: 'product turntable rotation, constant speed spin, 360 degree rotating object on a pedestal',
    dur: '4–8s 一圈',
    demo: 'shapes3d',
    pairs: ['gold3d', 'wire3d', 'blueprint3d', 'xray3d'],
    ae: `// 圖層 Y Rotation 勻速自轉
loopTime = 6;
linear(time % loopTime, 0, loopTime, 0, 360)`,
    move: { spin: 1, ease: 'linear' },
  }),
  M({
    id: 'dolly-zoom',
    name: '滑動變焦',
    en: 'Dolly Zoom (Vertigo)',
    cat: 'cam3d',
    desc: '鏡頭前後移動的同時反向變焦：主體大小不變，背景卻被拉伸或壓縮，製造暈眩感。',
    tips: ['主體大小要保持不變', '距離變化 30–60%', '搭配緩慢的呼吸節奏'],
    kw: 'dolly zoom vertigo effect, contra zoom, background perspective distortion, Hitchcock',
    dur: '2–4s 來回',
    demo: 'text3d',
    pairs: ['glass3d', 'gold3d', 'matte3d'],
    ae: `// 攝影機 Position Z 與 Zoom 反向連動（保持主體大小）
d = ease(Math.sin(time * 1.6) * 0.5 + 0.5, 0, 1, 1000, 1700);
[value[0], value[1], -d]
// Zoom 欄位表達式：
d * 1.0  // 讓 Zoom 與距離成正比`,
    move: { dolly: 1, ease: 'sine' },
  }),
  M({
    id: 'flythrough',
    name: '穿梭飛行',
    en: 'Fly-through',
    cat: 'cam3d',
    desc: '鏡頭貼著地面向前飛，景物迎面退後，帶左右漂移與高低起伏。',
    tips: ['前進速度穩定', '加一點左右搖擺', '地形要週期重複才能無縫'],
    kw: 'forward fly-through camera over terrain, low altitude flight, endless runner perspective, outrun driving',
    dur: '8–12s 循環',
    demo: 'terrain3d',
    pairs: ['synthwave3d', 'lowpoly3d', 'neon3d'],
    ae: `// 攝影機沿 Z 軸勻速前進（單位：像素／秒）
speed = 600;
[value[0] + Math.sin(time * 0.8) * 120, value[1] + Math.sin(time * 1.6) * 24, value[2] + time * speed]`,
    move: { fly: 1, truck: 0.35, crane: 0.25, ease: 'sine' },
  }),
  M({
    id: 'crane-shot',
    name: '升降搖臂',
    en: 'Crane Shot',
    cat: 'cam3d',
    desc: '鏡頭沿著弧線緩緩升起或降下，從低角度的英雄視角升到俯瞰全景。',
    tips: ['弧線運動，不要直上直下', '起點低、終點高', '配合慢速緩入緩出'],
    kw: 'crane camera move rising from low angle to high angle, cinematic jib shot, hero reveal',
    dur: '4–8s',
    demo: 'text3d',
    pairs: ['gold3d', 'lowpoly3d', 'synthwave3d'],
    ae: `// 攝影機沿弧線升降：Y 與 Z 同步
t = Math.sin(time * 0.8) * 0.5 + 0.5;
[value[0], value[1] - t * 500, value[2] + t * 200]`,
    move: { crane: 1, orbit: 0.25, ease: 'quint' },
  }),
  M({
    id: 'tumble',
    name: '物理翻滾',
    en: 'Tumble',
    cat: 'cam3d',
    desc: '物件像被丟出去一樣在空中翻滾，每個物件轉速不同，落地帶沉重感。',
    tips: ['各物件轉速錯開', '旋轉軸別全部一致', '落地要有擠壓與停頓'],
    kw: 'objects tumbling in the air, physics-based rotation, rigid body tumble, dice roll, heavy landing',
    dur: '2–3s',
    demo: 'shapes3d',
    pairs: ['plastic3d', 'paper3d', 'clay3d'],
    ae: `// 圖層三軸旋轉，轉速各異
[time * 180, time * 270, time * 120]`,
    move: { tumble: 1, ease: 'bounce', squash: 0.4, heavy: 0.3, parts: { dust: 0.5 } },
  }),
  M({
    id: 'explode-view',
    name: '爆炸拆解',
    en: 'Exploded View',
    cat: 'cam3d',
    desc: '零件沿各自方向散開，停一下，再收回組裝好——工業設計與產品拆解圖的語言。',
    tips: ['散開的距離與停留時間要足夠看清', '收回時錯峰', '各零件沿放射方向移動'],
    kw: 'exploded view animation, parts separating and reassembling, product teardown, assembly animation',
    dur: '3–5s',
    demo: 'text3d',
    pairs: ['paper3d', 'wire3d', 'blueprint3d', 'holo3d'],
    ae: `// 各零件位置 = 原位置 + 方向 × 散開量
spread = Math.sin(time * 1.2) * 0.5 + 0.5;
value + thisComp.layer("Center").transform.position.sub(value) * -spread * 2`,
    move: { explode: 1, ease: 'expo', stagger: 0.6 },
  }),
  M({
    id: 'flip3d',
    name: '卡片翻轉',
    en: '3D Flip',
    cat: 'cam3d',
    desc: '物件繞水平軸翻轉一圈，逐個錯峰，帶一點回彈。',
    tips: ['翻轉時加透視', '錯峰 3–5 幀', '結尾回彈'],
    kw: '3D flip animation, letters flipping around horizontal axis, staggered card flip, split-flap',
    dur: '0.6–1s 每個',
    demo: 'text3d',
    pairs: ['chrome', 'gold3d', 'plastic3d'],
    ae: `// X Rotation 翻轉 360°（需開啟 3D 圖層）
t = Math.max(0, time - inPoint - (index - 1) * 0.06);
ease(t, 0, 0.8, 0, 360)`,
    move: { flip: 1, ease: 'back', over: 0.5, stagger: 0.7 },
  }),
  M({
    id: 'levitate',
    name: '懸浮旋轉',
    en: 'Levitate & Rotate',
    cat: 'cam3d',
    desc: '整組物件輕輕懸浮上下、緩慢自轉，像漂在失重空間裡的展品。',
    tips: ['上下與旋轉頻率錯開', '幅度小、速度慢', '底下留一個淡淡的陰影'],
    kw: 'levitating object slowly rotating, floating product, zero gravity display, gentle bobbing',
    dur: '4–6s',
    demo: 'shapes3d',
    pairs: ['pearl3d', 'glass3d', 'holo3d', 'plastic3d'],
    ae: `// 懸浮 + 緩慢自轉
[value[0], value[1] + Math.sin(time * 1.4) * 14, value[2]]
// Y Rotation：Math.sin(time * 0.7) * 25`,
    move: { levitate: 1, float: 0.6, spin: 0.3, ease: 'sine' },
  }),
  M({
    id: 'truck',
    name: '橫移推軌',
    en: 'Truck / Track Shot',
    cat: 'cam3d',
    desc: '鏡頭沿水平方向平移，近處的物件移動得比遠處快，產生真實的視差。',
    tips: ['橫移速度穩定', '前景、中景、背景要有深度差', '往返移動才能無縫'],
    kw: 'lateral tracking shot, truck camera move, parallax between foreground and background, side dolly',
    dur: '4–8s 往返',
    demo: 'shapes3d',
    pairs: ['lowpoly3d', 'matte3d', 'synthwave3d'],
    ae: `// 攝影機沿 X 軸往返橫移
[value[0] + Math.sin(time * 0.9) * 300, value[1], value[2]]`,
    move: { truck: 1, ease: 'sine', parallax: 0.8 },
  }),
];
