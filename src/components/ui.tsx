import { Check, Copy, X } from 'lucide-react';
import { useEffect, useRef, useState, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react';
import { copyText } from '../lib/platform';
import { useStore } from '../store/store';

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'soft' | 'outline' | 'danger';
  size?: 'xs' | 'sm' | 'md';
  active?: boolean;
};

export function Button({ variant = 'ghost', size = 'md', active, className = '', ...p }: BtnProps) {
  const sz = size === 'xs' ? 'h-7 px-2 text-xs gap-1' : size === 'sm' ? 'h-8 px-2.5 text-[13px] gap-1.5' : 'h-9 px-3 text-sm gap-2';
  const v =
    variant === 'primary'
      ? 'bg-accent text-accent-fg hover:brightness-105 font-semibold'
      : variant === 'soft'
        ? 'bg-raise text-fg hover:bg-line-2/70'
        : variant === 'outline'
          ? 'border border-line-2 text-fg hover:bg-raise'
          : variant === 'danger'
            ? 'text-danger hover:bg-danger/10'
            : `text-fg-2 hover:text-fg hover:bg-raise ${active ? 'bg-raise text-fg' : ''}`;
  return (
    <button
      type="button"
      {...p}
      className={`inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-md transition-colors disabled:opacity-40 disabled:pointer-events-none ${sz} ${v} ${className}`}
    />
  );
}

export function IconBtn({ label, className = '', active, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      {...p}
      className={`inline-flex size-8 shrink-0 items-center justify-center rounded-md transition-colors disabled:opacity-40 ${
        active ? 'bg-raise text-fg' : 'text-fg-2 hover:bg-raise hover:text-fg'
      } ${className}`}
    />
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = 'md',
  className = '',
  id,
}: {
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (v: T) => void;
  size?: 'sm' | 'md';
  className?: string;
  id?: string;
}) {
  return (
    <div id={id} role="radiogroup" className={`inline-flex rounded-lg bg-panel-2 p-0.5 border border-line ${className}`}>
      {options.map((o) => (
        <button
          type="button"
          role="radio"
          aria-checked={o.value === value}
          key={o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={`rounded-md px-2.5 ${size === 'sm' ? 'h-6 text-xs' : 'h-7 text-[13px]'} whitespace-nowrap transition-colors ${
            o.value === value ? 'bg-raise text-fg shadow-sm' : 'text-fg-3 hover:text-fg'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Slider({
  id,
  value,
  min = 0,
  max = 1,
  step = 0.01,
  onChange,
  tone,
  label,
  format,
  className = '',
}: {
  id: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
  tone?: 'vis' | 'mot';
  label?: ReactNode;
  format?: (v: number) => string;
  className?: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {label !== undefined && (
        <label htmlFor={id} className="flex items-center justify-between text-xs text-fg-2">
          <span>{label}</span>
          <span className="num text-fg-3">{format ? format(value) : value.toFixed(2)}</span>
        </label>
      )}
      <input
        id={id}
        type="range"
        className={`sf-range ${tone ?? ''}`}
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ '--p': `${pct}%` } as CSSProperties}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </div>
  );
}

export function CopyButton({ text, label = '複製', size = 'sm', className = '' }: { text: string; label?: string; size?: 'xs' | 'sm'; className?: string }) {
  const [done, setDone] = useState<'idle' | 'ok' | 'fail'>('idle');
  return (
    <Button
      size={size}
      variant="soft"
      className={className}
      onClick={async () => {
        const ok = await copyText(text);
        setDone(ok ? 'ok' : 'fail');
        setTimeout(() => setDone('idle'), 1600);
      }}
    >
      {done === 'ok' ? <Check size={14} /> : <Copy size={14} />}
      {done === 'ok' ? '已複製' : done === 'fail' ? '請手動選取' : label}
    </Button>
  );
}

export function Modal({ open, onClose, title, children, wide, footer }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    ref.current?.focus();
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-0 sm:items-center sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        className={`pop-in flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-line bg-panel shadow-[var(--shadow)] outline-none sm:rounded-2xl ${wide ? 'sm:max-w-5xl' : 'sm:max-w-xl'}`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
          <div className="min-w-0 font-semibold">{title}</div>
          <IconBtn label="關閉" onClick={onClose}>
            <X size={18} />
          </IconBtn>
        </div>
        <div className="scroll-y min-h-0 flex-1 px-5 py-4">{children}</div>
        {footer && <div className="border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <h3 className="label uppercase">{children}</h3>
      {right}
    </div>
  );
}

export function CodeBlock({ code, maxH = 360 }: { code: string; maxH?: number }) {
  return (
    <pre className="scroll-y scroll-x rounded-lg border border-line bg-panel-2 p-3 text-[11.5px] leading-relaxed text-fg-2" style={{ maxHeight: maxH }}>
      <code className="num whitespace-pre">{code}</code>
    </pre>
  );
}

export function Toast() {
  const toast = useStore((s) => s.toast);
  if (!toast) return null;
  return (
    <div
      key={toast.id}
      role="status"
      className="toast fixed bottom-6 left-1/2 z-[60] max-w-[calc(100vw-32px)] rounded-full border border-line-2 bg-panel-2 px-4 py-2 text-sm text-fg shadow-[var(--shadow)]"
    >
      {toast.text}
    </div>
  );
}

/** 關鍵影格菱形：圖像（青）／動效（琥珀） */
export function Kf({ kind, filled = true }: { kind: 'v' | 'm'; filled?: boolean }) {
  const c = kind === 'v' ? 'var(--vis)' : 'var(--mot)';
  return <span className="kf" style={{ background: filled ? c : 'transparent', border: `1.5px solid ${c}` }} aria-hidden />;
}
