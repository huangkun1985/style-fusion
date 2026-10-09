// 主體 v2：動態文字標誌（第二版，藍本是 Dribbble 的「BANTER!」疊層擠出字海報，輔以 Swiss 風格的小字資訊列與跑馬燈，筆記見 docs/主體v2參考/type.md）。
// 參考圖共通的好看原因：一個巨大的粗體斜體字，正面只有一個奶油色；背後是三層不同顏色的擠出（橘紅、粉、深酒紅），像印刷錯位的套色；
// 整張海報只有三四個顏色；周圍用極小的等寬小字與細線當「資訊層」，和巨大的標題形成尺度對比；跑馬燈環帶增加動態。
// 動畫：逐字落下回彈，落地瞬間擠出厚度「彈」出來再回穩；仍支援波浪、打字機與字符解碼模式。時間結構與 v1 相同。顏色只用色板角色。
import type { Cue } from '../../../audio/types';
import { darken, luma, mix } from '../../color';
import { TAU, clamp, hash, lerp, wrap } from '../../util';
import type { Subject } from '../types';

const WORD = 'MOTION';
const SUB = '動效風格';
const MARQUEE = 'STYLE FUSION  ✦  MOTION DESIGN  ✦  EASE & TIMING  ✦  ';
const GLYPHS = 'ABCDEFGHJKLMNPRSTUVXYZ#%&@$0123456789';
const SIZE = 138;
const SKEW = -0.2; // 斜體傾角
const DEPTH = 30; // 擠出厚度（設計單位）
const STEPS = 20; // 擠出的切片數（每片 DEPTH/STEPS，要小於描邊寬才不會露縫）

