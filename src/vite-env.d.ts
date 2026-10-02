/// <reference types="vite/client" />

/** 由 vite.config.ts 從 package.json 注入的版本號 */
declare const __APP_VERSION__: string;

declare module 'gifenc' {
  export function GIFEncoder(opts?: { auto?: boolean; initialCapacity?: number }): {
    writeFrame(index: Uint8Array, width: number, height: number, opts?: { palette?: number[][]; delay?: number; repeat?: number; transparent?: boolean; transparentIndex?: number; dispose?: number; first?: boolean }): void;
    finish(): void;
    bytes(): Uint8Array;
    bytesView(): Uint8Array;
  };
  export function quantize(rgba: Uint8Array | Uint8ClampedArray, maxColors: number, opts?: { format?: 'rgb565' | 'rgb444' | 'rgba4444'; oneBitAlpha?: boolean | number; clearAlpha?: boolean }): number[][];
  export function applyPalette(rgba: Uint8Array | Uint8ClampedArray, palette: number[][], format?: 'rgb565' | 'rgb444' | 'rgba4444'): Uint8Array;
}
