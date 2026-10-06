import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Compass, RefreshCw, Sparkles } from 'lucide-react';
import { useDerived } from '@/hooks/useDerived';
import { useDataStore } from '@/store/useDataStore';
import { Button } from '@/components/ui/Button';
import { planReadiness } from '@/components/schedule/PlanSetupGuide';
import { cn } from '@/lib/utils';

type Page = 'dashboard' | 'subjects' | 'exams' | 'availability' | 'plan';

const pageOf: Record<string, Page> = { subjects: 'subjects', topics: 'subjects', availability: 'availability', deadlines: 'exams' };

/**
 * One clear "what to do next" line, shown on every setup page and the dashboard:
 *  1. a missing setup step  → go do it (or "do it below" when already on that page)
 *  2. everything set, no plan → generate it
 *  3. data changed since the plan was built → update the plan
 * Renders nothing when the workflow is complete and the plan is current.
 */
export function NextStepBanner({ page, className }: { page: Page; className?: string }) {
  const d = useDerived();
  const navigate = useNavigate();
  const generate = useDataStore((s) => s.generatePlan);
  const busy = useDataStore((s) => s.pending.generate);
  if (!d) return null;

  const { blocker } = planReadiness(d);
  const hasPlan = d.snapshot.sessions.some((s) => s.status === 'planned' && s.date >= d.today);
  const stale = hasPlan && d.snapshot.planStale;

  let tone: 'violet' | 'amber' | 'mint' = 'violet';
  let icon = <Compass className="h-5 w-5" />;
  let title = '';
  let detail = '';
  let action: JSX.Element | null = null;

  if (blocker) {
    // On the Study Plan page the full setup guide already covers this.
    if (page === 'plan') return null;
    const here = pageOf[blocker.id] === page;
    title = here ? `Next: ${blocker.title.toLowerCase()} — right here` : `Next step: ${blocker.title.toLowerCase()}`;
    detail = blocker.detail;
    action = here ? null : (
      <Button size="sm" iconRight={<ArrowRight className="h-3.5 w-3.5" />} onClick={() => navigate(blocker.action.to)}>
        {blocker.action.label}
      </Button>
    );
  } else if (!hasPlan) {
    if (page === 'plan') return null;
    tone = 'mint';
    icon = <Sparkles className="h-5 w-5" />;
    title = 'Everything is set — build your study plan';
    detail = 'Orbit will place every topic into your study hours, most urgent first.';
    action = (
      <Button
        size="sm"
        icon={<Sparkles className="h-3.5 w-3.5" />}
        loading={busy}
        onClick={async () => {
          if (await generate()) navigate('/plan');
        }}
      >
        Generate plan
      </Button>
    );
  } else if (stale) {
    tone = 'amber';
    icon = <RefreshCw className="h-5 w-5" />;
    title = 'Your plan is out of date';
    detail = 'You changed subjects, topics, exams or study hours since it was built. Update it to include those changes.';
    action = (
      <Button size="sm" variant="amber" icon={<RefreshCw className="h-3.5 w-3.5" />} loading={busy} onClick={() => void generate()}>
        Update plan
      </Button>
    );
  } else {
    return null;
  }

  const ring = { violet: 'border-violet/35 bg-violet/[0.08]', amber: 'border-amber/40 bg-amber/[0.08]', mint: 'border-mint/35 bg-mint/[0.07]' }[tone];
  const iconColor = { violet: 'text-violet', amber: 'text-amber', mint: 'text-mint' }[tone];

  return (
    <AnimatePresence>
      <motion.aside
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        role="status"
        className={cn('mb-5 flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center', ring, className)}
      >
        <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-line/[0.06]', iconColor)} aria-hidden>
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">{title}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted">{detail}</p>
        </div>
        {action}
      </motion.aside>
    </AnimatePresence>
  );
}
