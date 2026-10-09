// 風格處方：把混合結果轉成設計師看得懂、可以直接用的參考資料
//（色板、緩動、時長、要點、AI 提示詞、CSS / GSAP / AE 代碼）。
import { MOTION, MOTION_MAP } from '../data/motion';
import { RECIPES } from '../data/recipes';
import type { MCat, MotionStyle, Sel, VCat, VisualStyle } from '../data/schema';
import { VISUAL, VISUAL_MAP } from '../data/visual';
import { EASE_INFO, cssLinear, easePath, fitBezier, ioOf, type EaseFn } from '../engine/easing';
import { FX } from '../engine/fx';
import { FONTS } from '../engine/fonts';
import { PAL_KEYS } from '../engine/resolve';
import { SUBJECTS } from '../engine/subjects';
import { is3D, type Look, type Move, type Palette, type SubjectId, type Tune } from '../engine/types';
import { round } from '../engine/util';

export const ROLE_NAME: Record<keyof Palette, string> = {
  bg: '背景',
  bg2: '背景 2',
  ink: '線條／文字',
  light: '高光',
  card: '卡片',
  p: '主色',
  s: '輔色',
  a: '點綴',
  q: '自然',
  r: '大地',
};

const FILL_NAME: Record<string, string> = {
  flat: '平塗色塊',
  gradient: '線性漸層',
  soft: '柔和體積光',
  cel: '賽璐璐二分陰影',
  dots: '網點陰影',
  hatch: '排線陰影',
  line: '純線稿（留白填色）',
  none: '只描邊、不填色',
  glass: '半透明毛玻璃',
  neu: '新擬態浮雕',
  chrome: '鉻金屬反射',
  iridescent: '虹彩漸變',
  gloss: '光澤高光',
  inflate: '充氣鼓起',
  clay: '黏土指紋質感',
  crayon: '蠟筆塗抹',
  marker: '麥克筆筆觸',
  wash: '水墨／水彩暈染',
  jianzhi: '剪紙鏤空',
  puppet: '皮影鏤空半透明',
  silhouette: '全黑剪影',
  offset: '錯位色塊',
  paper: '紙片（紙纖維、微微捲邊與紙影）',
  sticky: '便利貼（頂端黏條與下緣捲曲陰影）',
};
const STROKE_NAME: Record<string, string> = {
  solid: '實線',
  sketch: '手繪重描',
  brush: '毛筆粗細變化',
  dashed: '虛線',
  glow: '霓虹發光',
  chalk: '粉筆斷續',
  pencil: '鉛筆淡線',
};
const SHADOW_NAME: Record<string, string> = {
  none: '無',
  soft: '柔和投影',
  hard: '硬投影',
  long: '45° 長投影',
  extrude: '立體擠出',
  paper: '紙張層疊影',
};

const SUBJECT_EN: Record<SubjectId, string> = {
  mascot: 'a cute round blob mascot with a little antenna, hopping left and right',
  ball: 'a bouncing ball with decaying bounces across the frame',
  walk: 'a stylized character in a looping walk cycle with a fluttering scarf',
  ui: 'a mobile app interface: cards, list items, a toggle and a button animating in',
  type: 'bold kinetic typography spelling "MOTION" with a Chinese subtitle',
  geo: 'a Bauhaus-like composition of circles, squares and triangles',
  chart: 'an animated data dashboard with growing bars, a line graph and a donut chart',
  logo: 'an original logo reveal: a dot splits into two overlapping rounded squares, the wordmark Lumen rises letter by letter, a tagline and a sparkle',
  portrait: 'a refined flat side-profile portrait illustration, boldly cropped and placed off-center: black bob haircut, a star make-up over the eye, red lips, hoop earring, Breton striped top; on the red wall beside her an arched window casts warm light where her profile shadow and swaying leaf shadows fall; she breathes, blinks and slightly lifts her chin',
  music: 'a music visualizer driven by the actual soundtrack: concentric rings, one per instrument (drums push the outer ring like a speaker cone, the bass ring vibrates like a plucked string, an arpeggio step-sequencer ring, chord and pad glow bands, a melody dot gliding around a 12-note pitch wheel), with Swiss-style labels, live note and chord readouts and a timeline with a melody piano roll',
  weather: 'a weather cycle with soft 3D icons: sunny, a cloud drifts over the sun, rain, lightning, clearing with a rainbow, with a big temperature readout',
  fireworks: 'fireworks over a city skyline at night: shells rise, burst into chrysanthemum, peony, willow and ring shapes, sparks slow down, droop and crackle out',
  loader: 'a button micro-interaction: a pill button is clicked, shrinks into a circle with a progress ring, completes with a check mark and a confetti burst',
  landscape: 'a layered parallax landscape with mountains, hills, trees, sun and birds',
  abstract: 'abstract morphing blob with orbiting dots, rings and waves',
  custom: 'a user-imported custom animated theme built from geometric layers and keyframes',
  voxel: 'a tiny floating voxel island with a blocky character hopping',
  shapes3d: 'a 3D scene of floating geometric primitives: a bouncing sphere, an orbiting ring, a rotating cube, a cone and a torus knot',
  char3d: 'a cute round 3D blob character with a little antenna hopping with squash and stretch',
  text3d: 'bold extruded 3D letters spelling MOTION dropping in one by one',
  product3d: 'a 3D product shot of a wireless earbuds charging case on a turntable: the lid snaps open, the earbuds rise and hover, then return and the lid closes',
  terrain3d: 'a low-poly 3D terrain valley flight at sunset with a sun on the horizon',
};
const SUBJECT_ZH: Record<SubjectId, string> = {
  mascot: '一隻圓滾滾、頭上有觸角的小怪獸左右跳躍',
  ball: '一顆彈跳球，彈跳高度逐次衰減',
  walk: '一個圍著圍巾的角色在原地走路循環',
  ui: '手機 App 介面：卡片、列表、開關、按鈕依序進場',
  type: '粗體動態文字「MOTION」與中文副標',
  geo: '包浩斯式的圓形、方形、三角形構成',
  chart: '數據儀表板：長條生長、折線描繪、圓環圖',
  logo: '原創標誌顯現：圓點分裂成疊印的雙方塊、文字 Lumen 逐字升起、副標與閃光',
  portrait: '精細的側臉扁平人像（大膽裁切、偏左）：黑色鮑伯頭、眼上的星形妝、紅唇、耳環、條紋上衣；旁邊紅牆上拱窗的暖光裡落著她的側臉影子與搖曳的葉影；呼吸、眨眼、微微抬頭',
  music: '跟著配樂演出的分軌星盤：每個樂器一圈（大鼓推動外圈、低音像弦振動、琶音步進音序器、和弦與鋪底光帶、旋律亮點在 12 音名的音高輪上滑動），瑞士風標籤、即時音名與和弦、整首時間軸與旋律捲簾',
  weather: '一次完整的天氣變化：晴、雲遮日、下雨、打雷、放晴出彩虹，旁邊大字溫度',
  fireworks: '城市夜空的煙火：升空、爆開成菊花／牡丹／柳／圓環，火花減速下垂、閃爍熄滅',
  loader: '按鈕微互動：藥丸按鈕被點下、縮成圓形進度環，完成後畫出勾勾並迸出彩粒',
  landscape: '多層視差風景：遠山、丘陵、樹木、太陽與飛鳥',
  abstract: '抽象流動：變形液滴、環繞的點與波浪',
  custom: '使用者匯入的自訂動畫主題（幾何圖層與關鍵影格）',
  voxel: '漂浮的體素小島，方塊角色在上面跳躍',
  shapes3d: '3D 幾何體：彈跳的球、環繞的圓環、旋轉的方塊、錐體與環結',
  char3d: '圓滾滾、頭上有觸角的 3D 小怪獸跳躍，帶擠壓與拉伸',
  text3d: '擠出的立體字母 MOTION 逐字落下',
  product3d: '轉盤上的無線耳機充電盒：蓋子彈開、耳機升起懸浮、再收回闔上',
  terrain3d: '日落時分飛越低多邊形山谷，地平線上有太陽',
};

