// 開發用：把內建的動畫主題範本輸出成檔案（docs/範本-動畫主題/），讓文件裡的範本與程式內建的永遠一致。
// 用法：npx tsx scripts/export-theme-templates.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { THEME_TEMPLATES, templateJson, themeAiPrompt } from '../src/engine/themeTemplates';

const dir = new URL('../docs/範本-動畫主題/', import.meta.url);
mkdirSync(dir, { recursive: true });
for (const t of THEME_TEMPLATES) {
  writeFileSync(new URL(t.file, dir), templateJson(t.data) + '\n');
  console.log('已輸出', t.file);
}

// 給 AI 的提示詞全文（與介面上「複製給 AI 的提示詞」按鈕複製的內容相同）
writeFileSync(new URL('../動畫主題-給AI的提示詞.txt', dir), `${themeAiPrompt()}\n`);
console.log('已輸出 動畫主題-給AI的提示詞.txt');
