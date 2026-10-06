import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, Check, CircleDot, FileUp, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import type { Difficulty, Subject, Topic, TopicStatus } from '@/types';
import { useDerived, type Derived } from '@/hooks/useDerived';
import { useDataStore } from '@/store/useDataStore';
import { NextStepBanner } from '@/components/workflow/NextStepBanner';
import { PageHeader } from '@/components/ui/PageHeader';
import { PageSkeleton } from '@/components/ui/PageSkeleton';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button, IconButton } from '@/components/ui/Button';
import { ProgressBar, SubjectDot } from '@/components/ui/Feedback';
import { EmptyState } from '@/components/ui/EmptyState';
import { InfoTip } from '@/components/ui/InfoTip';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { ColorPicker, DifficultyPicker, Field, Input, Select, Toggle } from '@/components/ui/Form';
import { ImportSyllabusModal } from '@/components/import/ImportSyllabusModal';
import { DIFFICULTY_OPTIONS, TopicAdder } from '@/components/subjects/TopicAdder';
import { cn, plural, round1, SUBJECT_COLORS } from '@/lib/utils';
import { topicsProgress } from '@/utils/scheduler';
import { addDays, diffDays, inDaysLabel } from '@/lib/date';

const STATUS_NEXT: Record<TopicStatus, TopicStatus> = { not_started: 'in_progress', in_progress: 'completed', completed: 'not_started' };
const STATUS_LABEL: Record<TopicStatus, string> = { not_started: 'Not started', in_progress: 'In progress', completed: 'Done' };

const hasHoursLeft = (topics: Topic[]) => topics.some((t) => t.status !== 'completed' && t.estimatedHours > t.completedHours);

