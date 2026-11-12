// 風格包（2.0 β，F11）：把一支片子交付出去需要的東西打成一個 ZIP——
//   提案影片.mp4（整支片子，含配樂與音效）、規格.html（一個檔就能開的規格網頁：每一場的畫面、色板、緩動、節奏、代碼、標記、授權）、
//   色板/（JSON、CSS 變數、SVG 色票）、代碼/（每一場的 CSS、GSAP、After Effects 表達式、給 AI Agent 的 JSON）、
//   分軌/（MIDI 方案才有：每個聲部一個 WAV＋MIDI）、專案.sfproj（用 Style Fusion「開啟檔案」就能繼續改）、讀我.txt（內容與授權）。
// 用串流 ZIP（審查 R-03）：每個檔案做完就放進去、釋放。
import { audioEngine } from '../audio/engine';
import { makeStems, stemsSupported, ZipStream } from '../audio/files';
import { writeMidi } from '../audio/midi';
import { SCHEME_INFO } from '../audio/render';
import { inScope, Renderer } from '../engine/renderer';
import { SUBJECTS } from '../engine/subjects';
import type { Look } from '../engine/types';
import { FilmCues, filmModel, mmss, shotFrame, type FilmModel, type FilmShot } from '../store/film';
import { currentProject, fileSafe } from '../store/persist';
import { stashActive } from '../store/scenes';
import { useStore } from '../store/store';
import { aeCode, cssCode, gsapCode, jsonCode, makeBrief, type Brief } from './brief';
import { canMp4, runExport } from './exporter';

export interface PackOpts {
  video: boolean;
  stems: boolean;
  /** 影片短邊 */
  short: number;
  fps: number;
  aspect: number;
}

const enc = new TextEncoder();
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function paletteFiles(b: Brief, n: number) {
  const json = JSON.stringify(Object.fromEntries(b.palette.map((p) => [p.role, { name: p.name, hex: p.hex }])), null, 2);
  const css = `/* 場景 ${n} 的色板（Style Fusion）：每個顏色都是「色板角色」，換色時改這裡就好 */\n:root {\n${b.palette.map((p) => `  --sf-${p.role}: ${p.hex}; /* ${p.name} */`).join('\n')}\n}\n`;
  const W = 120;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${b.palette.length * W}" height="150" font-family="sans-serif" font-size="12">${b.palette
    .map((p, i) => `<rect x="${i * W}" y="0" width="${W}" height="100" fill="${p.hex}"/><text x="${i * W + 8}" y="120">${esc(p.name)}</text><text x="${i * W + 8}" y="138" fill="#666">${p.hex}</text>`)
    .join('')}</svg>`;
  return { json, css, svg };
}

function easeSvg(b: Brief) {
  const [x1, y1, x2, y2] = b.bezier;
  const P = (x: number, y: number) => `${(x * 100).toFixed(1)},${(100 - y * 100).toFixed(1)}`;
  return `<svg viewBox="-6 -26 112 152" width="112" height="152" aria-label="緩動曲線"><rect x="0" y="0" width="100" height="100" fill="none" stroke="currentColor" stroke-opacity=".18"/><path d="M${P(0, 0)} C${P(x1, y1)} ${P(x2, y2)} ${P(1, 1)}" fill="none" stroke="currentColor" stroke-width="2"/></svg>`;
}

/** 每一場的代表畫面（JPEG data URL），規格頁用 */
function poster(r: Renderer, sh: FilmShot, w: number, h: number): string {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d')!;
  const hero = inScope(sh.scope, () => SUBJECTS[sh.subject].hero);
  r.render(ctx, w, h, shotFrame(sh, sh.loop * (Number.isFinite(hero) ? hero : 0.4)));
  return cv.toDataURL('image/jpeg', 0.86);
}

function specHtml(name: string, film: FilmModel, rows: { sh: FilmShot; b: Brief; img: string; css: string; gsap: string; ae: string }[], markers: { t: number; label: string }[], sounds: { name: string; author: string; license: string; page: string }[], files: string[]) {
  const music = film.plan;
  const scene = (r: (typeof rows)[number]) => `