// 圖像分類 × 動效分類 的搭配親和度
const AFF: Record<VCat, Record<MCat, number>> = {
  retro: { ui: 0.5, classic: 0.5, handmade: 0.8, lines: 0.4, physics: 0.7, type: 0.6, camera: 0.4, fx: 0.8, cam3d: 0.5 },
  mono: { ui: 0.4, classic: 0.7, handmade: 0.8, lines: 0.7, physics: 0.5, type: 0.6, camera: 0.8, fx: 0.5, cam3d: 0.55 },
  cartoon: { ui: 0.4, classic: 0.95, handmade: 0.8, lines: 0.4, physics: 0.8, type: 0.5, camera: 0.5, fx: 0.7, cam3d: 0.55 },
  modern: { ui: 0.95, classic: 0.5, handmade: 0.4, lines: 0.7, physics: 0.7, type: 0.7, camera: 0.5, fx: 0.5, cam3d: 0.5 },
  movement: { ui: 0.5, classic: 0.5, handmade: 0.6, lines: 0.8, physics: 0.6, type: 0.9, camera: 0.6, fx: 0.7, cam3d: 0.5 },
  craft: { ui: 0.4, classic: 0.6, handmade: 0.95, lines: 0.6, physics: 0.7, type: 0.5, camera: 0.6, fx: 0.4, cam3d: 0.6 },
  east: { ui: 0.3, classic: 0.5, handmade: 0.8, lines: 0.8, physics: 0.8, type: 0.5, camera: 0.7, fx: 0.4, cam3d: 0.4 },
  tech: { ui: 0.85, classic: 0.3, handmade: 0.4, lines: 0.85, physics: 0.5, type: 0.8, camera: 0.6, fx: 0.85, cam3d: 0.8 },
  photo: { ui: 0.3, classic: 0.5, handmade: 0.6, lines: 0.4, physics: 0.5, type: 0.5, camera: 0.95, fx: 0.6, cam3d: 0.7 },
  dim3d: { ui: 0.5, classic: 0.7, handmade: 0.6, lines: 0.6, physics: 0.85, type: 0.6, camera: 0.8, fx: 0.5, cam3d: 0.95 },
};

export function fpsText(fps: number) {
  if (!fps) return '60fps 流暢（無步進）';
  const on = Math.round(24 / fps);
  const tag = on <= 1 ? '一拍一' : on === 2 ? '一拍二' : on === 3 ? '一拍三' : `一拍${['', '一', '二', '三', '四', '五', '六'][on] ?? on}`;
  return `${fps}fps（${tag}）`;
}

function related(a: VisualStyle | MotionStyle, b: VisualStyle | MotionStyle) {
  return (a.pairs ?? []).includes(b.id) || (b.pairs ?? []).includes(a.id);
}

export function harmony(v: Sel[], m: Sel[]) {
  const vs = v.map((x) => VISUAL_MAP[x.id]).filter(Boolean);
  const ms = m.map((x) => MOTION_MAP[x.id]).filter(Boolean);
  if (!vs.length || !ms.length) return { score: -1, label: '加入圖像與動效風格後評估', tone: 'idle' as const };
  let sum = 0;
  let n = 0;
  for (const a of vs)
    for (const b of ms) {
      sum += related(a, b) ? 1 : AFF[a.cat][b.cat];
      n++;
    }
  let score = sum / n;
  // 兩個「完整配色」風格混在一起，色彩張力加大
  const palCount = vs.filter((s) => s.look.pal).length;
  if (palCount >= 2) score -= 0.08 * (palCount - 1);
  const fpsList = ms.map((s) => s.move.fps ?? 0).filter((f) => f > 0);
  const uiFluid = ms.some((s) => s.cat === 'ui');
  if (fpsList.length && uiFluid) score -= 0.1;
  // 案例配方是策展過的組合：只要混合裡完整包含某個配方，就視為和諧
  const curated = RECIPES.some((r) => r.v.every(([id]) => v.some((x) => x.id === id)) && r.m.every(([id]) => m.some((x) => x.id === id)));
  if (curated) score = Math.max(score, 0.76);
  const pct = Math.round(Math.max(0, Math.min(1, score)) * 100);
  if (pct >= 72) return { score: pct, label: '和諧統一：風格語言一致，適合正式產出', tone: 'good' as const };
  if (pct >= 50) return { score: pct, label: '有趣張力：有反差但說得通，適合找新鮮感', tone: 'mid' as const };
  return { score: pct, label: '實驗反差：衝突明顯，當成靈感刺激或刻意的違和', tone: 'wild' as const };
}

export function suggestions(v: Sel[], m: Sel[], n = 6) {
  const vs = v.map((x) => VISUAL_MAP[x.id]).filter(Boolean);
  const ms = m.map((x) => MOTION_MAP[x.id]).filter(Boolean);
  const sel = new Set([...v.map((x) => x.id), ...m.map((x) => x.id)]);
  const scoreM = MOTION.filter((s) => !sel.has(s.id)).map((s) => {
    let sc = 0;
    for (const a of vs) sc += (related(a, s) ? 1.2 : 0) + AFF[a.cat][s.cat] * 0.4;
    return { s, sc };
  });
  const scoreV = VISUAL.filter((s) => !sel.has(s.id)).map((s) => {
    let sc = 0;
    for (const b of ms) sc += (related(s, b) ? 1.2 : 0) + AFF[s.cat][b.cat] * 0.4;
    for (const a of vs) if ((a.pairs ?? []).some((id) => (s.pairs ?? []).includes(id))) sc += 0.3;
    return { s, sc };
  });
  const top = <T extends { sc: number }>(arr: T[]) => arr.sort((a, b) => b.sc - a.sc).slice(0, n);
  return { motion: vs.length ? top(scoreM).map((x) => x.s) : [], visual: ms.length ? top(scoreV).map((x) => x.s) : [] };
}

export function mixTitle(v: Sel[], m: Sel[]) {
  const names = [...v.map((x) => VISUAL_MAP[x.id]?.name), ...m.map((x) => MOTION_MAP[x.id]?.name)].filter(Boolean);
  return names.length ? names.join(' × ') : '尚未選擇風格';
}

export interface Brief {
  title: string;
  vs: { s: VisualStyle; w: number }[];
  ms: { s: MotionStyle; w: number }[];
  palette: { role: keyof Palette; name: string; hex: string }[];
  bezier: [number, number, number, number];
  bezierErr: number;
  linear: string;
  linearIO: string;
  path: string;
  easeLabel: string;
  fps: string;
  loopSec: number;
  durMs: number;
  staggerMs: number;
  metrics: { key: string; label: string; v: number }[];
  fx: { id: string; name: string }[];
  render: string[];
  tips: string[];
  durations: string[];
}

const METRICS: [keyof Move, string, number][] = [
  ['squash', '擠壓拉伸', 1],
  ['antic', '預備動作', 1],
  ['over', '過衝回彈', 1],
  ['follow', '跟隨重疊', 1],
  ['exag', '誇張程度', 1],
  ['jitter', '定格抖動', 1],
  ['boil', '線條沸騰', 1],
  ['holds', '停格比例', 1],
  ['stagger', '錯峰延遲', 1],
  ['handheld', '鏡頭晃動', 1],
  ['echo', '殘影', 1],
  ['float', '漂浮', 1],
  ['orbit', '環繞運鏡', 1],
  ['spin', '轉盤旋轉', 1],
  ['dolly', '滑動變焦', 1],
  ['fly', '穿梭飛行', 1],
  ['crane', '升降搖臂', 1],
  ['tumble', '翻滾', 1],
  ['explode', '爆炸拆解', 1],
  ['flip', '翻轉', 1],
  ['levitate', '懸浮', 1],
  ['truck', '橫移', 1],
];

const easeCache = new WeakMap<EaseFn, { p: [number, number, number, number]; err: number; lin: string; linIO: string; path: string }>();

