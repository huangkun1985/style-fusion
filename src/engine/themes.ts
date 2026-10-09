// 自訂動畫主題：使用者可以匯入一個 JSON 檔，定義一組「圖層」與「關鍵影格」，它就會變成一個主體（和角色跳躍、UI 介面等並列）。
// 因為是用風格畫筆（Brush）畫的，所以所有「圖像風格」（色板、描邊、填色、後期特效）與「動效風格」（緩動、誇張、果凍…）都會套上去。
// 檔案是純資料，不含任何程式碼；解析時會嚴格檢查型別、範圍與數量，壞檔案會得到清楚的錯誤訊息。規格見 docs/動畫主題格式說明.md。
import type { Cue, SfxKind } from '../audio/types';
import type { Brush } from './brush';
import type { Env } from './env';
import type { MotionCtx } from './motion';
import type { Ev } from './overlays';
import { contactShadow, ground } from './subjects/types';
import type { FontId, Role } from './types';
import { TAU, clamp, lerp, wrap } from './util';
import { FONTS } from './fonts';
import { safeStorage } from '../lib/platform';

export const THEME_FORMAT = 'style-fusion-theme';
export const THEME_VERSION = 1;
export const THEME_LIMITS = { bytes: 200_000, layers: 300, depth: 8, keys: 100, points: 400, events: 24, sounds: 48, text: 60, saved: 8 };

const ROLES = new Set<string>(['bg', 'bg2', 'ink', 'light', 'card', 'p', 's', 'a', 'q', 'r']);
const SHAPES = ['group', 'circle', 'ellipse', 'rect', 'polygon', 'blob', 'line', 'curve', 'arc', 'text'] as const;
export type ShapeType = (typeof SHAPES)[number];
const EASES = ['linear', 'in', 'out', 'inOut', 'hold', 'back', 'bounce'] as const;
export type Ease = (typeof EASES)[number];
const SFX = new Set<string>(['jump', 'land', 'bounce', 'pop', 'click', 'toggle', 'whoosh', 'tick', 'ping', 'sparkle', 'impact', 'step', 'notify', 'rise', 'drop', 'flip', 'blip', 'splash', 'quack']);
const PROPS = ['x', 'y', 'rot', 'sx', 'sy', 'alpha'] as const;
type Prop = (typeof PROPS)[number];
const REST: Record<Prop, number> = { x: 0, y: 0, rot: 0, sx: 1, sy: 1, alpha: 1 };

export type Key = [number, number, Ease];
export type Track = number | Key[];

export interface Layer {
  id: string;
  type: ShapeType;
  geom: { r?: number; rx?: number; ry?: number; w?: number; h?: number; radius?: number; points?: number[]; a0?: number; a1?: number; text?: string; size?: number; align?: CanvasTextAlign; font?: FontId };
  fill: string | null;
  stroke: string | false | undefined;
  lw: number;
  alpha: number;
  flags: { shadow?: boolean; hl?: boolean; glow?: boolean; flat?: boolean; outline?: boolean };
  w: number;
  tracks: Partial<Record<Prop, Track>>;
  react: number;
  delay: number;
  children: Layer[];
}

export interface ThemeEvent {
  u: number;
  x: number;
  y: number;
  k: number;
  sfx?: SfxKind;
}

/** 只出聲、不產生衝擊特效的音效點 */
export interface ThemeSound {
  u: number;
  k: number;
  sfx: SfxKind;
}

export interface Theme {
  name: string;
  desc: string;
  loop: number;
  hero: number;
  key: number;
  ground?: number;
  shadowFor?: string;
  shadowSize: number;
  track?: string;
  events: ThemeEvent[];
  sounds: ThemeSound[];
  /** 主題自帶的色板：這些角色固定用指定的顏色（使用者仍可在「自訂色板」改掉） */
  palette?: Partial<Record<Role, string>>;
  layers: Layer[];
  /** 不影響播放、但值得告訴使用者的提醒（例如循環接縫會跳） */
  warnings: string[];
}

// ---------- 解析與驗證 ----------
class Issues {
  list: string[] = [];
  add(path: string, msg: string) {
    this.list.push(`${path}：${msg}`);
  }
}

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

function num(v: unknown, path: string, I: Issues, lo: number, hi: number, def: number): number {
  if (v === undefined) return def;
  if (!isNum(v)) {
    I.add(path, `要是數字（現在是 ${JSON.stringify(v)?.slice(0, 30)}）`);
    return def;
  }
  if (v < lo || v > hi) {
    I.add(path, `超出範圍 ${lo} 到 ${hi}（現在是 ${v}）`);
    return clamp(v, lo, hi);
  }
  return v;
}

