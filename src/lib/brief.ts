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
  landscape: 'a layered parallax landscape with mountains, hills, trees, sun and birds',
  abstract: 'abstract morphing blob with orbiting dots, rings and waves',
  voxel: 'a tiny floating voxel island with a blocky character hopping',
  shapes3d: 'a 3D scene of floating geometric primitives: a bouncing sphere, an orbiting ring, a rotating cube, a cone and a torus knot',
  char3d: 'a cute round 3D blob character with a little antenna hopping with squash and stretch',
  text3d: 'bold extruded 3D letters spelling MOTION dropping in one by one',
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
  landscape: '多層視差風景：遠山、丘陵、樹木、太陽與飛鳥',
  abstract: '抽象流動：變形液滴、環繞的點與波浪',
  voxel: '漂浮的體素小島，方塊角色在上面跳躍',
  shapes3d: '3D 幾何體：彈跳的球、環繞的圓環、旋轉的方塊、錐體與環結',
  char3d: '圓滾滾、頭上有觸角的 3D 小怪獸跳躍，帶擠壓與拉伸',
  text3d: '擠出的立體字母 MOTION 逐字落下',
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
  const zh = `3D 設定：材質 ${look.mat3d}、燈光 ${look.light3d}、幾何 ${look.geo3d === 'lowpoly' ? '低多邊形（平面著色）' : '平滑'}；鏡頭：${camZh.join('、') || '固定機位'}。`;
  const en = `3D setup: material "${look.mat3d}", lighting "${look.light3d}", geometry ${look.geo3d === 'lowpoly' ? 'low-poly (flat shaded)' : 'smooth'}; camera: ${cam.join(', ') || 'static'}.`;
  return [zh, en];
}