export function makeBrief(v: Sel[], m: Sel[], look: Look, move: Move, subject: SubjectId, tune: Tune): Brief {
  const vs = v.map((x) => ({ s: VISUAL_MAP[x.id], w: x.w })).filter((x) => x.s);
  const ms = m.map((x) => ({ s: MOTION_MAP[x.id], w: x.w })).filter((x) => x.s);
  let ec = easeCache.get(move.ease);
  if (!ec) {
    const fit = fitBezier(move.ease);
    ec = { p: fit.p, err: fit.err, lin: cssLinear(move.ease), linIO: cssLinear(ioOf(move.ease)), path: easePath(move.ease) };
    easeCache.set(move.ease, ec);
  }
  const parts = move.easeParts.length ? move.easeParts.map((p) => `${EASE_INFO[p.id].name}${move.easeParts.length > 1 ? ` ${Math.round(p.w * 100)}%` : ''}`).join(' + ') : '預設 三次 Cubic';
  const sub = SUBJECTS[subject];
  const loopSec = round((sub.loop * tune.loopMul) / Math.max(0.1, move.speed), 2);
  const durMs = Math.round(420 / Math.max(0.3, move.speed));
  const staggerMs = Math.round(20 + move.stagger * 90);
  const tips: string[] = [];
  for (const { s } of [...vs, ...ms]) for (const t of s.tips) if (!tips.includes(t) && tips.length < 12) tips.push(t);
  const render: string[] = [`填色：${FILL_NAME[look.fill] ?? look.fill}`];
  render.push(look.stroke > 0.3 ? `描邊：${round(look.stroke, 1)}px ${STROKE_NAME[look.strokeStyle]}` : '描邊：無');
  if (look.shadow !== 'none') render.push(`陰影：${SHADOW_NAME[look.shadow]}`);
  if (look.glow > 0.05) render.push(`發光：${Math.round(look.glow * 100)}%`);
  if (look.facets >= 3) render.push(`多邊形面數：${look.facets}`);
  if (look.boil + move.boil > 0.05) render.push('線條逐幀沸騰');
  render.push(`字體：${FONTS[look.font].label}${look.upper ? '（全大寫）' : ''}`);
  return {
    title: mixTitle(v, m),
    vs,
    ms,
    palette: PAL_KEYS.map((k) => ({ role: k, name: ROLE_NAME[k], hex: look.pal[k].toUpperCase() })),
    bezier: ec.p,
    bezierErr: ec.err,
    linear: ec.lin,
    linearIO: ec.linIO,
    path: ec.path,
    easeLabel: parts,
    fps: fpsText(move.fps),
    loopSec,
    durMs,
    staggerMs,
    metrics: METRICS.map(([k, label]) => ({ key: k, label, v: Math.max(0, Math.min(1, move[k] as number)) })),
    fx: look.post.map((p) => ({ id: p.fx, name: FX[p.fx]?.name ?? p.fx })),
    render,
    tips,
    durations: ms.map(({ s }) => `${s.name}：${s.dur ?? '—'}`),
  };
}

export function briefMarkdown(b: Brief): string {
  const lines: string[] = [];
  lines.push(`# 風格處方：${b.title}`, '');
  lines.push('## 圖像風格');
  for (const { s, w } of b.vs) lines.push(`- **${s.name}**（${s.en}）${Math.round(w * 100)}%：${s.desc}`);
  if (!b.vs.length) lines.push('- （未選擇）');
  lines.push('', '### 色板');
  for (const p of b.palette) lines.push(`- ${p.name}：\`${p.hex}\``);
  lines.push('', '### 渲染');
  for (const r of b.render) lines.push(`- ${r}`);
  if (b.fx.length) lines.push(`- 後期鏈：${b.fx.map((f) => f.name).join(' → ')}`);
  lines.push('', '## 動效風格');
  for (const { s, w } of b.ms) lines.push(`- **${s.name}**（${s.en}）${Math.round(w * 100)}%：${s.desc}`);
  if (!b.ms.length) lines.push('- （未選擇）');
  lines.push('', '### 節奏');
  lines.push(`- 幀率：${b.fps}`);
  lines.push(`- 主緩動：${b.easeLabel}`);
  lines.push(`- 近似 cubic-bezier(${b.bezier.join(', ')})`);
  lines.push(`- 建議時長：單一動作約 ${b.durMs}ms，錯峰 ${b.staggerMs}ms，循環 ${b.loopSec}s`);
  for (const d of b.durations) lines.push(`- ${d}`);
  lines.push('', '### 動作參數');
  for (const mt of b.metrics.filter((x) => x.v > 0.04)) lines.push(`- ${mt.label}：${Math.round(mt.v * 100)}%`);
  lines.push('', '## 設計要點');
  for (const t of b.tips) lines.push(`- ${t}`);
  lines.push('', '— 由「動效設計風格混合器」產生');
  return lines.join('\n');
}

export function aiPrompts(b: Brief, subject: SubjectId, aspect: string, look: Look, move: Move) {
  const byWeight = <T extends { w: number }>(l: T[]) => [...l].sort((x, y) => y.w - x.w);
  const vk = byWeight(b.vs).map(({ s }) => s.kw);
  const mk = byWeight(b.ms).map(({ s }) => s.kw);
  const MONO = ['bw', 'noir', 'onebit', 'manga', 'silentfilm', 'inkline', 'charcoal', 'xerox'];
  const mono = b.vs.some(({ s, w }) => MONO.includes(s.id) && w >= 0.6);
  const colors = [look.pal.p, look.pal.s, look.pal.a, look.pal.bg].map((c) => c.toUpperCase()).join(', ');
  const fpsEn = move.fps ? `${move.fps} fps, choppy frame-by-frame timing` : 'smooth 60 fps';
  const imageEn = [SUBJECT_EN[subject], ...vk, mono ? 'monochrome' : `color palette ${colors}`, 'clean composition, high detail'].join(', ') + ` --ar ${aspect}`;
  const videoEn = `${SUBJECT_EN[subject]}. Visual style: ${vk.join('; ') || 'clean modern flat illustration'}. Motion: ${mk.join('; ') || 'smooth natural easing'}. Timing: ${fpsEn}, ${b.loopSec}s seamless loop.${mono ? ' Monochrome.' : ` Palette ${colors}.`}`;
  const vz = byWeight(b.vs).map(({ s }) => `${s.name}（${s.desc.replace(/。$/, '')}）`);
  const mz = byWeight(b.ms).map(({ s }) => `${s.name}（${s.desc.replace(/。$/, '')}）`);
  const imageZh = `${SUBJECT_ZH[subject]}。畫面風格：${vz.join('、') || '乾淨的現代扁平插畫'}。${mono ? '整體為單色。' : `主要配色 ${colors}，`}構圖乾淨、細節清楚，比例 ${aspect}。`;
  const videoZh = `${SUBJECT_ZH[subject]}。畫面風格：${vz.join('、') || '乾淨的現代扁平插畫'}。動作風格：${mz.join('、') || '自然流暢的緩動'}。節奏：${b.fps}，${b.loopSec} 秒無縫循環。`;
  const neg = ['blurry', 'watermark', 'text artifacts', 'extra limbs', 'deformed', 'low quality'];
  if (b.vs.some(({ s }) => s.cat === 'retro')) neg.push('anti-aliasing', 'smooth gradients');
  if (mono) neg.push('color');
  if (!b.vs.some(({ s }) => s.cat === 'photo')) neg.push('photorealistic');
  if (move.fps) neg.push('motion blur');
  return { imageEn, imageZh, videoEn, videoZh, negative: neg.join(', ') };
}