function color(v: unknown, path: string, I: Issues): string | undefined {
  if (typeof v !== 'string') {
    I.add(path, '顏色要是字串：色板角色（bg、bg2、ink、light、card、p、s、a、q、r）或 #rrggbb');
    return undefined;
  }
  if (ROLES.has(v) || /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(v)) return v;
  // 色板角色加明暗：a+20＝比點綴色亮 20%，a-15＝比點綴色暗 15%（跟著色板換色，明暗關係不變）
  const shaded = /^([a-z0-9]+)([+-])(\d{1,2})$/.exec(v);
  if (shaded && ROLES.has(shaded[1])) return v;
  I.add(path, `不認得的顏色「${v.slice(0, 20)}」，要用色板角色（bg、bg2、ink、light、card、p、s、a、q、r，可加明暗如 a+20、a-15）或 #rrggbb`);
  return undefined;
}

function parseTrack(v: unknown, path: string, I: Issues, prop: Prop, warnings: string[]): Track | undefined {
  if (v === undefined) return undefined;
  if (isNum(v)) return clamp(v, -5000, 5000);
  if (!Array.isArray(v)) {
    I.add(path, '要是一個數字（固定值）或關鍵影格陣列，例如 [[0, 0], [0.5, 100, "inOut"], [1, 0]]');
    return undefined;
  }
  if (v.length < 2) {
    I.add(path, '關鍵影格至少要有 2 個');
    return undefined;
  }
  if (v.length > THEME_LIMITS.keys) {
    I.add(path, `關鍵影格最多 ${THEME_LIMITS.keys} 個`);
    return undefined;
  }
  const keys: Key[] = [];
  v.forEach((k, i) => {
    if (!Array.isArray(k) || k.length < 2 || k.length > 3 || !isNum(k[0]) || !isNum(k[1])) {
      I.add(`${path}[${i}]`, '關鍵影格要是 [時間 0 到 1, 數值] 或 [時間, 數值, 緩動]');
      return;
    }
    if (k[0] < 0 || k[0] > 1) I.add(`${path}[${i}]`, `時間要在 0 到 1 之間（現在是 ${k[0]}）`);
    if (Math.abs(k[1]) > 5000) I.add(`${path}[${i}]`, `數值太大（${k[1]}）`);
    let ease: Ease = 'linear';
    if (k.length === 3) {
      if (typeof k[2] === 'string' && (EASES as readonly string[]).includes(k[2])) ease = k[2] as Ease;
      else I.add(`${path}[${i}]`, `緩動要是 ${EASES.join('、')} 其中之一（現在是 ${JSON.stringify(k[2])?.slice(0, 20)}）`);
    }
    keys.push([clamp(k[0], 0, 1), clamp(k[1], -5000, 5000), ease]);
  });
  if (keys.length < 2) return undefined;
  keys.sort((a, b) => a[0] - b[0]);
  // 循環：開頭與結尾要有關鍵影格；缺的補上（開頭補第一個值；結尾保持最後的值，並提醒）
  if (keys[0][0] > 0) {
    warnings.push(`${path}：第一個關鍵影格的時間是 ${keys[0][0]}，不是 0，已在 0 補上相同的值`);
    keys.unshift([0, keys[0][1], 'linear']);
  }
  if (keys[keys.length - 1][0] < 1) {
    warnings.push(`${path}：最後一個關鍵影格的時間是 ${keys[keys.length - 1][0]}，不是 1，已在 1 補上相同的值（循環到頭時會跳回起點）`);
    keys.push([1, keys[keys.length - 1][1], 'linear']);
  }
  const a = keys[0][1];
  const b = keys[keys.length - 1][1];
  const gap = prop === 'rot' ? (((b - a) % 360) + 360) % 360 : Math.abs(b - a);
  const closed = prop === 'rot' ? gap < 1e-6 || Math.abs(gap - 360) < 1e-6 : gap < 1e-6;
  if (!closed) warnings.push(`${path}：開頭（${a}）與結尾（${b}）的值不同，循環接縫會跳一下；想要無縫循環，結尾的值要和開頭一樣`);
  return keys;
}

