import { defineConfig, type Plugin, type PluginOption } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

/**
 * 背景執行緒（音樂渲染）的打包：取樣包的載入器換成空殼。取樣由主執行緒解碼後傳進去，
 * 背景執行緒不需要、也不該夾帶 8 MB 的取樣資料。
 */
function workerPackStub(): Plugin {
  const ID = '\0sf-pack-stub';
  return {
    name: 'sf-worker-pack-stub',
    enforce: 'pre',
    resolveId(source) {
      if (/(^|\/)pack\/loaders(\.ts)?$/.test(source)) return ID;
      return null;
    },
    load(id) {
      if (id === ID) return 'export const INST_LOADERS = {};\nexport const DRUM_LOADER = () => Promise.reject(new Error("worker: samples come from the main thread"));\n';
      return null;
    },
  };
}

/**
 * 線上版（npm run build:web → dist-web/）額外產生的檔案：
 * - manifest.webmanifest、icon.svg：可以「安裝」成 App（PWA）
 * - sw.js：離線快取（開過的東西離線也能用；網頁本身每次先問網路，部署新版馬上生效）
 * - _headers：Cloudflare 的快取規則（帶雜湊的檔案永久快取，sw.js 每次檢查）
 */
function webExtras(): Plugin {
  const icon =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#11151c"/><g transform="translate(2 2) scale(2)"><rect x="4" y="9" width="12" height="12" rx="2.5" transform="rotate(45 10 15)" fill="#6cd4ff"/><rect x="14" y="9" width="12" height="12" rx="2.5" transform="rotate(45 20 15)" fill="#ffb648" opacity="0.92"/></g></svg>';
  return {
    name: 'sf-web-extras',
    apply: 'build',
    transformIndexHtml() {
      return [
        { tag: 'link', attrs: { rel: 'manifest', href: './manifest.webmanifest' }, injectTo: 'head' },
        { tag: 'meta', attrs: { name: 'theme-color', content: '#11151c' }, injectTo: 'head' },
        { tag: 'link', attrs: { rel: 'apple-touch-icon', href: './icon.svg' }, injectTo: 'head' },
      ];
    },
    generateBundle(_opts, bundle) {
      const files = Object.keys(bundle);
      // 預先快取「打開就要用」的殼：網頁、主程式與樣式；取樣、3D、背景執行緒等等用到時才下載，下載過的也會進快取
      const shell = ['./', './index.html', ...files.filter((f) => /^assets\/index-[\w-]+\.(js|css)$/.test(f)).map((f) => `./${f}`)];
      const build = `${pkg.version}-${Date.now().toString(36)}`;
      const sw = readFileSync(new URL('./scripts/web/sw.js', import.meta.url), 'utf8').replace('__BUILD__', build).replace('__SHELL__', JSON.stringify(shell));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: sw });
      this.emitFile({ type: 'asset', fileName: 'icon.svg', source: icon });
      this.emitFile({
        type: 'asset',
        fileName: 'manifest.webmanifest',
        source: JSON.stringify(
          {
            name: 'Style Fusion 動效設計風格混合器',
            short_name: 'Style Fusion',
            description: '圖像風格 × 動效風格即時混搭的動效設計參考台',
            lang: 'zh-Hant',
            start_url: './',
            scope: './',
            display: 'standalone',
            background_color: '#11151c',
            theme_color: '#11151c',
            icons: [{ src: './icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
          },
          null,
          2,
        ),
      });
      this.emitFile({
        type: 'asset',
        fileName: '_headers',
        source: '/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n/sw.js\n  Cache-Control: no-cache\n/index.html\n  Cache-Control: no-cache\n',
      });
    },
  };
}

// 兩種成品：
// - npm run build      → dist/index.html：單一檔案（全部內嵌，約 10 MB），雙擊即可開啟，也是 start.bat 用的版本
// - npm run build:web  → dist-web/：線上版（Cloudflare 等靜態主機）。程式拆檔、取樣與 3D 用到才下載、可離線、可安裝
export default defineConfig(({ command, mode }) => {
  const web = mode === 'web';
  const plugins: PluginOption[] = [react(), tailwindcss()];
  if (command === 'build' && !web) plugins.push(viteSingleFile());
  if (command === 'build' && web) plugins.push(webExtras());
  return {
    base: './',
    define: { __APP_VERSION__: JSON.stringify(pkg.version) },
    plugins,
    worker: { plugins: () => [workerPackStub()] },
    build: {
      target: 'es2022',
      outDir: web ? 'dist-web' : 'dist',
      chunkSizeWarningLimit: 6000,
      // 單檔版要把所有資源內嵌；線上版維持預設（小檔內嵌、大檔獨立）
      assetsInlineLimit: web ? 4096 : 100000000,
    },
    server: { port: 5199, strictPort: false },
  };
});
