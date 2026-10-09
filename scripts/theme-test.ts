// 開發用：自訂動畫主題（匯入功能）的自動檢查。用法：npx tsx scripts/theme-test.ts
import { MOTION_MAP } from '../src/data/motion';
import type { Env } from '../src/engine/env';
import { MotionCtx } from '../src/engine/motion';
import { VISUAL_MAP } from '../src/data/visual';
import { resolveLook, resolveMove, TUNE_DEFAULT } from '../src/engine/resolve';
import { SUBJECTS } from '../src/engine/subjects';
import { drawTheme, evalTrack, layerWorld, parseTheme, themeCues, themeEvents, themes, THEME_LIMITS, type Track } from '../src/engine/themes';
import { TEMPLATE_BOX, TEMPLATE_ORBIT, THEME_TEMPLATES, templateJson, themeAiPrompt } from '../src/engine/themeTemplates';

let fails = 0;
const ok = (c: boolean, msg: string) => {
  if (!c) {
    fails++;
    console.log('  ✗', msg);
  }
};
const near = (a: number, b: number, e = 1e-6) => Math.abs(a - b) < e;
const base = (over: Record<string, unknown> = {}) => ({ format: 'style-fusion-theme', version: 1, name: 't', layers: [{ type: 'circle', r: 10 }], ...over });
const fail = (obj: unknown, expect: string, label: string) => {
  let msg = '';
  try {
    parseTheme(typeof obj === 'string' ? obj : JSON.stringify(obj));
  } catch (e) {
    msg = (e as Error).message;
  }
  ok(msg.includes(expect), `${label}：預期訊息含「${expect}」，實際是「${msg.slice(0, 120)}」`);
};

// 1) 範本：能解析、沒有提醒、輸出的檔案可以再讀回來
for (const t of THEME_TEMPLATES) {
  const th = parseTheme(templateJson(t.data));
  ok(th.warnings.length === 0, `${t.id}：範本不該有提醒：${th.warnings}`);
  ok(th.layers.length >= 1 && th.loop > 0, `${t.id}：基本欄位`);
  ok(JSON.stringify(parseTheme(JSON.stringify(t.data)).layers) === JSON.stringify(th.layers), `${t.id}：解析是確定的`);
}
const box = parseTheme(JSON.stringify(TEMPLATE_BOX));
const orbit = parseTheme(JSON.stringify(TEMPLATE_ORBIT));
ok(box.ground === 122 && box.shadowFor === 'box' && box.track === 'box', '彈跳盒子：地面、影子、軌跡');
ok(themeEvents(box).length === 1 && themeCues(box)[0].kind === 'land', '事件與音效點');
ok(themeCues(orbit).length === 2 && themeCues(orbit)[0].kind === 'whoosh' && themeEvents(orbit).length === 0, 'sounds 只出聲、不產生事件特效');
{
  const none = parseTheme(JSON.stringify(base({ events: [{ u: 0.5, x: 0, y: 0 }] })));
  ok(themeCues(none).length === 0 && none.warnings.some((w) => w.includes('沒有指定任何音效')), '沒有 sfx 的事件不產生音效點，且匯入時提醒無聲');
  const mix = parseTheme(JSON.stringify(base({ events: [{ u: 0.4, sfx: 'land' }], sounds: [{ u: 0.1, sfx: 'whoosh', k: 0.9 }] })));
  ok(themeCues(mix).length === 2 && !mix.warnings.some((w) => w.includes('沒有指定任何音效')), 'events 的 sfx 與 sounds 合併成音效點');
}
ok(themeAiPrompt().includes('style-fusion-theme') && themeAiPrompt().includes('彈跳盒子') && themeAiPrompt().length < 12000, 'AI 提示詞包含格式與範本');

