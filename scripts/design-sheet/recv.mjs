// 開發用：接收頁面 POST 過來的 PNG（data URL），存成檔案。用法：node scripts/design-sheet/recv.mjs <輸出資料夾>
// 之後用 Read 工具讀 <輸出資料夾>/<name>.png 就能「看」到畫面。
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const dir = process.argv[2];
if (!dir) {
  console.error('用法：node scripts/design-sheet/recv.mjs <輸出資料夾>');
  process.exit(1);
}
fs.mkdirSync(dir, { recursive: true });
http
  .createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    if (req.method === 'OPTIONS') {
      res.end();
      return;
    }
    const url = new URL(req.url, 'http://x');
    const name = (url.searchParams.get('name') || 'out').replace(/[^\w.-]/g, '_');
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      const b64 = body.replace(/^data:image\/\w+;base64,/, '');
      fs.writeFileSync(path.join(dir, name + '.png'), Buffer.from(b64, 'base64'));
      res.end('ok');
      console.log('saved', name);
    });
  })
  .listen(5555, () => console.log('listening 5555'));
