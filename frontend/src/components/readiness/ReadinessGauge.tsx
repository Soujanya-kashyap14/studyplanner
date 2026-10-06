import { motion } from 'framer-motion';
import { Rocket } from 'lucide-react';
import type { Exam, ReadinessPrediction, Subject } from '@/types';
import { AnimatedNumber } from '@/components/ui/Feedback';
import { useReducedMotion } from '@/hooks/useMotion';
import { cn } from '@/lib/utils';
import { Countdown } from './Countdown';

const riskStyle = {
  on_track: { label: 'GO FOR LAUNCH', color: 'rgb(var(--mint))', cls: 'text-mint' },
  some_risk: { label: 'HOLD — CHECKLIST', color: 'rgb(var(--amber))', cls: 'text-amber' },
  at_risk: { label: 'SCRUB RISK', color: 'rgb(var(--rose))', cls: 'text-rose' },
} as const;

/**
 * Readiness Gauge: a 240° radial dial with mission-style status,
 * a live T-minus countdown, and a one-line risk message.
 */
export function ReadinessGauge({ exam, subject, prediction, size = 200, compact }: { exam: Exam; subject?: Subject; prediction: ReadinessPrediction; size?: number; compact?: boolean }) {
  const reduce = useReducedMotion();
  const style = riskStyle[prediction.risk];
  const sweep = 240;
  const start = 150; // degrees, measured clockwise from +x
  const r = size / 2 - 14;
  const cx = size / 2;
  const cy = size / 2;
  const polar = (deg: number, rr = r) => [cx + rr * Math.cos((deg * Math.PI) / 180), cy + rr * Math.sin((deg * Math.PI) / 180)] as const;
  const arc = (from: number, to: number, rr = r) => {
    const [x1, y1] = polar(from, rr);
    const [x2, y2] = polar(to, rr);
    return `M ${x1} ${y1} A ${rr} ${rr} 0 ${to - from > 180 ? 1 : 0} 1 ${x2} ${y2}`;
  };
  const value = prediction.readiness / 100;
  const len = (Math.PI * 2 * r * sweep) / 360;
  const projected = prediction.projectedCoverage;

  return (
    <div className={cn('flex flex-col items-center', compact ? 'gap-2' : 'gap-3')}>
      <div className="relative" style={{ width: size, height: size * 0.82 }} role="img" aria-label={`${exam.title} readiness ${prediction.readiness}%. ${style.label}. ${prediction.message}`}>
        <svg width={size} height={size} className="absolute left-0 top-0" aria-hidden>
          {/* Ticks */}
          {Array.from({ length: 25 }, (_, i) => {
            const deg = start + (sweep / 24) * i;
            const [x1, y1] = polar(deg, r + 9);
            const [x2, y2] = polar(deg, r + (i % 6 === 0 ? 3 : 6));
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgb(var(--line) / 0.3)" strokeWidth={i % 6 === 0 ? 2 : 1} />;
          })}
          <path d={arc(start, start + sweep)} fill="none" stroke="rgb(var(--line) / 0.1)" strokeWidth={12} strokeLinecap="round" />
          {/* Projected coverage (thin inner arc) */}
          <path d={arc(start, start + sweep * Math.max(0.001, projected), r - 14)} fill="none" stroke={subject?.color ?? 'rgb(var(--violet))'} strokeOpacity={0.45} strokeWidth={3} strokeLinecap="round" />
          <motion.path
            d={arc(start, start + sweep)}
            fill="none"
            stroke={style.color}
            strokeWidth={12}
            strokeLinecap="round"
            strokeDasharray={len}
            initial={{ strokeDashoffset: reduce ? len * (1 - value) : len }}
            animate={{ strokeDashoffset: len * (1 - value) }}
            transition={{ duration: reduce ? 0 : 1.3, ease: [0.22, 1, 0.36, 1] }}
            style={{ filter: `drop-shadow(0 0 8px ${style.color})` }}
          />
        </svg>
        <div className="absolute inset-x-0 top-[30%] flex flex-col items-center">
          <span className="font-mono text-[32px] font-bold leading-none text-ink">
            <AnimatedNumber value={prediction.readiness} />
            <span className="text-base text-muted">%</span>
          </span>
          <span className={cn('mt-1.5 font-mono text-[10px] font-bold tracking-[0.18em]', style.cls)}>{style.label}</span>
        </div>
      </div>
      <div className="w-full text-center">
        <p className="flex items-center justify-center gap-1.5 text-sm font-semibold text-ink">
          <Rocket className="h-3.5 w-3.5 text-muted" aria-hidden />
          {exam.title}
        </p>
        <Countdown to={exam.date} className="mt-1 justify-center" />
        {!compact && <p className="mx-auto mt-2 max-w-[240px] text-xs leading-relaxed text-muted">{prediction.message}</p>}
      </div>
    </div>
  );
}
