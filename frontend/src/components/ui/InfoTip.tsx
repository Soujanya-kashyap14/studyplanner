import { useId, useState, type ReactNode } from 'react';
import { HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

/** A small (?) next to an unfamiliar term. Shows a plain-language explanation on hover, focus or tap. */
export function InfoTip({ children, label = 'What does this mean?', className }: { children: ReactNode; label?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className={cn('relative inline-flex align-middle', className)}>
      <button
        type="button"
        aria-label={label}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="grid h-5 w-5 place-items-center rounded-full text-faint transition-colors hover:text-ink"
      >
        <HelpCircle className="h-3.5 w-3.5" aria-hidden />
      </button>
      {open && (
        <span id={id} role="tooltip" className="glass-strong absolute left-1/2 top-full z-50 mt-2 w-64 -translate-x-1/2 rounded-xl p-3 text-left text-xs font-normal normal-case leading-relaxed tracking-normal text-ink shadow-xl">
          {children}
        </span>
      )}
    </span>
  );
}
