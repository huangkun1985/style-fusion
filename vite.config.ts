import { defineConfig, type PluginOption } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

// `npm run build` 產出單一 HTML（dist/index.html），雙擊即可在瀏覽器開啟，也可直接丟到任何靜態主機。
export default defineConfig(({ command }) => {
  const plugins: PluginOption[] = [react(), tailwindcss()];
  if (command === 'build') plugins.push(viteSingleFile());
  return {
    base: './',
    define: { __APP_VERSION__: JSON.stringify(pkg.version) },
    plugins,
    build: {
      target: 'es2022',
      chunkSizeWarningLimit: 6000,
      assetsInlineLimit: 100000000,
    },
    server: { port: 5199, strictPort: false },
  };
});
