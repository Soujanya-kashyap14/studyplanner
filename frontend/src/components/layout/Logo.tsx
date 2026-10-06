import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

/** Orbit mark: a glowing core with a tilted ring and an amber moon. */
export function LogoMark({ className, animated = true }: { className?: string; animated?: boolean }) {
  return (
    <svg viewBox="0 0 40 40" className={cn('h-9 w-9', className)} aria-hidden>
      <defs>
        <radialGradient id="logo-core" cx="50%" cy="45%" r="55%">
          <stop offset="0%" stopColor="#fff" />
          <stop offset="55%" stopColor="rgb(var(--violet))" />
          <stop offset="100%" stopColor="rgb(var(--violet))" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="20" cy="20" r="9" fill="url(#logo-core)" />
      <ellipse cx="20" cy="20" rx="17" ry="7" fill="none" stroke="rgb(var(--cyan))" strokeWidth="1.8" transform="rotate(-24 20 20)" opacity="0.9" />
      <motion.g
        style={{ transformOrigin: '20px 20px' }}
        animate={animated ? { rotate: 360 } : undefined}
        transition={{ duration: 14, repeat: Infinity, ease: 'linear' }}
      >
        <circle cx="35" cy="14" r="2.4" fill="rgb(var(--amber))" />
      </motion.g>
    </svg>
  );
}

export function Logo({ className, tagline = true }: { className?: string; tagline?: boolean }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <LogoMark />
      <div className="leading-none">
        <span className="font-display text-xl font-bold tracking-tight text-ink">Orbit</span>
        {tagline && <span className="mt-1 block font-mono text-[10px] uppercase tracking-[0.2em] text-muted">study in your own universe</span>}
      </div>
    </div>
  );
}
