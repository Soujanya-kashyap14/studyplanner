import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, BookOpen, CalendarClock, Check, Clock, Database, GraduationCap, ListChecks, Plus, Rocket, Trash2, Wand2 } from 'lucide-react';
import type { Availability, Difficulty, SetupPayload } from '@/types';
import { useAuthStore } from '@/store/useAuthStore';
import { useDataStore } from '@/store/useDataStore';
import { toast } from '@/store/useUIStore';
import { Logo } from '@/components/layout/Logo';
import { Button, IconButton } from '@/components/ui/Button';
import { DifficultyPicker, Field, Input, Segmented, Select } from '@/components/ui/Form';
import { SubjectDot } from '@/components/ui/Feedback';
import { LaunchScreen } from '@/components/layout/ProtectedRoute';
import { WeeklyHoursEditor, weeklyTotal } from '@/components/hours/WeeklyHoursEditor';
import { DIFFICULTY_OPTIONS, TopicAdder } from '@/components/subjects/TopicAdder';
import { DEFAULT_AVAILABILITY } from '@/data/defaults';
import { addDays, diffDays, formatFullDate, formatTime, todayISO } from '@/lib/date';
import { setSetupSkipped } from '@/lib/setupFlags';
import { cn, plural, round1, SUBJECT_COLORS, uid } from '@/lib/utils';

/* ------------------------------------------------------------------ */
/* Draft model (kept in localStorage so a refresh never loses work)    */
/* ------------------------------------------------------------------ */

interface DraftTopic {
  id: string;
  name: string;
  hours: number;
  difficulty: Difficulty;
}
interface DraftSubject {
  id: string;
  name: string;
  color: string;
  difficulty: Difficulty;
  topics: DraftTopic[];
}
interface DraftDeadline {
  id: string;
  subjectId: string;
  kind: 'exam' | 'assignment';
  title: string;
  date: string;
  time: string;
}
interface Draft {
  step: number;
  sessionMinutes: number;
  subjects: DraftSubject[];
  deadlines: DraftDeadline[];
  availability: Availability;
}

const STEPS = [
  { id: 'subjects', label: 'Add subjects', icon: BookOpen, why: 'Subjects group your topics and give each one its own color in the plan.' },
  { id: 'topics', label: 'Add topics', icon: ListChecks, why: 'Orbit schedules topics, not whole subjects — the hours you estimate become study sessions.' },
  { id: 'deadlines', label: 'Exams & deadlines', icon: GraduationCap, why: 'Dates tell Orbit what is urgent, so topics due sooner are scheduled first.' },
  { id: 'hours', label: 'Weekly study hours', icon: Clock, why: 'Orbit only places sessions inside the hours you say you can study.' },
  { id: 'generate', label: 'Generate plan', icon: Rocket, why: 'Orbit turns all of this into a day-by-day plan you can start right away.' },
] as const;
type StepId = (typeof STEPS)[number]['id'];

const draftKey = (userId: string) => `orbit.setupDraft.v2.${userId}`;
const freshDraft = (): Draft => ({ step: 0, sessionMinutes: 50, subjects: [], deadlines: [], availability: structuredClone(DEFAULT_AVAILABILITY) });

function loadDraft(userId: string): Draft {
  try {
    const raw = localStorage.getItem(draftKey(userId));
    if (raw) return { ...freshDraft(), ...(JSON.parse(raw) as Draft) };
  } catch {
    /* ignore */
  }
  return freshDraft();
}

/**
 * First-login setup in 5 steps, in the order the planner needs the information.
 * Nothing is saved until the last step, which saves everything in one call
 * and generates the first plan.
 */