/** 產生給 Claude（Claude.ai 的 Artifact 或 Claude Code）的完整製作提示詞，中英文各一份 */
export function claudePrompts(b: Brief, subject: SubjectId, aspect: string, look: Look, move: Move, sound: SoundSpec | null, specJson: string): { zh: string; en: string } {
  const byW = <T extends { w: number }>(l: T[]) => [...l].sort((x, y) => y.w - x.w);
  const vs = byW(b.vs);
  const ms = byW(b.ms);
  const mono = look.pal.p.toLowerCase() === look.pal.ink.toLowerCase();
  const three = is3D(subject);
  const [td3zh, td3en] = three ? threeDSettings(look, move) : ['', ''];
  const L: string[] = [];
  const E: string[] = [];

  // ===== 中文 =====
  L.push('# 任務', `請用程式碼做一段「${SUBJECT_ZH[subject]}」的循環動畫。畫面風格與動作風格必須嚴格依照下面的規格，不要自行改成別的風格。`, '');
  L.push('# 交付物');
  L.push('- 一個可以直接用瀏覽器開啟的單一 HTML 檔（CSS 與 JavaScript 全部內嵌）；程式裡生成所有圖形，不使用圖片檔或外部素材。');
  L.push(three ? '- 這是 3D 場景：用 Three.js（可從 CDN 載入）；材質、燈光與鏡頭依下面的 3D 設定。' : '- 用 <canvas>（或 SVG／CSS）繪製；需要時才用 GSAP。');
  L.push(`- 無縫循環 ${b.loopSec} 秒，${b.fps}；畫面比例 ${aspect}，容器縮放時保持比例。`);
  L.push('- 動畫必須是「時間的純函數」：給定時間 t 就能算出那一幀（不要依賴累積狀態），這樣暫停、拖曳時間軸、逐幀導出才會正確。');
  L.push('- 提供：播放／暫停（空白鍵）、時間軸滑桿、重新載入後自動開始；尊重 prefers-reduced-motion（預設暫停）。', '');
  L.push('# 圖像風格');
  for (const { s, w } of vs) L.push(`- ${s.name}（${s.en}）${Math.round(w * 100)}%：${s.desc} 關鍵詞：${s.kw}`);
  if (!vs.length) L.push('- 乾淨的現代扁平插畫');
  L.push('', '## 色板（請直接使用這些色碼）');
  for (const p of b.palette) L.push(`- ${p.name}：${p.hex}`);
  L.push('', '## 渲染細節');
  for (const r of b.render) L.push(`- ${r}`);
  if (b.fx.length) L.push(`- 後期處理（依序）：${b.fx.map((f) => f.name).join(' → ')}`);
  if (mono) L.push('- 整體為單色／近單色，不要加入別的顏色。');
  if (td3zh) L.push(`- ${td3zh}`);
  L.push('', '# 動作風格');
  for (const { s, w } of ms) L.push(`- ${s.name}（${s.en}）${Math.round(w * 100)}%：${s.desc} 關鍵詞：${s.kw}`);
  if (!ms.length) L.push('- 自然流暢的緩動');
  L.push('', '## 節奏與緩動');
  L.push(`- 幀率：${b.fps}`);
  L.push(`- 主緩動：${b.easeLabel}`);
  L.push(`- 近似 CSS：cubic-bezier(${b.bezier.join(', ')})；要精確還原曲線（含回彈）請在 JavaScript 裡把緩動寫成函數`);
  L.push(`- 單一動作約 ${b.durMs}ms，元素之間錯峰 ${b.staggerMs}ms`);
  const mm = b.metrics.filter((x) => x.v > 0.04);
  if (mm.length) {
    L.push('', '## 動作參數（越高越明顯）');
    for (const x of mm) L.push(`- ${x.label}：${Math.round(x.v * 100)}%`);
  }
  if (b.tips.length) {
    L.push('', '# 設計要點');
    for (const t of b.tips) L.push(`- ${t}`);
  }
  if (sound) {
    L.push('', '# 聲音（選配，請用 Web Audio 即時合成，不使用外部音檔）');
    L.push(`- 配樂：${sound.genre}，${sound.bpm} BPM，${sound.key} 調，聲音質感參考「${sound.scheme}」；音樂長度與動畫循環對齊。`);
    if (sound.pack && sound.cues.length) L.push(`- 動作音效（${sound.pack} 風格），在這些時間點觸發：${sound.cues.map((c) => `${c.t.toFixed(2)}s ${c.kind}`).join('、')}`);
    L.push('- 預設靜音，使用者點擊後才開啟（瀏覽器的自動播放限制）。');
  }
  L.push('', '# 驗收清單（做完請自己逐項檢查）');
  L.push('1. 整圈循環接縫處看不出跳動或停頓。');
  L.push('2. 色板、描邊、陰影與風格描述一致，沒有多餘的顏色。');
  L.push('3. 動作節奏符合幀率與緩動描述（定格風格要真的是階梯式更新，而不是平滑補間）。');
  L.push('4. 把時間軸拖到任意位置，畫面都與連續播放到那個時間點時相同。');
  L.push('5. 沒有任何外部圖片、字體檔或網路請求（3D 的 Three.js 例外）。', '');
  L.push('# 機器可讀的完整規格（JSON，與上面的描述等價；有衝突時以文字描述為準）', '```json', specJson, '```');

  // ===== English =====
  E.push('# Task', `Build a looping animation of: ${SUBJECT_EN[subject]}. Follow the visual style and motion style below exactly; do not substitute another style.`, '');
  E.push('# Deliverable');
  E.push('- A single HTML file that opens directly in a browser (all CSS/JS inline). Generate every shape in code; no image files or external assets.');
  E.push(three ? '- This is a 3D scene: use Three.js (loading from a CDN is fine); follow the 3D setup below for materials, lighting and camera.' : '- Draw with <canvas> (or SVG/CSS); use GSAP only if it genuinely helps.');
  E.push(`- Seamless ${b.loopSec}s loop at ${move.fps ? `${move.fps} fps (stepped, choppy frame timing)` : 'smooth 60 fps'}; aspect ratio ${aspect}, keep the ratio when the container resizes.`);
  E.push('- The animation must be a pure function of time: given t, compute that frame without relying on accumulated state, so pause, scrubbing and frame-by-frame export are correct.');
  E.push('- Include play/pause (Space), a timeline scrubber, autoplay on load; respect prefers-reduced-motion (start paused).', '');
  E.push('# Visual style');
  for (const { s, w } of vs) E.push(`- ${s.en} (${Math.round(w * 100)}%): ${s.kw}`);
  if (!vs.length) E.push('- clean modern flat illustration');
  E.push('', '## Palette (use these exact hex values)');
  for (const p of b.palette) E.push(`- ${ROLE_EN[p.role]}: ${p.hex}`);
  E.push('', '## Rendering details');
  E.push(`- fill: ${look.fill}; stroke: ${look.stroke > 0.3 ? `${round(look.stroke, 1)}px, ${look.strokeStyle}` : 'none'}; shadow: ${look.shadow}${look.glow > 0.05 ? `; glow ${Math.round(look.glow * 100)}%` : ''}`);
  E.push(`- font: ${FONTS[look.font].label}${look.upper ? ' (all caps)' : ''}`);
  if (b.fx.length) E.push(`- post-processing, in order: ${look.post.map((p) => p.fx).join(' -> ')}`);
  if (mono) E.push('- Monochrome / near-monochrome overall; do not introduce other colors.');
  if (td3en) E.push(`- ${td3en}`);
  E.push('', '# Motion style');
  for (const { s, w } of ms) E.push(`- ${s.en} (${Math.round(w * 100)}%): ${s.kw}`);
  if (!ms.length) E.push('- natural, smooth easing');
  E.push('', '## Timing and easing');
  E.push(`- frame rate: ${move.fps ? `${move.fps} fps stepped` : 'smooth 60 fps'}`);
  E.push(`- primary easing: ${b.easeLabel}`);
  E.push(`- CSS approximation: cubic-bezier(${b.bezier.join(', ')}); for the exact curve (with overshoot) implement the easing as a function in JavaScript`);
  E.push(`- one action takes about ${b.durMs}ms; stagger elements by ${b.staggerMs}ms`);
  if (mm.length) {
    E.push('', '## Motion parameters (higher = more pronounced)');
    for (const x of mm) E.push(`- ${x.key}: ${Math.round(x.v * 100)}%`);
  }
  if (sound) {
    E.push('', '# Sound (optional; synthesize with Web Audio, no audio files)');
    E.push(`- Music: ${sound.genre}, ${sound.bpm} BPM, key of ${sound.key}; length aligned to the animation loop.`);
    if (sound.pack && sound.cues.length) E.push(`- Action sound effects (${sound.pack} style) at these times: ${sound.cues.map((c) => `${c.t.toFixed(2)}s ${c.kind}`).join(', ')}`);
    E.push('- Muted by default; enable after a user click (browser autoplay policy).');
  }
  E.push('', '# Acceptance checklist (verify each item yourself before finishing)');
  E.push('1. The loop seam shows no jump or hitch.');
  E.push('2. Palette, strokes and shadows match the style description, with no stray colors.');
  E.push('3. Timing matches the frame rate and easing (stepped styles must really update in steps, not tween smoothly).');
  E.push('4. Scrubbing to any time shows exactly what continuous playback shows at that time.');
  E.push('5. No external images, font files or network requests (Three.js for 3D is the only exception).', '');
  E.push('# Machine-readable full spec (JSON, equivalent to the above; if they conflict, the prose wins)', '```json', specJson, '```');

  return { zh: L.join('\n'), en: E.join('\n') };
}
