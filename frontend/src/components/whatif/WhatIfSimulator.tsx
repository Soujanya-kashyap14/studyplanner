import { useDeferredValue, useMemo, useState } from 'react';
import { ArrowRight, FlaskConical } from 'lucide-react';
import type { Derived } from '@/hooks/useDerived';
import { useDataStore } from '@/store/useDataStore';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { SubjectDot } from '@/components/ui/Feedback';
import { adjustWeeklyHours, simulateWhatIf } from '@/utils/scheduler';
import { cn, round1 } from '@/lib/utils';

const STEPS = [-2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2];

const label = (h: number) => (h === 0 ? 'Your current hours' : `${Math.abs(h)}h ${h > 0 ? 'more' : 'less'} per study day`);
const tone = (r: number) => (r >= 80 ? 'text-mint' : r >= 60 ? 'text-amber' : 'text-rose');

/**
 * "What if I study 1 hour less per day?" — re-plans in the browser with the
 * changed hours and shows the effect on every upcoming exam's readiness.
 * Nothing is saved unless the student presses "Use these hours".
 */
export function WhatIfSimulator({ d }: { d: Derived }) {
  const [delta, setDelta] = useState(0);
  const deferred = useDeferredValue(delta);
  const save = useDataStore((s) => s.updateAvailability);
  const saving = useDataStore((s) => s.pending.availability);
  const result = useMemo(() => simulateWhatIf(d.input, deferred), [d.input, deferred]);
  const stale = deferred !== delta;

  if (!result.exams.length) return null;
  const worst = [...result.exams].sort((a, b) => a.after.readiness - a.before.readiness - (b.after.readiness - b.before.readiness))[0];
  const change = worst.after.readiness - worst.before.readiness;
  const worstTitle = d.snapshot.exams.find((e) => e.id === worst.examId)?.title;

  return (
    <GlassCard
      hover={false}
      title={
        <span className="flex items-center gap-2">
          <FlaskConical className="h-4 w-4 text-violet" aria-hidden /> What if…
        </span>
      }
      action={
        delta !== 0 ? (
          <Button size="sm" variant="secondary" loading={saving} onClick={() => void save(adjustWeeklyHours(d.snapshot.availability, delta)).then((ok) => ok && setDelta(0))} title="Save these study hours and re-fit your plan (you can undo)">
            Use these hours
          </Button>
        ) : undefined
      }
    >
      <p className="-mt-2 mb-4 text-sm text-muted">Drag to see how more or less study time per day changes your readiness for each exam. Nothing changes until you choose to.</p>

      <div className="flex flex-col gap-2">
        <input
          type="range"
          min={0}
          max={STEPS.length - 1}
          step={1}
          value={STEPS.indexOf(delta)}
          onChange={(e) => setDelta(STEPS[Number(e.target.value)])}
          aria-label="Change in study hours per day"
          aria-valuetext={label(delta)}
          className="w-full accent-[rgb(var(--violet))]"
        />
        <div className="flex justify-between font-mono text-[10px] text-faint" aria-hidden>
          <span>−2h</span>
          <span>0</span>
          <span>+2h</span>
        </div>
        <p className="text-sm font-medium text-ink">
          {label(delta)}{' '}
          <span className="font-normal text-muted">
            · {round1(result.weeklyHoursBefore)}h → {round1(result.weeklyHoursAfter)}h a week
          </span>
        </p>
      </div>

      <ul className={cn('mt-4 divide-y divide-line/[0.08] transition-opacity', stale && 'opacity-60')} aria-live="polite">
        {result.exams.map(({ examId, before, after }) => {
          const exam = d.snapshot.exams.find((e) => e.id === examId)!;
          const subject = d.subjectById.get(exam.subjectId);
          const diff = after.readiness - before.readiness;
          return (
            <li key={examId} className="flex items-center gap-3 py-2.5">
              <SubjectDot color={subject?.color ?? '#888'} />
              <span className="min-w-0 flex-1 truncate text-sm text-ink">{exam.title}</span>
              <span className={cn('font-mono text-sm', tone(before.readiness))}>{before.readiness}%</span>
              <ArrowRight className="h-3.5 w-3.5 text-faint" aria-hidden />
              <span className={cn('w-12 font-mono text-sm font-semibold', tone(after.readiness))}>{after.readiness}%</span>
              <span className={cn('w-12 text-right font-mono text-xs', diff > 0 ? 'text-mint' : diff < 0 ? 'text-rose' : 'text-faint')}>
                {diff > 0 ? `+${diff}` : diff === 0 ? '±0' : diff}
              </span>
            </li>
          );
        })}
      </ul>
      {delta !== 0 && (
        <p className="mt-3 text-xs text-muted">
          {change < 0
            ? `${worstTitle} is hit hardest: readiness drops ${-change} points.`
            : change > 0
              ? `Every exam gains — ${worstTitle} by ${change} points at least.`
              : 'Your readiness barely moves — your current plan already has room.'}
        </p>
      )}
    </GlassCard>
  );
}