function parsePoints(v: unknown, path: string, I: Issues, min: number): number[] | undefined {
  if (!Array.isArray(v) || v.length < min || v.length % 2 !== 0 || v.length > THEME_LIMITS.points || !v.every((x) => isNum(x) && Math.abs(x) <= 5000)) {
    I.add(path, `要是 [x1, y1, x2, y2, …] 的數字陣列：偶數個、至少 ${min} 個（${min / 2} 個點）、最多 ${THEME_LIMITS.points} 個數字，每個數字的絕對值不超過 5000`);
    return undefined;
  }
  return v as number[];
}

/** 各圖層類型真正有作用的欄位；其餘欄位（常見的是 AI 寫錯的）會在匯入時提醒 */
const COMMON_KEYS = ['type', 'id', 'fill', 'stroke', 'lw', 'opacity', 'x', 'y', 'rot', 'sx', 'sy', 's', 'alpha', 'react', 'delay', 'children', 'shadow', 'hl', 'glow', 'flat', 'outline'];
const TYPE_KEYS: Record<ShapeType, string[]> = {
  group: [],
  circle: ['r'],
  ellipse: ['rx', 'ry'],
  rect: ['w', 'h', 'radius'],
  polygon: ['points'],
  blob: ['points'],
  line: ['points', 'w'],
  curve: ['points', 'w'],
  arc: ['r', 'a0', 'a1', 'w'],
  text: ['text', 'size', 'align', 'font'],
};

function checkIgnored(raw: Record<string, unknown>, t: ShapeType, path: string, warnings: string[]) {
  const ok = new Set([...COMMON_KEYS, ...TYPE_KEYS[t]]);
  const bad = Object.keys(raw).filter((k) => !ok.has(k));
  if (!bad.length) return;
  const hint = bad.includes('w') && t !== 'rect' ? '（想調描邊粗細請用 lw；w 只有 rect 的寬度、line／curve／arc 的線寬）' : '';
  warnings.push(`${path}（${t}）：${bad.map((k) => `「${k}」`).join('、')} 對這種圖層沒有作用，會被忽略${hint}`);
}

