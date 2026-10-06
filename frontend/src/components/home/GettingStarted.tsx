import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Check, Sparkles } from 'lucide-react';
import type { Derived } from '@/hooks/useDerived';
import { useDataStore } from '@/store/useDataStore';
import { planReadiness } from '@/components/schedule/PlanSetupGuide';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

export interface ChecklistItem {
  id: string;
  label: string;
  detail: string;
  done: boolean;
  optional?: boolean;
  to?: string;
  action: string;
}

/** The five setup steps plus "Generate plan", in order, with what's left for each. */
export function gettingStartedItems(d: Derived): ChecklistItem[] {
  const { steps } = planReadiness(d);
  const by = (id: string) => steps.find((s) => s.id === id)!;
  const hasPlan = d.snapshot.sessions.some((s) => s.status === 'planned' && s.date >= d.today) || d.snapshot.sessions.some((s) => s.status === 'completed');
  return [
    { id: 'subjects', label: 'Add your subjects', detail: by('subjects').detail, done: by('subjects').done, to: '/subjects?new=1', action: 'Add a subject' },
    { id: 'topics', label: 'Add topics with hours', detail: by('topics').detail, done: by('topics').done, to: by('topics').action.to, action: by('topics').action.label },
    { id: 'deadlines', label: 'Add exams & deadlines', detail: by('deadlines').detail, done: by('deadlines').done, optional: true, to: '/exams?new=exam', action: 'Add an exam' },
    { id: 'hours', label: 'Set your weekly study hours', detail: by('availability').detail, done: by('availability').done, to: '/availability', action: 'Set study hours' },
    { id: 'plan', label: 'Generate your plan', detail: hasPlan ? 'Your plan is ready.' : 'Orbit turns everything above into daily study sessions.', done: hasPlan, action: 'Generate plan' },
  ];
}

/** Is the "Getting started" card still needed? (required steps or the plan missing) */
export const needsGettingStarted = (d: Derived) => gettingStartedItems(d).some((i) => !i.done && !i.optional);

/**
 * Home's "Getting started" card: progress bar + checklist. Its single primary
 * button is always the next unfinished required step.
 */
export function GettingStartedCard({ d }: { d: Derived }) {
  const items = gettingStartedItems(d);
  const generate = useDataStore((s) => s.generatePlan);
  const busy = useDataStore((s) => s.pending.generate);
  const navigate = useNavigate();
  const done = items.filter((i) => i.done).length;
  const next = items.find((i) => !i.done && !i.optional);

  const runNext = async () => {
    if (!next) return;
    if (next.id === 'plan') {
      if (await generate()) navigate('/plan');
    } else if (next.to) navigate(next.to);
  };

  return (
    <section className="glass p-6 sm:p-8" aria-labelledby="gs-title">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="gs-title" className="text-xl font-semibold text-ink">
            Getting started
          </h2>
          <p className="mt-1 text-sm text-muted">{next ? `Next: ${next.label.toLowerCase()}. It takes about a minute.` : 'All set!'}</p>
        </div>
        {next && (
          <Button size="lg" icon={next.id === 'plan' ? <Sparkles className="h-4 w-4" /> : undefined} iconRight={next.id === 'plan' ? undefined : <ArrowRight className="h-4 w-4" />} loading={next.id === 'plan' && busy} onClick={() => void runNext()}>
            {next.action}
          </Button>
        )}
      </div>

      <div className="mt-6 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-line/10" role="progressbar" aria-label="Setup progress" aria-valuemin={0} aria-valuemax={items.length} aria-valuenow={done}>
          <motion.div className="h-full rounded-full bg-[linear-gradient(90deg,rgb(var(--violet)),rgb(var(--cyan)))]" initial={{ width: 0 }} animate={{ width: `${(done / items.length) * 100}%` }} />
        </div>
        <span className="font-mono text-xs text-muted">
          {done} of {items.length} done
        </span>
      </div>

      <ol className="mt-6 grid gap-3 md:grid-cols-2">
        {items.map((i, n) => (
          <li key={i.id} className={cn('flex items-start gap-3 rounded-2xl border p-4', i.done ? 'border-mint/20 bg-mint/[0.04]' : i === next ? 'border-violet/40 bg-violet/[0.07]' : 'border-line/10 bg-line/[0.03]')}>
            <span className={cn('grid h-7 w-7 shrink-0 place-items-center rounded-full font-mono text-xs font-bold', i.done ? 'bg-mint text-on-accent' : 'bg-line/10 text-muted')} aria-hidden>
              {i.done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : n + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">
                {i.label}
                {i.optional && <span className="ml-2 text-xs font-normal text-faint">optional</span>}
                <span className="sr-only">{i.done ? ' — done' : ' — to do'}</span>
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted">{i.detail}</p>
              {!i.done && i !== next && i.to && (
                <Link to={i.to} className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-cyan hover:underline">
                  {i.action} <ArrowRight className="h-3 w-3" aria-hidden />
                </Link>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
