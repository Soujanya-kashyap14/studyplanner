import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useReducedMotion } from '@/hooks/useMotion';

/** Animated streak flame. Grey ember when the streak is 0. */
export function StreakFlame({ streak, size = 22, className }: { streak: number; size?: number; className?: string }) {
  const reduce = useReducedMotion();
  const lit = streak > 0;
  return (
    <motion.svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={cn('shrink-0', className)}
      aria-hidden
      animate={lit && !reduce ? { scaleY: [1, 1.08, 0.97, 1], y: [0, -0.6, 0.2, 0] } : undefined}
      transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
      style={{ transformOrigin: '50% 90%', filter: lit ? 'drop-shadow(0 0 6px rgb(var(--amber) / 0.7))' : undefined }}
    >
      <defs>
        <linearGradient id="flame-g" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="rgb(var(--amber))" />
          <stop offset="70%" stopColor="#FF7A59" />
          <stop offset="100%" stopColor="#FF4D8D" />
        </linearGradient>
      </defs>
      <path
        d="M12 2c1.2 3.2 4.8 5.6 4.8 10.2A4.8 4.8 0 0 1 12 17a4.8 4.8 0 0 1-4.8-4.8c0-1.8.8-3 1.6-4 .2 1.4 1 2.4 2 2.6C10.4 7.6 11 4.6 12 2Z"
        fill={lit ? 'url(#flame-g)' : 'rgb(var(--line) / 0.25)'}
        transform="translate(0 2.5)"
      />
      {lit && <path d="M12 12.5c.8 1 1.8 1.8 1.8 3.2a1.8 1.8 0 0 1-3.6 0c0-1.2.9-2 1.8-3.2Z" fill="#FFF3C4" transform="translate(0 2.5)" />}
    </motion.svg>
  );
}