// 1b) 匯入時的提醒：無效欄位、音效沒對準動作、音效太密、提示詞內容
{
  const ign = parseTheme(JSON.stringify(base({ layers: [{ type: 'ellipse', rx: 10, ry: 5, w: 3, bogus: 1 }] })));
  ok(ign.warnings.some((w) => w.includes('「w」') && w.includes('lw')) && ign.warnings.some((w) => w.includes('「bogus」')), '無效欄位會提醒（w 用在橢圓、拼錯的欄位）');
  const aligned = parseTheme(JSON.stringify(base({ layers: [{ type: 'circle', y: [[0, 0], [0.45, 80], [1, 0]] }], events: [{ u: 0.45, sfx: 'land' }] })));
  ok(!aligned.warnings.some((w) => w.includes('對準')), '音效點在關鍵影格上就不提醒');
  const off = parseTheme(JSON.stringify(base({ layers: [{ type: 'circle', y: [[0, 0], [0.45, 80], [1, 0]] }], sounds: [{ u: 0.2, sfx: 'whoosh' }] })));
  ok(off.warnings.some((w) => w.includes('沒有對準任何關鍵影格')), '音效點離所有關鍵影格都很遠會提醒');
  const busy = parseTheme(JSON.stringify(base({ loop: 2, sounds: [0, 0.2, 0.4, 0.6, 0.8].map((u) => ({ u, sfx: 'pop' })) })));
  ok(busy.warnings.some((w) => w.includes('音效太密')), '音效太密會提醒');
  const p = themeAiPrompt();
  ok(p.includes('splash 水花') && p.includes('quack 鴨叫'), 'AI 提示詞介紹 splash 與 quack');
  const wet = parseTheme(JSON.stringify(base({ layers: [{ type: 'circle', y: [[0, 0], [0.3, 50], [1, 0]] }], events: [{ u: 0.3, sfx: 'splash' }], sounds: [{ u: 0.3, sfx: 'quack' }] })));
  ok(themeCues(wet).map((c) => c.kind).join() === 'splash,quack', 'splash、quack 可以用在主題檔');
  const pal = parseTheme(JSON.stringify(base({ palette: { a: '#FFD43B' }, layers: [{ type: 'circle', fill: 'a-8', stroke: 'ink' }, { type: 'circle', fill: 'a+25' }] })));
  ok(pal.palette?.a === '#FFD43B' && pal.layers[0].fill === 'a-8', 'palette 與角色加明暗可以匯入');
  ok(parseTheme(JSON.stringify(base({ layers: [{ type: 'circle', fill: '#FFD43B' }] }))).warnings.some((w) => w.includes('寫死成色碼')), '寫死色碼會提醒');
  fail(base({ palette: { zzz: '#FFFFFF' } }), 'palette.zzz', 'palette 不認得的角色');
  fail(base({ palette: { a: 'yellow' } }), 'palette.a', 'palette 要是色碼');
  fail(base({ layers: [{ type: 'circle', fill: 'zz-8' }] }), '不認得的顏色', '不存在的角色加明暗');
  ok(p.includes('顏色怎麼用') && p.includes('配色表') && p.includes('搜尋整份 JSON'), 'AI 提示詞要求配色規劃、用 palette 與角色而不是寫死色碼');
  ok(p.includes('step 腳步') && p.includes('動作時間表') && p.includes('自我檢查') && p.includes('ground'), 'AI 提示詞含音效指南、工作流程與自我檢查');
}

// 1c) 優先使用我的顏色：量化風格把自訂顏色加進調色板；白模不蓋過；關閉後完全以風格為準
{
  const mineT = { ...TUNE_DEFAULT, custom: { a: '#F06AA8' } };
  const palOf = (id: string, tune: typeof mineT) => resolveLook([{ id, w: 1 }], VISUAL_MAP, tune, { r: '#FF9F1C' });
  const q8 = palOf('pixel8', mineT).post.find((p) => p.pal.length);
  ok(!!q8 && q8.pal.length <= 16 && q8.pal.includes('#F06AA8') && q8.pal.includes('#FF9F1C'), '8-bit 的調色板含自訂色與主題色，且不超過 16 色');
  ok(palOf('matte3d', mineT).pal.a === '#F06AA8', '白模不蓋過自訂色板');
  const styleT = { ...mineT, keepColors: false };
  const qs = palOf('pixel8', styleT).post.find((p) => p.pal.length);
  ok(!!qs && !qs.pal.includes('#F06AA8') && palOf('matte3d', styleT).pal.a === '#FFFFFF' && palOf('matte3d', styleT).pal.r !== '#FF9F1C', '以風格為準時：白模變白、8-bit 用自己的調色板');
  ok(palOf('pixel8', { ...TUNE_DEFAULT }).post.find((p) => p.pal.length)!.pal.includes('#FF9F1C'), '主題色板（沒有自訂色板時）也會加進調色板');
}

