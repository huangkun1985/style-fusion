// 開發用：把一個主體（v1 或 v2）在多個時間點畫成一張接觸表，方便逐幀檢查設計；畫完把 PNG 傳給本機小伺服器（recv.mjs）存成檔案，
// 這樣可以用 Read 工具「看」圖（內建瀏覽器截圖常逾時）。用法見 scripts/design-sheet/README.md。
// 網址參數：s=主體 id（custom＝自訂主題，配合 theme=檔案路徑；music 可加 genre=曲風）、v=1|2、style=圖像風格 id、m=動效風格 id、n=幾格、cols=幾欄、w=每格寬、t0/t1=起訖（0..1）、name=存檔名
//          ?all=1 冒煙測試（全部主體×風格，錯誤記錄在 window.__errs）；?bench=1 每幀耗時（window.__bench）
import { MOTION_MAP } from '../../src/data/motion';
import { VISUAL_MAP } from '../../src/data/visual';
import { preloadFonts } from '../../src/engine/fonts';
import { Renderer } from '../../src/engine/renderer';
import { resolveLook, resolveMove, TUNE_DEFAULT } from '../../src/engine/resolve';
import { SUBJECTS, setSubjectVersion } from '../../src/engine/subjects';
import { currentThemePalette, themes } from '../../src/engine/themes';
import type { SubjectId } from '../../src/engine/types';
import { composeSong } from '../../src/audio/compose';
import { setLiveSong } from '../../src/engine/liveSong';

const q = new URLSearchParams(location.search);
// theme=<專案內的路徑>：先把這個動畫主題檔匯入（只存在這個預覽瀏覽器），再畫 s=custom
const themePath = q.get('theme');
if (themePath) themes.add(await (await fetch('/' + themePath)).text());
// genre=<曲風 id>（＆seed=）：給「音樂視覺化」主體一首指定曲風的歌（App 裡是 AudioBridge 設定目前的配樂）
if (q.get('genre')) setLiveSong(composeSong({ genre: q.get('genre') as never, seed: parseInt(q.get('seed') ?? '7'), animSeconds: 8, sync: true, tempo: 1, key: -1 }));
const subject = (q.get('s') ?? 'mascot') as SubjectId;
const ver = q.get('v') === '1' ? 'v1' : 'v2';
const style = q.get('style') ?? 'flat';
const motion = q.get('m') ?? '';
const n = Math.max(1, Math.min(12, parseInt(q.get('n') ?? '6')));
const cols = parseInt(q.get('cols') ?? '3');
const fw = parseInt(q.get('w') ?? '480');
const ar = parseFloat(q.get('ar') ?? String(16 / 9)); // 長寬比；App 預設的「填滿」約 1.88
const fh = Math.round(fw / ar);
const t0 = parseFloat(q.get('t0') ?? '0.04');
const t1 = parseFloat(q.get('t1') ?? '0.96');

setSubjectVersion(ver);
preloadFonts();
const tune = { ...TUNE_DEFAULT };
const look = resolveLook([{ id: style, w: 1 }], VISUAL_MAP, tune, subject === 'custom' ? currentThemePalette() : undefined);
const move = resolveMove(motion ? [{ id: motion, w: 1 }] : [], MOTION_MAP, tune);
const sub = SUBJECTS[subject];
const L = sub.loop;
const r = new Renderer();
(window as unknown as { __r: Renderer }).__r = r; // 供測試：從主控台模擬 WebGL 被收回
const rows = Math.ceil(n / cols);
const cv = document.getElementById('c') as HTMLCanvasElement;
cv.width = cols * fw;
cv.height = rows * fh;
const ctx = cv.getContext('2d')!;
document.getElementById('info')!.textContent = `${subject} ${ver} style=${style} loop=${L}s  (${sub.name})`;

