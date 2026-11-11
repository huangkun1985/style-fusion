// Agent 的「初始提示詞」（2.0 α1 先用在手動模式：複製到任何 AI、把回答貼回來；α2 連上 Claude 後是同一份）。
// 流程是「先選風格模板 → 主題一行（最常改）＋長度 → 風格規格（自動附上）」；格式與自我檢查沿用 themeAiPrompt()。
import { MOTION_MAP } from '../data/motion';
import { RECIPES } from '../data/recipes';
import type { Recipe } from '../data/schema';
import { VISUAL_MAP } from '../data/visual';
import { resolveLook, resolveMove, TUNE_DEFAULT } from '../engine/resolve';
import { themeAiPrompt } from '../engine/themeTemplates';
import type { SubjectId } from '../engine/types';

/** 每個主體的示範主題：選了模板、沒有改主題就送出時用這一行 */
const DEMO_TOPIC: Record<SubjectId, string> = {
  mascot: '一隻圓滾滾的小狐狸跳上平台，落地時壓扁再彈起，尾巴慢半拍跟上',
  ball: '一顆彈力球從左上角落下，連彈三次越彈越低，最後滾到中間停住',
  walk: '一個小人從左走到右，走到中間停下來揮手打招呼',
  ui: '一張通知卡片從上方滑入，按鈕被點一下變成勾勾',
  type: '品牌名「晨光咖啡」一個字一個字彈出，副標從下方淡入',
  geo: '三個幾何形狀（圓、三角、方塊）輪流跳到中間組成一個標誌',
  chart: '四根長條由下往上長出來，最高的那根亮起並標出數字',
  loader: '一個載入動畫：三個圓點依序跳動，最後合成一個勾勾',
  logo: '一個標誌從線條描繪出來，再填滿顏色、輕輕放大定住',
  fireworks: '夜空中三朵煙火依序升起、炸開成圓形，再慢慢落下消失',
  weather: '一朵雲飄進畫面，下一陣小雨，雨停後太陽從雲後露出來',
  portrait: '一張臉眨眼、微笑，頭髮被風輕輕吹動',
  music: '隨著節拍跳動的五根音量條，重拍時整排一起放大',
  landscape: '遠山與近處的樹，太陽從山後升起，雲慢慢飄過',
  abstract: '幾條彩色的帶子在畫面裡交錯流動，最後聚成一個圓',
  custom: '咖啡杯冒煙，店名從杯口升起',
  shapes3d: '幾個幾何積木從空中落下，在桌面上疊成一座小塔',
  char3d: '一個小機器人在轉盤上轉身，轉到正面時揮手',
  text3d: '立體的「OPEN」字樣翻轉進場，最後停在正面',
  terrain3d: '鏡頭沿著山谷前進，越過山脊看到遠處的湖',
  product3d: '一支耳機在展示台上旋轉，停住時打上一道光',
  voxel: '一座方塊小島從海面升起，島上的樹一棵棵長出來',
};

export const recipeById = (id: string): Recipe => RECIPES.find((r) => r.id === id) ?? RECIPES[0];
export const demoTopic = (r: Recipe) => DEMO_TOPIC[r.subject] ?? DEMO_TOPIC.custom;
/** 模板的一行說明：主要的圖像風格 × 主要的動效風格 */
export const templateLine = (r: Recipe) => `${VISUAL_MAP[r.v[0]?.[0]]?.name ?? '—'} × ${MOTION_MAP[r.m[0]?.[0]]?.name ?? '—'}`;

/** 風格規格：從模板的風格算出色板、線條、動效與幀率，再加上構圖與字級的要求（實驗發現一次生成常常字太小、構圖空） */
export function styleSpec(r: Recipe): string {
  const v = r.v.map(([id, w]) => ({ id, w }));
  const m = r.m.map(([id, w]) => ({ id, w }));
  const look = resolveLook(v, VISUAL_MAP, TUNE_DEFAULT);
  const move = resolveMove(m, MOTION_MAP, TUNE_DEFAULT);
  const pal = look.pal;
  const L: string[] = [];
  L.push('【風格規格】');
  L.push(`風格模板：${r.name}——${r.desc}`);
  for (const [id, w] of r.v) {
    const s = VISUAL_MAP[id];
    if (s) L.push(`- 圖像風格 ${s.name}（${Math.round(w * 100)}%）：${s.desc}`);
  }
  for (const [id, w] of r.m) {
    const s = MOTION_MAP[id];
    if (s) L.push(`- 動效風格 ${s.name}（${Math.round(w * 100)}%）：${s.desc}`);
  }
  L.push(`- 色板（請在 palette 宣告這些值，圖層只用角色名）：bg ${pal.bg}、bg2 ${pal.bg2}、ink ${pal.ink}、light ${pal.light}、card ${pal.card}、p ${pal.p}、s ${pal.s}、a ${pal.a}、q ${pal.q}、r ${pal.r}`);
  L.push(`- 幀率：${move.fps ? `${move.fps} fps 的階梯感（動作一格一格跳）` : '流暢（60 fps）'}`);
  L.push('- 構圖：主角佔畫面寬度 50–70%，放在視覺中心；不要讓畫面大半是空的。');
  L.push('- 字級：畫面裡的文字高度至少是畫面高度的 8%，標題 12% 以上；字要粗、要清楚。');
  L.push('- 進場要有設計感（滑入、縮放彈出、描線、遮罩揭開），不要只是從上方掉下來；結尾要有一個停住的「定格」。');
  return L.join('\n');
}

export interface AgentInput {
  template: string;
  topic: string;
  seconds: number;
}

/** 手動模式複製出去的整段提示詞 */
export function agentPrompt(a: AgentInput): string {
  const r = recipeById(a.template);
  const topic = a.topic.trim() || demoTopic(r);
  const base = themeAiPrompt();
  const cut = base.lastIndexOf('我想要的動畫是：');
  const head = cut > 0 ? base.slice(0, cut) : base;
  return `${head}${styleSpec(r)}

【這次要做的】
主題：${topic}
長度：${a.seconds} 秒（loop 設成 ${a.seconds}，name 用一個短的中文名稱）`;
}

/** 從 AI 的回答裡取出主題檔 JSON：有 ```json 區塊就取最後一個，否則取第一個 { 到最後一個 } */
export function extractThemeJson(text: string): string {
  const blocks = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)];
  if (blocks.length) return blocks[blocks.length - 1][1].trim();
  const i = text.indexOf('{');
  const j = text.lastIndexOf('}');
  return i >= 0 && j > i ? text.slice(i, j + 1) : text.trim();
}
