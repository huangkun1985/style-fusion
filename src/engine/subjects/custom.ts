// 主體：自訂主題。內容來自使用者匯入的動畫主題檔（見 src/engine/themes.ts 與 docs/動畫主題格式說明.md）；
// 沒有匯入時畫一張提示。名稱、循環秒數、代表幀都跟著目前選用的主題走。
import { drawTheme, layerWorld, themeCues, themeEvents, themes } from '../themes';
import type { Subject } from './types';

export const custom: Subject = {
  id: 'custom',
  get name() {
    return themes.current()?.name ?? '自訂主題';
  },
  en: 'Custom Theme',
  get desc() {
    return themes.current()?.desc || '匯入你自己的動畫主題檔（JSON）：用幾何圖層與關鍵影格定義動畫，圖像風格與動效風格照樣套用。規格與範本在「匯入主題」視窗。';
  },
  get loop() {
    return themes.current()?.loop ?? 3;
  },
  get key() {
    return themes.current()?.key ?? 0.2;
  },
  get hero() {
    return themes.current()?.hero ?? 0.1;
  },
  events: () => {
    const t = themes.current();
    return t ? themeEvents(t) : [];
  },
  cues: () => {
    const t = themes.current();
    return t ? themeCues(t) : [];
  },
  track(M) {
    const t = themes.current();
    return t ? layerWorld(t, M, M.u, t.track) : [0, 0];
  },
  draw(S, M, env) {
    const t = themes.current();
    if (t) {
      drawTheme(t, S, M, env);
      return;
    }
    S.text('尚未匯入主題', 0, -12, 30, 'ink', { align: 'center', base: 'middle', alpha: 0.85 });
    S.text('按下方「匯入主題」匯入動畫檔', 0, 24, 15, 'ink', { align: 'center', base: 'middle', alpha: 0.55 });
  },
};