export function cssCode(b: Brief, move: Move): string {
  const lines: string[] = [];
  lines.push(`/* Style Fusion · ${b.title} */`);
  lines.push(':root {');
  lines.push(`  /* 精確曲線（含回彈）：CSS linear()，Chrome 113+ / Safari 17.2+ / Firefox 112+ */`);
  lines.push(`  --sf-ease: ${b.linear};`);
  lines.push(`  --sf-ease-in-out: ${b.linearIO};`);
  lines.push(`  /* 近似值（舊瀏覽器後備，誤差 ${round(b.bezierErr, 3)}） */`);
  lines.push(`  --sf-ease-approx: cubic-bezier(${b.bezier.join(', ')});`);
  lines.push(`  --sf-duration: ${b.durMs}ms;`);
  lines.push(`  --sf-stagger: ${b.staggerMs}ms;`);
  lines.push('}', '');
  lines.push('.sf-enter {');
  lines.push('  animation: sf-enter var(--sf-duration) var(--sf-ease-approx) both;');
  lines.push('  animation-timing-function: var(--sf-ease);');
  lines.push('  animation-delay: calc(var(--i, 0) * var(--sf-stagger));');
  lines.push('}');
  lines.push('@keyframes sf-enter {');
  lines.push('  from { opacity: 0; transform: translateY(24px) scale(0.96); }');
  lines.push('  to { opacity: 1; transform: none; }');
  lines.push('}');
  if (move.squash > 0.2 || move.antic > 0.3) {
    const a = round(1 - 0.25 * move.antic, 2);
    const s = round(1 + 0.3 * move.squash, 2);
    lines.push('', '/* 預備 → 拉伸 → 落地擠壓（錨點在底部） */');
    lines.push('.sf-hop { transform-origin: 50% 100%; animation: sf-hop calc(var(--sf-duration) * 3) var(--sf-ease) infinite; }');
    lines.push('@keyframes sf-hop {');
    lines.push(`  0%, 100% { transform: translateY(0) scale(1, 1); }`);
    lines.push(`  18% { transform: translateY(0) scale(${round(2 - a, 2)}, ${a}); }`);
    lines.push(`  45% { transform: translateY(-110px) scale(${round(1 / s, 2)}, ${s}); }`);
    lines.push(`  72% { transform: translateY(0) scale(${round(2 - a * 0.95, 2)}, ${round(a * 0.95, 2)}); }`);
    lines.push(`  85% { transform: translateY(0) scale(0.97, 1.03); }`);
    lines.push('}');
  }
  if (move.fps > 0) {
    const steps = Math.max(2, Math.round((move.fps * b.durMs * 3) / 1000));
    lines.push('', `/* 定格感：把連續動畫切成 ${move.fps}fps */`);
    lines.push(`.sf-steps { animation-timing-function: steps(${steps}, end) !important; }`);
  }
  if (move.jitter > 0.1) {
    lines.push('', '/* 定格抖動 */');
    lines.push('.sf-jitter { animation: sf-jitter 0.5s steps(6) infinite; }');
    lines.push('@keyframes sf-jitter {');
    const pts = ['0% { translate: 0 0; rotate: 0deg; }', '17% { translate: 1px -1px; rotate: 0.4deg; }', '33% { translate: -1px 1px; rotate: -0.3deg; }', '50% { translate: 1px 1px; rotate: 0.2deg; }', '67% { translate: -1px 0; rotate: -0.4deg; }', '83% { translate: 0 -1px; rotate: 0.3deg; }'];
    for (const p of pts) lines.push(`  ${p}`);
    lines.push('}');
  }
  if (move.float > 0.2) {
    lines.push('', '/* 漂浮 */');
    lines.push('.sf-float { animation: sf-float 3s ease-in-out infinite alternate; }');
    lines.push('@keyframes sf-float { from { translate: 0 -6px; rotate: -2deg; } to { translate: 0 6px; rotate: 2deg; } }');
  }
  lines.push('', '@media (prefers-reduced-motion: reduce) {', '  .sf-enter, .sf-hop, .sf-jitter, .sf-float { animation: none; }', '}');
  return lines.join('\n');
}

export function gsapCode(b: Brief, move: Move): string {
  const L: string[] = [];
  L.push('import gsap from "gsap";');
  L.push('import { CustomEase } from "gsap/CustomEase";');
  L.push('gsap.registerPlugin(CustomEase);');
  L.push('');
  L.push(`// ${b.title}`);
  L.push(`CustomEase.create("fusion", "${b.path}");`);
  L.push('');
  L.push('// 進場：錯峰');
  L.push(`gsap.from(".item", { y: 24, opacity: 0, scale: 0.96, duration: ${round(b.durMs / 1000, 2)}, ease: "fusion", stagger: ${round(b.staggerMs / 1000, 3)} });`);
  L.push('');
  L.push('// 角色：預備 → 起跳 → 落地擠壓');
  L.push('gsap.timeline({ repeat: -1, repeatDelay: 0.3, defaults: { transformOrigin: "50% 100%" } })');
  L.push(`  .to(".hero", { scaleY: ${round(1 - 0.25 * move.antic, 2)}, scaleX: ${round(1 + 0.2 * move.antic, 2)}, duration: 0.18, ease: "power2.out" })`);
  L.push(`  .to(".hero", { y: -120, scaleY: ${round(1 + 0.3 * move.squash, 2)}, scaleX: ${round(1 - 0.18 * move.squash, 2)}, duration: 0.32, ease: "fusion" })`);
  L.push('  .to(".hero", { y: 0, scaleY: 1, scaleX: 1, duration: 0.3, ease: "power2.in" })');
  L.push(`  .to(".hero", { scaleY: ${round(1 - 0.3 * move.squash, 2)}, scaleX: ${round(1 + 0.25 * move.squash, 2)}, duration: 0.08, ease: "power1.out" })`);
  L.push(`  .to(".hero", { scaleY: 1, scaleX: 1, duration: ${round(0.25 + move.over * 0.4, 2)}, ease: "${move.over > 0.3 ? 'elastic.out(1, 0.4)' : 'back.out(1.6)'}" });`);
  if (move.fps > 0) {
    L.push('');
    L.push(`// 全域幀率步進（定格／有限動畫感）`);
    L.push(`gsap.ticker.fps(${move.fps});`);
  }
  if (move.jitter > 0.1) {
    L.push('');
    L.push('// 每幀隨機微移');
    L.push('gsap.to(".hero", { x: "random(-2, 2)", y: "random(-2, 2)", rotation: "random(-1, 1)", duration: 1 / 12, repeat: -1, repeatRefresh: true, ease: "none" });');
  }
  if (move.float > 0.2) {
    L.push('');
    L.push('gsap.to(".hero", { y: "+=12", rotation: 3, duration: 1.6, yoyo: true, repeat: -1, ease: "sine.inOut" });');
  }
  return L.join('\n');
}

export function aeCode(b: Brief, move: Move): string {
  const L: string[] = [];
  L.push(`// ===== Style Fusion · ${b.title} =====`);
  L.push(`// 幀率：${b.fps}　主緩動：${b.easeLabel}`);
  L.push(`// Graph Editor 參考：cubic-bezier(${b.bezier.join(', ')})`);
  if (move.fps > 0) {
    L.push('', '// 【全域】在需要定格感的屬性前加：');
    L.push(`posterizeTime(${move.fps});`);
  }
  for (const { s } of b.ms) {
    if (!s.ae) continue;
    L.push('', `// ───── ${s.name} ─────`);
    L.push(s.ae);
  }
  if (!b.ms.length) L.push('', '// 尚未選擇動效風格');
  return L.join('\n');
}

export function jsonCode(v: Sel[], m: Sel[], subject: SubjectId, tune: Tune, look: Look, move: Move, sound?: SoundSpec | null): string {
  const out = {
    readme: '給 AI Agent／程式使用的機器可讀規格：描述一段動畫的圖像風格、動作風格、色板、節奏與（選配的）聲音。人類要閱讀請看「處方」分頁；要直接貼進專案請用 CSS／GSAP／AE 分頁。',
    tool: 'Style Fusion 動效風格混合器',
    visual: v,
    motion: m,
    subject,
    tune,
    resolved: {
      palette: look.pal,
      fill: look.fill,
      stroke: { width: round(look.stroke, 2), style: look.strokeStyle },
      shadow: look.shadow,
      ...(is3D(subject) ? { render3d: { material: look.mat3d, lighting: look.light3d, geometry: look.geo3d } } : {}),
      postFx: look.post.map((p) => ({ fx: p.fx, ...Object.fromEntries(Object.entries(p.p).map(([k, val]) => [k, round(val, 4)])) })),
      motion: {
        fps: move.fps,
        ease: move.easeParts,
        squash: round(move.squash, 3),
        anticipation: round(move.antic, 3),
        overshoot: round(move.over, 3),
        followThrough: round(move.follow, 3),
        jitter: round(move.jitter, 3),
        speed: round(move.speed, 3),
        ...(is3D(subject)
          ? { camera3d: { orbit: round(move.orbit, 3), spin: round(move.spin, 3), dolly: round(move.dolly, 3), fly: round(move.fly, 3), crane: round(move.crane, 3), tumble: round(move.tumble, 3), explode: round(move.explode, 3), flip: round(move.flip, 3), levitate: round(move.levitate, 3), truck: round(move.truck, 3) } }
          : {}),
      },
    },
    ...(sound ? { sound } : {}),
  };
  return JSON.stringify(out, null, 2);
}

// ---------- 給 Claude 的「做動畫」提示詞 ----------
export interface SoundSpec {
  title: string;
  genre: string;
  scheme: string;
  pack: string | null;
  bpm: number;
  key: string;
  /** 動畫循環內的音效提示點（秒） */
  cues: { t: number; kind: string }[];
}

const ROLE_EN: Record<keyof Palette, string> = {
  bg: 'background',
  bg2: 'background 2 (gradient end)',
  ink: 'ink / lines / text',
  light: 'highlight',
  card: 'card surface',
  p: 'primary',
  s: 'secondary',
  a: 'accent',
  q: 'nature',
  r: 'earth',
};

