import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, BookOpen, Check, Clock, GraduationCap, Sparkles } from 'lucide-react';
import type { Derived } from '@/hooks/useDerived';
import { Button } from '@/components/ui/Button';
import { cn, plural, round1 } from '@/lib/utils';

export interface SetupStep {
  id: 'subjects' | 'topics' | 'availability' | 'deadlines';
  title: string;
  /** What is done, or exactly what is missing. */
  detail: string;
  done: boolean;
  /** Required steps block plan generation; optional ones only improve it. */
  required: boolean;
  action: { label: string; to: string };
  icon: JSX.Element;
}

/**
 * What the planner needs before it can build a plan, in the order a new user
 * should do it. Used to explain an empty plan and to disable "Generate" with a reason.
 */
export function planReadiness(d: Derived): { steps: SetupStep[]; blocker: SetupStep | null; hoursToPlan: number } {
  const { subjects, topics, availability } = d.snapshot;
  const open = topics.filter((t) => t.status !== 'completed' && t.estimatedHours > t.completedHours);
  const hoursToPlan = round1(open.reduce((a, t) => a + (t.estimatedHours - t.completedHours), 0));
  const emptySubjects = subjects.filter((s) => !topics.some((t) => t.subjectId === s.id));
  const firstNeedingTopics = emptySubjects[0] ?? subjects[0];
  const weeklyHours = availability.weekly.reduce((a, w) => a + w.hours, 0);
  const hasDeadlines = d.snapshot.exams.length + d.snapshot.assignments.length > 0;

  const steps: SetupStep[] = [
    {
      id: 'subjects',
      title: 'Add a subject',
      detail: subjects.length ? `${plural(subjects.length, 'subject')}: ${subjects.map((s) => s.name).join(', ')}` : 'A subject is a course you are studying, like Physics or NLP.',
      done: subjects.length > 0,
      required: true,
      action: { label: 'Add subject', to: '/subjects?new=1' },
      icon: <BookOpen className="h-4 w-4" />,
    },
    {
      id: 'topics',
      title: 'Break it into topics with hours',
      detail: open.length
        ? `${plural(open.length, 'topic')} to study, about ${hoursToPlan}h in total${emptySubjects.length ? ` · ${emptySubjects.map((s) => s.name).join(', ')} still ${emptySubjects.length === 1 ? 'has' : 'have'} no topics` : ''}`
        : subjects.length
          ? `${firstNeedingTopics?.name ?? 'Your subject'} has no topics with hours left. Orbit schedules topics, not subjects — add a few (e.g. "Tokenization, 3h").`
          : 'Each topic gets an estimated number of hours. Orbit schedules those hours.',
      done: open.length > 0,
      required: true,
      action: { label: firstNeedingTopics ? `Add topics to ${firstNeedingTopics.name}` : 'Add topics', to: firstNeedingTopics ? `/subjects?addTopic=${firstNeedingTopics.id}` : '/subjects' },
      icon: <Sparkles className="h-4 w-4" />,
    },
    {
      id: 'availability',
      title: 'Set when you can study',
      detail: weeklyHours > 0 ? `${round1(weeklyHours)}h per week available` : 'No study hours set — Orbit has nowhere to put sessions.',
      done: weeklyHours > 0,
      required: true,
      action: { label: weeklyHours > 0 ? 'Adjust hours' : 'Set hours', to: '/availability' },
      icon: <Clock className="h-4 w-4" />,
    },
    {
      id: 'deadlines',
      title: 'Add exams or deadlines (recommended)',
      detail: hasDeadlines
        ? `${plural(d.snapshot.exams.length, 'exam')}, ${plural(d.snapshot.assignments.length, 'assignment')} — urgent topics get scheduled first`
        : 'Without dates, every topic is treated as due in 4 weeks. Add an exam so Orbit knows what is urgent.',
      done: hasDeadlines,
      required: false,
      action: { label: 'Add exam', to: '/exams?new=exam' },
      icon: <GraduationCap className="h-4 w-4" />,
    },
  ];
  return { steps, blocker: steps.find((s) => s.required && !s.done) ?? null, hoursToPlan };
}

/** Step-by-step checklist shown when there is no plan yet (or it can't be generated). */
export function PlanSetupGuide({ d, onGenerate, generating }: { d: Derived; onGenerate: () => void; generating?: boolean }) {
  const { steps, blocker, hoursToPlan } = planReadiness(d);
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="glass mb-4 p-5 sm:p-6" aria-labelledby="setup-title">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Get your plan in {steps.filter((s) => s.required).length} steps</p>
          <h2 id="setup-title" className="mt-1 text-lg font-semibold text-ink">
            {blocker ? 'Your plan needs a little more to work with' : 'Ready — generate your plan'}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {blocker ? `Next step: ${blocker.title.toLowerCase()}.` : `Orbit will spread about ${hoursToPlan}h of study across your available hours, most urgent first.`}
          </p>
        </div>
        <div className="flex items-center gap-2 font-mono text-xs text-muted" aria-label={`${doneCount} of ${steps.length} steps done`}>
          {steps.map((s) => (
            <span key={s.id} className={cn('h-1.5 w-8 rounded-full', s.done ? 'bg-mint' : 'bg-line/15')} />
          ))}
          <span className="ml-1">
            {doneCount}/{steps.length}
          </span>
        </div>
      </div>

      <ol className="grid gap-3 md:grid-cols-2">
        {steps.map((s, i) => {
          const isNext = blocker?.id === s.id;
          return (
            <li
              key={s.id}
              className={cn(
                'flex items-start gap-3 rounded-2xl border p-4 transition-colors',
                s.done ? 'border-mint/25 bg-mint/[0.05]' : isNext ? 'border-violet/50 bg-violet/[0.08] shadow-glow' : 'border-line/10 bg-line/[0.03]',
              )}
            >
              <span
                className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-full font-mono text-xs font-bold', s.done ? 'bg-mint text-on-accent' : isNext ? 'bg-violet text-on-accent' : 'bg-line/10 text-muted')}
                aria-hidden
              >
                {s.done ? <Check className="h-4 w-4" strokeWidth={3} /> : i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                  <span className="text-muted">{s.icon}</span>
                  {s.title}
                  <span className="sr-only">{s.done ? '(done)' : '(to do)'}</span>
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted">{s.detail}</p>
                {(!s.done || s.id === 'topics') && (
                  <Link to={s.action.to} className={cn('mt-2 inline-flex items-center gap-1 text-xs font-semibold underline-offset-4 hover:underline', isNext ? 'text-violet' : 'text-cyan')}>
                    {s.action.label} <ArrowRight className="h-3 w-3" aria-hidden />
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {!blocker && (
        <div className="mt-5 flex justify-end">
          <Button size="lg" icon={<Sparkles className="h-4 w-4" />} loading={generating} onClick={onGenerate}>
            Generate my plan
          </Button>
        </div>
      )}
    </motion.section>
  );
}
