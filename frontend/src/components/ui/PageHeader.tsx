import type { ReactNode } from 'react';
import { motion } from 'framer-motion';

/**
 * Page title block: a plain-language title, the themed name as a small subtitle,
 * and one line saying what the page is for.
 */
export function PageHeader({ title, subtitle, description, actions }: { title: ReactNode; subtitle?: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <motion.h1 initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="text-2xl font-semibold leading-tight text-ink sm:text-[32px]">
          {title}
        </motion.h1>
        {subtitle && <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.18em] text-violet">{subtitle}</p>}
        {description && <p className="mt-2 max-w-2xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
