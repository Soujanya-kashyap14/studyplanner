import type { ReactNode } from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { cn } from '@/lib/utils';

interface GlassCardProps extends Omit<HTMLMotionProps<'section'>, 'title'> {
  title?: ReactNode;
  eyebrow?: ReactNode;
  action?: ReactNode;
  hover?: boolean;
  padded?: boolean;
  children?: ReactNode;
  /** Accent glow color (CSS color) shown as a soft radial highlight. */
  glow?: string;
}

/** The base surface of Orbit: frosted glass, 1px translucent border, optional hover glow. */
export function GlassCard({ title, eyebrow, action, hover = true, padded = true, glow, className, children, ...rest }: GlassCardProps) {
  const headingId = typeof title === 'string' ? `card-${title.replace(/\W+/g, '-').toLowerCase()}` : undefined;
  return (
    <motion.section
      aria-labelledby={headingId}
      className={cn('glass relative overflow-hidden', hover && 'glass-hover', padded && 'p-6', className)}
      {...rest}
    >
      {glow && (
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full opacity-40 blur-3xl"
          style={{ background: glow }}
        />
      )}
      {(title || eyebrow || action) && (
        <header className="relative mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
            {title && (
              <h2 id={headingId} className="truncate text-base font-semibold text-ink">
                {title}
              </h2>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      <div className="relative">{children}</div>
    </motion.section>
  );
}