export default function Setup() {
  const user = useAuthStore((s) => s.user);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const status = useDataStore((s) => s.status);
  const load = useDataStore((s) => s.load);
  const completeSetup = useDataStore((s) => s.completeSetup);
  const resetDemo = useDataStore((s) => s.resetDemo);
  const pending = useDataStore((s) => s.pending.setup);
  const navigate = useNavigate();
  const [draft, setDraft] = useState<Draft>(() => (user ? loadDraft(user.id) : freshDraft()));
  const [dir, setDir] = useState(1);
  const [loadingSample, setLoadingSample] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (status === 'idle') void load();
  }, [status, load]);

  useEffect(() => {
    if (!user) return;
    try {
      localStorage.setItem(draftKey(user.id), JSON.stringify(draft));
    } catch {
      /* ignore */
    }
  }, [draft, user]);

  useEffect(() => {
    headingRef.current?.focus();
  }, [draft.step]);

  const patch = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));
  const setSubjects = (fn: (s: DraftSubject[]) => DraftSubject[]) =>
    setDraft((d) => {
      const subjects = fn(d.subjects);
      // Drop deadlines whose subject was removed.
      return { ...d, subjects, deadlines: d.deadlines.filter((x) => subjects.some((s) => s.id === x.subjectId)) };
    });

  const topicHours = round1(draft.subjects.reduce((a, s) => a + s.topics.reduce((b, t) => b + t.hours, 0), 0));
  const weekly = weeklyTotal(draft.availability);

  /** What is still missing for a step (null = complete). Required steps block Next. */
  const missing = (id: StepId): string | null => {
    if (id === 'subjects' && draft.subjects.length === 0) return 'Add at least one subject.';
    if (id === 'topics') {
      if (!draft.subjects.length) return 'Add a subject first.';
      const empty = draft.subjects.filter((s) => s.topics.length === 0).map((s) => s.name);
      if (empty.length) return `Add at least one topic to ${empty.join(', ')}.`;
    }
    if (id === 'hours' && weekly <= 0) return 'Turn on at least one day.';
    return null;
  };
  const step = STEPS[draft.step];
  const blocker = step.id === 'generate' ? (missing('subjects') ?? missing('topics') ?? missing('hours')) : missing(step.id);
  const optional = step.id === 'deadlines';

  const go = (to: number) => {
    setDir(to > draft.step ? 1 : -1);
    patch({ step: Math.max(0, Math.min(STEPS.length - 1, to)) });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  async function finish() {
    if (blocker) return;
    const payload: SetupPayload = {
      subjects: draft.subjects.map((s) => ({
        name: s.name,
        color: s.color,
        difficulty: s.difficulty,
        topics: s.topics.map((t) => ({ name: t.name, estimatedHours: t.hours, difficulty: t.difficulty })),
      })),
      deadlines: draft.deadlines.map((x) => ({
        subjectIndex: draft.subjects.findIndex((s) => s.id === x.subjectId),
        kind: x.kind,
        title: x.title,
        date: `${x.date}T${x.time || (x.kind === 'exam' ? '09:00' : '23:59')}:00`,
      })),
      availability: draft.availability,
    };
    if (user && user.preferredSessionMinutes !== draft.sessionMinutes) {
      await updateProfile({ preferredSessionMinutes: draft.sessionMinutes }).catch(() => undefined);
    }
    const ok = await completeSetup(payload);
    if (!ok) return;
    try {
      if (user) localStorage.removeItem(draftKey(user.id));
    } catch {
      /* ignore */
    }
    setSetupSkipped(user?.id, false);
    const planned = useDataStore.getState().snapshot?.sessions.filter((s) => s.status === 'planned') ?? [];
    const days = new Set(planned.map((s) => s.date)).size;
    toast({ tone: 'success', title: `Plan created: ${plural(planned.length, 'session')} across ${plural(days, 'day')}`, description: 'Start with the first one on your Home page.' });
    navigate('/', { replace: true });
  }

  const skipSetup = () => {
    setSetupSkipped(user?.id, true);
    navigate('/', { replace: true });
  };

  const loadSample = async () => {
    setLoadingSample(true);
    await resetDemo();
    setLoadingSample(false);
    setSetupSkipped(user?.id, true);
    navigate('/', { replace: true });
  };

  if (!user || status === 'loading' || status === 'idle') return <LaunchScreen label="Preparing your setup…" />;

  return (
    <div className="min-h-dvh px-4 pb-16 pt-6 sm:px-8">
      <header className="mx-auto mb-8 flex max-w-5xl flex-wrap items-center justify-between gap-4">
        <Logo />
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" icon={<Database className="h-3.5 w-3.5" />} loading={loadingSample} onClick={() => void loadSample()} title="Fill the app with an example student's subjects, exams and history">
            Load sample data
          </Button>
          <Button variant="ghost" size="sm" onClick={skipSetup}>
            Skip setup
          </Button>
        </div>
      </header>

      <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[230px_1fr]">
        {/* Stepper */}
        <nav aria-label="Setup steps">
          <p className="mb-3 font-mono text-xs text-muted" aria-live="polite">
            Step {draft.step + 1} of {STEPS.length}
          </p>
          <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-line/10" aria-hidden>
            <motion.div className="h-full rounded-full bg-[linear-gradient(90deg,rgb(var(--violet)),rgb(var(--cyan)))]" animate={{ width: `${((draft.step + 1) / STEPS.length) * 100}%` }} />
          </div>
          <ol className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:gap-1">
            {STEPS.map((s, i) => {
              const done = i < draft.step && !missing(s.id);
              const current = i === draft.step;
              return (
                <li key={s.id} className="shrink-0">
                  <button
                    onClick={() => go(i)}
                    aria-current={current ? 'step' : undefined}
                    className={cn('flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm transition-colors', current ? 'bg-violet/15 text-ink' : 'text-muted hover:bg-line/[0.05] hover:text-ink')}
                  >
                    <span className={cn('grid h-7 w-7 shrink-0 place-items-center rounded-full font-mono text-xs font-bold', done ? 'bg-mint text-on-accent' : current ? 'bg-violet text-on-accent' : 'bg-line/10')}>
                      {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : i + 1}
                    </span>
                    <span className="hidden whitespace-nowrap sm:inline">{s.label}</span>
                  </button>
                </li>
              );
            })}
          </ol>
          <p className="mt-4 hidden text-xs leading-relaxed text-faint lg:block">Nothing is saved until the last step. Your answers are kept if you refresh.</p>
        </nav>

        {/* Step content */}
        <main className="glass min-h-[480px] overflow-hidden p-6 sm:p-8">
          <AnimatePresence mode="wait" custom={dir}>
            <motion.div key={step.id} initial={{ opacity: 0, x: dir * 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: dir * -24 }} transition={{ duration: 0.25 }}>
              <div className="mb-6">
                <p className="font-mono text-xs text-violet">
                  Step {draft.step + 1} of {STEPS.length}
                  {optional && ' · optional'}
                </p>
                <h1 ref={headingRef} tabIndex={-1} className="mt-1 text-2xl font-semibold leading-tight outline-none sm:text-3xl">
                  {step.label}
                </h1>
                <p className="mt-2 max-w-2xl text-sm text-muted">{step.why}</p>
              </div>

              {step.id === 'subjects' && <StepSubjects subjects={draft.subjects} setSubjects={setSubjects} />}
              {step.id === 'topics' && <StepTopics subjects={draft.subjects} setSubjects={setSubjects} />}
              {step.id === 'deadlines' && <StepDeadlines subjects={draft.subjects} deadlines={draft.deadlines} onChange={(deadlines) => patch({ deadlines })} />}
              {step.id === 'hours' && (
                <StepHours draft={draft} onAvailability={(availability) => patch({ availability })} onMinutes={(sessionMinutes) => patch({ sessionMinutes })} topicHours={topicHours} weekly={weekly} />
              )}
              {step.id === 'generate' && <StepGenerate draft={draft} topicHours={topicHours} weekly={weekly} onEdit={go} missing={missing} />}
            </motion.div>
          </AnimatePresence>

          {/* Footer: Back · Skip · Next */}
          <div className="mt-8 flex flex-col-reverse gap-3 border-t border-line/10 pt-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              {draft.step > 0 && (
                <Button variant="ghost" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => go(draft.step - 1)}>
                  Back
                </Button>
              )}
            </div>
            <div className="flex flex-col items-stretch gap-2 sm:items-end">
              <div className="flex flex-wrap justify-end gap-2">
                {step.id !== 'generate' && (
                  <Button variant="ghost" onClick={() => (optional || step.id === 'hours' ? go(draft.step + 1) : skipSetup())} title={optional ? 'Skip this step' : 'Leave setup and finish it later from Home'}>
                    {optional ? 'Skip this step' : 'Skip setup for now'}
                  </Button>
                )}
                {step.id === 'generate' ? (
                  <Button size="lg" icon={<Wand2 className="h-4 w-4" />} loading={pending} disabled={!!blocker} onClick={() => void finish()}>
                    Generate my plan
                  </Button>
                ) : (
                  <Button size="lg" iconRight={<ArrowRight className="h-4 w-4" />} disabled={!!blocker} onClick={() => go(draft.step + 1)}>
                    Next
                  </Button>
                )}
              </div>
              {blocker && (
                <p className="text-xs text-amber" role="status">
                  {blocker}
                </p>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Steps                                                               */
/* ------------------------------------------------------------------ */

function StepSubjects({ subjects, setSubjects }: { subjects: DraftSubject[]; setSubjects: (fn: (s: DraftSubject[]) => DraftSubject[]) => void }) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string>();
  const add = (e?: FormEvent) => {
    e?.preventDefault();
    const n = name.trim();
    if (n.length < 2) return setError('Type a subject name (2+ characters).');
    if (subjects.some((s) => s.name.toLowerCase() === n.toLowerCase())) return setError(`${n} is already on your list.`);
    setError(undefined);
    setSubjects((s) => [...s, { id: uid('ds'), name: n, color: SUBJECT_COLORS[s.length % SUBJECT_COLORS.length], difficulty: 3, topics: [] }]);
    setName('');
  };
  return (
    <>
      <form onSubmit={add} className="mb-5 flex gap-2" noValidate>
        <Field label="Subject name" error={error} hideLabel className="flex-1">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Subject name, e.g. Data Structures" maxLength={40} autoFocus />
        </Field>
        <Button type="submit" variant="secondary" icon={<Plus className="h-4 w-4" />} className="h-11">
          Add
        </Button>
      </form>
      {subjects.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line/20 p-6 text-center text-sm text-muted">Type a subject and press Enter. Add as many as you like.</p>
      ) : (
        <ul className="space-y-2">
          <AnimatePresence initial={false}>
            {subjects.map((s, i) => (
              <motion.li key={s.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} className="flex flex-wrap items-center gap-3 rounded-2xl border border-line/10 bg-line/[0.03] p-3">
                <button
                  type="button"
                  onClick={() => setSubjects((all) => all.map((x) => (x.id === s.id ? { ...x, color: SUBJECT_COLORS[(SUBJECT_COLORS.indexOf(x.color) + 1) % SUBJECT_COLORS.length] } : x)))}
                  aria-label={`Change color of ${s.name}`}
                  title="Change color"
                  className="grid h-8 w-8 place-items-center rounded-full"
                >
                  <SubjectDot color={s.color} className="h-4 w-4" />
                </button>
                <span className="min-w-[120px] flex-1 font-medium text-ink">{s.name}</span>
                <span className="text-xs text-muted">How hard?</span>
                <DifficultyPicker value={s.difficulty} label={`How hard is ${s.name}`} onChange={(v) => setSubjects((all) => all.map((x) => (x.id === s.id ? { ...x, difficulty: v } : x)))} />
                <IconButton size="sm" label={`Remove ${s.name}`} className="hover:text-rose" onClick={() => setSubjects((all) => all.filter((_, j) => j !== i))}>
                  <Trash2 className="h-4 w-4" />
                </IconButton>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </>
  );
}

function StepTopics({ subjects, setSubjects }: { subjects: DraftSubject[]; setSubjects: (fn: (s: DraftSubject[]) => DraftSubject[]) => void }) {
  if (!subjects.length) return <p className="rounded-2xl border border-dashed border-amber/30 p-6 text-center text-sm text-amber">Go back one step and add a subject first.</p>;
  return (
    <div className="space-y-6">
      <p className="text-xs text-muted">A guess is fine — for example “Arrays, 3h”. Keep each topic between 1 and 6 hours.</p>
      {subjects.map((s) => {
        const total = round1(s.topics.reduce((a, t) => a + t.hours, 0));
        return (
          <section key={s.id} className={cn('rounded-2xl border p-5', s.topics.length ? 'border-line/10 bg-line/[0.03]' : 'border-amber/30 bg-amber/[0.04]')} aria-label={`Topics for ${s.name}`}>
            <div className="mb-4 flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-base font-semibold">
                <SubjectDot color={s.color} /> {s.name}
              </h2>
              <span className={cn('font-mono text-xs', s.topics.length ? 'text-muted' : 'text-amber')}>{s.topics.length ? `${plural(s.topics.length, 'topic')} · ${total}h` : 'needs a topic'}</span>
            </div>
            {s.topics.length > 0 && (
              <ul className="mb-4 space-y-1.5">
                {s.topics.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 rounded-xl bg-line/[0.04] px-3 py-2 text-sm">
                    <span className="flex-1 text-ink">{t.name}</span>
                    <span className="font-mono text-xs text-muted">{t.hours}h</span>
                    <span className="text-xs text-muted">{DIFFICULTY_OPTIONS[t.difficulty - 1][1]}</span>
                    <IconButton size="sm" label={`Remove ${t.name}`} className="h-7 w-7 hover:text-rose" onClick={() => setSubjects((all) => all.map((x) => (x.id === s.id ? { ...x, topics: x.topics.filter((y) => y.id !== t.id) } : x)))}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </IconButton>
                  </li>
                ))}
              </ul>
            )}
            <TopicAdder subjectName={s.name} onAdd={(t) => setSubjects((all) => all.map((x) => (x.id === s.id ? { ...x, topics: [...x.topics, { id: uid('dt'), ...t }] } : x)))} />
          </section>
        );
      })}
    </div>
  );
}

function StepDeadlines({ subjects, deadlines, onChange }: { subjects: DraftSubject[]; deadlines: DraftDeadline[]; onChange: (d: DraftDeadline[]) => void }) {
  const [kind, setKind] = useState<'exam' | 'assignment'>('exam');
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(addDays(todayISO(), 14));
  const [time, setTime] = useState('09:00');
  const [error, setError] = useState<string>();
  const subj = subjects.find((s) => s.id === subjectId);
  const add = (e: FormEvent) => {
    e.preventDefault();
    if (!subj) return setError('Pick a subject.');
    if (!date || date <= todayISO()) return setError('Pick a date after today.');
    setError(undefined);
    onChange(
      [...deadlines, { id: uid('dd'), subjectId, kind, title: title.trim() || `${subj.name} ${kind === 'exam' ? 'exam' : 'assignment'}`, date, time: kind === 'exam' ? time : time || '23:59' }].sort((a, b) =>
        a.date.localeCompare(b.date),
      ),
    );
    setTitle('');
  };
  return (
    <>
      <form onSubmit={add} className="grid gap-4 rounded-2xl border border-line/10 bg-line/[0.03] p-5 sm:grid-cols-2" noValidate>
        <div className="sm:col-span-2">
          <Segmented
            label="Type"
            value={kind}
            onChange={(k) => {
              setKind(k);
              setTime(k === 'exam' ? '09:00' : '23:30');
            }}
            options={[
              { value: 'exam', label: 'Exam' },
              { value: 'assignment', label: 'Assignment / deadline' },
            ]}
          />
        </div>
        <Field label="Subject">
          <Select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Title (optional)">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={subj ? `${subj.name} ${kind === 'exam' ? 'midterm' : 'project'}` : 'Title'} maxLength={60} />
        </Field>
        <Field label="Date" error={error} hint="e.g. a date in the next few weeks">
          <Input type="date" min={addDays(todayISO(), 1)} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label={kind === 'exam' ? 'Start time' : 'Due time'}>
          <Input type="time" step={1800} value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
        <div className="sm:col-span-2">
          <Button type="submit" variant="secondary" icon={<Plus className="h-4 w-4" />}>
            Add {kind === 'exam' ? 'exam' : 'deadline'}
          </Button>
        </div>
      </form>
      <ul className="mt-5 space-y-2">
        {deadlines.length === 0 && <li className="rounded-2xl border border-dashed border-line/20 p-5 text-center text-sm text-muted">No dates yet. Without dates, every topic is treated as due in 4 weeks — you can skip this and add them later.</li>}
        {deadlines.map((x) => {
          const s = subjects.find((y) => y.id === x.subjectId);
          const days = diffDays(todayISO(), x.date);
          return (
            <li key={x.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-line/10 bg-line/[0.03] p-3 text-sm">
              {x.kind === 'exam' ? <GraduationCap className="h-4 w-4 text-violet" aria-label="Exam" /> : <CalendarClock className="h-4 w-4 text-cyan" aria-label="Assignment" />}
              <span className="flex-1 font-medium text-ink">{x.title}</span>
              {s && (
                <span className="flex items-center gap-1.5 text-xs text-muted">
                  <SubjectDot color={s.color} glow={false} /> {s.name}
                </span>
              )}
              <span className="text-xs text-muted">
                {formatFullDate(x.date)}, {formatTime(x.time)} · in {plural(days, 'day')}
              </span>
              <IconButton size="sm" label={`Remove ${x.title}`} className="hover:text-rose" onClick={() => onChange(deadlines.filter((y) => y.id !== x.id))}>
                <Trash2 className="h-4 w-4" />
              </IconButton>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function StepHours({ draft, onAvailability, onMinutes, topicHours, weekly }: { draft: Draft; onAvailability: (a: Availability) => void; onMinutes: (m: number) => void; topicHours: number; weekly: number }) {
  const weeks = weekly ? Math.ceil((topicHours * 1.15) / weekly) : 0;
  return (
    <>
      <WeeklyHoursEditor value={draft.availability} onChange={onAvailability} />
      {weekly > 0 && topicHours > 0 && (
        <p className="mt-3 text-sm text-muted">
          At this pace your {topicHours}h of topics take about <span className="font-semibold text-ink">{plural(weeks, 'week')}</span>.
        </p>
      )}
      <div className="mt-8">
        <p className="mb-2 text-sm font-medium text-ink" id="focus-len">
          How long is one study session?
        </p>
        <div role="radiogroup" aria-labelledby="focus-len" className="flex flex-wrap gap-2">
          {[25, 45, 50, 60, 90].map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={draft.sessionMinutes === m}
              onClick={() => onMinutes(m)}
              className={cn('h-11 min-w-[76px] rounded-xl border px-3 font-mono text-sm transition-colors', draft.sessionMinutes === m ? 'border-violet/60 bg-violet/15 text-ink' : 'border-line/15 text-muted hover:text-ink')}
            >
              {m} min
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

function StepGenerate({ draft, topicHours, weekly, onEdit, missing }: { draft: Draft; topicHours: number; weekly: number; onEdit: (i: number) => void; missing: (id: StepId) => string | null }) {
  const rows: { i: number; icon: ReactNode; label: string; value: string; problem: string | null }[] = [
    { i: 0, icon: <BookOpen className="h-4 w-4 text-violet" />, label: 'Subjects', value: draft.subjects.map((s) => s.name).join(', ') || 'None yet', problem: missing('subjects') },
    { i: 1, icon: <ListChecks className="h-4 w-4 text-cyan" />, label: 'Topics', value: `${plural(draft.subjects.reduce((a, s) => a + s.topics.length, 0), 'topic')} · ${topicHours}h of study`, problem: missing('topics') },
    { i: 2, icon: <GraduationCap className="h-4 w-4 text-amber" />, label: 'Exams & deadlines', value: draft.deadlines.length ? plural(draft.deadlines.length, 'date') : 'None (optional)', problem: null },
    { i: 3, icon: <Clock className="h-4 w-4 text-mint" />, label: 'Study hours', value: `${weekly}h per week · ${draft.sessionMinutes}-min sessions`, problem: missing('hours') },
  ];
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.label} className={cn('flex flex-wrap items-center gap-3 rounded-2xl border p-4', r.problem ? 'border-amber/35 bg-amber/[0.06]' : 'border-line/10 bg-line/[0.03]')}>
          {r.icon}
          <span className="w-36 text-sm font-medium text-ink">{r.label}</span>
          <span className={cn('flex-1 text-sm', r.problem ? 'text-amber' : 'text-muted')}>{r.problem ?? r.value}</span>
          <button type="button" onClick={() => onEdit(r.i)} className="text-xs font-semibold text-cyan hover:underline">
            {r.problem ? 'Fix' : 'Edit'}
          </button>
        </li>
      ))}
    </ul>
  );
}