function parseLayer(raw: unknown, path: string, depth: number, I: Issues, ids: Set<string>, count: { n: number }, warnings: string[]): Layer | null {
  if (!isObj(raw)) {
    I.add(path, '圖層要是物件');
    return null;
  }
  if (++count.n > THEME_LIMITS.layers) {
    if (count.n === THEME_LIMITS.layers + 1) I.add(path, `圖層總數最多 ${THEME_LIMITS.layers} 個`);
    return null;
  }
  if (depth > THEME_LIMITS.depth) {
    I.add(path, `巢狀最多 ${THEME_LIMITS.depth} 層`);
    return null;
  }
  const type = raw.type;
  if (typeof type !== 'string' || !(SHAPES as readonly string[]).includes(type)) {
    I.add(`${path}.type`, `要是 ${SHAPES.join('、')} 其中之一`);
    return null;
  }
  let id = '';
  if (raw.id !== undefined) {
    if (typeof raw.id !== 'string' || !raw.id || raw.id.length > 40) I.add(`${path}.id`, '要是 1 到 40 字的字串');
    else if (ids.has(raw.id)) I.add(`${path}.id`, `「${raw.id}」重複了，每個 id 只能用一次`);
    else {
      id = raw.id;
      ids.add(id);
    }
  }
  const t = type as ShapeType;
  checkIgnored(raw, t, path, warnings);
  const g: Layer['geom'] = {};
  if (t === 'circle') g.r = num(raw.r, `${path}.r`, I, 0, 2000, 20);
  if (t === 'ellipse') {
    g.rx = num(raw.rx, `${path}.rx`, I, 0, 2000, 30);
    g.ry = num(raw.ry, `${path}.ry`, I, 0, 2000, 20);
  }
  if (t === 'rect') {
    g.w = num(raw.w, `${path}.w`, I, 0, 4000, 60);
    g.h = num(raw.h, `${path}.h`, I, 0, 4000, 40);
    g.radius = num(raw.radius, `${path}.radius`, I, 0, 2000, 0);
  }
  if (t === 'polygon' || t === 'blob') g.points = parsePoints(raw.points, `${path}.points`, I, 6) ?? [0, -20, 20, 20, -20, 20];
  if (t === 'line' || t === 'curve') g.points = parsePoints(raw.points, `${path}.points`, I, 4) ?? [-20, 0, 20, 0];
  if (t === 'arc') {
    g.r = num(raw.r, `${path}.r`, I, 0, 2000, 40);
    g.a0 = num(raw.a0, `${path}.a0`, I, -3600, 3600, 0);
    g.a1 = num(raw.a1, `${path}.a1`, I, -3600, 3600, 270);
  }
  if (t === 'text') {
    if (typeof raw.text !== 'string' || !raw.text || raw.text.length > THEME_LIMITS.text) I.add(`${path}.text`, `要是 1 到 ${THEME_LIMITS.text} 字的字串`);
    g.text = typeof raw.text === 'string' ? raw.text.slice(0, THEME_LIMITS.text) : '?';
    g.size = num(raw.size, `${path}.size`, I, 4, 400, 40);
    if (raw.align !== undefined) {
      if (raw.align === 'left' || raw.align === 'center' || raw.align === 'right') g.align = raw.align;
      else I.add(`${path}.align`, '要是 left、center 或 right');
    }
    if (raw.font !== undefined) {
      if (typeof raw.font === 'string' && raw.font in FONTS) g.font = raw.font as FontId;
      else I.add(`${path}.font`, `要是 ${Object.keys(FONTS).join('、')} 其中之一`);
    }
  }
  let fill: string | null = t === 'line' || t === 'curve' || t === 'arc' || t === 'text' ? 'ink' : 'p';
  if (raw.fill === null) fill = null;
  else if (raw.fill !== undefined) fill = color(raw.fill, `${path}.fill`, I) ?? fill;
  let stroke: string | false | undefined;
  if (raw.stroke === false) stroke = false;
  else if (raw.stroke !== undefined) stroke = color(raw.stroke, `${path}.stroke`, I);
  const flags: Layer['flags'] = {};
  for (const f of ['shadow', 'hl', 'glow', 'flat', 'outline'] as const) {
    if (raw[f] === undefined) continue;
    if (typeof raw[f] !== 'boolean') I.add(`${path}.${f}`, '要是 true 或 false');
    else flags[f] = raw[f] as boolean;
  }
  const tracks: Layer['tracks'] = {};
  for (const p of PROPS) tracks[p] = parseTrack(raw[p], `${path}.${p}`, I, p, warnings);
  // s：等比例縮放的簡寫（sx、sy 沒有另外寫時才生效）
  if (raw.s !== undefined) {
    const s = parseTrack(raw.s, `${path}.s`, I, 'sx', warnings);
    if (s !== undefined) {
      if (tracks.sx === undefined) tracks.sx = s;
      if (tracks.sy === undefined) tracks.sy = s;
    }
  }
  const layer: Layer = {
    id,
    type: t,
    geom: g,
    fill,
    stroke,
    lw: num(raw.lw, `${path}.lw`, I, 0, 10, 1),
    alpha: num(raw.opacity, `${path}.opacity`, I, 0, 1, 1),
    flags,
    // 線寬只對 line／curve／arc 有意義；rect 的 w 是寬度（上面 g.w 已經檢查過 0..4000），不能再用線寬的上限 200 檢查一次
    w: t === 'line' || t === 'curve' || t === 'arc' ? num(raw.w, `${path}.w`, I, 0, 200, 6) : 1,
    tracks: Object.fromEntries(Object.entries(tracks).filter(([, v]) => v !== undefined)) as Layer['tracks'],
    react: num(raw.react, `${path}.react`, I, 0, 3, 0),
    delay: num(raw.delay, `${path}.delay`, I, 0, 1, 0),
    children: [],
  };
  // rect 的 w 是寬度，不是線寬；線條類才用 w 當線寬
  if (t === 'rect') layer.w = 1;
  if (raw.children !== undefined) {
    if (!Array.isArray(raw.children)) I.add(`${path}.children`, '要是圖層陣列');
    else
      raw.children.forEach((c, i) => {
        const child = parseLayer(c, `${path}.children[${i}]`, depth + 1, I, ids, count, warnings);
        if (child) layer.children.push(child);
      });
  }
  return layer;
}

