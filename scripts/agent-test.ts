// 開發用：Agent（2.0 α2）的純函數測試。用法：npx tsx scripts/agent-test.ts（已接進 npm run test:audio）
// 涵蓋：從 AI 回答取出 JSON、時間點的名字與附帶資料、修改前後的差異（改了幾個值、動到的時間）、對話紀錄與專案的消毒。
// 本機橋接本身（Host／Origin／通行碼、取消會停掉 Claude Code）要開伺服器才能測，做法寫在驗收報告。
import { diffThemes, stampContext, stampLabel } from '../src/agent/themeTools';
import { parseTheme } from '../src/engine/themes';
import { TEMPLATE_BOX, templateJson } from '../src/engine/themeTemplates';
import { extractThemeJson } from '../src/lib/agentPrompt';
import { makeProject, sanitizeChat, sanitizeMix, sanitizeProject, sanitizeStamps } from '../src/store/project';

let fails = 0;
let n = 0;
const ok = (c: boolean, msg: string) => {
  n++;
  if (!c) {
    fails++;
    console.log('  ✗', msg);
  }
};

const json = templateJson(TEMPLATE_BOX);
const box = parseTheme(json);

// 1) 取出 JSON
ok(extractThemeJson('規劃…\n```json\n{"a":1}\n```\n') === '{"a":1}', '一個 json 區塊');
ok(extractThemeJson('```json\n{"a":1}\n```\n中間\n```json\n{"b":2}\n```') === '{"b":2}', '多個區塊取最後一個');
ok(extractThemeJson('前言 {"c":3} 後記') === '{"c":3}', '沒有區塊時取第一個 { 到最後一個 }');
ok(extractThemeJson('```\n{"d":4}\n```') === '{"d":4}', '沒標 json 的區塊');
ok(parseTheme(extractThemeJson(`摘要：盒子跳\n\`\`\`json\n${json}\n\`\`\``)).name === box.name, '取出後能通過 parseTheme');

// 2) 時間點
const landT = 0.45 * box.loop;
ok(stampLabel(box, landT) === '事件 land', `落地事件的名字（${stampLabel(box, landT)}）`);
ok(stampLabel(box, landT + box.loop * 3) === '事件 land', '超過一個循環的時間也對得上');
ok(stampLabel(null, 1) === '', '沒有主題時沒有名字');
const ctx = stampContext(box, { t: landT, label: '事件 land' });
ok(ctx.includes('u=0.450') && ctx.includes('音效 land') && ctx.includes('這一刻的圖層狀態'), '時間點附帶的資料有 u、事件、圖層狀態');
ok(/box（.*y@/.test(ctx), '時間點附帶前後 0.3 秒的關鍵影格');
ok(sanitizeStamps([{ t: 1.2, label: 'x' }, { t: 'a' }, null, { t: Infinity }, { t: 9999, label: 5 }]).length === 2, '時間點消毒：壞的丟掉');
ok(sanitizeStamps(Array.from({ length: 20 }, (_, i) => ({ t: i, label: '' }))).length === 8, '時間點最多 8 個');

// 3) 修改前後的差異
const raw = JSON.parse(json);
const same = diffThemes(json, box, json);
ok(same.changed === 0 && same.range === null, '沒改：0 個值、沒有範圍');
const y = raw.layers[0].y as [number, number, string][];
const k = y.findIndex((key) => key[0] > 0.2 && key[0] < 0.8);
const edited = JSON.parse(json);
edited.layers[0].y[k][1] += 10;
const ej = JSON.stringify(edited);
const d1 = diffThemes(json, parseTheme(ej), ej);
const lo = y[k - 1][0] * box.loop;
const hi = y[k + 1][0] * box.loop;
ok(d1.changed === 1, `改一個關鍵影格：1 個值（${d1.changed}）`);
ok(!!d1.range && Math.abs(d1.range[0] - lo) < 1e-6 && Math.abs(d1.range[1] - hi) < 1e-6, `範圍是那個鍵前後兩段（${d1.range}，預期 ${lo}–${hi}）`);
const sized = JSON.parse(json);
sized.layers[0].w = (sized.layers[0].w ?? 60) + 20;
const sj = JSON.stringify(sized);
const d2 = diffThemes(json, parseTheme(sj), sj);
ok(d2.changed >= 1 && d2.range === null, '只改大小：範圍是「整段」');
ok(diffThemes(null, box, json).changed === 0, '沒有原本的內容時不比較');

// 4) 對話紀錄與專案
const chat = sanitizeChat([
  { role: 'user', text: '慢一半', at: 1, stamps: [{ t: 1, label: 'a' }] },
  { role: 'agent', text: '好', at: 2, change: 'pending' },
  { role: 'system', text: '不認得的角色' },
  { role: 'agent', text: 123 },
  ...Array.from({ length: 100 }, (_, i) => ({ role: 'note', text: `n${i}`, at: i })),
]);
ok(chat.length === 60, `對話最多留 60 則（${chat.length}）`);
const c2 = sanitizeChat([{ role: 'agent', text: '好', at: 2, change: 'pending' }]);
ok(c2[0].change === 'discarded', '存檔裡「還沒決定」的修改，重新開啟時算放棄（預覽沒有存進專案）');
const p = makeProject('t', sanitizeMix({ subject: 'custom' }), [], 'x');
p.scenes[0].theme = json;
p.scenes[0].chat = [{ role: 'user', text: 'hi', at: 1 }];
const back = sanitizeProject(JSON.parse(JSON.stringify(p)), 'x');
ok(!!back && back.scenes[0].theme === json && back.scenes[0].chat?.length === 1, '生成的內容與對話跟著場景存、讀回來');
const huge = JSON.parse(JSON.stringify(p));
huge.scenes[0].theme = 'x'.repeat(500_000);
ok(sanitizeProject(huge, 'x')?.scenes[0].theme === undefined, '太大的主題不收');

// 5) α3：匯入的 MIDI 跟著專案
const withMidi = JSON.parse(JSON.stringify(p));
withMidi.midi = { name: 'a.mid', b64: 'TVRoZAAAAAYAAQABAeA=' };
ok(sanitizeProject(withMidi, 'x')?.midi?.name === 'a.mid', 'MIDI 原始檔跟著專案讀回來');
for (const bad of [{ b64: 'not base64!!' }, { b64: 'x' }, { b64: 5 }, { b64: 'A'.repeat(4_000_004) }, null]) {
  const w = JSON.parse(JSON.stringify(p));
  w.midi = bad;
  ok(sanitizeProject(w, 'x')?.midi === undefined, `壞的 MIDI 欄位不收（${JSON.stringify(bad)?.slice(0, 30)}）`);
}

console.log(fails ? `AGENT FAIL（${fails}／${n} 項失敗）` : `AGENT OK（${n} 項）`);
process.exit(fails ? 1 : 0);
