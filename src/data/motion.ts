// 動效風格庫：每個風格是一組「時間、緩動、形變、疊加」參數，附 AE 表達式與節奏建議。
import type { MotionStyle } from './schema';
import { MOTION_3D } from './motion3d';

const M = (s: MotionStyle) => s;

const OVERSHOOT = (amp: number, freq: number, decay: number) => `// 關鍵影格後的慣性過衝（Position / Scale / Rotation 通用）
amp = ${amp}; freq = ${freq}; decay = ${decay};
n = 0;
if (numKeys > 0) { n = nearestKey(time).index; if (key(n).time > time) n--; }
if (n > 0) {
  t = time - key(n).time;
  v = velocityAtTime(key(n).time - thisComp.frameDuration / 10);
  value + v * amp * Math.sin(freq * t * 2 * Math.PI) / Math.exp(decay * t);
} else value;`;

const BASE_MOTION: MotionStyle[] = [
  // ───────── UI 與產品 ─────────
  M({
    id: 'ui-micro',
    name: 'UI 微交互',
    en: 'UI Micro-interaction',
    cat: 'ui',
    desc: '快而輕：減速進場、極小的過衝、元素錯峰 40–60ms，回饋清楚但不搶戲。',
    tips: ['時長 150–300ms', '進場用減速、離場用加速', '一次只強調一件事'],
    kw: 'UI micro-interactions, ease-out transitions, subtle feedback, 250ms, staggered list',
    dur: '150–300ms／錯峰 40–60ms',
    demo: 'ui',
    pairs: ['flat', 'material', 'minimal', 'darkui'],
    ae: `// 位置：兩個關鍵影格，間隔 8 幀（30fps）
// Graph Editor 速度圖：出點影響度 75%，入點 0%
// 透明度 0→100 同步，延遲 2 幀
// 列表錯峰：每列圖層往後推 2 幀`,
    move: { ease: 'cubic', squash: 0.05, antic: 0, over: 0.06, follow: 0.12, stagger: 0.5, ripple: 0.4, speed: 1.1, arc: 0.2 },
  }),
  M({
    id: 'material-motion',
    name: 'Material 運動',
    en: 'Material Motion',
    cat: 'ui',
    desc: 'Material 標準曲線：快速起步、長而平順的減速，容器轉換、共享元素。',
    tips: ['標準曲線 cubic-bezier(0.2, 0, 0, 1)', '大面積元素時長較長', '移動走弧線'],
    kw: 'Material Design motion, emphasized easing, container transform, shared axis transitions',
    dur: '200–500ms（依面積）',
    demo: 'ui',
    pairs: ['material', 'flat', 'gradient'],
    ae: `// Material 標準曲線 cubic-bezier(0.2, 0, 0, 1)
// Graph Editor：第一個關鍵影格出點影響度 20%，第二個入點 100%
// 共享元素：同一圖層從縮圖位置縮放到全版，時長 300ms`,
    move: { ease: 'material', squash: 0, antic: 0, over: 0, follow: 0.15, stagger: 0.6, morph: 0.15, arc: 0.7 },
  }),
  M({
    id: 'ios-spring',
    name: 'iOS 彈簧',
    en: 'iOS Spring',
    cat: 'ui',
    desc: '阻尼彈簧：有速度、有質量，停下前輕輕回彈一下，手感自然。',
    tips: ['用阻尼比 0.7–0.85', '可被打斷、保留速度', '過衝不超過 10%'],
    kw: 'iOS spring animation, damped spring physics, natural overshoot, fluid interface',
    dur: 'response 0.35–0.55s／damping 0.75',
    demo: 'ui',
    pairs: ['glass', 'neumorph', 'y2k', 'skeuo'],
    ae: OVERSHOOT(0.05, 2.2, 6),
    move: { ease: 'spring', over: 0.35, squash: 0.12, antic: 0, stagger: 0.4, follow: 0.35 },
  }),
  M({
    id: 'shimmer',
    name: '骨架屏流光',
    en: 'Skeleton Shimmer',
    cat: 'ui',
    desc: '載入中的骨架屏：一道斜向流光掃過，內容再柔和地淡入。',
    tips: ['流光週期 1.2–1.6s', '流光角度約 20°', '真內容到了要平滑接手'],
    kw: 'skeleton loading screen, shimmer sweep, placeholder animation, content fade-in',
    dur: '流光 1.2–1.6s 一輪',
    demo: 'ui',
    pairs: ['minimal', 'material', 'darkui'],
    ae: `// 流光：Gradient Ramp 圖層設為 Overlay，旋轉 20°
// 位置（循環掃過）：
period = 1.4;
p = (time % period) / period;
value + [p * thisComp.width * 1.6 - thisComp.width * 0.8, 0]`,
    move: { ease: 'sine', shimmer: 1, stagger: 0.7, float: 0.1 },
  }),
  M({
    id: 'stagger',
    name: '交錯編排',
    en: 'Staggered Choreography',
    cat: 'ui',
    desc: '元素一個接一個登場，像骨牌一樣把視線帶過整個畫面。',
    tips: ['每個延遲 30–80ms', '總時長控制在 600ms 內', '方向與閱讀順序一致'],
    kw: 'staggered animation, cascading entrance, choreographed sequence, domino effect',
    dur: '每項延遲 30–80ms',
    demo: 'chart',
    pairs: ['isometric', 'dataviz', 'corporate'],
    ae: `// 交錯：複製圖層即自動延遲 3 幀（跟隨第 1 層）
delay = (index - 1) * 3 * thisComp.frameDuration;
thisComp.layer(1).transform.position.valueAtTime(time - delay)`,
    move: { ease: 'quart', stagger: 1, over: 0.12 },
  }),
  M({
    id: 'parallax',
    name: '視差滾動',
    en: 'Parallax',
    cat: 'ui',
    desc: '遠景慢、近景快，用速度差造出景深。',
    tips: ['至少三層深度', '近景速度是遠景 3–4 倍', '前景可輕微模糊'],
    kw: 'parallax scrolling, layered depth, multiplane camera, foreground moves faster',
    dur: '依滾動或 6–10s 循環',
    demo: 'landscape',
    pairs: ['papercut', 'synthwave', 'pastoral'],
    ae: `// 2D 視差：每層乘上深度係數（遠 0.2、中 0.5、近 1）
depth = 0.5;
value + [thisComp.layer("CTRL").transform.position[0] * -depth, 0]
// 或直接用 3D 圖層 + 攝影機，讓 Z 深度自動產生視差`,
    move: { ease: 'sine', parallax: 1, kenburns: 0.25, float: 0.2 },
  }),
  M({
    id: 'jelly',
    name: '液態果凍',
    en: 'Jelly',
    cat: 'ui',
    desc: '按下去像果凍：形變、晃動、慢慢回穩，Q 彈又有觸感。',
    tips: ['寬高反向變化保持體積', '晃動 2–3 下就停', '適合按鈕與貼紙'],
    kw: 'jelly wobble animation, squishy elastic deformation, bouncy button, gummy',
    dur: '400–700ms',
    pairs: ['kawaii', 'inflate', 'y2k', 'sticker'],
    ae: `// 果凍抖動（Scale）
freq = 3; decay = 4; amp = 12;
t = time - inPoint;
s = amp * Math.sin(freq * t * 2 * Math.PI) / Math.exp(decay * t);
[value[0] + s, value[1] - s]`,
    move: { ease: 'elastic', wobble: 0.7, squash: 0.6, over: 0.6 },
  }),
  M({
    id: 'data-grow',
    name: '數據生長',
    en: 'Data Growth',
    cat: 'ui',
    desc: '長條從基線長出、折線描過、數字滾動，資料「被計算出來」的感覺。',
    tips: ['錨點放在基線', '數字和圖形同步', '最重要的數據最後到'],
    kw: 'data visualization animation, growing bar charts, line drawing, counting numbers',
    dur: '800–1500ms 全部完成',
    demo: 'chart',
    pairs: ['dataviz', 'darkui', 'circuit'],
    ae: `// 長條生長（Scale，錨點在底部），每根延遲 2 幀
delay = (index - 1) * 2 * thisComp.frameDuration;
t = Math.max(0, time - inPoint - delay);
[value[0], ease(t, 0, 0.6, 0, 100)]`,
    move: { ease: 'quart', stagger: 0.8, drawOn: 0.25, over: 0.15 },
  }),
  M({
    id: 'ripple',
    name: '漣漪回饋',
    en: 'Ripple Feedback',
    cat: 'ui',
    desc: '點擊處擴散的圓圈，清楚告訴使用者「收到了」。',
    tips: ['從觸點出發', '擴散快、淡出慢', '顏色用強調色低透明'],
    kw: 'ripple effect, touch feedback, expanding circles, material ink ripple',
    dur: '300–600ms',
    pairs: ['material', 'flat', 'neumorph'],
    ae: `// 漣漪圓：Scale 0→300，Opacity 100→0
t = time - inPoint;
s = linear(t, 0, 0.6, 0, 300);
[s, s]`,
    move: { ripple: 1, ease: 'cubic', parts: { bubble: 0.3 } },
  }),

  // ───────── 經典動畫原則 ─────────
  M({
    id: 'disney12',
    name: '迪士尼十二法則',
    en: '12 Principles',
    cat: 'classic',
    desc: '擠壓拉伸、預備動作、跟隨重疊、弧線、緩入緩出、誇張，經典動畫的全套語法。',
    tips: ['先蹲再跳：預備越大，動作越有力', '體積守恆：壓扁就變寬', '所有運動走弧線'],
    kw: 'Disney 12 principles of animation, squash and stretch, anticipation, follow through, arcs, slow in slow out, exaggeration',
    dur: '24fps，動作 8–20 幀',
    demo: 'mascot',
    pairs: ['disney', 'toon3d', 'pencil', 'anime'],
    ae: `// 依速度自動擠壓拉伸（Scale）
vy = transform.position.velocity[1];
k = clamp(Math.abs(vy) / 40, 0, 25);
[value[0] - k * 0.6, value[1] + k]`,
    move: { ease: 'quint', squash: 0.85, antic: 0.8, over: 0.45, follow: 0.9, arc: 1, exag: 0.5 },
  }),
  M({
    id: 'rubberhose-m',
    name: '橡皮管搖擺',
    en: 'Rubber Hose Bounce',
    cat: 'classic',
    desc: '一切都在隨音樂搖擺：麵條手腳、連續彈跳、往返循環的 1930 年代律動。',
    tips: ['全身隨拍子上下彈', '手腳像水管一樣彎', '動作循環往返'],
    kw: '1930s rubber hose animation, bouncing to the beat, noodle limbs, looping swing, Fleischer rhythm',
    dur: '110–130 BPM 循環',
    demo: 'walk',
    pairs: ['rubberhose', 'silentfilm', 'memphis'],
    ae: `// 跟著節拍彈（Position）
bpm = 110; t = time * bpm / 60;
value - [0, Math.abs(Math.sin(t * Math.PI)) * 12]`,
    move: { ease: 'sine', noodle: 1, beat: 0.6, bpm: 110, wobble: 0.3, squash: 0.6, float: 0.4, follow: 0.7 },
  }),
  M({
    id: 'limited-anime',
    name: '日式有限動畫',
    en: 'Anime Limited',
    cat: 'classic',
    desc: '一拍三（8fps）、大量停格、關鍵瞬間閃一張衝擊幀、速度線撐場。',
    tips: ['用停格省幀數、把力氣花在關鍵幀', '衝擊幀 1–2 張反白', '速度線取代中間畫'],
    kw: 'anime limited animation, animating on threes, held poses, impact frames, speed lines, sakuga',
    dur: '8–12fps，停格 6–12 幀',
    demo: 'mascot',
    pairs: ['anime', 'manga', 'comic'],
    ae: `// 一拍三（8fps）
posterizeTime(8);
value
// 關鍵影格改 Toggle Hold Keyframe，轉場只留 1–2 張中間畫`,
    move: { fps: 8, holds: 0.7, impact: 0.8, speedLines: 0.8, smear: 0.2, ease: 'expo', squash: 0.25, antic: 0.5 },
  }),
  M({
    id: 'looney',
    name: '誇張鬧劇',
    en: 'Slapstick Exaggeration',
    cat: 'classic',
    desc: '極度擠壓、拖影幀、超大預備、撞擊震動，越誇張越好笑。',
    tips: ['預備動作誇張到變形', '衝刺用 1–2 張拖影幀', '撞擊後停頓再反應'],
    kw: 'slapstick cartoon animation, extreme squash and stretch, smear frames, wild takes, Looney style',
    dur: '快—停—快，節奏反差大',
    demo: 'mascot',
    pairs: ['ustoon', 'comic', 'rubberhose'],
    ae: `// 衝刺：前段強烈預備 + CC Force Motion Blur
// Scale：衝出瞬間 [70, 180]，落點 [150, 60]，再彈回 [100, 100]`,
    move: { ease: 'back', squash: 1, antic: 1, exag: 1, smear: 0.8, speedLines: 0.6, shake: 0.6, over: 0.7 },
  }),
  M({
    id: 'pose-to-pose',
    name: '關鍵姿勢',
    en: 'Pose to Pose',
    cat: 'classic',
    desc: '在幾個清楚的姿勢間快速切換、停住、再切換，表演感十足。',
    tips: ['每個姿勢剪影要清楚', '轉換快、停留長', '姿勢間加預備'],
    kw: 'pose to pose animation, strong key poses, snappy transitions, held poses, acting',
    dur: '停留 8–16 幀、轉換 3–5 幀',
    pairs: ['silhouette', 'ustoon', 'bauhaus'],
    ae: `// 姿勢停格：每 4 幀更新一次
posterizeTime(6);
value`,
    move: { holds: 0.85, antic: 0.7, ease: 'expo', fps: 12 },
  }),
  M({
    id: 'smear',
    name: '拖影幀',
    en: 'Smear Frames',
    cat: 'classic',
    desc: '高速移動時把形體拉長成殘影，用一兩張畫面騙過眼睛。',
    tips: ['只在最快的 1–2 幀用', '拖影沿運動方向', '顏色可以更淡'],
    kw: 'smear frames, motion blur drawing, stretched in-betweens, fast action, multiples',
    dur: '1–2 幀',
    pairs: ['ustoon', 'anime', 'comic'],
    ae: `// 拖影：Effect > Time > Echo
// Echo Time -0.02，Number of Echoes 4，Decay 0.6
// 或 CC Force Motion Blur：Samples 8`,
    move: { smear: 1, echo: 0.3, ease: 'expo', squash: 0.6 },
  }),
  M({
    id: 'overlap',
    name: '重疊與跟隨',
    en: 'Overlapping Action',
    cat: 'classic',
    desc: '主體停了，毛髮、觸角、衣角還在晃：不同部位不同時停。',
    tips: ['越末端越晚停', '柔軟部位晃得越久', '延遲 2–6 幀'],
    kw: 'overlapping action, follow through, drag, secondary motion, delayed appendages',
    dur: '附屬部位延遲 2–6 幀',
    demo: 'walk',
    pairs: ['disney', 'toon3d', 'storybook'],
    ae: `// 跟隨：子物件延遲取樣主物件
lag = 0.08;
thisComp.layer("Parent").transform.position.valueAtTime(time - lag) + [0, -60]`,
    move: { follow: 1, stagger: 0.6, ease: 'sine', wobble: 0.2 },
  }),
  M({
    id: 'slowinout',
    name: '緩入緩出',
    en: 'Slow In / Slow Out',
    cat: 'classic',
    desc: '起步與停止都慢、中間快：最基本也最自然的節奏。',
    tips: ['關鍵影格兩端密、中間疏', 'S 型曲線', '機械物件例外'],
    kw: 'slow in slow out, ease in out, smooth S-curve timing, natural acceleration',
    dur: '任何時長',
    pairs: ['minimal', 'noir', 'artdeco'],
    ae: `// 所有關鍵影格 F9（Easy Ease）
// Graph Editor 把影響度拉到 80%，形成 S 型曲線`,
    move: { ease: 'quint', arc: 0.8, squash: 0.3 },
  }),

  // ───────── 手作與定格 ─────────
  M({
    id: 'stopmotion',
    name: '定格動畫',
    en: 'Stop Motion',
    cat: 'handmade',
    desc: '一拍二（12fps）加上每幀細微位移：實物被手一格格移動的痕跡。',
    tips: ['12fps 就夠', '每幀加 1–2px 隨機抖動', '不要做動態模糊'],
    kw: 'stop motion animation, 12 fps, frame by frame, handmade jitter, tactile puppets',
    dur: '12fps（一拍二）',
    demo: 'mascot',
    pairs: ['clay', 'papercut', 'collage', 'crayon'],
    ae: `// 定格：12fps + 每幀隨機微移（Position）
posterizeTime(12);
seedRandom(index, false);
value + [random(-2, 2), random(-2, 2)]`,
    move: { fps: 12, jitter: 0.6, boil: 0.15, boilFps: 12, ease: 'quad' },
  }),
  M({
    id: 'claymation-m',
    name: '黏土定格',
    en: 'Claymation',
    cat: 'handmade',
    desc: '黏土被一格格捏動：形體會「呼吸」起伏，擠壓更柔軟。',
    tips: ['每幀形狀都有點不同', '擠壓幅度大', '保留指紋與凹凸'],
    kw: 'claymation, plasticine stop motion, surface boiling, squishy deformation, 12fps',
    dur: '12fps',
    demo: 'mascot',
    pairs: ['clay', 'inflate', 'storybook'],
    ae: `// 黏土：12fps + Scale 隨機起伏
posterizeTime(12);
seedRandom(index, false);
value + [random(-1.5, 1.5), random(-1.5, 1.5)]`,
    move: { fps: 12, jitter: 0.4, wobble: 0.5, boil: 0.35, boilFps: 12, squash: 0.5, ease: 'quad' },
  }),
  M({
    id: 'cutout-m',
    name: '剪紙動畫',
    en: 'Cutout Animation',
    cat: 'handmade',
    desc: '紙片角色用鉚釘連接，只旋轉、平移，不變形——硬硬的可愛。',
    tips: ['只轉關節、不變形', '一拍二', '身體部件分圖層'],
    kw: 'cutout animation, paper puppet, hinged joints, rigid parts, South Park style, 12fps',
    dur: '12fps',
    demo: 'walk',
    pairs: ['papercut', 'jianzhi', 'shadowpuppet', 'collage'],
    ae: `// 剪紙：以錨點（鉚釘）旋轉
posterizeTime(12);
Math.sin(time * 4) * 12`,
    move: { fps: 12, rigid: 1, jitter: 0.15, ease: 'quad', antic: 0.3 },
  }),
  M({
    id: 'boil',
    name: '線條沸騰',
    en: 'Line Boil',
    cat: 'handmade',
    desc: '每一幀重描的線條會微微顫動，靜止的畫面也有生命。',
    tips: ['8–12fps 更換', '顫動 1–2px 就好', '只動線條、不動位置'],
    kw: 'line boil, hand-drawn wiggle, redrawn every frame, living lines, squigglevision',
    dur: '8–12fps 換幀',
    pairs: ['pencil', 'inkline', 'doodle', 'chalk'],
    ae: `// 線條沸騰：Turbulent Displace（Amount 4、Size 8）
// Evolution：
posterizeTime(8);
seedRandom(1, false);
random(0, 360)`,
    move: { boil: 0.8, boilFps: 8 },
  }),
  M({
    id: 'handdrawn',
    name: '手繪逐格',
    en: 'Hand-drawn Frames',
    cat: 'handmade',
    desc: '一拍二的傳統手繪：線條沸騰、弧線運動、適度擠壓。',
    tips: ['一拍二', '線稿每幀略有不同', '動作仍要守動畫原則'],
    kw: 'traditional hand-drawn animation, on twos, pencil test, line boil, frame by frame',
    dur: '12fps（一拍二）',
    demo: 'ball',
    pairs: ['pencil', 'storybook', 'doodle'],
    ae: `posterizeTime(12);
// 搭配 Turbulent Displace 的 Evolution 隨機值做線條沸騰`,
    move: { fps: 12, boil: 0.5, boilFps: 12, squash: 0.5, arc: 0.8, antic: 0.5 },
  }),
  M({
    id: 'pixel-anim',
    name: '像素逐格',
    en: 'Pixel Sprite',
    cat: 'handmade',
    desc: '8fps、位置吸附像素格、動作簡單有力，遊戲精靈圖的節奏。',
    tips: ['位置一定落在整數像素', '每個動作 2–6 幀', '別用平滑緩動'],
    kw: 'pixel art sprite animation, 8 fps, snapped to pixel grid, game character cycle',
    dur: '6–10fps',
    demo: 'mascot',
    pairs: ['pixel8', 'pixel16', 'gameboy', 'pico8'],
    ae: `// 像素逐格：8fps + 吸附 4px 格
posterizeTime(8);
g = 4;
[Math.round(value[0] / g) * g, Math.round(value[1] / g) * g]`,
    move: { fps: 8, snap: 1, squash: 0.15, ease: 'quad' },
  }),
  M({
    id: 'puppet',
    name: '木偶皮影',
    en: 'Puppet Sway',
    cat: 'handmade',
    desc: '被桿子或線操縱的偶：關節擺盪、帶慣性、略為漂浮。',
    tips: ['動作從操縱點傳下去', '關節像鐘擺', '腳不一定踩實地'],
    kw: 'shadow puppet animation, rod puppet, pendulum swing joints, floaty theatrical motion',
    dur: '慢節奏 1.5–3s 一個動作',
    demo: 'walk',
    pairs: ['shadowpuppet', 'silhouette', 'jianzhi'],
    ae: `// 關節擺盪（Rotation）
amp = 10; freq = 0.8;
Math.sin(time * freq * 2 * Math.PI) * amp + Math.sin(time * freq * 4.1) * amp * 0.3`,
    move: { rigid: 0.8, float: 0.6, follow: 0.6, ease: 'sine', wind: 0.3 },
  }),

  // ───────── 線條與幾何 ─────────
  M({
    id: 'complex-lines',
    name: '複雜線條',
    en: 'Complex Line Systems',
    cat: 'lines',
    desc: '大量線條在畫面中流動、連結、生長：流場、網絡、描邊同時進行。',
    tips: ['線條細、數量多', '同時有生長與流動', '主體保持清楚'],
    kw: 'complex generative line animation, flow field lines, plexus network, line drawing, intricate motion graphics',
    dur: '4–8s 循環',
    demo: 'abstract',
    pairs: ['minimal', 'blueprint', 'hud', 'inkline'],
    ae: `// 線條生長：Shape Layer > Trim Paths > End
ease(time, inPoint, inPoint + 1.2, 0, 100)
// 多條線錯峰：每條 Start 延遲 0.05s；流動用 Offset：time * 40`,
    move: { lines: { flow: 1, network: 0.7 }, drawOn: 0.6, ease: 'sine' },
  }),
  M({
    id: 'drawon',
    name: '描邊生長',
    en: 'Line Draw-on',
    cat: 'lines',
    desc: '先畫出線稿、再填上顏色，像正在被畫出來。',
    tips: ['線先、色後', '從主要輪廓開始', '收尾時可反向擦除'],
    kw: 'line draw-on animation, trim paths, stroke reveal, sketch to color, write-on effect',
    dur: '0.8–1.5s 畫完',
    demo: 'geo',
    pairs: ['inkline', 'blueprint', 'neon', 'chalk'],
    ae: `// Trim Paths End
t = time - inPoint;
ease(t, 0, 1, 0, 100)`,
    move: { drawOn: 1, ease: 'quart', stagger: 0.6 },
  }),
  M({
    id: 'spirograph',
    name: '繁花曲線',
    en: 'Spirograph',
    cat: 'lines',
    desc: '內擺線一圈圈描出繁複花紋，數學的優雅。',
    tips: ['線要細', '描繪速度均勻', '兩層曲線反向旋轉'],
    kw: 'spirograph, hypotrochoid curves, mathematical line art, rotating patterns',
    dur: '4–6s 描完',
    demo: 'abstract',
    pairs: ['artdeco', 'minimal', 'neon'],
    ae: `// 繁花曲線（Position，搭配 Echo 或 Trail）
R = 150; r = 54; d = 90; t = time * 2;
k = (R - r) / r;
[thisComp.width / 2 + (R - r) * Math.cos(t) + d * Math.cos(k * t),
 thisComp.height / 2 + (R - r) * Math.sin(t) - d * Math.sin(k * t)]`,
    move: { lines: { spiro: 1 }, ease: 'linear' },
  }),
  M({
    id: 'flowfield',
    name: '流場',
    en: 'Flow Field',
    cat: 'lines',
    desc: '線條沿著看不見的向量場流動，像風、像水、像磁力線。',
    tips: ['場要平滑', '線條長短不一', '顏色分層'],
    kw: 'flow field, perlin noise vector field, flowing lines, generative art',
    dur: '持續循環',
    demo: 'abstract',
    pairs: ['watercolor', 'gradient', 'inkwash'],
    ae: `// Trapcode Form / Particular 的 Turbulence Field
// 或 CC Particle World：Floor + Turbulence 讓粒子沿場流動`,
    move: { lines: { flow: 1 }, ease: 'sine', float: 0.2 },
  }),
  M({
    id: 'geoloop',
    name: '幾何循環',
    en: 'Geometric Loop',
    cat: 'lines',
    desc: '多邊形環以不同速度反向旋轉，完美無縫的催眠循環。',
    tips: ['每圈轉速是整數比', '首尾完全相接', '線寬一致'],
    kw: 'geometric loop animation, rotating polygons, seamless loop, hypnotic motion design',
    dur: '2–4s 完美循環',
    demo: 'geo',
    pairs: ['bauhaus', 'stainedglass', 'mosaic'],
    ae: `// 完美循環旋轉（Rotation）
loopTime = 4;
linear(time % loopTime, 0, loopTime, 0, 360 / 6)`,
    move: { lines: { rings: 0.9 }, ease: 'sine', speed: 0.8, morph: 0.2 },
  }),
  M({
    id: 'morph',
    name: '形變',
    en: 'Shape Morph',
    cat: 'lines',
    desc: '圓變方、方變星：形狀之間流暢地互相轉換。',
    tips: ['頂點數要一致', '轉換時加一點旋轉', '用緩入緩出'],
    kw: 'shape morphing animation, circle to square, fluid shape transitions, liquid motion',
    dur: '0.6–1.2s 每次',
    demo: 'geo',
    pairs: ['gradient', 'chrome', 'origami'],
    ae: `// Path 關鍵影格之間 Easy Ease
// 圓角形變（Rectangle Roundness）：
50 + 50 * Math.sin(time * Math.PI)`,
    move: { morph: 1, ease: 'cubic', squash: 0 },
  }),
  M({
    id: 'contour',
    name: '等高線',
    en: 'Topographic Contours',
    cat: 'lines',
    desc: '起伏的等高線緩緩流動，地形圖般的層次。',
    tips: ['線距均勻', '兩種顏色交替', '流動要慢'],
    kw: 'topographic contour lines, animated terrain map, marching squares, isolines',
    dur: '6–10s 循環',
    demo: 'abstract',
    pairs: ['blueprint', 'minimal', 'dataviz'],
    ae: `// Fractal Noise（Contrast 400）→ Find Edges
// Evolution：time * 60`,
    move: { lines: { contour: 1 }, ease: 'sine' },
  }),
  M({
    id: 'gridwave',
    name: '網格波動',
    en: 'Grid Wave',
    cat: 'lines',
    desc: '背景網格像水面一樣起波紋，從中心一圈圈擴散。',
    tips: ['波從中心擴散', '振幅隨距離衰減', '網格要淡'],
    kw: 'grid wave distortion, ripple displacement, warped grid lines, tech background',
    dur: '1–2s 一波',
    pairs: ['wireframe', 'swiss', 'brutalism'],
    ae: `// 單點版（Position Y）
d = length(transform.position, [thisComp.width / 2, thisComp.height / 2]);
value + [0, Math.sin(d * 0.04 - time * 6) * 8]`,
    move: { lines: { grid: 1 }, ease: 'sine' },
  }),
  M({
    id: 'orbit',
    name: '軌道環繞',
    en: 'Orbit',
    cat: 'lines',
    desc: '小衛星沿傾斜的橢圓軌道環繞主體，帶出空間感。',
    tips: ['軌道傾斜才有 3D 感', '近大遠小', '速度各不相同'],
    kw: 'orbit animation, satellites circling, elliptical orbits, atom model, tech icon motion',
    dur: '2–4s 一圈',
    pairs: ['scifi', 'hologram', 'lowpoly'],
    ae: `// 環繞（Position）
r = 140; speed = 1;
c = thisComp.layer("Center").transform.position;
c + [Math.cos(time * speed * 2 * Math.PI) * r, Math.sin(time * speed * 2 * Math.PI) * r * 0.4]`,
    move: { lines: { orbit: 1 }, ease: 'sine', float: 0.3 },
  }),

  // ───────── 物理與自然 ─────────
  M({
    id: 'elastic',
    name: '彈性',
    en: 'Elastic',
    cat: 'physics',
    desc: '像橡皮筋一樣衝過頭再彈回，來回晃幾下才停。',
    tips: ['過衝 10–30%', '回彈 2–3 次', '適合圖示、貼紙、按鈕'],
    kw: 'elastic easing, springy overshoot, rubber band bounce, wobbly settle',
    dur: '500–900ms',
    pairs: ['kawaii', 'memphis', 'sticker', 'ustoon'],
    ae: OVERSHOOT(0.08, 2.5, 5),
    move: { ease: 'elastic', over: 0.8, squash: 0.5, wobble: 0.3 },
  }),
  M({
    id: 'bounce',
    name: '重力彈跳',
    en: 'Gravity Bounce',
    cat: 'physics',
    desc: '受重力影響的落地反彈：高度遞減、觸地擠壓、空中拉伸。',
    tips: ['每次反彈約剩 60% 高度', '觸地那幀最扁', '空中最高點停留最久'],
    kw: 'gravity bounce, decaying bounces, squash on impact, physics-based animation',
    dur: '依高度：落下 0.3–0.6s',
    demo: 'ball',
    pairs: ['pixel8', 'voxel', 'minecraft'],
    ae: `// 落地反彈（Position，最後一個關鍵影格後）
e = 0.6; g = 4000; nMax = 6;
n = 0;
if (numKeys > 0) { n = nearestKey(time).index; if (key(n).time > time) n--; }
if (n > 0) {
  t = time - key(n).time;
  v = -velocityAtTime(key(n).time - 0.001) * e;
  vl = length(v); vu = vl > 0 ? normalize(v) : [0, 0];
  tCur = 0; segDur = 2 * vl / g; tNext = segDur; nb = 1;
  while (tNext < t && nb <= nMax) { vl *= e; segDur *= e; tCur = tNext; tNext += segDur; nb++; }
  if (nb <= nMax) { d = t - tCur; value + vu * d * (vl - g * d / 2); } else value;
} else value;`,
    move: { ease: 'bounce', squash: 0.6, arc: 1, parts: { dust: 0.4 } },
  }),
  M({
    id: 'floaty',
    name: '漂浮失重',
    en: 'Floaty',
    cat: 'physics',
    desc: '像在水裡或太空：慢、柔、持續地上下漂浮與緩轉。',
    tips: ['速度放慢 30–50%', '上下與旋轉頻率錯開', '不要有硬停頓'],
    kw: 'floating animation, zero gravity, gentle bobbing, underwater drift, slow and dreamy',
    dur: '2–4s 一個起伏',
    pairs: ['dreamy', 'vaporwave', 'scifi', 'watercolor'],
    ae: `// 漂浮（Position）
value + [Math.sin(time * 1.3) * 6, Math.sin(time * 2) * 12]
// Rotation：Math.sin(time * 1.1) * 4`,
    move: { float: 1, ease: 'sine', speed: 0.65, squash: 0.1, antic: 0, parts: { bubble: 0.3 } },
  }),
  M({
    id: 'liquid',
    name: '液態流體',
    en: 'Liquid',
    cat: 'physics',
    desc: '黏稠的液滴互相吸附、拉絲、融合，形體像在流動。',
    tips: ['邊緣持續起伏', '液滴靠近就黏起來', '動作慢而重'],
    kw: 'liquid motion, gooey metaballs, viscous blobs, fluid morphing, organic',
    dur: '2–5s 循環',
    demo: 'abstract',
    pairs: ['chrome', 'gradient', 'psychedelic'],
    ae: `// Gooey：Gaussian Blur 20 → Levels（Alpha 輸入黑 100、白 140）收邊`,
    move: { lines: { liquid: 1 }, wobble: 0.8, squash: 0.4, ease: 'sine' },
  }),
  M({
    id: 'particles',
    name: '粒子爆發',
    en: 'Particle Burst',
    cat: 'physics',
    desc: '撞擊或觸發時迸出火花、星星與彩紙，強化事件的能量。',
    tips: ['爆發 2–3 幀內完成', '粒子帶重力落下', '大小與壽命要有變化'],
    kw: 'particle burst, sparks and confetti, explosion of particles, celebratory effect',
    dur: '爆發 0.1s，消散 0.6–1s',
    pairs: ['guochao', 'arcade', 'pico8'],
    ae: `// CC Particle Systems II 或 Trapcode Particular
// Birth Rate 只在 2 幀內打開，Velocity 300，Gravity 400，Life 0.8s`,
    move: { parts: { spark: 1, star: 0.6, confetti: 0.6 }, ease: 'expo' },
  }),
  M({
    id: 'wind',
    name: '風吹擺動',
    en: 'Wind Sway',
    cat: 'physics',
    desc: '樹葉、圍巾、觸角都被同一陣風推著擺動，還有葉子飛過。',
    tips: ['所有柔軟物件同方向', '擺動有延遲傳遞', '加一點飄落物'],
    kw: 'wind sway animation, swaying trees, fluttering cloth, drifting leaves, breeze',
    dur: '2–3s 一陣',
    demo: 'landscape',
    pairs: ['pastoral', 'storybook', 'ukiyoe'],
    ae: `// 風吹擺動（Rotation，錨點在根部）
w = wiggle(0.6, 3) - value;
value + Math.sin(time * 2.2 + index) * 6 + w`,
    move: { wind: 1, follow: 0.8, parts: { leaf: 0.6 }, float: 0.2 },
  }),
  M({
    id: 'mechanical',
    name: '機械精準',
    en: 'Mechanical',
    cat: 'physics',
    desc: '線性、步進、停頓：像齒輪與鐘錶，沒有一絲多餘的彈性。',
    tips: ['線性或步進', '沒有過衝', '節拍穩定'],
    kw: 'mechanical motion, linear stepped movement, robotic precision, clockwork ticking',
    dur: '固定節拍',
    demo: 'geo',
    pairs: ['blueprint', 'swiss', 'circuit', 'brutalism'],
    ae: `// 機械步進（Rotation）：每秒跳一格
step = 30;
Math.floor(time) * step + ease(time % 1, 0.85, 1, 0, step)`,
    move: { ease: 'linear', squash: 0, antic: 0, over: 0, follow: 0, holds: 0.45, arc: 0 },
  }),
  M({
    id: 'heavy',
    name: '沉重質感',
    en: 'Heavy / Weighty',
    cat: 'physics',
    desc: '很重的東西：預備久、起跳低、落地停頓、地面震動、揚起塵土。',
    tips: ['預備時間拉長', '落地停頓 2–4 幀', '鏡頭震一下'],
    kw: 'heavy weighty animation, slow anticipation, ground impact, camera shake, dust cloud',
    dur: '比一般慢 20–40%',
    pairs: ['clay', 'charcoal', 'voxel'],
    ae: `// 落地後鏡頭震動（攝影機或 Null 的 Position，需一個圖層標記）
t = time - marker.key(1).time;
t > 0 ? wiggle(25, 18 * Math.exp(-t * 8)) : value`,
    move: { heavy: 1, antic: 1, shake: 0.7, hitstop: 0.6, parts: { dust: 0.8 }, squash: 0.35, ease: 'quart', speed: 0.85 },
  }),
  M({
    id: 'swarm',
    name: '群集',
    en: 'Swarm',
    cat: 'physics',
    desc: '一群小東西像鳥群或魚群繞著主體流動。',
    tips: ['個體跟隨群體', '速度略有差異', '整體形狀會變化'],
    kw: 'swarm animation, flocking boids, schooling fish, murmuration, crowd simulation',
    dur: '持續循環',
    pairs: ['inkwash', 'hologram', 'minimal'],
    ae: `// CC Particle World + Wind/Turbulence；或 Particular 的 Flocking 設定`,
    move: { lines: { swarm: 1 }, ease: 'sine' },
  }),

  // ───────── 文字與排版 ─────────
  M({
    id: 'kinetic',
    name: '動態排版',
    en: 'Kinetic Typography',
    cat: 'type',
    desc: '字跟著節奏跳出、放大、旋轉，文字本身就是表演者。',
    tips: ['逐字錯峰', '重點字放大', '跟著音樂節拍'],
    kw: 'kinetic typography, animated text, letters popping on beat, bold motion type',
    dur: '每字 2–3 幀錯峰',
    demo: 'type',
    pairs: ['swiss', 'constructivism', 'guochao', 'duotone'],
    ae: `// Text Animator：Position [0, 80]、Scale 0%、Opacity 0%
// Range Selector > Advanced：Based On Characters，Shape: Ramp Up，Ease Low 100%`,
    move: { zoomPunch: 0.5, stagger: 0.8, ease: 'expo', beat: 0.4, typeWave: 0.3, tilt: 0.2 },
  }),
  M({
    id: 'typewriter',
    name: '打字機',
    en: 'Typewriter',
    cat: 'type',
    desc: '一個字一個字出現，游標在最後閃爍。',
    tips: ['速度 15–25 字／秒', '游標 2Hz 閃', '標點後停頓一下'],
    kw: 'typewriter text effect, character by character reveal, blinking cursor, terminal typing',
    dur: '15–25 字／秒',
    demo: 'type',
    pairs: ['terminal', 'ascii', 'teletext', 'hud'],
    ae: `// 打字機（Source Text）
speed = 18;
n = Math.floor((time - inPoint) * speed);
cursor = Math.floor(time * 2) % 2 ? "|" : " ";
value.substr(0, n) + cursor`,
    move: { typeWriter: 1, ease: 'linear', stagger: 1 },
  }),
  M({
    id: 'scramble',
    name: '字符解碼',
    en: 'Text Scramble',
    cat: 'type',
    desc: '亂碼字元快速翻動，再一個個「解碼」成正確的字。',
    tips: ['翻動 15fps 左右', '從左到右依序定格', '用等寬字更俐落'],
    kw: 'text scramble decode effect, random characters resolving, hacker text, cipher reveal',
    dur: '0.8–1.5s',
    demo: 'type',
    pairs: ['ascii', 'matrix', 'cyberpunk', 'xray'],
    ae: `// 字符解碼（Source Text）
chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ#%&@$";
t = time - inPoint; settle = 1.2;
out = "";
for (i = 0; i < value.length; i++) {
  if (t > settle * (i + 1) / value.length) out += value[i];
  else { seedRandom(Math.floor(time * 15) + i, true); out += chars[Math.floor(random(chars.length))]; }
}
out`,
    move: { typeScramble: 1, stutter: 0.1, ease: 'expo' },
  }),
  M({
    id: 'wave-text',
    name: '波浪文字',
    en: 'Wave Text',
    cat: 'type',
    desc: '字母依序上下起伏，像一陣波浪從左到右經過。',
    tips: ['相位差 0.1–0.2', '振幅別太大', '可加輕微旋轉'],
    kw: 'wavy text animation, sine wave letters, bouncing characters, playful typography',
    dur: '1–2s 一波',
    demo: 'type',
    pairs: ['psychedelic', 'kawaii', 'rubberhose'],
    ae: `// Text Animator > Position [0, -20] + Expression Selector
// Amount：
Math.sin(time * 4 + textIndex * 0.5) * 100`,
    move: { typeWave: 1, float: 0.3, ease: 'sine' },
  }),

  // ───────── 鏡頭與轉場 ─────────
  M({
    id: 'handheld',
    name: '手持鏡頭',
    en: 'Handheld Camera',
    cat: 'camera',
    desc: '輕微不規則的晃動，像真人拿著攝影機，帶來臨場與紀實感。',
    tips: ['頻率低（1–2Hz）', '旋轉幅度很小', '晃動要可循環'],
    kw: 'handheld camera shake, documentary feel, subtle wobble, found footage',
    dur: '持續',
    pairs: ['noir', 'film', 'vhs', 'nightvision'],
    ae: `// 手持（攝影機或 Null）
wiggle(1.2, 10)
// Rotation：wiggle(0.8, 1.2)`,
    move: { handheld: 1 },
  }),
  M({
    id: 'kenburns',
    name: '推拉搖移',
    en: 'Ken Burns',
    cat: 'camera',
    desc: '緩慢推近並橫移，讓靜態畫面也像在呼吸。',
    tips: ['縮放 10–20%', '方向跟著視線', '越慢越有質感'],
    kw: 'Ken Burns effect, slow zoom and pan, documentary camera move, cinematic push in',
    dur: '6–12s',
    demo: 'landscape',
    pairs: ['engraving', 'sepia', 'oilpaint', 'tiltshift'],
    ae: `// 推拉（Scale）
s = linear(time, inPoint, outPoint, 100, 115);
[s, s]`,
    move: { kenburns: 1, ease: 'sine' },
  }),
  M({
    id: 'whip',
    name: '甩鏡轉場',
    en: 'Whip Pan',
    cat: 'camera',
    desc: '鏡頭猛地甩開，在動態模糊中切到下一個畫面。',
    tips: ['甩的過程 4–6 幀', '加方向性模糊', '前後畫面方向一致'],
    kw: 'whip pan transition, fast camera swipe, directional motion blur, energetic cut',
    dur: '4–8 幀',
    pairs: ['cyberpunk', 'comic', 'lomo'],
    ae: `// Directional Blur > Blur Length 依速度
v = length(transform.position.velocity);
clamp(v / 40, 0, 120)`,
    move: { whip: 1, smear: 0.3 },
  }),
  M({
    id: 'maskreveal',
    name: '遮罩揭示',
    en: 'Mask Reveal',
    cat: 'camera',
    desc: '光圈打開、色塊劃過，用遮罩把畫面「揭開」。',
    tips: ['遮罩邊緣可略羽化', '揭示方向有意義', '收尾用反向劃出'],
    kw: 'mask reveal transition, iris wipe, shape wipe, graphic transition',
    dur: '0.4–0.8s',
    pairs: ['swiss', 'destijl', 'bauhaus'],
    ae: `// Mask Expansion 關鍵影格 + Feather 20
// 圓形光圈：Mask Path 從中心縮放到滿版，Easy Ease`,
    move: { mask: 1, ease: 'quart' },
  }),
  M({
    id: 'zoompunch',
    name: '衝擊縮放',
    en: 'Zoom Punch',
    cat: 'camera',
    desc: '在重拍或撞擊瞬間猛地放大再彈回，打擊感十足。',
    tips: ['放大 8–12%', '1 幀到位、6 幀回彈', '對準音樂重拍'],
    kw: 'zoom punch, impact zoom, beat hit, camera bump, music video editing',
    dur: '放大 1 幀、回彈 6–8 幀',
    pairs: ['comic', 'popart', 'guochao', 'manga'],
    ae: `// 每個圖層標記彈一下（Scale）
n = marker.numKeys > 0 ? marker.nearestKey(time).index : 0;
if (n > 0 && time >= marker.key(n).time) {
  t = time - marker.key(n).time;
  s = 100 + 12 * Math.exp(-t * 10);
  [s, s];
} else value;`,
    move: { zoomPunch: 1, beat: 0.3, shake: 0.2 },
  }),
  M({
    id: 'dutch',
    name: '荷蘭角擺動',
    en: 'Dutch Angle',
    cat: 'camera',
    desc: '鏡頭緩慢傾斜擺動，製造不安、迷幻或醉意。',
    tips: ['傾斜 3–8°', '擺動非常慢', '搭配手持更自然'],
    kw: 'dutch angle, tilted camera, slow roll, unsettling perspective',
    dur: '4–8s 一個擺動',
    pairs: ['noir', 'psychedelic', 'constructivism'],
    ae: `// 攝影機 Z Rotation
Math.sin(time * 0.8) * 5`,
    move: { tilt: 1, handheld: 0.2 },
  }),

  // ───────── 節奏與特效 ─────────
  M({
    id: 'beat',
    name: '節拍律動',
    en: 'Beat Sync',
    cat: 'fx',
    desc: '每個拍點都脈衝一下：縮放、閃光、跳動，畫面跟著音樂呼吸。',
    tips: ['先確定 BPM', '重拍大、輕拍小', '脈衝快起慢落'],
    kw: 'beat synced animation, pulsing to music, rhythmic motion, music visualizer',
    dur: '依 BPM（120 = 每拍 0.5s）',
    pairs: ['synthwave', 'memphis', 'arcade', 'riso'],
    ae: `// 節拍脈衝（Scale）
bpm = 120; t = time * bpm / 60;
p = t - Math.floor(t);
s = 100 + 14 * Math.exp(-p * 8);
[s, s]`,
    move: { beat: 1, bpm: 120, zoomPunch: 0.3 },
  }),
  M({
    id: 'glitch-m',
    name: '故障跳幀',
    en: 'Glitch Stutter',
    cat: 'fx',
    desc: '時間突然卡住、倒退、跳格，伴隨 RGB 錯位的爆發。',
    tips: ['故障要短而偶發', '時間跳躍 1–3 幀', '和音樂的碎拍對齊'],
    kw: 'glitch stutter, time skip, frame repeat, RGB split bursts, datamosh transition',
    dur: '每次 2–6 幀',
    pairs: ['glitch', 'cyberpunk', 'vhs', 'ascii'],
    ae: `// 故障跳幀（Position）
posterizeTime(12);
seedRandom(index, false);
random() < 0.12 ? value + [random(-40, 40), 0] : value`,
    move: { stutter: 0.8, glitch: 1, jitter: 0.2 },
  }),
  M({
    id: 'impact',
    name: '打擊感',
    en: 'Impact Hit',
    cat: 'fx',
    desc: '命中瞬間：停頓、反白閃幀、鏡頭震動、火花四濺、集中線。',
    tips: ['命中時停 2–4 幀（hit-stop）', '閃 1–2 張反白', '震動快速衰減'],
    kw: 'impact frames, hit stop, screen shake, flash frame, spark burst, game feel',
    dur: '停頓 2–4 幀＋震動 6–10 幀',
    pairs: ['anime', 'comic', 'arcade', 'onebit'],
    ae: `// 命中閃幀：Invert 效果，命中幀 Blend 0%，前後各 1 幀 100%
// 鏡頭震動：
t = time - marker.key(1).time;
t > 0 ? wiggle(30, 20 * Math.exp(-t * 9)) : value`,
    move: { impact: 1, shake: 0.8, hitstop: 0.8, speedLines: 0.5, parts: { spark: 0.8 } },
  }),
  M({
    id: 'echo',
    name: '殘影回聲',
    en: 'Echo Trails',
    cat: 'fx',
    desc: '移動物體身後拖著漸淡的分身，看得見它剛剛去過哪裡。',
    tips: ['殘影 3–6 個', '透明度遞減', '適合快速或循環動作'],
    kw: 'echo trails, ghosting afterimages, motion trail, time echo effect',
    dur: '殘影間隔 2–3 幀',
    pairs: ['vaporwave', 'glitch', 'neon'],
    ae: `// Effect > Time > Echo
// Echo Time -0.067，Number of Echoes 5，Starting Intensity 1，Decay 0.6`,
    move: { echo: 1 },
  }),
  M({
    id: 'slowmo',
    name: '子彈時間',
    en: 'Bullet Time',
    cat: 'fx',
    desc: '快—慢—快的速度曲線：在關鍵瞬間把時間拉長。',
    tips: ['慢放對準最精彩的一刻', '進出慢放要平滑', '慢的時候細節要夠'],
    kw: 'bullet time, speed ramp, slow motion at key moment, time remapping',
    dur: '慢放段 4–8 倍',
    pairs: ['vaporwave', 'inkwash', 'charcoal', 'toon3d'],
    ae: `// Time Remapping（啟用後）
t = time - inPoint;
mid = 1.0;
t < mid ? t : mid + (t - mid) * 0.25`,
    move: { ramp: 1 },
  }),
  M({
    id: 'pingpong',
    name: '往返循環',
    en: 'Ping-pong Loop',
    cat: 'fx',
    desc: '播完再倒著播回來，像 Boomerang 一樣無限往返。',
    tips: ['動作首尾要能接', '轉折點自然停頓', '適合 GIF 與貼圖'],
    kw: 'ping-pong loop, boomerang, forward and reverse, seamless GIF loop',
    dur: '1–3s 往返',
    pairs: ['rubberhose', 'psychedelic', 'polaroid'],
    ae: `// 往返循環
loopOut("pingpong")`,
    move: { pingpong: 1 },
  }),
];

export const MOTION: MotionStyle[] = [...MOTION_3D, ...BASE_MOTION];

export const MOTION_MAP: Record<string, MotionStyle> = Object.fromEntries(MOTION.map((s) => [s.id, s]));