// 2) 關鍵影格取值
const lin: Track = [[0, 0, 'linear'], [1, 100, 'linear']];
ok(near(evalTrack(lin, 0.25, null), 25) && near(evalTrack(lin, 0, null), 0) && near(evalTrack(lin, 1, null), 100), '線性補間');
ok(evalTrack([[0, 0, 'hold'], [0.5, 10, 'linear'], [1, 20, 'linear']], 0.3, null) === 0, 'hold：保持到下一格');
ok(evalTrack([[0, 0, 'hold'], [0.5, 10, 'linear'], [1, 20, 'linear']], 0.5, null) === 10, 'hold：下一格才跳');
ok(evalTrack([[0, 0, 'back'], [1, 100, 'linear']], 0.8, null) > 100, 'back：過衝');
ok(evalTrack([[0, 0, 'bounce'], [1, 100, 'linear']], 0.99, null) <= 100.0001, 'bounce 不超過終點');
ok(evalTrack(7, 0.5, null) === 7, '固定值');
{
  const mv = resolveMove([], MOTION_MAP, TUNE_DEFAULT);
  const M = new MotionCtx(mv, 3, 1.5, 7);
  const v = evalTrack([[0, 0, 'inOut'], [1, 100, 'linear']], 0.5, M);
  ok(v > 40 && v < 60, `inOut 在中點約 50：${v}`);
}

// 3) 巢狀位置：行星在 u=0 於 (130,0)，u=0.25 轉到 (0,130)；月亮再繞行星
ok(near(layerWorld(orbit, null, 0, 'planet')[0], 130) && near(layerWorld(orbit, null, 0, 'planet')[1], 0), `行星 u=0：${layerWorld(orbit, null, 0, 'planet')}`);
{
  const [x, y] = layerWorld(orbit, null, 0.25, 'planet');
  ok(near(x, 0, 1e-6) && near(y, 130, 1e-6), `行星 u=0.25：${x},${y}`);
  const [mx, my] = layerWorld(orbit, null, 0, 'moon');
  ok(near(mx, 160) && near(my, 0), `月亮 u=0：${mx},${my}`);
  const [wx, wy] = layerWorld(orbit, null, 0.25, 'moon');
  ok(Math.hypot(wx - 0, wy - 130) > 29.9 && Math.hypot(wx - 0, wy - 130) < 30.1, '月亮到行星的距離固定是 30');
  ok(layerWorld(orbit, null, 0, 'nope')[0] === 0, '找不到的圖層回傳 (0,0)');
}

