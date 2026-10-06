import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, ChevronDown, GraduationCap, ListTodo, Play, RefreshCw, Sparkles } from 'lucide-react';
import { useDerived, type Derived } from '@/hooks/useDerived';
import { useUIStore } from '@/store/useUIStore';
import { useDataStore } from '@/store/useDataStore';
import { useAuthStore } from '@/store/useAuthStore';
import { ConstellationMap } from '@/components/constellation/ConstellationMap';
import { DailyBriefingCard } from '@/components/briefing/DailyBriefing';
import { SmartSuggestions } from '@/components/suggestions/SmartSuggestions';
import { ReadinessGauge } from '@/components/readiness/ReadinessGauge';
import { SessionRow } from '@/components/sessions/SessionRow';
import { StreakFlame } from '@/components/achievements/StreakFlame';
import { CategoryIcon } from '@/components/achievements/CategoryIcon';
import { GettingStartedCard, needsGettingStarted } from '@/components/home/GettingStarted';
import { GlassCard } from '@/components/ui/GlassCard';
import { AnimatedNumber, ProgressRing, SubjectDot } from '@/components/ui/Feedback';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { InfoTip } from '@/components/ui/InfoTip';
import { PageSkeleton } from '@/components/ui/PageSkeleton';
import { formatDuration, formatTime, formatMonthDay, formatWeekday, greetingFor, inDaysLabel, relativeDay } from '@/lib/date';
import { now } from '@/lib/clock';
import { cn, plural } from '@/lib/utils';

const section = { initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } } };

/**
 * Home — "What should I do today?"
 * 1 Greeting + next best action  2 Today's plan  3 Deadlines · Progress · Streak
 * 4 Constellation  5 Daily briefing  6 More insights
 * Only one primary button on the page: the next best action.
 */
export default function Dashboard() {
  const d = useDerived();
  const user = useAuthStore((s) => s.user);
  if (!d) return <PageSkeleton variant="dashboard" />;
  const setupNeeded = needsGettingStarted(d);
  const first = user?.name.split(' ')[0];

  return (
    <motion.div initial="initial" animate="animate" transition={{ staggerChildren: 0.06 }} className="flex flex-col gap-8">
      {/* 1. Greeting + one next best action */}
      <motion.section variants={section} aria-labelledby="home-title">
        <h1 id="home-title" className="mb-6 text-2xl font-semibold text-ink sm:text-[32px]">
          {greetingFor(now())}
          {first ? `, ${first}` : ''}
        </h1>
        {setupNeeded ? <GettingStartedCard d={d} /> : <NextBestAction d={d} />}
      </motion.section>

      {/* 2. Today's plan */}
      {!setupNeeded && (
        <motion.section variants={section}>
          <TodayPlan d={d} />
        </motion.section>
      )}

      {/* 3. Deadlines · Progress · Streak */}
      <motion.section variants={section} className="grid gap-6 md:grid-cols-3" aria-label="At a glance">
        <DeadlinesCard d={d} />
        <ProgressCard d={d} />
        <StreakCard d={d} />
      </motion.section>

      {/* 4. Constellation */}
      <motion.section variants={section}>
        <SkyCard d={d} />
      </motion.section>

      {/* 5. Daily briefing */}
      {d.snapshot.topics.length > 0 && (
        <motion.section variants={section}>
          <DailyBriefingCard d={d} />
        </motion.section>
      )}

      {/* 6. More insights */}
      {d.snapshot.topics.length > 0 && (
        <motion.section variants={section}>
          <MoreInsights d={d} />
        </motion.section>
      )}
    </motion.div>
  );
}

/* ---------------- 1. Next best action ---------------- */