// 供測試：用目前的風格畫一格並回傳「不同顏色的數量」（8-bit 像素風經過色板量化後會非常少；沒套到後期特效時會是幾千種）
(window as unknown as { __probe: () => number }).__probe = () => {
  const c = document.createElement('canvas');
  c.width = 640;
  c.height = 360;
  const cx = c.getContext('2d')!;
  r.render(cx, 640, 360, { subject, look, move, tune, time: 0.45 * L });
  const d = cx.getImageData(0, 0, 640, 360).data;
  const set = new Set<number>();
  for (let i = 0; i < d.length; i += 4) set.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
  return set.size;
};

// 供測試：閃爍探測。以很小的時間間隔連續畫 n 格，回傳相鄰兩格「差很多的像素」比例（正常動畫變化很小；陰影／深度打架會讓局部像素大幅跳動）。
// opts.noShadow 會先關掉陰影貼圖，用來判斷閃爍是否來自陰影。
(window as unknown as { __flick: (n: number, dt: number, noShadow?: boolean) => number[] }).__flick = (n, dt, noShadow) => {
  const th = (r as unknown as { three?: { renderer: { shadowMap: { enabled: boolean }; dispose?: () => void } } }).three;
  if (th) {
    th.renderer.shadowMap.enabled = !noShadow;
    // 關閉／開啟陰影後材質需要重新編譯
    (th as unknown as { cache?: Map<string, { root: { traverse: (f: (o: unknown) => void) => void } }> }).cache?.forEach((b) => b.root.traverse((o) => { const m = (o as { material?: { needsUpdate: boolean } }).material; if (m) m.needsUpdate = true; }));
  }
  const c = document.createElement('canvas');
  c.width = 480;
  c.height = 256;
  const cx = c.getContext('2d', { willReadFrequently: true })!;
  let prev: Uint8ClampedArray | null = null;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    r.render(cx, 480, 256, { subject, look, move, tune, time: (0.3 + i * dt) * L });
    const d = cx.getImageData(0, 0, 480, 256).data;
    if (prev) {
      let k = 0;
      for (let j = 0; j < d.length; j += 4) if (Math.abs(d[j] - prev[j]) + Math.abs(d[j + 1] - prev[j + 1]) + Math.abs(d[j + 2] - prev[j + 2]) > 90) k++;
      out.push(k / (d.length / 4));
    }
    prev = new Uint8ClampedArray(d);
  }
  return out;
};

async function go() {
  await r.ready(subject);
  await new Promise((res) => setTimeout(res, 600));
  for (let i = 0; i < n; i++) {
    const u = n === 1 ? t0 : t0 + ((t1 - t0) * i) / (n - 1);
    const c = document.createElement('canvas');
    c.width = fw;
    c.height = fh;
    const cx = c.getContext('2d')!;
    r.render(cx, fw, fh, { subject, look, move, tune, time: u * L, noPost: false });
    ctx.drawImage(c, (i % cols) * fw, Math.floor(i / cols) * fh);
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    ctx.fillRect((i % cols) * fw, Math.floor(i / cols) * fh, 52, 16);
    ctx.fillStyle = '#fff';
    ctx.font = '11px monospace';
    ctx.fillText(`u=${u.toFixed(2)}`, (i % cols) * fw + 4, Math.floor(i / cols) * fh + 12);
  }
  (window as unknown as { __done: boolean }).__done = true;
  const name = q.get('name') ?? `${subject}_${ver}_${style}`;
  await fetch(`http://localhost:5555/save?name=${name}`, { method: 'POST', body: cv.toDataURL('image/png') }).catch(() => undefined);
}
if (!q.get('all') && !q.get('bench')) void go();