function threeDSettings(look: Look, move: Move): [string, string] {
  const cam: string[] = [];
  const camZh: string[] = [];
  const add = (k: keyof Move, zh: string, en: string) => {
    const v = move[k] as number;
    if (v > 0.05) {
      camZh.push(`${zh} ${Math.round(Math.min(1, v) * 100)}%`);
      cam.push(`${en} ${Math.round(Math.min(1, v) * 100)}%`);
    }
  };
  add('orbit', '環繞運鏡', 'orbit');
  add('spin', '轉盤旋轉', 'turntable spin');
  add('dolly', '滑動變焦', 'dolly zoom');
  add('fly', '穿梭飛行', 'fly-through');
  add('crane', '升降搖臂', 'crane');
  add('tumble', '翻滾', 'tumble');
  add('explode', '爆炸拆解', 'exploded view');
  add('flip', '翻轉', 'flip');
  add('levitate', '懸浮', 'levitate');
  add('truck', '橫移', 'truck');
  const zh = `3D 設定：${look.mat3d === 'auto' ? '材質依填色模式' : `材質 ${look.mat3d}`}、燈光 ${look.light3d}、幾何 ${look.geo3d === 'lowpoly' ? '低多邊形（平面著色）' : '平滑'}；鏡頭：${camZh.join('、') || '固定機位'}。`;
  const en = `3D setup: ${look.mat3d === 'auto' ? 'material follows the fill mode' : `material "${look.mat3d}"`}, lighting "${look.light3d}", geometry ${look.geo3d === 'lowpoly' ? 'low-poly (flat shaded)' : 'smooth'}; camera: ${cam.join(', ') || 'static'}.`;
  return [zh, en];
}

// 「怎麼用程式做出這個質感」的提示：填色模式與後期特效各一句，中文／英文各一份，讓 Claude 把風格套到任何內容上
const FILL_HOW: Record<string, [string, string]> = {
  flat: ['純色塊，不要漸層與陰影', 'solid color blocks, no gradients or shading'],
  gradient: ['色塊內用線性漸層', 'linear gradients inside shapes'],
  soft: ['柔和的體積光漸層', 'soft volumetric gradients'],
  cel: ['賽璐璐式：亮部與暗部兩階色塊，邊界銳利', 'cel shading: two hard-edged tone bands'],
  dots: ['暗部用網點（CSS radial-gradient 重複排列，或 SVG pattern）表現，不用平滑漸層', 'shade with halftone dots (repeating CSS radial-gradient or SVG pattern), not smooth gradients'],
  hatch: ['暗部用平行排線（repeating-linear-gradient）表現', 'shade with parallel hatching lines (repeating-linear-gradient)'],
  line: ['只有線稿，內部留白', 'line art only, empty fills'],
  none: ['只描邊、不填色', 'outline only, no fill'],
  glass: ['半透明毛玻璃（backdrop-filter: blur＋細亮邊）', 'translucent frosted glass (backdrop-filter blur + thin bright edge)'],
  neu: ['新擬態：同色底，左上亮影、右下暗影的浮雕', 'neumorphism: same-color surface, light top-left and dark bottom-right shadows'],
  chrome: ['鉻金屬：高對比的天空／地平線反射漸層', 'chrome: high-contrast sky/horizon reflection gradient'],
  iridescent: ['虹彩：隨角度或時間流動的彩虹漸層', 'iridescent shifting rainbow gradient'],
  gloss: ['光澤：頂部一條高光反射', 'glossy highlight reflection along the top'],
  inflate: ['充氣：中心亮、邊緣暗的鼓起感', 'inflated look: bright center, darker edges'],
  clay: ['黏土：微粗糙的啞光質感與指紋般的不均勻', 'clay: matte surface with slight fingerprint-like unevenness'],
  crayon: ['蠟筆：不均勻的塗抹與紙紋透出', 'crayon: uneven scribbled fill with paper texture showing through'],
  marker: ['麥克筆：半透明、筆觸有重疊深色', 'marker: translucent strokes, darker where they overlap'],
  wash: ['水墨／水彩：半透明暈染、邊緣較深', 'ink/watercolor wash: translucent, darker edges'],
  jianzhi: ['剪紙：色塊上鏤空花紋', 'paper-cut: decorative cut-outs in solid shapes'],
  puppet: ['皮影：半透明色塊與鏤空', 'shadow puppet: translucent shapes with cut-outs'],
  silhouette: ['全黑剪影', 'solid black silhouettes'],
  offset: ['套色錯位：填色相對輪廓偏移幾像素', 'misregistered fills offset a few px from the outline'],
  paper: ['紙片：淡淡的纖維紋理、微微的斜向光影與紙影', 'paper pieces: faint fiber texture, subtle diagonal light, paper shadow'],
  sticky: ['便利貼：頂端深一階的黏條、下緣微捲陰影、右下角翹起', 'sticky notes: darker adhesive strip on top, curled bottom shadow, lifted corner'],
};
const FX_HOW: Record<string, [string, string]> = {
  pixelate: ['像素化：Canvas 縮小再以 image-rendering: pixelated 放大', 'pixelate: draw small, scale up with image-rendering: pixelated'],
  quantize: ['色板量化：把顏色對應到上面的固定色板（Canvas 後處理，或直接只用這些顏色繪製）', 'palette quantize: map colors to the fixed palette above (canvas post-process, or simply draw using only those colors)'],
  posterize: ['色調分離：減少色階（SVG feComponentTransfer 的 discrete，或直接用有限色階繪製）', 'posterize: reduce tonal levels (SVG feComponentTransfer discrete, or draw with limited tones)'],
  halftone: ['半色調網點：用 radial-gradient 或 SVG pattern 疊一層網點', 'halftone: overlay a dot pattern via radial-gradient or SVG pattern'],
  hatching: ['交叉排線：repeating-linear-gradient 疊兩個方向', 'cross-hatching: stack two repeating-linear-gradients'],
  engrave: ['雕刻線：沿形狀的細密平行線', 'engraving: fine parallel lines'],
  grain: ['顆粒：SVG feTurbulence 或半透明噪點圖疊在最上層', 'grain: SVG feTurbulence or a translucent noise overlay on top'],
  paper: ['紙張紋理：淡淡的纖維噪點疊在背景與畫面上', 'paper texture: faint fiber noise over background and content'],
  vignette: ['暗角：邊緣的徑向漸層暗化', 'vignette: radial gradient darkening at the edges'],
  bloom: ['泛光：亮部的 CSS filter: blur 疊加（mix-blend-mode: screen）', 'bloom: blurred copy of highlights blended with screen'],
  blur: ['柔焦：CSS filter: blur', 'soft focus: CSS filter blur'],
  tiltshift: ['移軸微縮：上下兩端模糊、中間清晰的遮罩', 'tilt-shift: blur top and bottom, sharp in the middle'],
  mblur: ['動態模糊：沿運動方向的殘影或方向性模糊', 'motion blur: directional smear/trail along movement'],
  chroma: ['色差：紅藍通道錯位幾像素（文字用 text-shadow 的紅藍偏移）', 'chromatic aberration: offset red/blue channels a few px (text-shadow red/blue offsets for text)'],
  glitch: ['故障：水平切片錯位、RGB 分離，偶爾閃現', 'glitch: horizontal slice displacement and RGB split, occasionally'],
  vhs: ['VHS：掃描線、色彩暈染、底部雜訊帶、畫面抖動', 'VHS: scanlines, color bleed, bottom noise band, jitter'],
  scanlines: ['掃描線：repeating-linear-gradient 的細橫線', 'scanlines: thin horizontal repeating-linear-gradient'],
  crt: ['CRT：掃描線、輕微彎曲與暗角、微弱螢光發光', 'CRT: scanlines, slight curvature and vignette, faint phosphor glow'],
  film: ['膠片：顆粒、輕微閃爍、垂直刮痕與灰塵', 'film: grain, slight flicker, vertical scratches and dust'],
  riso: ['孔版雙色：兩色油墨疊印、套色偏移、顆粒', 'risograph: two-ink overprint with misregistration and grain'],
  watercolor: ['水彩：邊緣暈染與顆粒', 'watercolor: bleeding edges and pigment granulation'],
  kuwahara: ['油畫筆觸：區塊式的平滑色塊', 'oil-paint look: smoothed painterly blocks'],
  edges: ['邊緣偵測：只保留輪廓線', 'edge detection: keep only outlines'],
  grayscale: ['灰階：CSS filter: grayscale', 'grayscale: CSS filter'],
  threshold: ['二值化：只有黑與白（高對比）', 'threshold: pure black and white'],
  invert: ['反相：CSS filter: invert', 'invert: CSS filter'],
  gradmap: ['漸變映射：依亮度映射到一組漸層色', 'gradient map: map luminance onto a color ramp'],
  holo: ['全息：虹彩色偏與細掃描線', 'holographic: iridescent tint with fine scanlines'],
  dots: ['點彩：畫面由彩色小圓點組成', 'pointillism: image built from colored dots'],
  led: ['LED 點陣：規則排列的發光圓點', 'LED matrix: regular grid of glowing dots'],
  bevel: ['方塊浮雕：每個格子有亮邊與暗邊', 'bevel blocks: lit and shaded edges on each cell'],
  studs: ['積木凸點：每個格子上一個圓形凸點', 'toy-brick studs: a round stud on each cell'],
  knit: ['毛線編織紋理', 'knitted yarn texture'],
  stitch: ['十字繡：X 形針腳組成的像素', 'cross-stitch: pixels made of X stitches'],
  ascii: ['ASCII 字符畫：用字元表現明暗', 'ASCII art: characters for brightness'],
  wave: ['波動扭曲：正弦位移', 'wave distortion: sinusoidal displacement'],
  kaleido: ['萬花筒：鏡像對稱重複', 'kaleidoscope: mirrored symmetric repetition'],
  voronoi: ['泰森多邊形：細胞狀色塊', 'voronoi: cell-like color patches'],
  tri: ['三角面：低多邊形色塊', 'low-poly triangulated patches'],
};