function NextBestAction({ d }: { d: Derived }) {
  const openFocus = useUIStore((s) => s.openFocus);
  const generate = useDataStore((s) => s.generatePlan);
  const busy = useDataStore((s) => s.pending.generate);
  const navigate = useNavigate();
  const next = d.nextSession;
  const hasFuture = d.upcomingSessions.length > 0;

  let eyebrow = 'Next best action';
  let title: string;
  let detail: string;
  let button: JSX.Element;
  let color = 'rgb(var(--violet))';

  if (d.snapshot.planStale && hasFuture) {
    title = 'Update your plan';
    detail = 'You changed subjects, topics, exams or study hours since the plan was made. Update it so today is right.';
    button = (
      <Button size="lg" icon={<RefreshCw className="h-4 w-4" />} loading={busy} onClick={() => void generate()}>
        Update plan
      </Button>
    );
  } else if (next) {
    const topic = d.topicById.get(next.topicId);
    const subject = d.subjectById.get(next.subjectId);
    color = subject?.color ?? color;
    const isToday = next.date === d.today;
    eyebrow = next.status === 'in_progress' ? 'Continue where you left off' : isToday ? `Next session · ${formatTime(next.start)}` : `Next session · ${relativeDay(next.date)}, ${formatTime(next.start)}`;
    title = `Start: ${topic?.name}, ${formatDuration(next.durationMin)}`;
    detail = `${subject?.name}${isToday ? '' : ' — nothing left today, so this gets you ahead'}. Opens a distraction-free focus timer.`;
    button = (
      <Button size="lg" icon={<Play className="h-4 w-4" fill="currentColor" />} onClick={() => openFocus(next.id)}>
        Start
      </Button>
    );
  } else if (!hasFuture) {
    title = 'Your plan is empty';
    detail = 'Every planned session is done, or the plan has not been generated yet. Generate it to get your next sessions.';
    button = (
      <Button
        size="lg"
        icon={<Sparkles className="h-4 w-4" />}
        loading={busy}
        onClick={async () => {
          if (await generate()) navigate('/plan');
        }}
      >
        Generate plan
      </Button>
    );
  } else {
    title = 'All done for today';
    detail = 'Nice work. Rest, or open your plan to see what is coming next.';
    button = (
      <Button size="lg" iconRight={<ArrowRight className="h-4 w-4" />} onClick={() => navigate('/plan')}>
        Open Study Plan
      </Button>
    );
  }

  return (
    <div className="glass relative flex flex-col gap-5 overflow-hidden p-6 sm:flex-row sm:items-center sm:p-8">
      <div aria-hidden className="pointer-events-none absolute -left-10 -top-16 h-48 w-48 rounded-full opacity-40 blur-3xl" style={{ background: color }} />
      <div className="relative min-w-0 flex-1">
        <p className="eyebrow">{eyebrow}</p>
        <p className="mt-2 font-display text-xl font-semibold text-ink sm:text-2xl">{title}</p>
        <p className="mt-1 text-sm text-muted">{detail}</p>
      </div>
      <div className="relative shrink-0">{button}</div>
    </div>
  );
}

/* ---------------- 2. Today's plan ---------------- */

function TodayPlan({ d }: { d: Derived }) {
  const sessions = d.todaySessions;
  const left = sessions.filter((s) => s.status === 'planned' || s.status === 'in_progress').length;
  return (
    <GlassCard
      title="Today's plan"
      eyebrow={sessions.length ? `${left} to go · ${formatDuration(d.todayStats.doneMin)} of ${formatDuration(d.todayStats.plannedMin)} done` : undefined}
      action={
        <Link to="/plan" className="flex items-center gap-1 text-xs font-semibold text-cyan hover:underline">
          Full plan <ArrowRight className="h-3 w-3" aria-hidden />
        </Link>
      }
      hover={false}
    >
      {sessions.length === 0 ? (
        <EmptyState
          compact
          art="calendar"
          title="Nothing planned for today"
          description={d.upcomingSessions[0] ? `Your next session is ${relativeDay(d.upcomingSessions[0].date).toLowerCase()} at ${formatTime(d.upcomingSessions[0].start)}.` : 'Generate a plan to fill your days.'}
        />
      ) : (
        <ul className="space-y-3">
          {sessions.map((s) => (
            <SessionRow key={s.id} s={s} d={d} />
          ))}
        </ul>
      )}
    </GlassCard>
  );
}