export function parseTheme(text: string): Theme {
  if (text.length > THEME_LIMITS.bytes) throw new Error(`檔案太大（超過 ${Math.round(THEME_LIMITS.bytes / 1000)} KB），主題檔通常只有幾 KB`);
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new Error(`不是有效的 JSON：${(e as Error).message}`);
  }
  if (!isObj(raw)) throw new Error('最外層要是一個 JSON 物件 { … }');
  if (raw.format !== THEME_FORMAT) throw new Error(`缺少 "format": "${THEME_FORMAT}"，這看起來不是 Style Fusion 的動畫主題檔`);
  if (raw.version !== THEME_VERSION) throw new Error(`不支援的版本 ${JSON.stringify(raw.version)}（目前只有版本 ${THEME_VERSION}）`);
  const I = new Issues();
  const warnings: string[] = [];
  const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 40) : '未命名主題';
  if (raw.name !== undefined && (typeof raw.name !== 'string' || !raw.name.trim())) I.add('name', '要是非空的字串');
  const desc = typeof raw.desc === 'string' ? raw.desc.slice(0, 200) : '';
  const ids = new Set<string>();
  const count = { n: 0 };
  const layers: Layer[] = [];
  if (!Array.isArray(raw.layers) || raw.layers.length === 0) I.add('layers', '要是至少有一個圖層的陣列');
  else raw.layers.forEach((l, i) => {
    const layer = parseLayer(l, `layers[${i}]`, 1, I, ids, count, warnings);
    if (layer) layers.push(layer);
  });
  const events: ThemeEvent[] = [];
  if (raw.events !== undefined) {
    if (!Array.isArray(raw.events) || raw.events.length > THEME_LIMITS.events) I.add('events', `要是最多 ${THEME_LIMITS.events} 個事件的陣列`);
    else
      raw.events.forEach((e, i) => {
        if (!isObj(e)) return I.add(`events[${i}]`, '事件要是物件，例如 { "u": 0.5, "x": 0, "y": 120, "sfx": "land" }');
        const ev: ThemeEvent = { u: num(e.u, `events[${i}].u`, I, 0, 1, 0), x: num(e.x, `events[${i}].x`, I, -2000, 2000, 0), y: num(e.y, `events[${i}].y`, I, -2000, 2000, 0), k: num(e.k, `events[${i}].k`, I, 0, 1.5, 0.6) };
        if (e.sfx !== undefined) {
          if (typeof e.sfx === 'string' && SFX.has(e.sfx)) ev.sfx = e.sfx as SfxKind;
          else I.add(`events[${i}].sfx`, `要是 ${[...SFX].join('、')} 其中之一`);
        }
        events.push(ev);
      });
  }
  const sounds: ThemeSound[] = [];
  if (raw.sounds !== undefined) {
    if (!Array.isArray(raw.sounds) || raw.sounds.length > THEME_LIMITS.sounds) I.add('sounds', `要是最多 ${THEME_LIMITS.sounds} 個音效點的陣列`);
    else
      raw.sounds.forEach((s, i) => {
        if (!isObj(s)) return I.add(`sounds[${i}]`, '音效點要是物件，例如 { "u": 0.25, "sfx": "whoosh" }');
        const u = num(s.u, `sounds[${i}].u`, I, 0, 1, 0);
        const k = num(s.k, `sounds[${i}].k`, I, 0, 1.5, 0.6);
        if (typeof s.sfx === 'string' && SFX.has(s.sfx)) sounds.push({ u, k, sfx: s.sfx as SfxKind });
        else I.add(`sounds[${i}].sfx`, `必填，要是 ${[...SFX].join('、')} 其中之一`);
      });
  }
  if (!events.some((e) => e.sfx) && !sounds.length) warnings.push('沒有指定任何音效：在 events 事件裡加 "sfx"，或用 "sounds" 陣列加只出聲的音效點，動畫才會有動作音效');
  // 音效要對準動作：音效點離所有關鍵影格都很遠，多半是憑感覺填的時間
  {
    const times = new Set<number>([0, 1]);
    const walk = (ls: Layer[]) => {
      for (const l of ls) {
        for (const tr of Object.values(l.tracks)) if (Array.isArray(tr)) for (const k of tr) times.add(k[0]);
        walk(l.children);
      }
    };
    walk(layers);
    const arr = [...times];
    const all = [...events.filter((e) => e.sfx).map((e) => ({ u: e.u, sfx: e.sfx!, at: 'events' })), ...sounds.map((s) => ({ u: s.u, sfx: s.sfx, at: 'sounds' }))];
    const off = all.filter((c) => !arr.some((k) => Math.abs(k - c.u) <= 0.03));
    if (off.length) warnings.push(`有 ${off.length} 個音效點沒有對準任何關鍵影格（${off.slice(0, 4).map((c) => `${c.sfx}@${c.u}`).join('、')}${off.length > 4 ? '…' : ''}）：音效時間要取自動作發生的那個關鍵影格時間（落地、碰撞、出現…），不然聽起來會和畫面脫節`);
    const loopSec = num(raw.loop, 'loop', new Issues(), 0.5, 30, 3);
    if (all.length / loopSec > 2) warnings.push(`音效太密：${loopSec} 秒的循環裡有 ${all.length} 個音效（平均每秒 ${(all.length / loopSec).toFixed(1)} 個），建議每秒不超過 2 個，只留下最明顯的動作`);
  }
  // 寫死的色碼不會被「自訂色板」改動，也不跟圖像風格換色：提醒作者改用 palette 與角色
  {
    const hexes = new Set<string>();
    const walkC = (ls: Layer[]) => {
      for (const l of ls) {
        for (const c of [l.fill, l.stroke]) if (typeof c === 'string' && c.startsWith('#')) hexes.add(c.toUpperCase());
        walkC(l.children);
      }
    };
    walkC(layers);
    if (hexes.size) warnings.push(`有 ${hexes.size} 種顏色寫死成色碼（${[...hexes].slice(0, 4).join('、')}${hexes.size > 4 ? '…' : ''}），使用者無法在「自訂色板」改這些顏色，也不會跟著圖像風格換色。想讓它們可以改色：在最外層用 palette 宣告，圖層改用色板角色（可加明暗如 a-8、a+25）`);
  }
  let palette: Theme['palette'];
  if (raw.palette !== undefined) {
    if (!isObj(raw.palette)) I.add('palette', '要是物件，例如 { "a": "#FFD43B", "r": "#FF9F1C" }（角色 → #rrggbb）');
    else {
      palette = {};
      for (const [k, v] of Object.entries(raw.palette)) {
        if (!ROLES.has(k)) I.add(`palette.${k}`, `不認得的色板角色，要是 ${[...ROLES].join('、')} 其中之一`);
        else if (typeof v !== 'string' || !/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v)) I.add(`palette.${k}`, '要是 #rrggbb 色碼');
        else palette[k as Role] = v;
      }
    }
  }
  const refId = (v: unknown, path: string): string | undefined => {
    if (v === undefined) return undefined;
    if (typeof v !== 'string' || !ids.has(v)) {
      I.add(path, `找不到 id 為 ${JSON.stringify(v)?.slice(0, 30)} 的圖層（要先在圖層裡用 "id" 命名）`);
      return undefined;
    }
    return v;
  };
  const theme: Theme = {
    name,
    desc,
    loop: num(raw.loop, 'loop', I, 0.5, 30, 3),
    hero: num(raw.hero, 'hero', I, 0, 1, 0.1),
    key: num(raw.key, 'key', I, 0, 1, 0.2),
    ground: raw.ground === undefined ? undefined : num(raw.ground, 'ground', I, -400, 400, 120),
    shadowFor: refId(raw.shadowFor, 'shadowFor'),
    shadowSize: num(raw.shadowSize, 'shadowSize', I, 5, 400, 40),
    track: refId(raw.track, 'track'),
    events,
    sounds,
    palette,
    layers,
    warnings,
  };
  if (I.list.length) {
    const shown = I.list.slice(0, 8).join('\n');
    throw new Error(`${I.list.length} 個問題：\n${shown}${I.list.length > 8 ? `\n…還有 ${I.list.length - 8} 個` : ''}`);
  }
  return theme;
}

