import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

type Art = 'constellation' | 'telescope' | 'calendar' | 'comet' | 'planet' | 'lost';

/** Custom illustrated SVG empty states, themed via CSS variables. */
function Illustration({ art }: { art: Art }) {
  const star = (cx: number, cy: number, r = 2, delay = 0) => (
    <motion.circle
      key={`${cx}-${cy}`}
      cx={cx}
      cy={cy}
      r={r}
      fill="rgb(var(--ink))"
      initial={{ opacity: 0.2 }}
      animate={{ opacity: [0.2, 1, 0.2] }}
      transition={{ duration: 3, repeat: Infinity, delay }}
    />
  );
  const common = (
    <>
      <defs>
        <radialGradient id="es-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgb(var(--violet))" stopOpacity="0.45" />
          <stop offset="100%" stopColor="rgb(var(--violet))" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="es-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="rgb(var(--violet))" />
          <stop offset="100%" stopColor="rgb(var(--cyan))" />
        </linearGradient>
      </defs>
      <circle cx="100" cy="70" r="64" fill="url(#es-glow)" />
      {star(24, 22, 1.5, 0.2)}
      {star(176, 30, 1.5, 1.1)}
      {star(160, 112, 1.2, 0.6)}
      {star(36, 110, 1.2, 1.6)}
    </>
  );
  switch (art) {
    case 'constellation':
      return (
        <svg viewBox="0 0 200 140" className="h-36 w-auto" aria-hidden>
          {common}
          <path d="M50 92 L82 54 L118 68 L150 38" stroke="rgb(var(--line) / 0.3)" strokeDasharray="4 5" fill="none" strokeWidth="1.5" />
          {[
            [50, 92],
            [82, 54],
            [118, 68],
            [150, 38],
          ].map(([x, y], i) => (
            <g key={i}>
              <circle cx={x} cy={y} r="9" fill="none" stroke="rgb(var(--line) / 0.25)" strokeDasharray="2 3" />
              <circle cx={x} cy={y} r="3" fill="rgb(var(--ink) / 0.35)" />
            </g>
          ))}
          <motion.circle cx="150" cy="38" r="5" fill="url(#es-grad)" animate={{ scale: [1, 1.3, 1] }} transition={{ duration: 2.4, repeat: Infinity }} style={{ transformOrigin: '150px 38px' }} />
        </svg>
      );
    case 'telescope':
      return (
        <svg viewBox="0 0 200 140" className="h-36 w-auto" aria-hidden>
          {common}
          <g transform="rotate(-28 100 80)">
            <rect x="62" y="68" width="78" height="20" rx="6" fill="url(#es-grad)" />
            <rect x="136" y="64" width="14" height="28" rx="4" fill="rgb(var(--cyan))" />
            <rect x="48" y="72" width="16" height="12" rx="3" fill="rgb(var(--violet))" />
          </g>
          <path d="M96 92 L80 128 M104 92 L120 128 M100 92 L100 128" stroke="rgb(var(--ink) / 0.5)" strokeWidth="3" strokeLinecap="round" />
          <motion.circle cx="160" cy="26" r="4" fill="rgb(var(--amber))" animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 2, repeat: Infinity }} />
        </svg>
      );
    case 'calendar':
      return (
        <svg viewBox="0 0 200 140" className="h-36 w-auto" aria-hidden>
          {common}
          <rect x="52" y="34" width="96" height="84" rx="14" fill="rgb(var(--glass) / var(--glass-alpha))" stroke="rgb(var(--line) / 0.25)" />
          <rect x="52" y="34" width="96" height="20" rx="10" fill="url(#es-grad)" opacity="0.8" />
          {[0, 1, 2, 3].map((c) =>
            [0, 1, 2].map((r) => <rect key={`${c}${r}`} x={62 + c * 21} y={62 + r * 17} width="14" height="10" rx="3" fill="rgb(var(--line) / 0.14)" />),
          )}
          <motion.rect x="83" y="79" width="14" height="10" rx="3" fill="rgb(var(--amber))" animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 1.8, repeat: Infinity }} />
        </svg>
      );
    case 'comet':
      return (
        <svg viewBox="0 0 200 140" className="h-36 w-auto" aria-hidden>
          {common}
          <motion.g animate={{ x: [0, 6, 0], y: [0, -4, 0] }} transition={{ duration: 4, repeat: Infinity }}>
            <path d="M40 112 Q100 84 134 50" stroke="url(#es-grad)" strokeWidth="10" strokeLinecap="round" fill="none" opacity="0.35" />
            <path d="M60 104 Q104 82 134 50" stroke="url(#es-grad)" strokeWidth="5" strokeLinecap="round" fill="none" opacity="0.7" />
            <circle cx="138" cy="46" r="11" fill="rgb(var(--ink))" />
          </motion.g>
        </svg>
      );
    case 'planet':
      return (
        <svg viewBox="0 0 200 140" className="h-36 w-auto" aria-hidden>
          {common}
          <circle cx="100" cy="72" r="30" fill="url(#es-grad)" />
          <ellipse cx="100" cy="72" rx="56" ry="14" fill="none" stroke="rgb(var(--ink) / 0.6)" strokeWidth="3" transform="rotate(-18 100 72)" />
          <motion.circle cx={0} cy={0} r="5" fill="rgb(var(--amber))" initial={{ x: 48, y: 86 }} animate={{ x: [48, 152, 48], y: [86, 58, 86] }} transition={{ duration: 6, repeat: Infinity, ease: 'linear' }} />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 200 140" className="h-36 w-auto" aria-hidden>
          {common}
          <circle cx="100" cy="70" r="26" fill="none" stroke="url(#es-grad)" strokeWidth="4" strokeDasharray="6 8" />
          <text x="100" y="78" textAnchor="middle" className="font-display" fontSize="24" fill="rgb(var(--ink))">
            ?
          </text>
        </svg>
      );
  }
}

export function EmptyState({ art = 'constellation', title, description, action, className, compact }: { art?: Art; title: string; description?: string; action?: ReactNode; className?: string; compact?: boolean }) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center', compact ? 'gap-2 py-4' : 'gap-3 py-10', className)}>
      <div className={compact ? 'scale-75' : ''}>
        <Illustration art={art} />
      </div>
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {description && <p className="max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