export const type2: Subject = {
  id: 'type',
  name: '文字標誌',
  en: 'Kinetic Type',
  desc: '動態海報式排版：巨大斜體標題逐字落下回彈、落地時三色擠出彈出，周圍是小字資訊列、副標與循環跑馬燈；可切換波浪、打字機與字符解碼模式。',
  loop: 3.4,
  key: 0.22,
  hero: 0.6,
  events: () => [
    { u: 0.2, x: -120, y: 20, k: 0.6 },
    { u: 0.3, x: 120, y: 20, k: 0.6 },
  ],
  cues(M) {
    const out: Cue[] = [{ u: 0.04, kind: 'whoosh', k: 0.5 }];
    if (M.mv.typeWriter > 0.5) for (let i = 0; i < 6; i++) out.push({ u: 0.06 + i * 0.055, kind: 'tick', k: 0.5 });
    else for (let i = 0; i < 6; i++) out.push({ u: 0.22 + M.stag(i) * 1.5, kind: i % 2 ? 'tick' : 'land', k: 0.55 + (i === 3 ? 0.2 : 0) });
    out.push({ u: 0.26, kind: 'pop', k: 0.4 }, { u: 0.8, kind: 'whoosh', k: 0.5 });
    return out;
  },
  track(M) {
    const i = 2;
    const p = M.tw(0.04 + M.stag(i) * 1.5, 0.22 + M.stag(i) * 1.5, 'o');
    const out = M.tw(0.8 + M.stag(i), 0.95 + M.stag(i), 'i');
    return [-30, lerp(-230, -20, p) - out * 260];
  },
  draw(S, M, env) {
    const mv = M.mv;
    const u = M.u;
    const pal = S.pal;
    const tw = mv.typeWriter > 0.5;
    const scr = mv.typeScramble;
    const det = S.look.detail;
    const baseA = S.alpha;
    const FL = { stroke: false, shadow: false, hl: false, flat: true, drawOn: false } as const;

    // ── 色彩：正面奶油色；背後三層擠出（強調色、淡粉、深酒紅）；全部由色板角色算出
    // 深色背景：奶油正面＋強調色／淡粉／深酒紅（藍本）；淺色背景：奶油在底上會消失，改成強調色正面＋奶油／亮色／深色三層
    const dark = luma(pal.bg) < 0.55;
    const cream = mix(pal.light, pal.p, 0.06);
    const face = dark ? cream : pal.p;
    const bands = dark ? [pal.p, mix(pal.p, pal.light, 0.5), darken(mix(pal.p, pal.ink, 0.55), 0.04)] : [cream, pal.a, mix(pal.ink, pal.p, 0.2)];
    const soft = mix(pal.bg, pal.ink, 0.2); // 最遠的柔影（取背景的深一階）
    const meta = mix(pal.card, pal.ink, 0.72);

    // 像素風格下，小於約 3.6 格高的字讀不出來，改畫成色條
    const cell = (S.look.post.find((q) => q.fx === 'pixelate')?.p.size ?? 0) * 400;
    const tiny = (str: string, x: number, y: number, size: number, c: string, o: { a?: number; align?: CanvasTextAlign } = {}) => {
      const al = o.align ?? 'left';
      if (cell > 1.2 && size < cell * 3.6) {
        const w = Math.max(cell * 2, S.measure(str, size, 'mono'));
        const cx = al === 'left' ? x + w / 2 : al === 'right' ? x - w / 2 : x;
        S.rect(cx, y, w, Math.max(cell * 0.9, size * 0.5), 1, c, { alpha: (o.a ?? 1) * 0.55, ...FL });
        return;
      }
      S.text(str, x, y, size, c, { flat: true, shadow: false, stroke: false, font: 'mono', alpha: o.a ?? 1, align: al });
    };

    const widths = WORD.split('').map((c) => S.measure(c, SIZE, 'grotesk'));
    const gap = -6; // 字距收緊（參考圖的字幾乎貼在一起）
    const total = widths.reduce((s, w) => s + w, 0) + gap * (WORD.length - 1);
    const fit = Math.min(1, (env.Wu * 0.82) / (total + 40));
    let x = -total / 2;
    const xs: number[] = [];
    widths.forEach((w) => {
      xs.push(x + w / 2);
      x += w + gap;
    });
    const half = (total * fit) / 2;
    const Hh = env.Hu / 2;

    // ═══ 資訊層（小字與細線）：上緣一排，進場時從兩側滑入 ═══
    const kp = M.tw(0.04, 0.2, 'o');
    const ko = M.tw(0.78, 0.9, 'i');
    if (kp > 0.01 && ko < 1) {
      S.alpha = baseA * clamp(kp) * (1 - ko);
      const y = -Hh + 36;
      const w = Math.max(half, 150) + 10;
      S.push();
      S.jitter(18, 0.6);
      tiny('MOTION DESIGN — VOL.08', -w, y, 11, 'ink', { a: 0.8 });
      tiny('2026', w, y, 11, 'ink', { a: 0.8, align: 'right' });
      S.rect(0, y + 14, (w * 2) * kp, 1.6, 0.8, 'ink', { alpha: 0.55, ...FL });
      S.pop();
    }

    // ═══ 標題：逐字落下，落地時擠出彈出 ═══
    S.alpha = baseA;
    S.push();
    S.scale(fit);
    let lastVisible = -1;
    const cy = -8; // 字的視覺中心
    for (let i = 0; i < WORD.length; i++) {
      const st = M.stag(i) * 1.5;
      let p: number;
      let out: number;
      let alpha = 1;
      if (tw) {
        p = u > 0.06 + i * 0.055 ? 1 : 0;
        out = u > 0.8 + (WORD.length - 1 - i) * 0.025 ? 1 : 0;
        alpha = p * (1 - out);
        if (alpha > 0) lastVisible = i;
      } else {
        p = M.tw(0.04 + st, 0.22 + st, 'o');
        out = M.tw(0.8 + M.stag(i), 0.95 + M.stag(i), 'i');
        alpha = clamp(p * 3) * (1 - clamp(out * 1.2));
      }
      if (alpha <= 0.01) continue;
      let y = tw ? cy : lerp(-230, cy, p) - out * 260;
      const rot = tw ? 0 : (1 - clamp(p)) * (i % 2 ? -0.5 : 0.5) + out * (i % 2 ? 0.4 : -0.4);
      y += mv.typeWave * 12 * Math.sin(TAU * (u * 2 - i * 0.12));
      y += M.fl(i + 3, 6);
      const beat = mv.beat > 0.01 ? mv.beat * 0.14 * M.beat() * (i % 2 ? 1 : 0.6) : 0;
      const land = tw ? 0 : Math.max(0, 1 - Math.abs(u - (0.22 + st)) / 0.05);
      const sq = land * mv.squash * 0.3;
      // 擠出厚度：落下時是 0，落地瞬間彈出到 1.35 倍再回穩到 1；離場時收回
      const grow = tw ? 1 : clamp(p) * (1 + 0.35 * land) * (1 - clamp(out * 1.5));
      S.alpha = baseA * alpha;
      S.push();
      S.translate(xs[i], y);
      S.jitter(10 + i);
      S.rotate(rot);
      const sc = tw ? 1 : lerp(0.55, 1, clamp(p));
      S.scale((1 + sq + beat) * sc, (1 - sq * 0.8 + beat) * sc);
      S.skew(SKEW);
      let ch = WORD[i];
      const settle = 0.3 + i * 0.035;
      if (scr > 0.25 && u < settle) ch = GLYPHS[Math.floor(hash(Math.floor(M.tReal * 15), i, 3) * GLYPHS.length)];
      const opt = { font: 'grotesk' as const, flat: true, shadow: false, stroke: false as const, glow: false, drawOn: false };
      if (det > 0.3 && grow > 0.02) {
        // 最遠的柔影，再由遠到近三層色帶（每層 STEPS/3 片）
        const d = DEPTH * grow;
        S.text(ch, d * 1.3, d * 1.0 + 6, SIZE, soft, { ...opt, alpha: 0.9 });
        const n = det > 0.55 ? STEPS : 3;
        for (let k = n; k >= 1; k--) {
          const t = (k / n) * d;
          S.text(ch, t, t * 0.62, SIZE, bands[Math.min(2, Math.floor(((k - 1) / n) * 3))], opt);
        }
      }
      S.text(ch, 0, 0, SIZE, face, { font: 'grotesk', shadow: false });
      S.pop();
    }
    if (tw && u < 0.95) {
      const on = Math.floor(M.tReal * 2.5) % 2 === 0;
      if (on) {
        const cx = lastVisible >= 0 ? xs[lastVisible] + widths[lastVisible] / 2 + 14 : xs[0] - widths[0] / 2;
        S.alpha = baseA;
        S.rect(cx, cy, 9, SIZE * 0.8, 1, 'p', FL);
      }
    }
    S.pop();

    // ═══ 副標與右下角小說明 ═══
    const sp = M.tw(0.26, 0.42, 'o');
    const so = M.tw(0.78, 0.9, 'i');
    if (sp > 0.01 && so < 1) {
      S.alpha = baseA * clamp(sp) * (1 - so);
      const fnt = S.look.font === 'term' ? 'term' : 'brush'; // 像素字體沒有中文字，會退回很小的後備字；中文副標一律用粗宋體
      S.push();
      S.translate(-half, 96 + (1 - sp) * 24 - so * 16);
      S.jitter(19);
      S.text(SUB, 0, 0, cell > 1.2 ? 54 : 40, 'ink', { align: 'left', font: fnt, flat: true, shadow: false });
      S.pop();
      tiny('A creative platform shaped by', half, 88 + (1 - sp) * 18, 9.5, 'ink', { a: 0.6, align: 'right' });
      tiny('movement, change & perspective.', half, 101 + (1 - sp) * 18, 9.5, 'ink', { a: 0.6, align: 'right' });
    }

    // ═══ 跑馬燈環帶：底部一條深色帶，文字每圈剛好走一個單位（無縫循環）═══
    const mp = M.tw(0.12, 0.3, 'o');
    const mo = M.tw(0.84, 0.94, 'i');
    if (mp > 0.01 && mo < 1) {
      S.alpha = baseA * (1 - mo);
      const by = Hh - 28 + (1 - mp) * 30;
      S.rect(0, by, env.Wu + 40, 24, 0, 'ink', { shadow: false, stroke: false, flat: true, drawOn: false });
      if (det > 0.35) {
        S.alpha = baseA * (1 - mo) * clamp(mp * 1.5);
        const unit = S.measure(MARQUEE, 11, 'mono');
        const n = Math.ceil(env.Wu / unit) + 2;
        const off = -u * unit * 1.0;
        for (let k = 0; k < n; k++) {
          const x0 = -env.Wu / 2 + k * unit + wrap(off, unit) - unit;
          S.text(MARQUEE, x0, by + 0.5, 11, pal.bg, { align: 'left', flat: true, shadow: false, stroke: false, font: 'mono', drawOn: false });
        }
      }
    }
    S.alpha = baseA;
  },
};