// ---------- 取值與繪製 ----------
const easeBack = (x: number) => 1 + 2.70158 * Math.pow(x - 1, 3) + 1.70158 * Math.pow(x - 1, 2);
function easeBounce(x: number) {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (x < 1 / d1) return n1 * x * x;
  if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75;
  if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375;
  return n1 * (x -= 2.625 / d1) * x + 0.984375;
}

export function evalTrack(t: Track, u: number, M: MotionCtx | null): number {
  if (typeof t === 'number') return t;
  if (u <= t[0][0]) return t[0][1];
  for (let i = 1; i < t.length; i++) {
    if (u <= t[i][0] || i === t.length - 1) {
      const [a, va, ease] = t[i - 1];
      const [b, vb] = t[i];
      if (b <= a) return vb;
      const w = clamp((u - a) / (b - a));
      let e = w;
      switch (ease) {
        case 'in':
          e = M ? M.in(w) : w * w;
          break;
        case 'out':
          e = M ? M.out(w) : 1 - (1 - w) * (1 - w);
          break;
        case 'inOut':
          e = M ? M.io(w) : w * w * (3 - 2 * w);
          break;
        case 'hold':
          e = w >= 1 ? 1 : 0;
          break;
        case 'back':
          e = easeBack(w);
          break;
        case 'bounce':
          e = easeBounce(w);
          break;
      }
      return lerp(va, vb, e);
    }
  }
  return t[t.length - 1][1];
}