<section class="scene">
  <div class="head"><h2>${r.sh.index + 1}　${esc(r.sh.name)}</h2><span class="num">${mmss(r.sh.start)} – ${mmss(r.sh.start + r.sh.dur)}（${r.sh.dur.toFixed(2)} 秒）${r.sh.trans === 'fade' ? '・從上一場淡進來' : ''}・配樂段落：${esc(r.sh.section)}</span></div>
  <div class="grid">
    <img src="${r.img}" alt="${esc(r.sh.name)} 的代表畫面">
    <div>
      <p class="mix"><b>${esc(r.b.title)}</b></p>
      <p>圖像風格：${r.b.vs.map((x) => `${esc(x.s.name)} ${Math.round(x.w * 100)}%`).join('、') || '—'}</p>
      <p>動效風格：${r.b.ms.map((x) => `${esc(x.s.name)} ${Math.round(x.w * 100)}%`).join('、') || '—'}</p>
      <p>主體：${esc(SUBJECTS[r.sh.subject].name)}・一個循環 ${r.sh.loop.toFixed(2)} 秒・${esc(r.b.fps)}</p>
      <div class="sw">${r.b.palette.map((p) => `<span><i style="background:${p.hex}"></i>${esc(p.name)}<br><code>${p.hex}</code></span>`).join('')}</div>
      <div class="ease">${easeSvg(r.b)}<div><p>緩動：${esc(r.b.easeLabel)}</p><p><code>cubic-bezier(${r.b.bezier.map((x) => x.toFixed(3)).join(', ')})</code></p><p>單次動作約 ${r.b.durMs} ms・錯峰 ${r.b.staggerMs} ms</p><p>${r.b.render.map(esc).join('・')}</p>${r.b.fx.length ? `<p>後期：${r.b.fx.map((f) => esc(f.name)).join('、')}</p>` : ''}</div></div>
    </div>
  </div>
  <details><summary>CSS</summary><pre>${esc(r.css)}</pre></details>
  <details><summary>GSAP</summary><pre>${esc(r.gsap)}</pre></details>
  <details><summary>After Effects 表達式</summary><pre>${esc(r.ae)}</pre></details>
</section>`;
  return `<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(name)} 規格</title>
