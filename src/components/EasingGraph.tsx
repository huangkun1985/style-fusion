import { bezier, ioOf, type EaseFn } from '../engine/easing';

/** 緩動曲線圖：實線＝混合後的減速曲線，虛線＝擬合的 cubic-bezier，淡線＝兩端緩 */
export function EasingGraph({ ease, bz }: { ease: EaseFn; bz: [number, number, number, number] }) {
  const W = 300;
  const H = 180;
  const pad = 14;
  const y0 = -0.35;
  const y1 = 1.35;
  const X = (x: number) => pad + x * (W - pad * 2);
  const Y = (y: number) => H - pad - ((y - y0) / (y1 - y0)) * (H - pad * 2);
  const pathOf = (f: EaseFn) => {
    let d = '';
    for (let i = 0; i <= 120; i++) {
      const x = i / 120;
      const y = Math.max(y0, Math.min(y1, f(x)));
      d += `${i ? 'L' : 'M'}${X(x).toFixed(1)},${Y(y).toFixed(1)}`;
    }
    return d;
  };
  const b = bezier(...bz);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="緩動曲線圖">
      <rect x={X(0)} y={Y(1)} width={X(1) - X(0)} height={Y(0) - Y(1)} fill="var(--panel-2)" />
      {[0, 0.25, 0.5, 0.75, 1].map((g) => (
        <g key={g}>
          <line x1={X(g)} x2={X(g)} y1={Y(y0)} y2={Y(y1)} stroke="var(--line)" strokeWidth={1} />
          <line x1={X(0)} x2={X(1)} y1={Y(g)} y2={Y(g)} stroke="var(--line)" strokeWidth={1} />
        </g>
      ))}
      <line x1={X(0)} x2={X(1)} y1={Y(0)} y2={Y(0)} stroke="var(--line-2)" strokeWidth={1.2} />
      <line x1={X(0)} x2={X(1)} y1={Y(1)} y2={Y(1)} stroke="var(--line-2)" strokeWidth={1.2} />
      <path d={pathOf(ioOf(ease))} fill="none" stroke="var(--vis)" strokeOpacity={0.45} strokeWidth={1.5} />
      <path d={pathOf(b)} fill="none" stroke="var(--fg-3)" strokeDasharray="4 4" strokeWidth={1.4} />
      <path d={pathOf(ease)} fill="none" stroke="var(--mot)" strokeWidth={2.4} strokeLinejoin="round" />
      <text x={X(0) + 2} y={Y(1) - 4} fontSize={9} fill="var(--fg-3)" fontFamily="var(--font-mono)">
        1.0
      </text>
      <text x={X(0) + 2} y={Y(0) + 11} fontSize={9} fill="var(--fg-3)" fontFamily="var(--font-mono)">
        0
      </text>
      <text x={X(1) - 2} y={Y(0) + 11} fontSize={9} fill="var(--fg-3)" textAnchor="end" fontFamily="var(--font-mono)">
        時間 →
      </text>
    </svg>
  );
}