// 4) 壞檔案要有清楚的錯誤
fail('{ bad json', '不是有效的 JSON', '壞 JSON');
fail('[]', '最外層要是一個 JSON 物件', '陣列');
fail({ version: 1, layers: [] }, '缺少 "format"', '沒有 format');
fail({ format: 'style-fusion-theme', version: 9, layers: [] }, '不支援的版本', '版本');
fail(base({ layers: [] }), 'layers', '空圖層');
fail(base({ layers: [{ type: 'star' }] }), 'type', '不認得的圖層類型');
fail(base({ layers: [{ type: 'circle', fill: 'red' }] }), '不認得的顏色', '壞顏色');
fail(base({ layers: [{ type: 'circle', x: [[0, 0, 'wiggle'], [1, 1]] }] }), '緩動', '壞緩動');
fail(base({ layers: [{ type: 'circle', x: [[0, 0]] }] }), '至少要有 2 個', '單一關鍵影格');
fail(base({ layers: [{ type: 'circle', x: [[2, 0], [1, 1]] }] }), '時間要在 0 到 1', '時間超界');
fail(base({ layers: [{ type: 'polygon', points: [0, 0, 1, 1, 2] }] }), 'points', '奇數個座標');
fail(base({ layers: [{ type: 'circle', id: 'a' }, { type: 'circle', id: 'a' }] }), '重複', '重複 id');
fail(base({ shadowFor: 'zzz' }), '找不到 id', 'shadowFor 指到不存在的圖層');
fail(base({ loop: 100 }), 'loop', 'loop 太長');
fail(base({ layers: [{ type: 'circle', r: 1e9 }] }), '超出範圍', '半徑過大');
fail(base({ layers: [{ type: 'text', text: 'x'.repeat(100) }] }), 'text', '文字太長');
fail(base({ events: [{ u: 0.5, sfx: 'boom' }] }), 'sfx', '不認得的音效');
fail(base({ sounds: [{ u: 0.5, sfx: 'boom' }] }), 'sounds[0].sfx', 'sounds 不認得的音效');
fail(base({ sounds: [{ u: 0.5 }] }), 'sounds[0].sfx', 'sounds 缺少 sfx');
fail(base({ sounds: [{ u: 3, sfx: 'pop' }] }), 'sounds[0].u', 'sounds 的 u 超界');
fail(base({ sounds: Array.from({ length: THEME_LIMITS.sounds + 1 }, () => ({ u: 0.1, sfx: 'pop' })) }), 'sounds', 'sounds 過多');
fail('x'.repeat(THEME_LIMITS.bytes + 10), '檔案太大', '檔案過大');
{
  const many = base({ layers: Array.from({ length: THEME_LIMITS.layers + 5 }, () => ({ type: 'circle', r: 3 })) });
  fail(many, '圖層總數最多', '圖層過多');
  let deep: Record<string, unknown> = { type: 'circle', r: 3 };
  for (let i = 0; i < THEME_LIMITS.depth + 2; i++) deep = { type: 'group', children: [deep] };
  fail(base({ layers: [deep] }), '巢狀最多', '巢狀過深');
}
{
  let msg = '';
  try {
    parseTheme(JSON.stringify(base({ layers: [{ type: 'circle', fill: 'zz', r: -3, x: 'a' }] })));
  } catch (e) {
    msg = (e as Error).message;
  }
  ok(/3 個問題/.test(msg), `一次列出所有問題：${msg.slice(0, 60)}`);
}

// 5) 循環提醒與自動補齊
{
  const th = parseTheme(JSON.stringify(base({ layers: [{ type: 'circle', x: [[0, 0], [0.5, 100], [0.8, 50]] }] })));
  ok(th.warnings.length >= 2, `結尾沒到 1、頭尾值不同要提醒：${th.warnings}`);
  const t = th.layers[0].tracks.x as Track;
  ok(typeof t !== 'number' && t[t.length - 1][0] === 1, '自動補上 u=1');
  const rot = parseTheme(JSON.stringify(base({ layers: [{ type: 'circle', rot: [[0, 0], [1, 720]] }] })));
  const seam = (w: string[]) => w.filter((x) => !x.includes('沒有指定任何音效'));
  ok(seam(rot.warnings).length === 0, `旋轉差 360 的倍數是無縫的：${rot.warnings}`);
  const s = parseTheme(JSON.stringify(base({ layers: [{ type: 'circle', s: [[0, 1], [0.5, 2], [1, 1]] }] })));
  ok(!!s.layers[0].tracks.sx && !!s.layers[0].tracks.sy, 's 是 sx、sy 的簡寫');
}

