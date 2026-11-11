// 風格牆（2.0 α3，F7）挑哪 8 個風格：同一段內容套 9 種風格（第 1 格是目前的）。
// 「相近／對比」用色板的距離（背景、主色、副色、點綴色）判斷；同一批固定（種子），按「換一批」才換。純函數，Node 可測。
import type { Sel, VisualStyle } from '../data/schema';
import { VISUAL, VISUAL_MAP } from '../data/visual';

export type WallFilter = 'all' | 'near' | 'contrast' | '3d';
export const WALL_SIZE = 8;
/** 混合的篩選裡 3D 格子最多幾個（效能：3D 縮圖比 2D 重很多）；「3D」篩選本身不受限，縮圖排程器的時間預算會控制 */
export const WALL_MAX_3D = 3;

const is3d = (s: VisualStyle) => s.cat === 'dim3d';

function rng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rgb(c: unknown): [number, number, number] | null {
  if (typeof c !== 'string') return null;
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split('').map((x) => x + x).join('') : m[1];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** 色板的特徵：背景、主色、副色、點綴色（沒有寫的角色不算） */
function feature(s: VisualStyle): [number, number, number][] {
  const p = (s.look.pal ?? {}) as Record<string, unknown>;
  return ['bg', 'p', 's', 'a'].map((k) => rgb(p[k])).filter((x): x is [number, number, number] => !!x);
}

export function paletteDistance(a: VisualStyle, b: VisualStyle): number {
  const fa = feature(a);
  const fb = feature(b);
  if (!fa.length || !fb.length) return 1e9;
  const n = Math.min(fa.length, fb.length);
  let d = 0;
  for (let i = 0; i < n; i++) d += Math.hypot(fa[i][0] - fb[i][0], fa[i][1] - fb[i][1], fa[i][2] - fb[i][2]);
  return d / n + (a.cat === b.cat ? 0 : 40);
}

function shuffle<T>(arr: T[], r: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 依篩選挑 8 個風格 id（不含目前混合裡的），3D 最多 WALL_MAX_3D 個；同樣的 batch 結果固定 */
export function wallPicks(current: Sel[], filter: WallFilter, batch: number): string[] {
  const r = rng(batch * 7919 + (filter === 'all' ? 1 : filter === 'near' ? 2 : filter === 'contrast' ? 3 : 4));
  const used = new Set(current.map((x) => x.id));
  const pool = VISUAL.filter((s) => s.look.pal && !used.has(s.id));
  const primary = current.length ? VISUAL_MAP[current[0].id] : undefined;
  let order: VisualStyle[];
  if (filter === '3d') {
    order = shuffle(pool.filter(is3d), r);
  } else if ((filter === 'near' || filter === 'contrast') && primary) {
    const sorted = [...pool].sort((a, b) => paletteDistance(primary, a) - paletteDistance(primary, b));
    // 每一批從排序後的前（或後）面一段裡隨機取：換一批時會換，但都還是「相近」或「對比」
    const span = Math.min(sorted.length, 24);
    const part = filter === 'near' ? sorted.slice(0, span) : sorted.slice(-span).reverse();
    order = shuffle(part, r);
    if (filter === 'contrast') {
      // 對比的再加一條：類別盡量不重複，畫面才會真的不一樣
      const seen = new Set<string>();
      const first = order.filter((s) => (seen.has(s.cat) ? false : (seen.add(s.cat), true)));
      order = [...first, ...order.filter((s) => !first.includes(s))];
    }
  } else {
    order = shuffle(pool, r);
  }
  const out: string[] = [];
  let n3d = 0;
  for (const s of order) {
    if (out.length >= WALL_SIZE) break;
    if (is3d(s) && filter !== '3d') {
      if (n3d >= WALL_MAX_3D) continue;
      n3d++;
    }
    out.push(s.id);
  }
  return out;
}