export default function Subjects() {
  const d = useDerived();
  const [params, setParams] = useSearchParams();
  const [selected, setSelected] = useState<string | null>(params.get('subject') ?? params.get('addTopic'));
  const [subjectModal, setSubjectModal] = useState<{ open: boolean; subject?: Subject }>({ open: false });
  const [topicModal, setTopicModal] = useState<{ open: boolean; subjectId?: string; topic?: Topic }>({ open: false });
  const [confirm, setConfirm] = useState<{ kind: 'subject' | 'topic'; id: string; name: string } | null>(null);
  const [importing, setImporting] = useState(false);
  const deleteSubject = useDataStore((s) => s.deleteSubject);
  const deleteTopic = useDataStore((s) => s.deleteTopic);
  const focusTopic = params.get('topic');

  // Deep links: ?new=1 (new subject), ?addTopic=<id> (focus the add-topic row), ?subject=&topic= (highlight)
  useEffect(() => {
    if (params.get('new') === '1') setSubjectModal({ open: true });
    if (params.get('import') === '1') setImporting(true);
    const add = params.get('addTopic');
    if (add) {
      setSelected(add);
      window.setTimeout(() => document.querySelector<HTMLInputElement>('#topic-adder input')?.focus(), 400);
    }
    if (params.get('new') || params.get('import') || add) setParams({}, { replace: true });
  }, [params, setParams]);

  useEffect(() => {
    if (!focusTopic || !d) return;
    const t = window.setTimeout(() => document.getElementById(`topic-${focusTopic}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 350);
    return () => window.clearTimeout(t);
  }, [focusTopic, d]);

  const subjects = useMemo(() => d?.snapshot.subjects ?? [], [d]);
  const current = useMemo(() => subjects.find((s) => s.id === selected) ?? subjects[0], [subjects, selected]);

  if (!d) return <PageSkeleton variant="list" />;

  return (
    <>
      <PageHeader
        title="Subjects & Topics"
        subtitle="Your constellations"
        description="Pick a subject on the left, then add its topics with rough hours on the right. Orbit schedules topics."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon={<FileUp className="h-4 w-4" />} onClick={() => setImporting(true)} title="Upload a syllabus or exam timetable and let Orbit fill in subjects, topics and exam dates">
              Import syllabus
            </Button>
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => setSubjectModal({ open: true })}>
              Add subject
            </Button>
          </div>
        }
      />
      <NextStepBanner page="subjects" />

      {subjects.length === 0 ? (
        <div className="glass">
          <EmptyState
            art="constellation"
            title="No subjects yet"
            description="Add a subject (a course you are studying) and break it into topics — or import your syllabus and Orbit fills them in for you."
            action={
              <Button icon={<FileUp className="h-4 w-4" />} onClick={() => setImporting(true)}>
                Import a syllabus
              </Button>
            }
          />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          {/* Left: subjects */}
          <nav aria-label="Subjects" className="glass h-fit p-3">
            <ul className="space-y-1">
              {subjects.map((s) => {
                const topics = d.topicsBySubject.get(s.id) ?? [];
                const progress = topicsProgress(topics);
                const warn = !hasHoursLeft(topics);
                const active = current?.id === s.id;
                return (
                  <li key={s.id}>
                    <button
                      onClick={() => setSelected(s.id)}
                      aria-current={active ? 'true' : undefined}
                      className={cn('w-full rounded-2xl p-4 text-left transition-colors', active ? 'bg-violet/[0.12] ring-1 ring-violet/35' : 'hover:bg-line/[0.05]')}
                    >
                      <span className="flex items-center gap-2.5">
                        <SubjectDot color={s.color} />
                        <span className="flex-1 truncate text-sm font-semibold text-ink">{s.name}</span>
                        {warn && (
                          <span className="rounded-full border border-amber/40 bg-amber/10 px-2 py-0.5 text-[10px] font-semibold text-amber" title="Orbit can't plan this subject until it has topics with hours left">
                            {topics.length ? 'nothing left' : 'add topics'}
                          </span>
                        )}
                      </span>
                      <span className="mt-1 block text-xs text-muted">{topics.length ? `${plural(topics.length, 'topic')} · ${Math.round(progress * 100)}% done` : 'No topics yet'}</span>
                      <ProgressBar value={progress} color={s.color} label={`${s.name} progress`} height={5} className="mt-2" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* Right: the selected subject's topics */}
          {current && (
            <SubjectPane
              key={current.id}
              d={d}
              subject={current}
              highlight={focusTopic}
              onEdit={() => setSubjectModal({ open: true, subject: current })}
              onDelete={() => setConfirm({ kind: 'subject', id: current.id, name: current.name })}
              onEditTopic={(topic) => setTopicModal({ open: true, subjectId: current.id, topic })}
              onDeleteTopic={(topic) => setConfirm({ kind: 'topic', id: topic.id, name: topic.name })}
            />
          )}
        </div>
      )}

      <SubjectModal state={subjectModal} onClose={() => setSubjectModal({ open: false })} />
      <TopicModal state={topicModal} onClose={() => setTopicModal({ open: false })} />
      <ImportSyllabusModal open={importing} onClose={() => setImporting(false)} />
      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={`Delete ${confirm?.name}?`}
        description={confirm?.kind === 'subject' ? 'This removes the subject with all its topics, exams, deadlines and sessions. You can undo right after.' : 'This removes the topic and its planned sessions. You can undo right after.'}
        onConfirm={() => confirm && void (confirm.kind === 'subject' ? deleteSubject(confirm.id) : deleteTopic(confirm.id))}
      />
    </>
  );
}

function SubjectPane({
  d,
  subject,
  highlight,
  onEdit,
  onDelete,
  onEditTopic,
  onDeleteTopic,
}: {
  d: Derived;
  subject: Subject;
  highlight: string | null;
  onEdit: () => void;
  onDelete: () => void;
  onEditTopic: (t: Topic) => void;
  onDeleteTopic: (t: Topic) => void;
}) {
  const topics = d.topicsBySubject.get(subject.id) ?? [];
  const progress = topicsProgress(topics);
  const setStatus = useDataStore((s) => s.setTopicStatus);
  const createTopic = useDataStore((s) => s.createTopic);
  const adding = useDataStore((s) => s.pending[`topic:new:${subject.id}`]);
  const hoursLeft = round1(topics.reduce((a, t) => a + (t.status === 'completed' ? 0 : Math.max(0, t.estimatedHours - t.completedHours)), 0));
  const warn = !hasHoursLeft(topics);

  return (
    <GlassCard hover={false} padded={false} className="p-6 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-3 text-xl font-semibold text-ink">
            <SubjectDot color={subject.color} className="h-3 w-3" />
            {subject.name}
          </h2>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-muted">
            <span className="inline-flex items-center gap-1">
              {DIFFICULTY_OPTIONS[subject.difficulty - 1][1]}
              <InfoTip>How hard the subject feels to you. Harder subjects get a little more priority when Orbit plans.</InfoTip>
            </span>
            <span>· {plural(topics.length, 'topic')}</span>
            <span>· {hoursLeft}h left to study</span>
          </p>
        </div>
        <div className="flex gap-1">
          <IconButton label={`Edit ${subject.name}`} onClick={onEdit}>
            <Pencil className="h-4 w-4" />
          </IconButton>
          <IconButton label={`Delete ${subject.name}`} className="hover:text-rose" onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
          </IconButton>
        </div>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <ProgressBar value={progress} color={subject.color} label={`${subject.name} progress`} />
        <span className="w-12 text-right font-mono text-sm font-semibold text-ink">{Math.round(progress * 100)}%</span>
      </div>

      {warn && (
        <p className="mt-5 flex items-start gap-2 rounded-2xl border border-amber/35 bg-amber/[0.07] p-4 text-sm text-ink" role="status">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber" aria-hidden />
          {topics.length ? 'Every topic here is finished, so there is nothing left to plan for this subject.' : `${subject.name} has no topics yet, so Orbit can't plan it. Add one below, for example "Arrays, 3h".`}
        </p>
      )}

      {/* Always-visible add row */}
      <div id="topic-adder" className="mt-6">
        <p className="mb-2 text-sm font-semibold text-ink">Add a topic</p>
        <TopicAdder subjectName={subject.name} busy={adding} onAdd={(t) => createTopic(subject.id, { name: t.name, estimatedHours: t.hours, difficulty: t.difficulty })} />
      </div>

      <ul className="mt-6 divide-y divide-line/[0.08]">
        <AnimatePresence initial={false}>
          {topics.map((t) => {
            const due = d.deadlineOf.get(t.id);
            const daysLeft = due ? diffDays(d.today, addDays(due, 1)) : null;
            return (
              <motion.li
                key={t.id}
                id={`topic-${t.id}`}
                layout
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className={cn('group flex items-center gap-4 py-3', highlight === t.id && 'rounded-xl bg-violet/10 px-2 ring-1 ring-violet/40')}
              >
                <motion.button
                  whileTap={{ scale: 0.8 }}
                  onClick={() => void setStatus(t.id, STATUS_NEXT[t.status])}
                  aria-label={`${t.name}: ${STATUS_LABEL[t.status]}. Change to ${STATUS_LABEL[STATUS_NEXT[t.status]]}`}
                  title={`${STATUS_LABEL[t.status]} — click to change to ${STATUS_LABEL[STATUS_NEXT[t.status]]}`}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full"
                  style={{
                    background: t.status === 'completed' ? subject.color : 'transparent',
                    border: t.status === 'completed' ? 'none' : `2px ${t.status === 'in_progress' ? 'solid' : 'dashed'} ${subject.color}`,
                  }}
                >
                  {t.status === 'completed' ? <Check className="h-4 w-4 text-[#0B1020]" strokeWidth={3} /> : t.status === 'in_progress' ? <CircleDot className="h-3.5 w-3.5" style={{ color: subject.color }} /> : null}
                </motion.button>
                <div className="min-w-0 flex-1">
                  <p className={cn('truncate text-sm font-medium text-ink', t.status === 'completed' && 'text-muted line-through decoration-1')}>{t.name}</p>
                  <p className="flex flex-wrap gap-x-3 text-xs text-muted">
                    <span>{STATUS_LABEL[t.status]}</span>
                    <span>
                      {round1(t.completedHours)} of {t.estimatedHours}h
                    </span>
                    <span>{DIFFICULTY_OPTIONS[t.difficulty - 1][1]}</span>
                    {!!t.weightage && <span title="Share of the exam's marks">{t.weightage}% of marks</span>}
                    {t.frequentlyAsked && (
                      <span className="inline-flex items-center gap-0.5 text-amber" title="Frequently asked in previous-year papers — Orbit gives it extra priority">
                        <Star className="h-3 w-3" fill="currentColor" aria-hidden /> often asked
                      </span>
                    )}
                    {daysLeft !== null && t.status !== 'completed' && <span className={daysLeft <= 3 ? 'text-amber' : ''}>Due {inDaysLabel(daysLeft).toLowerCase()}</span>}
                  </p>
                </div>
                <div className="flex shrink-0 md:opacity-0 md:transition-opacity md:group-focus-within:opacity-100 md:group-hover:opacity-100">
                  <IconButton size="sm" label={`Edit ${t.name}`} onClick={() => onEditTopic(t)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </IconButton>
                  <IconButton size="sm" label={`Delete ${t.name}`} className="hover:text-rose" onClick={() => onDeleteTopic(t)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </IconButton>
                </div>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
      {topics.length === 0 && <p className="mt-2 text-sm text-faint">Topics you add appear here.</p>}
    </GlassCard>
  );
}

function SubjectModal({ state, onClose }: { state: { open: boolean; subject?: Subject }; onClose: () => void }) {
  const create = useDataStore((s) => s.createSubject);
  const update = useDataStore((s) => s.updateSubject);
  const [name, setName] = useState('');
  const [color, setColor] = useState(SUBJECT_COLORS[0]);
  const [difficulty, setDifficulty] = useState<Difficulty>(3);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!state.open) return;
    setName(state.subject?.name ?? '');
    setColor(state.subject?.color ?? SUBJECT_COLORS[Math.floor(Math.random() * SUBJECT_COLORS.length)]);
    setDifficulty(state.subject?.difficulty ?? 3);
    setError(undefined);
  }, [state]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) return setError('Give the subject a name (2+ characters).');
    setSaving(true);
    const ok = state.subject ? await update(state.subject.id, { name: name.trim(), color, difficulty }) : await create({ name: name.trim(), color, difficulty });
    setSaving(false);
    if (ok) onClose();
  }

  return (
    <Modal open={state.open} onClose={onClose} title={state.subject ? 'Edit subject' : 'New subject'} description="A subject becomes a constellation in your sky.">
      <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
        <Field label="Name" error={error}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Linear Algebra" maxLength={40} />
        </Field>
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-muted">Signature color</span>
          <ColorPicker value={color} onChange={setColor} colors={SUBJECT_COLORS} />
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-muted">Difficulty</span>
          <DifficultyPicker value={difficulty} onChange={setDifficulty} />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            {state.subject ? 'Save changes' : 'Add subject'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function TopicModal({ state, onClose }: { state: { open: boolean; subjectId?: string; topic?: Topic }; onClose: () => void }) {
  const create = useDataStore((s) => s.createTopic);
  const update = useDataStore((s) => s.updateTopic);
  const [form, setForm] = useState({ name: '', hours: '3', difficulty: 3 as Difficulty, status: 'not_started' as TopicStatus, deadline: '', weightage: '', frequentlyAsked: false });
  const [errors, setErrors] = useState<{ name?: string; hours?: string; weightage?: string }>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!state.open) return;
    const t = state.topic;
    setForm({
      name: t?.name ?? '',
      hours: String(t?.estimatedHours ?? 3),
      difficulty: t?.difficulty ?? 3,
      status: t?.status ?? 'not_started',
      deadline: t?.deadline ?? '',
      weightage: t?.weightage ? String(t.weightage) : '',
      frequentlyAsked: !!t?.frequentlyAsked,
    });
    setErrors({});
  }, [state]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const hours = Number(form.hours);
    const weightage = form.weightage.trim() ? Number(form.weightage) : 0;
    const next = {
      name: form.name.trim().length < 2 ? 'Name the topic (2+ characters).' : undefined,
      hours: !Number.isFinite(hours) || hours < 0.5 || hours > 100 ? 'Between 0.5 and 100 hours.' : undefined,
      weightage: !Number.isFinite(weightage) || weightage < 0 || weightage > 100 ? 'Between 0 and 100.' : undefined,
    };
    setErrors(next);
    if (next.name || next.hours || next.weightage) return;
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      estimatedHours: hours,
      difficulty: form.difficulty,
      status: form.status,
      deadline: form.deadline || undefined,
      weightage,
      frequentlyAsked: form.frequentlyAsked,
    };
    const ok = state.topic ? await update(state.topic.id, payload) : await create(state.subjectId!, payload);
    setSaving(false);
    if (ok) onClose();
  }

  return (
    <Modal open={state.open} onClose={onClose} title={state.topic ? 'Edit topic' : 'New topic'} description="Topics are the stars Orbit schedules.">
      <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
        <Field label="Topic name" error={errors.name}>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Eigenvalues" maxLength={60} />
        </Field>
        <div className="grid gap-6 sm:grid-cols-2">
          <Field label="Estimated hours" error={errors.hours}>
            <Input type="number" min={0.5} max={100} step={0.5} inputMode="decimal" value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value })} />
          </Field>
          <Field label="Status">
            <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as TopicStatus })}>
              <option value="not_started">Not started</option>
              <option value="in_progress">In progress</option>
              <option value="completed">Completed</option>
            </Select>
          </Field>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-muted">Difficulty</span>
          <DifficultyPicker value={form.difficulty} onChange={(v) => setForm({ ...form, difficulty: v })} />
        </div>
        <Field label="Exam weightage, % of marks (optional)" error={errors.weightage} hint="Higher-scoring topics get more priority in your plan.">
          <Input type="number" min={0} max={100} step={1} inputMode="numeric" placeholder="e.g. 20" value={form.weightage} onChange={(e) => setForm({ ...form, weightage: e.target.value })} />
        </Field>
        <Toggle
          checked={form.frequentlyAsked}
          onChange={(v) => setForm({ ...form, frequentlyAsked: v })}
          label="Frequently asked in previous-year papers"
          description="Orbit weights this topic higher when planning."
        />
        <Field label="Own deadline (optional)" hint="Otherwise the deadline comes from linked exams and assignments.">
          <Input type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            {state.topic ? 'Save topic' : 'Add topic'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