// 6) 用假畫筆走一遍完整繪製（不需要 canvas）
{
  const calls: string[] = [];
  const S = new Proxy({ alpha: 1, look: { bg: { type: 'solid' }, detail: 1 }, pal: {}, px: 1 } as Record<string, unknown>, {
    get(t, k: string) {
      if (k in t) return t[k];
      return (...a: unknown[]) => {
        calls.push(k);
        for (const x of a) if (typeof x === 'number' && !Number.isFinite(x)) throw new Error(`${k} 收到非有限數字`);
        return undefined;
      };
    },
    set(t, k: string, v) {
      t[k] = v;
      return true;
    },
  });
  const mv = resolveMove([], MOTION_MAP, TUNE_DEFAULT);
  const env = { Wu: 711, Hu: 400, u: 1, look: S.look, detail: 1, thumb: false, W: 711, H: 400 } as unknown as Env;
  for (const th of [box, orbit]) {
    for (const u of [0, 0.13, 0.46, 0.5, 0.77, 0.999]) {
      calls.length = 0;
      const M = new MotionCtx(mv, th.loop, u * th.loop, 7);
      drawTheme(th, S as never, M, env);
      ok(calls.length > 3, `${th.name} u=${u}：有畫東西（${calls.length} 次）`);
      ok(calls.filter((c) => c === 'push').length === calls.filter((c) => c === 'pop').length, `${th.name} u=${u}：push／pop 要成對`);
    }
  }
  ok(S.alpha === 1, '畫完後透明度要還原');
  const M = new MotionCtx(mv, box.loop, 0.45 * box.loop, 7);
  calls.length = 0;
  drawTheme(box, S as never, M, env);
  ok(calls.includes('ellipse') && calls.includes('rect') && calls.includes('curve') && calls.includes('line'), `彈跳盒子用到 rect／circle／curve／line／陰影：${[...new Set(calls)]}`);
}

// 7) 已匯入主題的管理（Node 裡沒有 localStorage，只測記憶體裡的邏輯）+ 自訂主體跟著目前主題走
{
  ok(!themes.has() && themes.current() === null, '一開始沒有主題');
  ok(SUBJECTS.custom.loop === 3 && SUBJECTS.custom.name === '自訂主題', '沒有主題時的預設值');
  const a = themes.add(templateJson(TEMPLATE_BOX));
  ok(themes.current()?.name === box.name && themes.currentId() === a.id, '匯入後成為目前的主題');
  ok(SUBJECTS.custom.loop === box.loop && SUBJECTS.custom.hero === box.hero && SUBJECTS.custom.name === box.name, '自訂主體的循環秒數、代表幀、名稱跟著目前主題');
  themes.add(templateJson(TEMPLATE_ORBIT));
  ok(themes.list().length === 2 && SUBJECTS.custom.loop === 6, '第二個主題');
  themes.add(templateJson(TEMPLATE_ORBIT));
  ok(themes.list().length === 2, '同名的主題會被取代，不會重複');
  themes.use(a.id);
  ok(themes.current()?.name === box.name, '切換主題');
  for (let i = 0; i < 12; i++) themes.add(templateJson({ ...TEMPLATE_ORBIT, name: `n${i}` }));
  ok(themes.list().length === THEME_LIMITS.saved, `最多留 ${THEME_LIMITS.saved} 個：${themes.list().length}`);
  let events = 0;
  const off = themes.onChange(() => events++);
  const cur = themes.currentId()!;
  themes.remove(cur);
  ok(events === 1 && themes.currentId() !== cur, '刪除會通知並換到別的主題');
  off();
  themes.remove('nope');
  ok(events === 1, '取消訂閱後不再通知');
  for (const t of themes.list()) themes.remove(t.id);
  ok(!themes.has() && themes.current() === null && SUBJECTS.custom.loop === 3, '全部刪除後回到預設');
  let bad = false;
  try {
    themes.add('{}');
  } catch {
    bad = true;
  }
  ok(bad && !themes.has(), '匯入失敗不會留下任何東西');
}

console.log(fails ? `FAILED ${fails}` : 'THEME OK');
process.exit(fails ? 1 : 0);
