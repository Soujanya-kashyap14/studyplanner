import { useMemo } from 'react';
import { Sunrise } from 'lucide-react';
import type { Derived } from '@/hooks/useDerived';
import { GlassCard } from '@/components/ui/GlassCard';
import { peakHours } from '@/utils/insights';
import { cn } from '@/lib/utils';

/** When do you actually study best? Completion rate per part of the day, learned from your history. */
export function PeakHoursCard({ d }: { d: Derived }) {
  const p = useMemo(() => peakHours(d.snapshot.sessions), [d.snapshot.sessions]);
  const pct = (r: number | null) => (r === null ? null : Math.round(r * 100));
  const summary = p.peak
    ? `You finish ${pct(p.peak.rate)}% of your ${p.peak.part} sessions${p.low && p.low.part !== p.peak.part ? `, but only ${pct(p.low.rate)}% in the ${p.low.part}` : ''}. Orbit now schedules hard topics in the ${p.peak.part} whenever your study hours reach it.`
    : 'Orbit is still learning when you study best. After a few finished (or skipped) sessions in different parts of the day, it starts placing hard topics in your strongest hours.';

  return (
    <GlassCard
      hover={false}
      title={
        <span className="flex items-center gap-2">
          <Sunrise className="h-4 w-4 text-amber" aria-hidden /> Your peak hours
        </span>
      }
    >
      <p className="-mt-2 mb-5 text-sm text-muted">{summary}</p>
      <ul className="grid gap-3 sm:grid-cols-4">
        {p.parts.map((x) => {
          const v = pct(x.rate);
          const best = p.peak?.part === x.part;
          return (
            <li key={x.part} className={cn('rounded-2xl border p-3', best ? 'border-amber/40 bg-amber/[0.06]' : 'border-line/10 bg-line/[0.03]')}>
              <p className="text-xs font-medium text-muted">{x.label}</p>
              <p className={cn('mt-1 font-mono text-2xl font-bold', v === null ? 'text-faint' : best ? 'text-amber' : 'text-ink')}>{v === null ? '—' : `${v}%`}</p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line/10" aria-hidden>
                <div className={cn('h-full rounded-full', best ? 'bg-amber' : 'bg-violet')} style={{ width: `${v ?? 0}%` }} />
              </div>
              <p className="mt-1.5 text-[11px] text-faint">
                {x.completed} done · {x.missed} skipped
              </p>
            </li>
          );
        })}
      </ul>
    </GlassCard>
  );
}
