import { useEffect, useRef } from 'react';
import { thumbs, type ThumbSpec } from '../engine/thumbs';

/** 由排程器驅動的即時縮圖 canvas。specKey 改變時重畫（靜態模式用）。 */
export function Thumb({ spec, specKey, className = '' }: { spec: () => ThumbSpec; specKey: string; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const specRef = useRef(spec);
  specRef.current = spec;
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    return thumbs.register(c, () => specRef.current());
  }, []);
  useEffect(() => {
    if (ref.current) thumbs.touch(ref.current);
  }, [specKey]);
  return <canvas ref={ref} className={`thumb-canvas ${className}`} aria-hidden />;
}
