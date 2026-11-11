// Agent 用的純函數（不碰瀏覽器、不碰 store，Node 測試直接用）：時間點的名字與附帶資料、修改前後的差異。
import { evalTrack, parseTheme, type Layer, type Theme } from '../engine/themes';
import type { Stamp } from '../store/project';

// ---------- 時間點 ----------
export function flat(layers: Layer[], out: Layer[] = []): Layer[] {
  for (const L of layers) {
    out.push(L);
    flat(L.children, out);
  }
  return out;
}

/** 時間點的名字：最近的事件（有音效就用音效名）或最近的關鍵影格所在的圖層 */
export function stampLabel(theme: Theme | null, t: number): string {
  if (!theme) return '';
  const u = (((t / theme.loop) % 1) + 1) % 1;
  let best = '';
  let bd = 0.3 / theme.loop;
  for (const e of theme.events) {
    const d = Math.abs(e.u - u);
    if (d <= bd) {
      bd = d;
      best = e.sfx ? `事件 ${e.sfx}` : '事件';
    }
  }
  if (best) return best;
  // 沒有事件時找最近的關鍵影格：放寬到前後 0.6 秒
  bd = 0.6 / theme.loop;
  for (const L of flat(theme.layers)) {
    for (const tr of Object.values(L.tracks)) {
      if (!Array.isArray(tr)) continue;
      for (const k of tr) {
        const d = Math.abs(k[0] - u);
        if (d < bd) {
          bd = d;
          best = L.id;
        }
      }
    }
  }
  return best;
}

/** 給 Agent 的時間點資料：時間、循環比例、前後 0.3 秒的事件與關鍵影格、那一刻各圖層的狀態 */
export function stampContext(theme: Theme, s: Stamp): string {
  const u = (((s.t / theme.loop) % 1) + 1) % 1;
  const win = 0.3 / theme.loop;
  const L: string[] = [`@${s.t.toFixed(2)}s（循環的 ${Math.round(u * 100)}%，u=${u.toFixed(3)}）${s.label ? `　最近的是：${s.label}` : ''}`];
  const ev = theme.events.filter((e) => Math.abs(e.u - u) <= win).map((e) => `u=${e.u.toFixed(3)}${e.sfx ? ` 音效 ${e.sfx}` : ''}`);
  if (ev.length) L.push(`  前後 0.3 秒的事件：${ev.join('；')}`);
  const keys: string[] = [];
  const states: string[] = [];
  for (const ly of flat(theme.layers)) {
    const near: string[] = [];
    const st: string[] = [];
    for (const [p, tr] of Object.entries(ly.tracks)) {
      if (tr === undefined) continue;
      if (Array.isArray(tr)) for (const k of tr) if (Math.abs(k[0] - u) <= win) near.push(`${p}@${k[0].toFixed(3)}=${k[1]}`);
      const v = evalTrack(tr, u, null);
      st.push(`${p}=${Math.round(v * 100) / 100}`);
    }
    if (near.length) keys.push(`${ly.id}（${near.join('，')}）`);
    if (st.length) states.push(`${ly.id}：${st.join(' ')}`);
  }
  if (keys.length) L.push(`  前後 0.3 秒的關鍵影格：${keys.slice(0, 20).join('；')}`);
  if (states.length) L.push(`  這一刻的圖層狀態：${states.slice(0, 30).join('；')}`);
  return L.join('\n');
}

// ---------- 修改卡：改了什麼、動到哪段時間、每幀耗時 ----------
type J = unknown;
function countDiff(a: J, b: J): number {
  if (typeof a === 'number' && typeof b === 'number') return a === b ? 0 : 1;
  if (Array.isArray(a) && Array.isArray(b)) {
    let n = Math.abs(a.length - b.length);
    for (let i = 0; i < Math.min(a.length, b.length); i++) n += countDiff(a[i], b[i]);
    return n;
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a as object);
    const kb = Object.keys(b as object);
    let n = 0;
    for (const k of new Set([...ka, ...kb])) n += countDiff((a as Record<string, J>)[k], (b as Record<string, J>)[k]);
    return n;
  }
  return a === b ? 0 : 1;
}

function keyTimes(layers: Layer[], map = new Map<string, Map<string, string>>()) {
  for (const L of flat(layers)) {
    const m = new Map<string, string>();
    for (const [p, tr] of Object.entries(L.tracks)) m.set(p, JSON.stringify(tr));
    map.set(L.id, m);
  }
  return map;
}

/** 比較修改前後：改了幾個值、動到的時間範圍（秒）；沒有關鍵影格的改動（大小、顏色）回傳 null 範圍＝整段 */
export function diffThemes(beforeJson: string | null, after: Theme, afterJson: string): { changed: number; range: [number, number] | null } {
  if (!beforeJson) return { changed: 0, range: null };
  let changed = 0;
  try {
    changed = countDiff(JSON.parse(beforeJson), JSON.parse(afterJson));
  } catch {
    changed = 0;
  }
  let before: Theme;
  try {
    before = parseTheme(beforeJson);
  } catch {
    return { changed, range: null };
  }
  const a = keyTimes(before.layers);
  let lo = Infinity;
  let hi = -Infinity;
  for (const L of flat(after.layers)) {
    const old = a.get(L.id);
    for (const [p, tr] of Object.entries(L.tracks)) {
      const prev = old?.get(p);
      if (prev === JSON.stringify(tr)) continue;
      // 只算真的變了的鍵：鍵 i 變了，動到的是它前後兩段（u[i-1]～u[i+1]）；鍵的數量變了就算整條
      let pt: unknown = null;
      try {
        pt = prev ? JSON.parse(prev) : null;
      } catch {
        pt = null;
      }
      const us: number[] = [];
      if (Array.isArray(tr) && Array.isArray(pt) && pt.length === tr.length) {
        for (let k = 0; k < tr.length; k++) {
          if (JSON.stringify(tr[k]) === JSON.stringify(pt[k])) continue;
          us.push(tr[Math.max(0, k - 1)][0], tr[Math.min(tr.length - 1, k + 1)][0], (pt as [number][])[k][0]);
        }
      } else {
        if (Array.isArray(tr)) us.push(...tr.map((k) => k[0]));
        if (Array.isArray(pt)) us.push(...(pt as [number][]).map((k) => k[0]));
      }
      for (const u of us) {
        lo = Math.min(lo, u);
        hi = Math.max(hi, u);
      }
    }
  }
  if (!Number.isFinite(lo)) return { changed, range: null };
  return { changed, range: [lo * after.loop, hi * after.loop] };
}