/* ---------------- 3. Row of three ---------------- */

function DeadlinesCard({ d }: { d: Derived }) {
  const items = d.deadlines.filter((x) => x.daysLeft >= 0 && !(x.kind === 'assignment' && x.done)).slice(0, 3);
  return (
    <GlassCard
      title="Upcoming deadlines"
      action={
        <Link to="/exams" className="text-xs font-semibold text-cyan hover:underline">
          All
        </Link>
      }
      className="h-full"
      hover={false}
    >
      {items.length === 0 ? (
        <EmptyState compact art="telescope" title="No dates yet" description="Add exams and deadlines so Orbit knows what is urgent." action={<Link to="/exams?new=exam"><Button size="sm" variant="secondary">Add an exam</Button></Link>} />
      ) : (
        <ul className="space-y-4">
          {items.map((x) => {
            const subj = d.subjectById.get(x.subjectId);
            return (
              <li key={x.id} className="flex items-start gap-3">
                {x.kind === 'exam' ? <GraduationCap className="mt-0.5 h-4 w-4 shrink-0 text-violet" aria-label="Exam" /> : <ListTodo className="mt-0.5 h-4 w-4 shrink-0 text-cyan" aria-label="Assignment" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{x.title}</p>
                  <p className="flex items-center gap-1.5 text-xs text-muted">
                    {subj && <SubjectDot color={subj.color} glow={false} />}
                    {formatWeekday(x.date.slice(0, 10))}, {formatMonthDay(x.date.slice(0, 10))}
                  </p>
                </div>
                <span className={cn('shrink-0 text-xs font-semibold', x.daysLeft <= 3 ? 'text-amber' : 'text-muted')}>{inDaysLabel(x.daysLeft)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </GlassCard>
  );
}

function ProgressCard({ d }: { d: Derived }) {
  const topics = d.snapshot.topics;
  const done = topics.filter((t) => t.status === 'completed').length;
  return (
    <GlassCard
      title={
        <span className="flex items-center gap-1">
          Progress
          <InfoTip>Share of all your estimated topic hours you have finished. Completed topics count fully.</InfoTip>
        </span>
      }
      className="h-full"
      hover={false}
    >
      {topics.length === 0 ? (
        <EmptyState compact art="constellation" title="No topics yet" description="Progress appears once you add topics." action={<Link to={d.snapshot.subjects[0] ? `/subjects?addTopic=${d.snapshot.subjects[0].id}` : '/subjects?new=1'}><Button size="sm" variant="secondary">{d.snapshot.subjects.length ? 'Add topics' : 'Add a subject'}</Button></Link>} />
      ) : (
        <div className="flex items-center gap-5">
          <ProgressRing value={d.overallProgress} size={96} stroke={9} label="Overall progress">
            <span className="font-mono text-xl font-bold text-ink">
              <AnimatedNumber value={Math.round(d.overallProgress * 100)} />
              <span className="text-xs text-muted">%</span>
            </span>
          </ProgressRing>
          <div className="space-y-1 text-sm">
            <p className="text-ink">
              <span className="font-mono font-semibold">{done}</span> of {plural(topics.length, 'topic')} finished
            </p>
            <p className="text-muted">{formatDuration(d.week.hours * 60)} studied this week</p>
          </div>
        </div>
      )}
    </GlassCard>
  );
}

function StreakCard({ d }: { d: Derived }) {
  const studiedToday = d.todayStats.doneMin > 0;
  return (
    <GlassCard
      title={
        <span className="flex items-center gap-1">
          Study streak
          <InfoTip>Days in a row on which you finished at least one session.</InfoTip>
        </span>
      }
      className="h-full"
      hover={false}
    >
      <div className="flex items-center gap-4">
        <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-amber/10">
          <StreakFlame streak={d.streak} size={36} />
        </div>
        <div>
          {d.streak > 0 ? (
            <>
              <p className="font-mono text-2xl font-bold text-ink">{plural(d.streak, 'day')}</p>
              <p className="text-xs text-muted">{studiedToday ? 'Today counts — nice.' : 'Finish one session today to keep it going.'}</p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-ink">No streak yet</p>
              <p className="text-xs text-muted">Finish one session today to start one.</p>
            </>
          )}
        </div>
      </div>
    </GlassCard>
  );
}

/* ---------------- 4. Constellation ---------------- */

function SkyCard({ d }: { d: Derived }) {
  const hasTopics = d.snapshot.topics.length > 0;
  return (
    <section className="glass p-2" aria-labelledby="sky-title">
      <div className="flex flex-wrap items-end justify-between gap-2 px-4 pb-4 pt-4">
        <div>
          <h2 id="sky-title" className="text-base font-semibold text-ink">
            Your sky
          </h2>
          <p className="text-sm text-muted">Each star is a topic. Lit stars are completed — hover or tap one for details.</p>
        </div>
        {hasTopics && <span className="font-mono text-xs text-muted">{Math.round(d.overallProgress * 100)}% lit</span>}
      </div>
      {hasTopics ? (
        <ConstellationMap d={d} />
      ) : (
        <div className="sky-panel rounded-3xl text-white">
          <EmptyState
            art="constellation"
            title="No topics yet"
            description="Each topic you add becomes a star here."
            action={
              <Link to={d.snapshot.subjects[0] ? `/subjects?addTopic=${d.snapshot.subjects[0].id}` : '/subjects?new=1'}>
                <Button variant="secondary">{d.snapshot.subjects.length ? 'Add topics' : 'Add a subject'}</Button>
              </Link>
            }
          />
        </div>
      )}
    </section>
  );
}

/* ---------------- 6. More insights ---------------- */

function MoreInsights({ d }: { d: Derived }) {
  const nextExam = d.deadlines.find((x) => x.kind === 'exam' && x.daysLeft >= 0);
  const recent = [...d.snapshot.achievements].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);
  return (
    <details className="group" open>
      <summary className="mb-4 flex cursor-pointer list-none items-center gap-2 text-base font-semibold text-ink">
        More insights
        <ChevronDown className="h-4 w-4 text-muted transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="grid gap-6 lg:grid-cols-3">
        <GlassCard
          title={
            <span className="flex items-center gap-1">
              Exam readiness
              <InfoTip>A prediction of how prepared you will be on exam day if you keep your current pace.</InfoTip>
            </span>
          }
          hover={false}
        >
          {nextExam && nextExam.kind === 'exam' ? (
            <ReadinessGauge exam={nextExam.exam} subject={d.subjectById.get(nextExam.subjectId)} prediction={d.readiness.get(nextExam.id)!} size={170} />
          ) : (
            <EmptyState compact art="telescope" title="No exams ahead" description="Add an exam to see how ready you are." action={<Link to="/exams?new=exam"><Button size="sm" variant="secondary">Add an exam</Button></Link>} />
          )}
        </GlassCard>

        <GlassCard
          title="Achievements"
          action={
            <Link to="/achievements" className="text-xs font-semibold text-cyan hover:underline">
              All
            </Link>
          }
          hover={false}
        >
          <ul className="space-y-4">
            {recent.map((a) => (
              <li key={a.id} className="flex items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[linear-gradient(135deg,rgb(var(--amber)),rgb(var(--violet)))] text-white">
                  <CategoryIcon category={a.category} className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{a.title}</p>
                  <p className="text-xs text-muted">
                    {formatMonthDay(a.date)}
                    {a.result ? ` · ${a.result}` : ''}
                  </p>
                </div>
              </li>
            ))}
            {recent.length === 0 && (
              <li>
                <EmptyState compact art="comet" title="No achievements yet" description="Record good marks, passed exams and other wins." action={<Link to="/achievements?new=1"><Button size="sm" variant="secondary">Add one</Button></Link>} />
              </li>
            )}
          </ul>
        </GlassCard>

        <SmartSuggestions d={d} compact />
      </div>
    </details>
  );
}