/** 圖層在時間 u 的局部變換（已套用延遲與「誇張」） */
function localOf(L: Layer, u: number, M: MotionCtx | null) {
  const mv = M?.mv;
  const u2 = L.delay && mv ? wrap(u - L.delay * (0.6 + mv.follow), 1) : L.delay ? wrap(u - L.delay, 1) : u;
  const f = L.react && mv ? 1 + L.react * (mv.exag * 0.6 + mv.noodle * 0.4) : 1;
  const out = { ...REST };
  for (const p of PROPS) {
    const t = L.tracks[p];
    if (t === undefined) continue;
    let v = evalTrack(t, u2, M);
    if (f !== 1 && p !== 'alpha') {
      const rest = evalTrack(t, 0, M);
      v = rest + (v - rest) * f;
    }
    out[p] = v;
  }
  return out;
}

function findPath(layers: Layer[], id: string, path: Layer[] = []): Layer[] | null {
  for (const L of layers) {
    const p = [...path, L];
    if (L.id === id) return p;
    const r = findPath(L.children, id, p);
    if (r) return r;
  }
  return null;
}

/** 圖層原點在畫面上的位置（軌跡線、速度線、環繞線、陰影都用它） */
export function layerWorld(theme: Theme, M: MotionCtx | null, u: number, id?: string): [number, number] {
  const path = id ? findPath(theme.layers, id) : theme.layers.length ? [theme.layers[0]] : null;
  if (!path) return [0, 0];
  let a = 1;
  let b = 0;
  let c = 0;
  let d = 1;
  let e = 0;
  let f = 0;
  for (const L of path) {
    const t = localOf(L, u, M);
    const r = (t.rot * Math.PI) / 180;
    const cs = Math.cos(r);
    const sn = Math.sin(r);
    // 新矩陣 = 舊矩陣 × 平移 × 旋轉 × 縮放
    const na = a * cs * t.sx + c * sn * t.sx;
    const nb = b * cs * t.sx + d * sn * t.sx;
    const nc = -a * sn * t.sy + c * cs * t.sy;
    const nd = -b * sn * t.sy + d * cs * t.sy;
    e = a * t.x + c * t.y + e;
    f = b * t.x + d * t.y + f;
    a = na;
    b = nb;
    c = nc;
    d = nd;
  }
  return [e, f];
}

function drawLayer(S: Brush, L: Layer, M: MotionCtx, idx: number) {
  const t = localOf(L, M.u, M);
  S.push();
  S.translate(t.x, t.y);
  if (t.rot) S.rotate((t.rot * Math.PI) / 180);
  if (t.sx !== 1 || t.sy !== 1) S.scale(t.sx, t.sy);
  const prevAlpha = S.alpha;
  S.alpha = prevAlpha * clamp(t.alpha, 0, 1) * L.alpha;
  const o = { ...L.flags, lw: L.lw, ...(L.stroke !== undefined ? { stroke: L.stroke } : {}), ...(L.fill === null ? { mode: 'none' as const, outline: true } : {}) };
  const fill = L.fill ?? 'ink';
  // 線稿類風格（黑板粉筆、線框…）把形狀畫成「底色填滿＋描邊」；沒有描邊的圖層就只剩底色，整個看不見。
  // 墨色（ink）的無描邊小細節是眼睛、鼻孔、瞳孔這類五官，消失了角色就沒有臉：改成實心畫出來
  if ((S.look.fill === 'line' || S.look.fill === 'none') && L.stroke === false && typeof L.fill === 'string' && L.fill.startsWith('ink')) {
    Object.assign(o, { mode: 'flat' as const });
  }
  const g = L.geom;
  const lineColor = (L.stroke !== undefined && L.stroke !== false ? L.stroke : L.fill) ?? 'ink';
  switch (L.type) {
    case 'circle':
      S.circle(0, 0, g.r!, fill, o);
      break;
    case 'ellipse':
      S.ellipse(0, 0, g.rx!, g.ry!, fill, o);
      break;
    case 'rect':
      S.rect(0, 0, g.w!, g.h!, g.radius!, fill, o);
      break;
    case 'polygon':
      S.poly(g.points!, fill, o);
      break;
    case 'blob':
      S.blob(g.points!, fill, o);
      break;
    case 'line':
      S.line(g.points!, lineColor, { ...o, w: L.w, cap: 'round', outlined: !!L.flags.outline });
      break;
    case 'curve':
      S.curve(g.points!, lineColor, { ...o, w: L.w, outlined: !!L.flags.outline });
      break;
    case 'arc':
      S.arc(0, 0, g.r!, (g.a0! * Math.PI) / 180, (g.a1! * Math.PI) / 180, lineColor, { ...o, w: L.w });
      break;
    case 'text':
      S.text(g.text!, 0, 0, g.size!, fill, { align: g.align ?? 'center', base: 'middle', ...(g.font ? { font: g.font } : {}), ...o });
      break;
    case 'group':
      break;
  }
  L.children.forEach((c, i) => drawLayer(S, c, M, idx * 31 + i + 1));
  S.alpha = prevAlpha;
  S.pop();
}

