// 開發用：用 App 自己的解析器檢查一個動畫主題檔，列出錯誤與提醒。用法：npx tsx scripts/design-sheet/check-theme.ts <主題檔>
import { readFileSync } from 'node:fs';
import { parseTheme } from '../../src/engine/themes';

const file = process.argv[2];
try {
  const t = parseTheme(readFileSync(file, 'utf8'));
  console.log(`OK「${t.name}」loop=${t.loop}s 圖層 ${t.layers.length}（頂層）`);
  console.log(t.warnings.length ? t.warnings.map((w) => '提醒：' + w).join('\n') : '沒有提醒');
} catch (e) {
  console.log('錯誤：' + (e as Error).message);
  process.exit(1);
}