if (q.get('all')) {
  void (async () => {
    const ids = ['mascot', 'ball', 'walk', 'ui', 'type', 'geo', 'chart', 'loader', 'logo', 'fireworks', 'weather', 'portrait', 'music', 'landscape', 'abstract', 'voxel', 'shapes3d', 'char3d', 'text3d', 'terrain3d', 'product3d'] as SubjectId[];
    const styles = ['flat', 'popart', 'pixel8', 'watercolor', 'cel3d', 'matte3d', 'neon3d', 'lowpoly3d', 'wire3d', 'paper3d', 'glass3d', 'clay3d', 'holo3d', 'stickynote', 'ransom'].filter((s) => VISUAL_MAP[s]);
    const errs: string[] = [];
    let cnt = 0;
    for (const v of ['v1', 'v2'] as const) {
      setSubjectVersion(v);
      for (const id of ids) {
        await r.ready(id);
        for (const st of styles) {
          const lk = resolveLook([{ id: st, w: 1 }], VISUAL_MAP, tune);
          const c = document.createElement('canvas');
          c.width = 320;
          c.height = 180;
          for (const t of [0.1, 0.5, 0.9]) {
            try {
              r.render(c.getContext('2d')!, 320, 180, { subject: id, look: lk, move, tune, time: t * SUBJECTS[id].loop });
              cnt++;
            } catch (e) {
              errs.push(`${v} ${id} ${st} ${t}: ${(e as Error).message}`);
            }
          }
        }
      }
    }
    (window as unknown as { __errs: string[]; __n: number }).__errs = errs;
    (window as unknown as { __n: number }).__n = cnt;
  })();
}

if (q.get('bench')) {
  void (async () => {
    const ids = ['mascot', 'ball', 'walk', 'ui', 'type', 'geo', 'chart', 'loader', 'logo', 'fireworks', 'weather', 'portrait', 'music', 'landscape', 'abstract'] as SubjectId[];
    const lk = resolveLook([{ id: 'flat', w: 1 }], VISUAL_MAP, tune);
    const res: Record<string, string> = {};
    for (const id of ids) {
      for (const v of ['v1', 'v2'] as const) {
        setSubjectVersion(v);
        const c = document.createElement('canvas');
        c.width = 640;
        c.height = 360;
        const cx = c.getContext('2d')!;
        const tt = performance.now();
        for (let i = 0; i < 30; i++) r.render(cx, 640, 360, { subject: id, look: lk, move, tune, time: (i / 30) * SUBJECTS[id].loop });
        res[`${id} ${v}`] = ((performance.now() - tt) / 30).toFixed(1);
      }
    }
    (window as unknown as { __bench: Record<string, string> }).__bench = res;
  })();
}

// 供測試：對一個主體×風格跑閃爍探測並回傳平均與最大（相鄰兩格差異大的像素比例，%）
(window as unknown as { __flickScan: (ids: string[], styleId: string, dt: number) => Promise<Record<string, string>> }).__flickScan = async (ids, styleId, dt) => {
  const res: Record<string, string> = {};
  const lk = resolveLook([{ id: styleId, w: 1 }], VISUAL_MAP, tune);
  for (const id of ids) {
    await r.ready(id as SubjectId);
    const sub2 = SUBJECTS[id as SubjectId];
    const c = document.createElement('canvas');
    c.width = 480;
    c.height = 256;
    const cx = c.getContext('2d', { willReadFrequently: true })!;
    let prev: Uint8ClampedArray | null = null;
    const vals: number[] = [];
    for (let i = 0; i < 16; i++) {
      r.render(cx, 480, 256, { subject: id as SubjectId, look: lk, move, tune, time: (0.3 + i * dt) * sub2.loop });
      const d = cx.getImageData(0, 0, 480, 256).data;
      if (prev) {
        let k = 0;
        for (let j = 0; j < d.length; j += 4) if (Math.abs(d[j] - prev[j]) + Math.abs(d[j + 1] - prev[j + 1]) + Math.abs(d[j + 2] - prev[j + 2]) > 90) k++;
        vals.push(k / (d.length / 4));
      }
      prev = new Uint8ClampedArray(d);
    }
    res[id] = `${((vals.reduce((a, b) => a + b, 0) / vals.length) * 100).toFixed(2)}% max ${(Math.max(...vals) * 100).toFixed(2)}%`;
  }
  return res;
};