const PROMPT_SFX_USE_ZH = '元素彈出／出現＝pop 或 jump；區塊切換、快速移動＝whoosh；按鈕與點擊＝click；重要內容揭曉＝sparkle 或 ping；重物落定＝land；通知＝notify；翻頁或翻面＝flip';
const PROMPT_SFX_USE_EN = 'element pops in = pop or jump; section transitions and fast moves = whoosh; buttons/clicks = click; key reveal = sparkle or ping; heavy settle = land; notification = notify; page/card flip = flip';

/** 給 Claude 的「風格套用」提示詞，中英文各一份。
 *  設計原則：① 使用者只貼這一份提示詞，後面只回覆「確認」或修改意見，所以規格要全程記住、不能依賴補充說明；
 *  ② 分兩階段，中間有「使用者確認審美」的關卡：階段一做完靜態分鏡就停下來，確認後才做動效；
 *  ③ 目的是把風格套到使用者的新專案，不是重現示範動畫。 */
export function claudePrompts(b: Brief, subject: SubjectId, look: Look, move: Move, sound: SoundSpec | null): { zh: string; en: string } {
  const byW = <T extends { w: number }>(l: T[]) => [...l].sort((x, y) => y.w - x.w);
  const vs = byW(b.vs);
  const ms = byW(b.ms);
  const mono = look.pal.p.toLowerCase() === look.pal.ink.toLowerCase();
  const camMoves = (['orbit', 'spin', 'dolly', 'fly', 'crane', 'tumble', 'explode', 'flip', 'levitate', 'truck'] as const).some((k) => (move[k] as number) > 0.05);
  const three = is3D(subject) || vs.some(({ s }) => s.cat === 'dim3d') || camMoves;
  const [td3zh, td3en] = three ? threeDSettings(look, move) : ['', ''];
  const mm = b.metrics.filter((x) => x.v > 0.04);
  const L: string[] = [];
  const E: string[] = [];

  // ===== 中文 =====
  L.push('# 任務');
  L.push('我只會發送這一份提示詞，之後的對話裡我只會回覆「確認」或給你修改意見，不會再貼規格，所以請全程記住下面的風格規格與流程。');
  L.push('請依下面的「風格規格」，為「專案內容」製作一個 HTML 動畫作品。工作分兩個階段，中間有一道「我確認審美」的關卡：');
  L.push('- 階段一：做靜態分鏡，把審美定下來。做完、自檢通過後，**停下來等我確認**，這一次回覆不要做任何動效。');
  L.push('- 階段二：等我回覆「確認」之後，才在確認過的分鏡上加動效。如果我給了修改意見，就先改分鏡、再交給我確認一次。');
  L.push('風格規格要嚴格遵守，不要自行改成別的風格。專案內容沒寫清楚的地方，不要先問我——自己做合理的假設、照樣開始做，並在階段一的回覆最後列出假設，讓我在確認時一併修正（內容事實不確定的地方標註「待確認」，不要編造）。', '');
  L.push('# 專案內容（發送前請先填寫）');
  L.push('- 要做什麼（主題與內容）：');
  L.push('- 用途與載體（網頁、簡報、影片素材…）：');
  L.push('- 篇幅或時長：');
  L.push('- 必須出現的文字與資料：', '');
  L.push('# 風格規格');
  L.push('## A. 圖像風格（階段一用）');
  for (const { s, w } of vs) L.push(`- ${s.name}（${s.en}）${Math.round(w * 100)}%：${s.desc} 關鍵詞：${s.kw}`);
  if (!vs.length) L.push('- 乾淨的現代扁平插畫');
  L.push('', '### 色板（只使用這些色碼，不要加入其他顏色）');
  for (const p of b.palette) L.push(`- ${p.name}：${p.hex}`);
  L.push('- 用法：背景色與背景 2 做底；線條／文字色寫字與描邊；主色、輔色、點綴色分配給不同層級的元素（標題、重點、圖形、按鈕…）；高光與卡片色用在亮面。文字與底色的對比約 4.5:1 以上。');
  L.push('', '### 渲染細節');
  for (const r of b.render) L.push(`- ${r}`);
  const fillHow = FILL_HOW[look.fill];
  if (fillHow) L.push(`- 填色做法：${fillHow[0]}`);
  if (b.fx.length) {
    L.push(`- 後期處理（依序）：${b.fx.map((f) => f.name).join(' → ')}`);
    for (const f of look.post) if (FX_HOW[f.fx]) L.push(`  - ${FX_HOW[f.fx][0]}${f.p.amt !== undefined && f.p.amt < 0.99 ? `（強度約 ${Math.round(f.p.amt * 100)}%）` : ''}`);
    L.push('  - 這些是「質感」要求：用 CSS／SVG 濾鏡、Canvas 或著色器做最接近的版本即可，不要為了還原細節犧牲文字的可讀性與效能。');
  }
  if (mono) L.push('- 整體為單色／近單色，不要加入別的顏色。');
  if (td3zh) {
    L.push(`- ${td3zh}`);
    L.push('  - 如果專案適合 3D（Three.js），就用這組材質、燈光與鏡頭；如果用 2D 呈現，鏡頭語言改用視差、縮放與平移來近似。');
  }
  if (b.tips.length) {
    L.push('', '### 設計要點');
    for (const t of b.tips) L.push(`- ${t}`);
  }
  L.push('', '## B. 動作風格（階段二用）');
  for (const { s, w } of ms) L.push(`- ${s.name}（${s.en}）${Math.round(w * 100)}%：${s.desc} 關鍵詞：${s.kw}`);
  if (!ms.length) L.push('- 自然流暢的緩動');
  L.push('', '### 節奏與緩動');
  L.push(`- 幀率感：${b.fps}${move.fps ? '（動作要真的是階梯式更新，不要補成平滑）' : ''}`);
  L.push(`- 主緩動：${b.easeLabel}`);
  L.push(`- 近似 CSS：cubic-bezier(${b.bezier.join(', ')})；要精確還原曲線（含回彈）請在 JavaScript 裡把緩動寫成函數`);
  L.push(`- 單一動作約 ${b.durMs}ms，同時進場的元素之間錯峰 ${b.staggerMs}ms`);
  if (mm.length) {
    L.push('', '### 動作參數（越高越明顯）');
    for (const x of mm) L.push(`- ${x.label}：${Math.round(x.v * 100)}%`);
  }
  if (sound) {
    L.push('', '## C. 聲音風格（階段二用；選配：用 Web Audio 即時合成，不使用外部音檔）');
    L.push(`- 配樂：${sound.genre}，約 ${sound.bpm} BPM，${sound.key} 調，聲音質感參考「${sound.scheme}」。配樂可以自然循環，不必和動畫長度對齊；音量柔和，不蓋過內容。`);
    if (sound.pack) L.push(`- 動作音效：${sound.pack} 風格。依互動配對：${PROMPT_SFX_USE_ZH}。音效要少而準，不要每個元素都響。`);
    L.push('- 預設靜音，提供一個明顯的聲音開關，使用者點擊後才開啟（瀏覽器的自動播放限制）。');
  }
  L.push('', '# 工作流程（依序做完，不要跳步）');
  L.push('## 階段一：分鏡（先把審美定下來；這個階段不要加任何動畫，做完要停下來等我確認）');
  L.push('1. 風格詮釋：用 3 到 5 行寫出這個風格的「視覺規則」（例如：哪些地方用網點、線條一律多粗、每個色碼各自負責什麼），之後每個分鏡都照這組規則。');
  L.push('2. 版面系統：定一套所有分鏡共用的版面——邊距、欄位網格、標題位置、頁碼或進度元素、裝飾元素的語彙——寫成 CSS 變數。分鏡之間變化的是內容與構圖，不是版面系統。');
  L.push('3. 分鏡清單：把內容拆成 4 到 10 個分鏡（開場、各段內容、收尾）。每個分鏡寫清楚：目的（一句話）、唯一的視覺焦點、構圖（區塊與大致比例）、主視覺（用 SVG／CSS 生成的圖形是什麼）、文案（標題加最多 2 行說明）、色彩分配。');
  L.push('4. 製作靜態分鏡：每個分鏡都用 HTML／CSS／SVG 做成「完成狀態」的靜態畫面（16:9 畫板），此時沒有任何動作。');
  L.push('5. 審美自檢：逐幀對照下面的「審美底線」，從 1 到 5 分替每一幀的「層級、對齊與留白、色彩比例、風格忠實度、主視覺品質」打分；任何一項低於 4 分，就寫出問題並修改，改到每一幀每一項都 ≥ 4 才能交給我。回覆中用簡短的表格記錄「問題 → 怎麼改」。');
  L.push('6. 交給我確認：輸出靜態分鏡的完整 HTML，並在回覆最後列出假設，然後**停下來**，請我確認審美（或給修改意見）。不要在同一次回覆裡繼續做階段二。');
  L.push('## 階段二：動效（收到我的「確認」之後才做）');
  L.push('7. 動效腳本：為每個分鏡定義進場（哪些元素、什麼順序、錯峰多少）、停留（強調或微動）、退場與轉場到下一個分鏡；全部依「B. 動作風格」的緩動、時長、錯峰與參數。每個元素的動作都要有這個風格的味道，不要只換顏色、動作卻是預設的淡入淡出。');
  L.push('8. 實作：直接在我確認過的靜態結構上加動作。不得更動版面、配色與文案；如果某個動作需要改版面，就回到階段一修好再繼續。');
  if (sound) L.push('9. 聲音：依「C. 聲音風格」加入配樂與音效，音效只配在關鍵動作上。');
  L.push('', '# 審美底線（每個分鏡都要符合；風格的特色在此之上，不能拿風格當藉口犧牲這些）');
  L.push('- 單一焦點：每個分鏡只有一個最大、最醒目的元素，視線要有明確的起點與順序。層級至少三級（標題、重點、輔助），標題字級約為內文的 2 倍以上。');
  L.push('- 對齊與網格：所有元素沿同一組網格與基準線對齊；間距用固定的級距（例如 8px 的倍數）；邊距不小於畫面寬度的 5%。');
  L.push('- 留白與呼吸：就算風格偏滿（拼貼、波普），也要留出一塊安靜的區域讓視線休息；不要把整個畫面塞滿同樣大小的東西。');
  L.push('- 色彩比例：約 60% 底色、30% 主要色、10% 點綴色；點綴色只用在焦點。不要把每個色碼平均地用在每個地方。');
  L.push('- 字體：最多兩種字型（標題與內文）；標題要短、有力、不換行亂斷；中文行距約 1.5，行長不超過約 30 個字。');
  L.push('- 主視覺：每個分鏡都要有一個與內容相關的主視覺圖形，用 SVG／CSS 自己畫出來；全部分鏡共用同一套圖形語言（線條粗細、圓角、陰影方式一致）。不要只用「文字加方塊」，也不要用 emoji 當圖示。');
  L.push('- 風格忠實度：風格規格裡的每一項（網點、線條粗細、填色方式、後期質感）都要在畫面上看得出來，而不是只換了顏色。');
  L.push('- 避免常見的「AI 味」：不要預設的紫藍漸層、不要一排大小相同的圓角卡片加陰影、不要置中對齊一長串內容、不要使用 Lorem ipsum 或空洞的口號。');
  L.push('', '# 交付物');
  L.push('- 階段一的回覆順序：① 設計（風格詮釋、版面系統、分鏡清單，精簡即可）；② 審美自檢紀錄表；③ 靜態分鏡的完整單一 HTML 程式碼區塊（CSS 與 JavaScript 內嵌，可直接用瀏覽器開啟，把所有分鏡的完成狀態排成網格，方便我逐幀看審美）；④ 假設清單；⑤ 一句話請我確認或給修改意見。');
  L.push('- 階段二的回覆：一個完整的單一 HTML 程式碼區塊（專案另有技術要求時以專案為準），並簡述每個分鏡的動效腳本。');
  L.push(`- 圖形、圖示、背景紋理用程式生成（CSS／SVG／Canvas${three ? '，3D 用 Three.js' : ''}），不依賴外部圖片。`);
  L.push('- 階段二的 HTML 提供兩種檢視：「動畫」（預設，自動播放，可用方向鍵或點擊切換分鏡、空白鍵暫停）與「分鏡板」（按 G 或按鈕切換，就是我確認過的那些靜態分鏡）。');
  L.push('- 版面在手機到桌機都清楚好讀；尊重 prefers-reduced-motion（降低或關閉動態）。');
  L.push('', '# 驗收清單（每個階段輸出前請自己逐項檢查，不符合就修正後再輸出）');
  L.push('階段一：');
  L.push('1. 每個分鏡都通過「審美底線」，自檢表裡沒有低於 4 分的項目。');
  L.push('2. 只用了色板顏色；填色、描邊、陰影、字體與風格描述一致，辨識得出是這個風格。');
  L.push('3. 文字清楚好讀（對比、字級、行長）；事實與文案正確，不確定的資料已標註「待確認」；已列出假設；沒有任何動效。');
  L.push('階段二：');
  L.push('4. 版面、配色與文案和我確認過的分鏡完全一致。');
  L.push('5. 動作的緩動、時長、錯峰與參數符合描述，轉場也有這個風格的味道。');
  L.push(`6. ${sound ? '聲音預設靜音且開關可用；' : ''}「分鏡板」檢視可用；沒有外部圖片或網路請求${three ? '（Three.js 除外）' : ''}。`);

  // ===== English =====
  E.push('# Task');
  E.push('I will send only this one prompt. In the rest of the conversation I will reply only with "confirmed" or with revision notes and will not paste the spec again, so keep the style specification and workflow below in mind throughout.');
  E.push('Using the style specification below, build an HTML animated piece for the project brief. Work in two phases with a checkpoint where I confirm the aesthetics:');
  E.push('- Phase 1: build static storyboard frames and lock the aesthetics. When they are done and pass self-review, **stop and wait for my confirmation**; add no motion in this reply.');
  E.push('- Phase 2: only after I reply "confirmed", add the motion onto the confirmed frames. If I give revision notes, revise the frames first and hand them to me for confirmation again.');
  E.push('Follow the style strictly; do not substitute another one. Where the project brief is incomplete, do not ask me first — make reasonable assumptions, start working anyway, and list the assumptions at the end of the Phase 1 reply so I can correct them when I confirm (flag uncertain facts as "to be confirmed"; never fabricate).', '');
  E.push('# Project brief (fill in before sending)');
  E.push('- What to build (topic and content):');
  E.push('- Purpose and medium (web page, slides, video asset…):');
  E.push('- Length or scope:');
  E.push('- Text and data that must appear:', '');
  E.push('# Style specification');
  E.push('## A. Visual style (used in Phase 1)');
  for (const { s, w } of vs) E.push(`- ${s.en} (${Math.round(w * 100)}%): ${s.kw}`);
  if (!vs.length) E.push('- clean modern flat illustration');
  E.push('', '### Palette (use only these hex values; add no other colors)');
  for (const p of b.palette) E.push(`- ${ROLE_EN[p.role]}: ${p.hex}`);
  E.push('- Usage: background and background 2 as the base; ink for text and outlines; primary, secondary and accent distributed across different levels of elements (headings, key points, shapes, buttons); highlight and card for light surfaces. Keep text/background contrast around 4.5:1 or better.');
  E.push('', '### Rendering details');
  E.push(`- fill: ${look.fill}; stroke: ${look.stroke > 0.3 ? `${round(look.stroke, 1)}px, ${look.strokeStyle}` : 'none'}; shadow: ${look.shadow}${look.glow > 0.05 ? `; glow ${Math.round(look.glow * 100)}%` : ''}`);
  if (FILL_HOW[look.fill]) E.push(`- how to render the fill: ${FILL_HOW[look.fill][1]}`);
  E.push(`- font: ${FONTS[look.font].label}${look.upper ? ' (all caps)' : ''}`);
  if (b.fx.length) {
    E.push(`- post-processing, in order: ${look.post.map((p) => p.fx).join(' -> ')}`);
    for (const f of look.post) if (FX_HOW[f.fx]) E.push(`  - ${FX_HOW[f.fx][1]}${f.p.amt !== undefined && f.p.amt < 0.99 ? ` (strength ~${Math.round(f.p.amt * 100)}%)` : ''}`);
    E.push('  - These are texture requirements: a close CSS/SVG-filter, canvas or shader approximation is fine; do not sacrifice text legibility or performance.');
  }
  if (mono) E.push('- Monochrome / near-monochrome overall; do not introduce other colors.');
  if (td3en) {
    E.push(`- ${td3en}`);
    E.push('  - If the project suits 3D (Three.js), use this material, lighting and camera; if it is 2D, approximate the camera language with parallax, zoom and pan.');
  }
  if (b.tips.length) {
    E.push('', '### Design notes');
    for (const t of b.tips) E.push(`- ${t}`);
  }
  E.push('', '## B. Motion style (used in Phase 2)');
  for (const { s, w } of ms) E.push(`- ${s.en} (${Math.round(w * 100)}%): ${s.kw}`);
  if (!ms.length) E.push('- natural, smooth easing');
  E.push('', '### Timing and easing');
  E.push(`- frame feel: ${move.fps ? `${move.fps} fps stepped (really update in steps, do not tween smoothly)` : 'smooth 60 fps'}`);
  E.push(`- primary easing: ${b.easeLabel}`);
  E.push(`- CSS approximation: cubic-bezier(${b.bezier.join(', ')}); for the exact curve (with overshoot) implement the easing as a function in JavaScript`);
  E.push(`- one action takes about ${b.durMs}ms; stagger elements entering together by ${b.staggerMs}ms`);
  if (mm.length) {
    E.push('', '### Motion parameters (higher = more pronounced)');
    for (const x of mm) E.push(`- ${x.key}: ${Math.round(x.v * 100)}%`);
  }
  if (sound) {
    E.push('', '## C. Sound style (used in Phase 2; optional; synthesize with Web Audio, no audio files)');
    E.push(`- Music: ${sound.genre}, about ${sound.bpm} BPM, key of ${sound.key}, timbre like "${sound.scheme}". It may loop naturally and need not match the animation length; keep the volume gentle so it never covers the content.`);
    if (sound.pack) E.push(`- Action sound effects: ${sound.pack} style. Pair with interactions: ${PROMPT_SFX_USE_EN}. Keep them few and meaningful, not on every element.`);
    E.push('- Muted by default; provide a clear sound toggle and enable only after a user click (browser autoplay policy).');
  }
  E.push('', '# Workflow (do in order, do not skip steps)');
  E.push('## Phase 1: Storyboard (lock the aesthetics first; add no animation in this phase, and stop for my confirmation when done)');
  E.push('1. Style interpretation: in 3-5 lines write the "visual rules" of this style (where dots appear, how thick lines are, what each hex value is responsible for). Every frame follows these rules.');
  E.push('2. Layout system: define one layout shared by all frames — margins, column grid, title position, page/progress element, decorative vocabulary — as CSS variables. What varies between frames is content and composition, not the layout system.');
  E.push('3. Frame list: split the content into 4-10 frames (opening, content sections, closing). For each frame state: purpose (one sentence), the single visual focal point, composition (regions and rough proportions), key visual (what graphic you generate in SVG/CSS), copy (a title plus at most 2 lines), and color allocation.');
  E.push('4. Build static frames: build every frame in HTML/CSS/SVG in its finished state (16:9 artboard), with no motion at all.');
  E.push('5. Aesthetic self-review: check each frame against the "Aesthetic baseline" below and score it 1-5 on hierarchy, alignment and whitespace, color proportion, style fidelity and key-visual quality. Any score below 4: write the problem and fix it; only when every frame scores >= 4 on every item may you hand them to me. Record "problem -> fix" in a short table in your reply.');
  E.push('6. Hand over for confirmation: output the complete HTML of the static storyboard, list your assumptions at the end of the reply, then **stop** and ask me to confirm the aesthetics (or give revision notes). Do not continue into Phase 2 in the same reply.');
  E.push('## Phase 2: Motion (only after I reply "confirmed")');
  E.push('7. Motion script: for each frame define the entrance (which elements, in what order, with what stagger), hold (emphasis or subtle movement), and exit/transition to the next frame, all following the easing, duration, stagger and parameters of "B. Motion style". Every element\'s motion must carry the style — do not change only colors while leaving default fades.');
  E.push('8. Implementation: add motion directly onto the confirmed static structure. Do not change layout, colors or copy; if a motion needs a layout change, go back and fix Phase 1 first.');
  if (sound) E.push('9. Sound: add music and effects per "C. Sound style"; put effects only on key actions.');
  E.push('', '# Aesthetic baseline (every frame must meet it; the style\'s character sits on top of this and is never an excuse to break it)');
  E.push('- One focal point: each frame has a single largest, most prominent element with a clear reading order. At least three hierarchy levels (title, key point, supporting); the title is roughly 2x the body size or more.');
  E.push('- Alignment and grid: all elements align to one grid and baseline; spacing uses fixed steps (e.g. multiples of 8px); margins are at least 5% of the frame width.');
  E.push('- Whitespace: even for dense styles (collage, pop art) leave a quiet area for the eye to rest; do not fill the frame with same-size things.');
  E.push('- Color proportion: roughly 60% base, 30% main color, 10% accent; the accent only on the focal point. Do not spread every hex value evenly everywhere.');
  E.push('- Typography: at most two typefaces (headline and body); headlines short and strong with no awkward breaks; line-height about 1.5 for CJK and a line length of at most about 30 characters.');
  E.push('- Key visual: every frame has one content-related key graphic that you draw yourself in SVG/CSS; all frames share one graphic language (consistent line weight, corner radius, shadow treatment). Do not rely on "text plus boxes", and do not use emoji as icons.');
  E.push('- Style fidelity: every item in the style specification (dots, line weight, fill treatment, post-processing texture) must be visible on screen, not just the colors.');
  E.push('- Avoid the common "AI look": no default purple-blue gradients, no row of equal rounded cards with drop shadows, no long centered stacks of content, no lorem ipsum or empty slogans.');
  E.push('', '# Deliverable');
  E.push('- Phase 1 reply order: (1) the design (style interpretation, layout system, frame list; keep it concise); (2) the aesthetic self-review table; (3) one complete single-file HTML code block of the static storyboard (CSS and JavaScript inline, opens directly in a browser, all finished frames laid out in a grid so I can judge the aesthetics frame by frame); (4) the list of assumptions; (5) one sentence asking me to confirm or give revision notes.');
  E.push('- Phase 2 reply: one complete single-file HTML code block (follow the project if it has other technical requirements) plus a brief motion script per frame.');
  E.push(`- Generate shapes, icons and background textures in code (CSS/SVG/Canvas${three ? ', Three.js for 3D' : ''}); avoid external images.`);
  E.push('- The Phase 2 HTML provides two views: "Animation" (default; autoplay; arrow keys or clicks switch frames; Space pauses) and "Storyboard" (toggle with G or a button; the static frames I confirmed).');
  E.push('- Layout must read well from phone to desktop; respect prefers-reduced-motion (reduce or disable motion).');
  E.push('', '# Acceptance checklist (verify each item yourself before each phase\'s reply; fix anything that fails and then output)');
  E.push('Phase 1:');
  E.push('1. Every frame passes the "Aesthetic baseline"; no score below 4 remains in the self-review table.');
  E.push('2. Only the palette colors are used; fill, stroke, shadow and typography match the style, which is recognizable.');
  E.push('3. Text is clear and readable (contrast, size, line length); facts and copy are correct, uncertain data is flagged "to be confirmed"; assumptions are listed; there is no motion at all.');
  E.push('Phase 2:');
  E.push('4. Layout, colors and copy are identical to the storyboard I confirmed.');
  E.push('5. Easing, duration, stagger and parameters match the description, and transitions carry the style too.');
  E.push(`6. ${sound ? 'Sound is muted by default and the toggle works; ' : ''}the "Storyboard" view works; no external images or network requests${three ? ' (Three.js excepted)' : ''}.`);

  return { zh: L.join('\n'), en: E.join('\n') };
}
