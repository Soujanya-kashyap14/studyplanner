import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, cloneElement, isValidElement, type ReactElement } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

const fieldBase =
  'w-full rounded-xl border bg-glass/[var(--glass-alpha)] px-3.5 text-sm text-ink placeholder:text-faint transition-[border-color,box-shadow] duration-200 focus:outline-none focus:ring-2 focus:ring-cyan/40 focus:border-cyan/60 disabled:opacity-60';

interface FieldProps {
  label: string;
  error?: string;
  hint?: ReactNode;
  children: ReactElement;
  className?: string;
  /** Visually hide the label (still read by screen readers). */
  hideLabel?: boolean;
}

/** Label + control + animated error/hint. Wires up id, aria-invalid and aria-describedby. */
export function Field({ label, error, hint, children, className, hideLabel }: FieldProps) {
  const id = useId();
  const msgId = `${id}-msg`;
  const control = isValidElement(children)
    ? cloneElement(children as ReactElement<Record<string, unknown>>, {
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': error || hint ? msgId : undefined,
      })
    : children;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className={cn('text-xs font-medium text-muted', hideLabel && 'sr-only')}>
        {label}
      </label>
      {control}
      <AnimatePresence initial={false} mode="wait">
        {error ? (
          <motion.p
            key="err"
            id={msgId}
            role="alert"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-1.5 text-xs text-rose"
          >
            <AlertCircle className="h-3.5 w-3.5" aria-hidden /> {error}
          </motion.p>
        ) : hint ? (
          <p key="hint" id={msgId} className="text-xs text-faint">
            {hint}
          </p>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return (
    <input
      ref={ref}
      className={cn(fieldBase, 'h-11', rest['aria-invalid'] ? 'border-rose/60' : 'border-line/15', className)}
      {...rest}
    />
  );
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  return (
    <select
      ref={ref}
      className={cn(fieldBase, 'h-11 appearance-none bg-[length:16px] bg-[right_12px_center] bg-no-repeat pr-9', rest['aria-invalid'] ? 'border-rose/60' : 'border-line/15', className)}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23888fb5' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
      }}
      {...rest}
    >
      {children}
    </select>
  );
});

interface ToggleProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}

/** Accessible switch (role="switch") with a springy knob. */
export function Toggle({ checked, onChange, label, description, disabled }: ToggleProps) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm font-medium text-ink">
          {label}
        </label>
        {description && <p className="text-xs text-muted">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors duration-200',
          checked ? 'border-violet/50 bg-violet/80' : 'border-line/15 bg-line/10',
        )}
      >
        <motion.span
          layout
          transition={{ type: 'spring', stiffness: 600, damping: 32 }}
          className={cn('h-5 w-5 rounded-full shadow-md', checked ? 'ml-6 bg-white' : 'ml-1 bg-muted')}
        />
      </button>
    </div>
  );
}

interface SegmentedProps<T extends string> {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; icon?: ReactNode }[];
  label: string;
  className?: string;
}

/** Pill tab control with a sliding indicator. */
export function Segmented<T extends string>({ value, onChange, options, label, className }: SegmentedProps<T>) {
  const id = useId();
  return (
    <div role="radiogroup" aria-label={label} className={cn('inline-flex rounded-xl border border-line/10 bg-line/[0.04] p-1', className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn('relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors', active ? 'text-ink' : 'text-muted hover:text-ink')}
          >
            {active && (
              <motion.span
                layoutId={`seg-${id}`}
                className="absolute inset-0 rounded-lg border border-line/10 bg-glass/[calc(var(--glass-alpha)+0.06)] shadow-sm"
                transition={{ type: 'spring', stiffness: 500, damping: 36 }}
              />
            )}
            <span className="relative flex items-center gap-1.5">
              {o.icon}
              {o.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Difficulty picker: 5 star-points, keyboard accessible as a radio group. */
export function DifficultyPicker({ value, onChange, label = 'Difficulty' }: { value: number; onChange: (v: 1 | 2 | 3 | 4 | 5) => void; label?: string }) {
  const names = ['Gentle', 'Easy', 'Moderate', 'Hard', 'Brutal'];
  return (
    <div role="radiogroup" aria-label={label} className="flex items-center gap-1.5">
      {([1, 2, 3, 4, 5] as const).map((n) => (
        <motion.button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} — ${names[n - 1]}`}
          whileTap={{ scale: 0.85 }}
          onClick={() => onChange(n)}
          className="grid h-9 w-9 place-items-center rounded-lg transition-colors hover:bg-line/[0.06]"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
            <path
              d="M12 2.5l2.4 6.6 6.6 2.4-6.6 2.4L12 20.5l-2.4-6.6L3 11.5l6.6-2.4z"
              className={cn('transition-colors duration-200', n <= value ? 'fill-amber' : 'fill-line/15')}
            />
          </svg>
        </motion.button>
      ))}
      <span className="ml-1 text-xs text-muted">{names[value - 1]}</span>
    </div>
  );
}

/** Swatch picker for subject signature colors. */
export function ColorPicker({ value, onChange, colors }: { value: string; onChange: (c: string) => void; colors: string[] }) {
  return (
    <div role="radiogroup" aria-label="Signature color" className="flex flex-wrap gap-2">
      {colors.map((c) => (
        <motion.button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          aria-label={`Color ${c}`}
          whileTap={{ scale: 0.85 }}
          onClick={() => onChange(c)}
          className={cn('h-8 w-8 rounded-full ring-offset-2 ring-offset-canvas transition-shadow', value === c && 'ring-2 ring-ink')}
          style={{ background: c, boxShadow: value === c ? `0 0 16px ${c}` : undefined }}
        />
      ))}
    </div>
  );
}
