import type { FontId } from './types';

export const FONTS: Record<FontId, { family: string; weight: number; scale: number; label: string }> = {
  sans: { family: '"Outfit", "Noto Sans TC", sans-serif', weight: 800, scale: 1, label: '幾何無襯線' },
  grotesk: { family: '"Archivo", "Noto Sans TC", sans-serif', weight: 900, scale: 0.92, label: '粗體怪誕體' },
  round: { family: '"Fredoka", "Noto Sans TC", sans-serif', weight: 700, scale: 1, label: '圓體' },
  serif: { family: '"Playfair Display", "Noto Serif TC", serif', weight: 800, scale: 0.98, label: '高對比襯線' },
  mono: { family: '"JetBrains Mono", "Noto Sans TC", monospace', weight: 700, scale: 0.86, label: '等寬' },
  pixel: { family: '"Press Start 2P", "Noto Sans TC", monospace', weight: 400, scale: 0.6, label: '像素字' },
  term: { family: '"VT323", "Noto Sans TC", monospace', weight: 400, scale: 1.3, label: '終端機' },
  display: { family: '"Rubik Mono One", "Noto Sans TC", sans-serif', weight: 400, scale: 0.74, label: '粗黑展示' },
  deco: { family: '"Limelight", "Noto Serif TC", serif', weight: 400, scale: 0.92, label: '裝飾藝術' },
  neon: { family: '"Monoton", "Noto Sans TC", sans-serif', weight: 400, scale: 0.78, label: '霓虹線體' },
  script: { family: '"Pacifico", "Noto Sans TC", cursive', weight: 400, scale: 0.92, label: '手寫草體' },
  cond: { family: '"Bebas Neue", "Noto Sans TC", sans-serif', weight: 400, scale: 1.25, label: '窄體' },
  groovy: { family: '"Shrikhand", "Noto Sans TC", cursive', weight: 400, scale: 0.9, label: '70 年代粗圓' },
  brush: { family: '"Noto Serif TC", serif', weight: 900, scale: 1, label: '宋體／書法感' },
};

export function fontCss(id: FontId, size: number): string {
  const f = FONTS[id] ?? FONTS.sans;
  return `${f.weight} ${Math.max(1, size * f.scale)}px ${f.family}`;
}

let loaded = false;
/** 預先載入畫布會用到的字體（畫布不會自動觸發 webfont 下載） */
export function preloadFonts(onDone?: () => void) {
  if (loaded || typeof document === 'undefined' || !document.fonts) return;
  loaded = true;
  const sample = 'MOTION動效風格混合 0123456789%';
  const jobs = Object.values(FONTS).map((f) => {
    const fam = f.family.split(',')[0];
    return document.fonts.load(`${f.weight} 32px ${fam}`, sample).catch(() => undefined);
  });
  jobs.push(document.fonts.load('900 32px "Noto Sans TC"', sample).catch(() => undefined));
  jobs.push(document.fonts.load('900 32px "Noto Serif TC"', sample).catch(() => undefined));
  Promise.all(jobs).then(() => onDone?.());
}
