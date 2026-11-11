// 開發用：配方碼（分享連結 #mix=）與消毒的邊界測試。用法：npx tsx scripts/share-test.ts（已接進 npm run test:audio）
// 涵蓋審查 R-04（風格數量上限）、R-17（色碼位數），以及壞輸入不丟例外、原型鏈名稱被擋、數值夾回範圍。
import { AUDIO_DEFAULT } from '../src/audio/types';
import { MOTION, MOTION_MAP } from '../src/data/motion';
import { VISUAL, VISUAL_MAP } from '../src/data/visual';
import { TUNE_DEFAULT } from '../src/engine/resolve';
import { isColor, isSubjectId, MAX_PER_KIND, sanitizeSels, sanitizeTune } from '../src/store/sanitize';
import { decodeMix, encodeMix, musicOf } from '../src/store/share';

let fails = 0;
let n = 0;
const ok = (c: boolean, msg: string) => {
  n++;
  if (!c) {
    fails++;
    console.log('  ✗', msg);
  }
};
const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const raw = (o: unknown) => 'SF1.' + b64(typeof o === 'string' ? o : JSON.stringify(o));
const noThrow = (label: string, f: () => unknown) => {
  try {
    f();
    ok(true, label);
  } catch (e) {
    ok(false, `${label}：不該丟出例外（${(e as Error).message}）`);
  }
};

// 1) 來回編碼：一般的混合原樣回來
const v0 = [{ id: VISUAL[0].id, w: 1 }, { id: VISUAL[1].id, w: 0.5 }];
const m0 = [{ id: MOTION[0].id, w: 0.8 }];
const code = encodeMix({ v: v0, m: m0, s: 'mascot', t: { ...TUNE_DEFAULT, speed: 1.5 }, n: '測試', a: musicOf(AUDIO_DEFAULT) });
const back = decodeMix(code);
ok(!!back && back.v.length === 2 && back.m.length === 1 && back.s === 'mascot', '來回編碼：風格與主體');
ok(!!back && back.t?.speed === 1.5 && back.n === '測試', '來回編碼：微調與名稱');
ok(!!back && JSON.stringify(back.a) === JSON.stringify(musicOf(AUDIO_DEFAULT)), '來回編碼：音樂設定');
ok(!!decodeMix(`https://example.com/#mix=${code}`), '整段網址也能解');

// 2) 壞輸入：回傳 null 或安全的值，不丟例外
const bad = ['', 'SF1.', 'SF1.@@@', 'hello', 'SF1.' + b64('null'), 'SF1.' + b64('[]'), 'SF1.' + b64('123'), raw('{"v":'), raw({ v: 5, m: {}, s: 9 })];
for (const b of bad) noThrow(`壞輸入「${b.slice(0, 20)}」`, () => decodeMix(b));
ok(decodeMix('hello') === null && decodeMix('SF1.@@@') === null, '亂碼回傳 null');
const weird = decodeMix(raw({ v: 5, m: {}, s: 9 }));
ok(!!weird && weird.v.length === 0 && weird.m.length === 0 && weird.s === 'mascot', '型別不對的欄位變成空的／預設主體');

// 3) 原型鏈上的名稱不能被當成風格或主體
const proto = decodeMix(raw({ v: 'constructor:100,toString:100,__proto__:100,hasOwnProperty:50', m: 'valueOf:100', s: 'constructor' }));
ok(!!proto && proto.v.length === 0 && proto.m.length === 0 && proto.s === 'mascot', '原型鏈名稱被擋掉');
ok(!isSubjectId('toString') && !isSubjectId(undefined), 'isSubjectId 擋原型鏈名稱');

// 4) R-04：風格數量上限
const many = decodeMix(raw({ v: VISUAL.map((s) => `${s.id}:100`).join(','), m: MOTION.map((s) => `${s.id}:100`).join(','), s: 'ui' }));
ok(!!many && many.v.length === MAX_PER_KIND && many.m.length === MAX_PER_KIND, `R-04：${VISUAL.length} 個圖像風格被截成 ${many?.v.length}（上限 ${MAX_PER_KIND}）`);
ok(!!many && many.v[0].id === VISUAL[0].id, 'R-04：截斷保留前面的');
ok(sanitizeSels(VISUAL.map((s) => ({ id: s.id, w: 1 })), VISUAL_MAP).length === MAX_PER_KIND, 'R-04：sanitizeSels 預設上限');
ok(sanitizeSels([{ id: VISUAL[0].id, w: 1 }, { id: VISUAL[0].id, w: 1 }], VISUAL_MAP).length === 1, '重複的風格只留一個');

// 5) 數值夾回範圍
const w = decodeMix(raw({ v: `${VISUAL[0].id}:99999,${VISUAL[1].id}:-50,${VISUAL[2].id}:abc`, m: '', s: 'mascot', t: { speed: 1e9, fps: -3, loopMul: 'x', seed: NaN, strokeMul: Infinity } }));
ok(!!w && w.v[0].w === 1.5 && w.v[1].w === 0.05 && w.v[2].w === 1, '權重夾在 5%～150%，非數字當 100%');
ok(!!w && w.t?.speed === 2.5 && w.t?.fps === 0 && w.t?.loopMul === TUNE_DEFAULT.loopMul && w.t?.strokeMul === TUNE_DEFAULT.strokeMul, '微調數值夾回範圍');
const longName = decodeMix(raw({ v: '', m: '', s: 'mascot', n: 'x'.repeat(5000) }));
ok(!!longName && longName.n?.length === 80, '名稱截到 80 字');
const music = decodeMix(raw({ v: '', m: '', s: 'mascot', a: ['constructor', 'toString', '__proto__', 1, 1e9, 99, 99, 'nope', 1, 1e9, 'x', 1, 0] }));
ok(!!music?.a && music.a.genre === 'auto' && music.a.scheme === 'auto' && music.a.pack === 'auto' && music.a.tempo === 2 && music.a.key === 11 && music.a.piece === 'off' && music.a.arrLen === 180 && music.a.polish === false, '音樂設定消毒');

// 6) R-17：色碼只收 3、4、6、8 位
for (const c of ['#abc', '#abcd', '#aabbcc', '#aabbccdd', 'rgb(1,2,3)', 'hsla(10, 20%, 30%, .5)']) ok(isColor(c), `合法色碼 ${c}`);
for (const c of ['#12345', '#1234567', '#12', '#ggg', '#', 'red', 'url(x)', 'rgb(())', 5]) ok(!isColor(c), `不合法色碼 ${String(c)}`);
const tc = sanitizeTune({ custom: { bg: '#12345', ink: '#fff', p: 'javascript:x', constructor: '#fff' } });
ok(tc.custom.bg === undefined && tc.custom.ink === '#fff' && tc.custom.p === undefined && !Object.hasOwn(tc.custom, 'constructor'), 'R-17：自訂色板只留合法色碼與認得的角色');

// 7) 大輸入不會卡住
const huge = raw({ v: Array.from({ length: 20000 }, (_, i) => `${VISUAL[i % VISUAL.length].id}:100`).join(','), m: '', s: 'mascot' });
const t0 = performance.now();
const hu = decodeMix(huge);
ok(!!hu && hu.v.length === MAX_PER_KIND && performance.now() - t0 < 500, `兩萬筆的配方碼在 0.5 秒內解完（${(performance.now() - t0).toFixed(0)} ms）`);
void MOTION_MAP;

console.log(fails ? `SHARE FAIL（${fails}／${n} 項失敗）` : `SHARE OK（${n} 項）`);
process.exit(fails ? 1 : 0);
