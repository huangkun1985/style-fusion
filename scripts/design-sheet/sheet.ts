// 開發用：把一個主體（v1 或 v2）在多個時間點畫成一張接觸表，方便逐幀檢查設計；畫完把 PNG 傳給本機小伺服器（recv.mjs）存成檔案，
// 這樣可以用 Read 工具「看」圖（內建瀏覽器截圖常逾時）。用法見 scripts/design-sheet/README.md。
// 網址參數：s=主體 id（custom＝自訂主題，配合 theme=檔案路徑；music 可加 genre=曲風）、v=1|2、style=圖像風格 id、m=動效風格 id、n=幾格、cols=幾欄、w=每格寬、t0/t1=起訖（0..1）、name=存檔名
//          ?all=1 冒煙測試（全部主體×風格，錯誤記錄在 window.__errs）；?bench=1 每幀耗時（window.__bench）；?full=1 擴大冒煙（window.__full）；
//          ?regress=1 視覺回歸（和基準圖比對，window.__regress）、?regress=save 重存基準圖（要開 recv.mjs）
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
if (!q.get('all') && !q.get('bench') && !q.get('full') && !q.get('regress')) void go();

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

// ?full=1 擴大冒煙測試（1.2.1）：全部圖像風格 × 2D 主體、全部動效 × 2D 主體 × 5 個時間點、極端尺寸、全部 3D 材質 × 3D 主體、3D 運鏡；
// v1／v2 都跑。結果在 window.__full（{ n, errs, blank, ms }）；約 40 秒，用 javascript_tool 分次讀。
if (q.get('full')) {
  void (async () => {
    const t0 = performance.now();
    const ids2d = ['mascot', 'ball', 'walk', 'ui', 'type', 'geo', 'chart', 'loader', 'logo', 'fireworks', 'weather', 'portrait', 'music', 'landscape', 'abstract'] as SubjectId[];
    const ids3d = ['voxel', 'shapes3d', 'char3d', 'text3d', 'terrain3d', 'product3d'] as SubjectId[];
    const v3 = Object.keys(VISUAL_MAP).filter((k) => VISUAL_MAP[k].cat === 'dim3d');
    const v2d = Object.keys(VISUAL_MAP).filter((k) => !v3.includes(k));
    const m3 = Object.keys(MOTION_MAP).filter((k) => MOTION_MAP[k].cat === 'cam3d');
    const errs: string[] = [];
    const blank: string[] = [];
    let n = 0;
    const move0 = resolveMove([], MOTION_MAP, tune);
    const one = (cx: CanvasRenderingContext2D, w: number, h: number, id: SubjectId, lk: ReturnType<typeof resolveLook>, mv: ReturnType<typeof resolveMove>, t: number, tag: string, checkBlank = false) => {
      try {
        r.render(cx, w, h, { subject: id, look: lk, move: mv, tune, time: t * SUBJECTS[id].loop });
        n++;
        if (checkBlank) {
          const d = cx.getImageData(0, 0, w, h).data;
          const set = new Set<number>();
          for (let i = 0; i < d.length; i += 16) set.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
          if (set.size < 3) blank.push(`${tag} colors=${set.size}`);
        }
      } catch (e) {
        errs.push(`${tag}: ${(e as Error).message}`);
      }
    };
    const mk2 = (w: number, h: number) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      return c.getContext('2d', { willReadFrequently: true })!;
    };
    for (const v of ['v2', 'v1'] as const) {
      setSubjectVersion(v);
      const cx = mk2(192, 102);
      for (const id of ids2d) {
        for (const st of v2d) one(cx, 192, 102, id, resolveLook([{ id: st, w: 1 }], VISUAL_MAP, tune), move0, 0.37, `${v} ${id} ${st}`);
        const flat = resolveLook([{ id: 'flat', w: 1 }], VISUAL_MAP, tune);
        for (const m of Object.keys(MOTION_MAP)) {
          const mv = resolveMove([{ id: m, w: 1 }], MOTION_MAP, tune);
          for (const t of [0, 0.21, 0.5, 0.77, 0.999]) one(cx, 192, 102, id, flat, mv, t, `${v} ${id} m=${m} t=${t}`);
        }
        for (const st of ['flat', 'popart', 'pixel8', 'cyberpunk', 'chalk', 'watercolor'].filter((x) => VISUAL_MAP[x])) {
          const lk = resolveLook([{ id: st, w: 1 }], VISUAL_MAP, tune);
          for (const [w, h] of [[108, 192], [150, 150], [260, 100], [48, 27]]) one(mk2(w, h), w, h, id, lk, move0, 0.5, `${v} ${id} ${st} ${w}x${h}`, w === 108);
        }
        await new Promise((res) => setTimeout(res, 0));
      }
      for (const id of ids3d) {
        await r.ready(id);
        for (const st of v3) {
          const lk = resolveLook([{ id: st, w: 1 }], VISUAL_MAP, tune);
          one(mk2(188, 100), 188, 100, id, lk, move0, 0.45, `${v} ${id} ${st}`, st !== 'dither3d');
          one(mk2(90, 160), 90, 160, id, lk, move0, 0.45, `${v} ${id} ${st} 9:16`);
        }
        const lk = resolveLook([{ id: 'matte3d', w: 1 }], VISUAL_MAP, tune);
        for (const m of m3) for (const t of [0.02, 0.5, 0.98]) one(mk2(150, 80), 150, 80, id, lk, resolveMove([{ id: m, w: 1 }], MOTION_MAP, tune), t, `${v} ${id} m=${m} t=${t}`);
        await new Promise((res) => setTimeout(res, 0));
      }
    }
    (window as unknown as { __full: unknown }).__full = { n, errs: errs.slice(0, 50), nErr: errs.length, blank: blank.slice(0, 30), nBlank: blank.length, ms: Math.round(performance.now() - t0) };
  })();
}