export function drawTheme(theme: Theme, S: Brush, M: MotionCtx, env: Env) {
  if (theme.ground !== undefined) {
    ground(S, env, theme.ground);
    if (theme.shadowFor) {
      const [x, y] = layerWorld(theme, M, M.u, theme.shadowFor);
      const h = clamp((theme.ground - y) / 320, 0, 0.7);
      contactShadow(S, x, theme.ground + 1, theme.shadowSize * (1 - h * 0.5), theme.shadowSize * 0.14 * (1 - h * 0.5), 1 - h);
    }
  }
  S.push();
  S.jitter(1);
  theme.layers.forEach((L, i) => drawLayer(S, L, M, i + 1));
  S.pop();
}

/** 目前主題自帶的色板（只有選了自訂主題才會用到） */
export function currentThemePalette(): Theme['palette'] {
  return themes.current()?.palette;
}

export function themeEvents(theme: Theme): Ev[] {
  return theme.events.map((e) => ({ u: e.u, x: e.x, y: e.y, k: e.k }));
}

export function themeCues(theme: Theme): Cue[] {
  const fromEvents = theme.events.filter((e) => e.sfx).map<Cue>((e) => ({ u: e.u, kind: e.sfx!, k: e.k }));
  return [...fromEvents, ...theme.sounds.map<Cue>((s) => ({ u: s.u, kind: s.sfx, k: s.k }))];
}

// ---------- 已匯入的主題（模組內的狀態；存在這個瀏覽器的 localStorage） ----------
interface Stored {
  id: string;
  json: string;
}
export interface ThemeInfo {
  id: string;
  theme: Theme;
}

const STORE_KEY = 'sf-themes-v1';
let items: { id: string; theme: Theme; json: string }[] = [];
let currentId: string | null = null;
let rev = 0;
const listeners = new Set<() => void>();
const emit = () => {
  rev++;
  listeners.forEach((f) => f());
};

function persist() {
  const data: { list: Stored[]; current: string | null } = { list: items.map((x) => ({ id: x.id, json: x.json })), current: currentId };
  safeStorage.setItem(STORE_KEY, JSON.stringify(data));
}

try {
  const saved = safeStorage.getItem(STORE_KEY);
  if (saved) {
    const o = JSON.parse(saved) as { list: Stored[]; current: string | null };
    for (const s of o.list ?? []) {
      try {
        items.push({ id: s.id, theme: parseTheme(s.json), json: s.json });
      } catch {
        /* 壞掉的略過 */
      }
    }
    currentId = items.some((x) => x.id === o.current) ? o.current : (items[0]?.id ?? null);
  }
} catch {
  /* 存的資料壞了：當作沒有 */
}

export const themes = {
  list: (): ThemeInfo[] => items.map((x) => ({ id: x.id, theme: x.theme })),
  current: (): Theme | null => items.find((x) => x.id === currentId)?.theme ?? null,
  currentId: () => currentId,
  has: () => items.length > 0,
  rev: () => rev,
  /** 匯入並設為目前的主題；失敗會丟出帶有說明的錯誤。同名的會被取代。 */
  add(text: string): ThemeInfo {
    const theme = parseTheme(text);
    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    items = items.filter((x) => x.theme.name !== theme.name);
    items.unshift({ id, theme, json: text });
    items = items.slice(0, THEME_LIMITS.saved);
    currentId = id;
    persist();
    emit();
    return { id, theme };
  },
  use(id: string) {
    if (!items.some((x) => x.id === id)) return;
    currentId = id;
    persist();
    emit();
  },
  remove(id: string) {
    items = items.filter((x) => x.id !== id);
    if (currentId === id) currentId = items[0]?.id ?? null;
    persist();
    emit();
  },
  onChange(f: () => void) {
    listeners.add(f);
    return () => {
      listeners.delete(f);
    };
  },
};

export type { Role };
void TAU;
