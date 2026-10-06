import { useEffect, useRef, type ReactNode } from 'react';
import { animate, motion, useMotionValue, useTransform } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useReducedMotion } from '@/hooks/useMotion';

/* ---------------- Badge ---------------- */

type Tone = 'neutral' | 'violet' | 'cyan' | 'amber' | 'rose' | 'mint';
const tones: Record<Tone, string> = {
  neutral: 'bg-line/[0.07] text-muted border-line/10',
  violet: 'bg-violet/[0.12] text-violet border-violet/25',
  cyan: 'bg-cyan/[0.12] text-cyan border-cyan/25',
  amber: 'bg-amber/[0.12] text-amber border-amber/30',
  rose: 'bg-rose/[0.12] text-rose border-rose/30',
  mint: 'bg-mint/[0.12] text-mint border-mint/25',
};

export function Badge({ tone = 'neutral', children, className, pulse }: { tone?: Tone; children: ReactNode; className?: string; pulse?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 font-mono text-[11px] font-medium',
        tones[tone],
        pulse && 'animate-pulse-amber',
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Urgency badge from days left: amber is reserved for "soon". */
export function UrgencyBadge({ daysLeft, done }: { daysLeft: number; done?: boolean }) {
  if (done) return <Badge tone="mint">Done</Badge>;
  if (daysLeft < 0) return <Badge tone="rose">Overdue</Badge>;
  if (daysLeft === 0) return <Badge tone="amber" pulse>Today</Badge>;
  if (daysLeft <= 3) return <Badge tone="amber" pulse={daysLeft <= 1}>T-{daysLeft}d</Badge>;
  if (daysLeft <= 7) return <Badge tone="violet">T-{daysLeft}d</Badge>;
  return <Badge>T-{daysLeft}d</Badge>;
}

/* ---------------- Subject chip ---------------- */

export function SubjectDot({ color, className, glow = true }: { color: string; className?: string; glow?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn('inline-block h-2.5 w-2.5 shrink-0 rounded-full', className)}
      style={{ background: color, boxShadow: glow ? `0 0 10px ${color}` : undefined }}
    />
  );
}

/* ---------------- Animated number ---------------- */

export function AnimatedNumber({ value, decimals = 0, suffix = '', className }: { value: number; decimals?: number; suffix?: string; className?: string }) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(reduce ? value : 0);
  const text = useTransform(mv, (v) => `${v.toFixed(decimals)}${suffix}`);
  useEffect(() => {
    if (reduce) {
      mv.set(value);
      return;
    }
    const controls = animate(mv, value, { duration: 0.9, ease: [0.22, 1, 0.36, 1] });
    return () => controls.stop();
  }, [value, reduce, mv]);
  return <motion.span className={cn('tabular-nums', className)}>{text}</motion.span>;
}

/* ---------------- Progress ring ---------------- */

interface RingProps {
  value: number; // 0..1
  size?: number;
  stroke?: number;
  color?: string;
  track?: string;
  children?: ReactNode;
  label: string;
  gradient?: boolean;
}

/** Circular progress that draws in on mount and on change. */
export function ProgressRing({ value, size = 120, stroke = 10, color, track, children, label, gradient = true }: RingProps) {
  const reduce = useReducedMotion();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const gid = useRef(`ring-${Math.random().toString(36).slice(2, 8)}`).current;
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }} role="img" aria-label={`${label}: ${Math.round(v * 100)}%`}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="rgb(var(--violet))" />
            <stop offset="100%" stopColor="rgb(var(--cyan))" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track ?? 'rgb(var(--line) / 0.1)'} strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={gradient && !color ? `url(#${gid})` : color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: reduce ? c * (1 - v) : c }}
          animate={{ strokeDashoffset: c * (1 - v) }}
          transition={{ duration: reduce ? 0 : 1.1, ease: [0.22, 1, 0.36, 1] }}
          style={{ filter: `drop-shadow(0 0 6px ${color ?? 'rgb(var(--violet) / 0.6)'})` }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}

/* ---------------- Progress bar ---------------- */

export function ProgressBar({ value, color, label, className, height = 8 }: { value: number; color?: string; label: string; className?: string; height?: number }) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
      className={cn('w-full overflow-hidden rounded-full bg-line/10', className)}
      style={{ height }}
    >
      <motion.div
        className="h-full rounded-full"
        initial={{ width: 0 }}
        animate={{ width: `${v * 100}%` }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        style={{
          background: color ? `linear-gradient(90deg, ${color}99, ${color})` : 'linear-gradient(90deg, rgb(var(--violet)), rgb(var(--cyan)))',
          boxShadow: color ? `0 0 12px ${color}88` : undefined,
        }}
      />
    </div>
  );
}

/* ---------------- Skeleton ---------------- */

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('skeleton', className)} />;
}

/* ---------------- Kbd ---------------- */

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded-md border border-line/15 bg-line/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-muted">{children}</kbd>;
}