// ?regress=1 視覺回歸（1.3.0）：固定的一組「主體 × 風格 × 時間點」畫成一張總表，和 baseline/atlas.png 逐格比對，
// 差異大的格子列在 window.__regress（{ tiles, changed, ms }）。改了共用程式（brush、背景、後期…）後跑一次，確認沒有意外改到別的主體，
// 尤其是 v1（使用者要拿來比較新舊，不能變）。真的要改外觀時：開 recv.mjs 到 scripts/design-sheet/baseline，再開 ?regress=save 重存基準圖。
if (q.get('regress')) {
  void (async () => {
    const t0 = performance.now();
    await document.fonts.ready;
    const TW = 160;
    const TH = 85;
    const all = ['mascot', 'ball', 'walk', 'ui', 'type', 'geo', 'chart', 'loader', 'logo', 'fireworks', 'weather', 'portrait', 'music', 'landscape', 'abstract', 'voxel', 'shapes3d', 'char3d', 'text3d', 'terrain3d', 'product3d'] as SubjectId[];
    const v1ids = ['mascot', 'ball', 'walk', 'ui', 'type', 'geo', 'chart', 'landscape', 'abstract', 'shapes3d', 'char3d', 'text3d', 'terrain3d', 'voxel'] as SubjectId[];
    const jobs: { v: 'v1' | 'v2'; id: SubjectId; st: string; t: number }[] = [];
    for (const id of all) for (const st of id.endsWith('3d') || id === 'voxel' ? ['cel3d', 'matte3d', 'wire3d'] : ['flat', 'pixel8', 'cyberpunk']) jobs.push({ v: 'v2', id, st, t: 0.35 });
    for (const id of v1ids) jobs.push({ v: 'v1', id, st: id.endsWith('3d') || id === 'voxel' ? 'cel3d' : 'flat', t: 0.35 });
    const cols = 10;
    const rows = Math.ceil(jobs.length / cols);
    const atlas = document.createElement('canvas');
    atlas.width = cols * TW;
    atlas.height = rows * TH;
    const actx = atlas.getContext('2d', { willReadFrequently: true })!;
    const c = document.createElement('canvas');
    c.width = TW;
    c.height = TH;
    const cx = c.getContext('2d')!;
    const move0 = resolveMove([], MOTION_MAP, tune);
    for (let i = 0; i < jobs.length; i++) {
      const j = jobs[i];
      setSubjectVersion(j.v);
      await r.ready(j.id);
      r.render(cx, TW, TH, { subject: j.id, look: resolveLook([{ id: j.st, w: 1 }], VISUAL_MAP, tune), move: move0, tune, time: j.t * SUBJECTS[j.id].loop });
      actx.drawImage(c, (i % cols) * TW, Math.floor(i / cols) * TH);
    }
    setSubjectVersion('v2');
    if (q.get('regress') === 'save') {
      await fetch('http://localhost:5555/save?name=atlas', { method: 'POST', body: atlas.toDataURL('image/png') });
      (window as unknown as { __regress: unknown }).__regress = { saved: jobs.length };
      return;
    }
    const img = new Image();
    const loaded = await new Promise<boolean>((res) => {
      img.onload = () => res(true);
      img.onerror = () => res(false);
      img.src = `/scripts/design-sheet/baseline/atlas.png?${Date.now()}`;
    });
    if (!loaded || img.width !== atlas.width || img.height !== atlas.height) {
      (window as unknown as { __regress: unknown }).__regress = { error: loaded ? '基準圖尺寸不同（格數變了）：請重存基準圖' : '找不到基準圖：先用 ?regress=save 存一份' };
      return;
    }
    const b = document.createElement('canvas');
    b.width = img.width;
    b.height = img.height;
    const bctx = b.getContext('2d', { willReadFrequently: true })!;
    bctx.drawImage(img, 0, 0);
    const changed: string[] = [];
    for (let i = 0; i < jobs.length; i++) {
      const x = (i % cols) * TW;
      const y = Math.floor(i / cols) * TH;
      const A = actx.getImageData(x, y, TW, TH).data;
      const B = bctx.getImageData(x, y, TW, TH).data;
      let k = 0;
      for (let p = 0; p < A.length; p += 4) if (Math.abs(A[p] - B[p]) + Math.abs(A[p + 1] - B[p + 1]) + Math.abs(A[p + 2] - B[p + 2]) > 48) k++;
      const pct = (k / (TW * TH)) * 100;
      if (pct > 1) changed.push(`${jobs[i].v} ${jobs[i].id} ${jobs[i].st}: ${pct.toFixed(1)}%`);
    }
    (window as unknown as { __regress: unknown }).__regress = { tiles: jobs.length, changed, ms: Math.round(performance.now() - t0) };
  })();
}