<style>
:root{--bg:#f6f5f2;--panel:#fff;--fg:#1c1c1a;--fg2:#5d5c57;--line:#e2e0da;--accent:#b8730a}
@media (prefers-color-scheme:dark){:root{--bg:#121316;--panel:#1b1d21;--fg:#ecebe7;--fg2:#a3a29c;--line:#2c2f35;--accent:#ffb648}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.65 system-ui,"Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif}
main{max-width:1080px;margin:0 auto;padding:32px 16px 64px}h1{font-size:24px;margin:0 0 4px}h2{font-size:16px;margin:0}
.num,code{font-variant-numeric:tabular-nums;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12.5px}
.meta{color:var(--fg2);margin:0 0 24px}.card,.scene{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:16px;margin:0 0 16px}
.head{display:flex;flex-wrap:wrap;gap:4px 12px;align-items:baseline;margin-bottom:12px}.head span{color:var(--fg2)}
.grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.2fr);gap:16px}@media (max-width:720px){.grid{grid-template-columns:1fr}}
img{width:100%;border-radius:8px;display:block}p{margin:2px 0}.mix{font-size:15px}
.sw{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}.sw span{font-size:11px;color:var(--fg2);width:72px}.sw i{display:block;height:36px;border-radius:6px;border:1px solid var(--line);margin-bottom:2px}
.ease{display:flex;gap:12px;align-items:flex-start;color:var(--fg)}.ease svg{flex:none;color:var(--accent)}.ease p{color:var(--fg2)}
details{margin-top:8px}summary{cursor:pointer;color:var(--accent)}pre{overflow:auto;background:var(--bg);padding:12px;border-radius:8px;font-size:12px;line-height:1.5}
table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}th{color:var(--fg2);font-weight:600}
.bar{display:flex;height:28px;border-radius:6px;overflow:hidden;margin:8px 0 4px}.bar div{border-right:2px solid var(--panel);background:var(--accent);opacity:.75;color:#000;font-size:11px;padding:0 6px;line-height:28px;white-space:nowrap;overflow:hidden}
.bar div:nth-child(2n){opacity:.5}
</style></head><body><main>
<h1>${esc(name)}</h1>
<p class="meta">Style Fusion 風格包・${film.shots.length} 場・總長 ${film.total.toFixed(2)} 秒・${new Date().toLocaleDateString('zh-TW')}</p>
<div class="card">
  <h2>整支片子</h2>
  <div class="bar">${film.shots.map((sh) => `<div style="flex:${sh.dur}" title="${esc(sh.name)}">${sh.index + 1} ${esc(sh.name)}</div>`).join('')}</div>
  <p>配樂：${esc(music.song.title)}・${esc(SCHEME_INFO[music.scheme]?.name ?? music.scheme)}・${film.scored ? `每一場一個段落（${film.shots.map((x) => esc(x.section)).join(' → ')}），結尾有收尾` : '照原曲循環'}・${film.sync === 'picture' ? '畫面遷就音樂（換場落在小節線上）' : `音樂遷就畫面（速度 ${film.drift >= 0 ? '+' : ''}${(film.drift * 100).toFixed(1)}%）`}</p>
  ${markers.length ? `<h2 style="margin-top:12px">標記</h2><table><tr><th>時間</th><th>名稱</th></tr>${markers.map((m) => `<tr><td class="num">${mmss(m.t)}</td><td>${esc(m.label)}</td></tr>`).join('')}</table>` : ''}
</div>
${rows.map(scene).join('\n')}
<div class="card">
  <h2>這個包裡有什麼</h2>
  <table>${files.map((f) => `<tr><td><code>${esc(f)}</code></td></tr>`).join('')}</table>
</div>
<div class="card">
  <h2>授權</h2>
  <p>畫面、動畫、合成音色與合成音效都是 Style Fusion 用程式即時計算的。配樂若用「MIDI（真實樂器）」或「XM」方案，含有開放授權的樂器取樣（以 CC0 為主），來源見 Style Fusion 的 CREDITS.md；商業發行前請自行確認。</p>
  ${sounds.length ? `<table><tr><th>真實音效</th><th>作者</th><th>授權</th><th>來源</th></tr>${sounds.map((s) => `<tr><td>${esc(s.name)}</td><td>${esc(s.author)}</td><td>${esc(s.license)}${s.license === 'BY' ? '（使用時要標示作者）' : s.license === 'BY-NC' ? '（不可商用）' : ''}</td><td>${s.page ? `<a href="${esc(s.page)}">${esc(s.page)}</a>` : '—'}</td></tr>`).join('')}</table>` : '<p>沒有用到下載的真實音效。</p>'}
</div>
</main></body></html>`;
}

/** 做風格包：onPhase(說明, 0..1) 回報進度 */
export async function makeStylePack(o: PackOpts, onPhase: (text: string, p: number) => void, signal?: AbortSignal): Promise<{ blob: Blob; name: string; note?: string }> {
  const s = useStore.getState();
  const film = filmModel(s);
  const scenes = stashActive(s);
  const base = fileSafe(s.projectName);
  const zip = new ZipStream();
  const files: string[] = [];
  const add = (path: string, data: Uint8Array | string) => {
    zip.add(path, typeof data === 'string' ? enc.encode(data) : data);
    files.push(path);
  };
  const notes: string[] = [];

  // 1) 每一場：代表畫面、色板、代碼
  onPhase('整理每一場的規格…', 0.02);
  const r = new Renderer(true);
  const rows: { sh: FilmShot; b: Brief; img: string; css: string; gsap: string; ae: string }[] = [];
  try {
    for (const sh of film.shots) {
      await r.ready(sh.subject);
      const sc = scenes[sh.index];
      const b = inScope(sh.scope, () => makeBrief(sc.mix.v, sc.mix.m, sh.look as Look, sh.move, sh.subject, sh.tune));
      const n = sh.index + 1;
      const tag = `${String(n).padStart(2, '0')}-${fileSafe(sh.name)}`;
      const pal = paletteFiles(b, n);
      add(`色板/${tag}.json`, pal.json);
      add(`色板/${tag}.css`, pal.css);
      add(`色板/${tag}.svg`, pal.svg);
      const css = cssCode(b, sh.move);
      const gsap = gsapCode(b, sh.move);
      const ae = aeCode(b, sh.move);
      add(`代碼/${tag}.css`, css);
      add(`代碼/${tag}.gsap.js`, gsap);
      add(`代碼/${tag}.ae.txt`, ae);
      add(`代碼/${tag}.json`, inScope(sh.scope, () => jsonCode(sc.mix.v, sc.mix.m, sh.subject, sh.tune, sh.look, sh.move)));
      rows.push({ sh, b, img: poster(r, sh, 640, Math.round(640 / o.aspect)), css, gsap, ae });
    }
  } finally {
    r.dispose();
  }
  if (signal?.aborted) throw new Error('已取消');

  // 2) 提案影片（整支片子）
  if (o.video) {
    if (!canMp4) notes.push('這個瀏覽器不能編碼 MP4，風格包裡沒有提案影片（請用 Chrome 或 Edge 再做一次）。');
    else {
      onPhase('渲染配樂…', 0.1);
      const p = audioEngine.soundPrefs();
      const audio = p.on && (p.bgm || p.sfx) ? await audioEngine.exportFilmMix(film.plan, new FilmCues(film, o.aspect), film.total) : null;
      if (!audio) notes.push('聲音是關著的，提案影片沒有聲音（要聲音請先開聲音再做一次）。');
      const w = Math.round(o.aspect >= 1 ? o.short * o.aspect : o.short);
      const h = Math.round(o.aspect >= 1 ? o.short : o.short / o.aspect);
      const sh0 = film.shots[0];
      const res = await runExport(
        { format: 'mp4', subject: sh0.subject, look: sh0.look, move: sh0.move, tune: sh0.tune, w: w - (w % 2), h: h - (h % 2), fps: o.fps, loops: 1, film, audio, name: '提案影片' },
        (x) => onPhase('逐格渲染提案影片…', 0.12 + x * 0.6),
        signal,
      );
      if (res.note) notes.push(res.note);
      add('提案影片.mp4', new Uint8Array(await res.blob.arrayBuffer()));
    }
  }

  // 3) 分軌（只有 MIDI 方案，審查 R-15）
  if (o.stems) {
    if (!stemsSupported(film.plan.scheme)) notes.push('分軌只支援「MIDI（真實樂器）」聲音方案，這次沒有放分軌。');
    else {
      await makeStems(film.plan, (x) => onPhase('渲染分軌…', 0.74 + x * 0.16), { zip, dir: '分軌/' });
      files.push('分軌/（每個聲部一個 WAV、song.mid、讀我.txt）');
    }
  } else add('配樂.mid', writeMidi(film.plan.song));
  if (signal?.aborted) throw new Error('已取消');

  // 4) 專案檔、規格頁、讀我
  onPhase('寫規格頁…', 0.92);
  const proj = currentProject();
  add(`${base}.sfproj`, JSON.stringify(proj, null, 2));
  const sounds = (s.sounds ?? []).filter((x) => Object.values(s.sfxMap).includes(x.id));
  const listed = ['規格.html', '讀我.txt', ...files];
  add('規格.html', specHtml(s.projectName, film, rows, film.markers, sounds, listed));
  const readme = [
    `Style Fusion 風格包：${s.projectName}`,
    '',
    `${film.shots.length} 場、總長 ${film.total.toFixed(2)} 秒。`,
    '',
    '先打開「規格.html」（瀏覽器就能看）：每一場的畫面、色板、緩動、節奏、代碼、片子的標記與授權都在裡面。',
    '',
    '內容：',
    o.video && canMp4 ? '・提案影片.mp4　整支片子（含淡轉場、配樂與音效）' : '',
    '・色板/　每一場的色板：JSON、CSS 變數、SVG 色票',
    '・代碼/　每一場的 CSS、GSAP、After Effects 表達式、給 AI Agent 的 JSON 規格',
    o.stems && stemsSupported(film.plan.scheme) ? '・分軌/　配樂每個聲部一個 WAV（加總就是混音）＋ MIDI' : '・配樂.mid　配樂的標準 MIDI',
    `・${base}.sfproj　專案檔：在 Style Fusion 按專案名稱 ▾ →「開啟檔案」就能繼續改（任何一台電腦都可以）`,
    '',
    sounds.length ? '真實音效的授權：' : '',
    ...sounds.map((x) => `・${x.name}　作者 ${x.author}　${x.license}${x.license === 'BY' ? '（使用時要標示作者）' : x.license === 'BY-NC' ? '（不可商用）' : ''}　${x.page}`),
    notes.length ? '' : '',
    ...notes.map((n) => `注意：${n}`),
  ]
    .filter((x, i, a) => x !== '' || a[i - 1] !== '')
    .join('\r\n');
  add('讀我.txt', readme);
  onPhase('打包…', 0.97);
  const blob = await zip.blob();
  onPhase('完成', 1);
  return { blob, name: `${base}-風格包.zip`, note: notes.join(' ') || undefined };
}
