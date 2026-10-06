import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown, GraduationCap, ListTodo, MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import type { Assignment, AssignmentStatus, Exam } from '@/types';
import { useDerived, type Derived } from '@/hooks/useDerived';
import { useDataStore } from '@/store/useDataStore';
import { NextStepBanner } from '@/components/workflow/NextStepBanner';
import { PageHeader } from '@/components/ui/PageHeader';
import { PageSkeleton } from '@/components/ui/PageSkeleton';
import { Button, IconButton } from '@/components/ui/Button';
import { SubjectDot } from '@/components/ui/Feedback';
import { EmptyState } from '@/components/ui/EmptyState';
import { InfoTip } from '@/components/ui/InfoTip';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { Field, Input, Select } from '@/components/ui/Form';
import { ReadinessGauge } from '@/components/readiness/ReadinessGauge';
import { WhatIfSimulator } from '@/components/whatif/WhatIfSimulator';
import { addDays, formatFullDate, formatTime, inDaysLabel, todayISO } from '@/lib/date';
import { cn } from '@/lib/utils';

type Row = { kind: 'exam'; item: Exam; date: string } | { kind: 'assignment'; item: Assignment; date: string };

export default function Exams() {
  const d = useDerived();
  const [examModal, setExamModal] = useState<{ open: boolean; exam?: Exam }>({ open: false });
  const [asgModal, setAsgModal] = useState<{ open: boolean; assignment?: Assignment }>({ open: false });
  const [confirm, setConfirm] = useState<{ kind: 'exam' | 'asg'; id: string; name: string } | null>(null);
  const [addMenu, setAddMenu] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const deleteExam = useDataStore((s) => s.deleteExam);
  const deleteAssignment = useDataStore((s) => s.deleteAssignment);
  const updateAssignment = useDataStore((s) => s.updateAssignment);
  const [params, setParams] = useSearchParams();

  // Deep links: /exams?new=exam | assignment
  useEffect(() => {
    const kind = params.get('new');
    if (!kind) return;
    if (kind === 'exam') setExamModal({ open: true });
    if (kind === 'assignment') setAsgModal({ open: true });
    setParams({}, { replace: true });
  }, [params, setParams]);

  useEffect(() => {
    if (!addMenu) return;
    const close = (e: MouseEvent) => !menuRef.current?.contains(e.target as Node) && setAddMenu(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [addMenu]);

  if (!d) return <PageSkeleton variant="list" />;
  const noSubjects = d.snapshot.subjects.length === 0;
  const rows: Row[] = [
    ...d.snapshot.exams.map((item): Row => ({ kind: 'exam', item, date: item.date })),
    ...d.snapshot.assignments.map((item): Row => ({ kind: 'assignment', item, date: item.dueDate })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  const upcoming = rows.filter((r) => r.date.slice(0, 10) >= d.today);
  const past = rows.filter((r) => r.date.slice(0, 10) < d.today);

  return (
    <>
      <PageHeader
        title="Exams & Deadlines"
        subtitle="Your launch windows"
        description="Every exam and assignment, soonest first. Topics linked to a date are scheduled before it."
        actions={
          <div className="relative" ref={menuRef}>
            <Button icon={<Plus className="h-4 w-4" />} iconRight={<ChevronDown className="h-4 w-4" />} disabled={noSubjects} title={noSubjects ? 'Add a subject first' : undefined} onClick={() => setAddMenu((m) => !m)} aria-haspopup="menu" aria-expanded={addMenu}>
              Add
            </Button>
            <AnimatePresence>
              {addMenu && (
                <motion.div role="menu" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="glass-strong absolute right-0 top-12 z-20 w-60 rounded-2xl p-2">
                  <button role="menuitem" onClick={() => { setAddMenu(false); setExamModal({ open: true }); }} className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-line/[0.06]">
                    <GraduationCap className="mt-0.5 h-4 w-4 text-violet" aria-hidden />
                    <span>
                      <span className="block text-sm font-medium text-ink">Exam</span>
                      <span className="block text-xs text-muted">Covers some or all topics of a subject</span>
                    </span>
                  </button>
                  <button role="menuitem" onClick={() => { setAddMenu(false); setAsgModal({ open: true }); }} className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-line/[0.06]">
                    <ListTodo className="mt-0.5 h-4 w-4 text-cyan" aria-hidden />
                    <span>
                      <span className="block text-sm font-medium text-ink">Assignment / deadline</span>
                      <span className="block text-xs text-muted">Homework, a report, a project…</span>
                    </span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        }
      />
      <NextStepBanner page="exams" />

      {rows.length === 0 ? (
        <div className="glass">
          <EmptyState art="telescope" title="No exams or deadlines yet" description={noSubjects ? 'Add a subject first, then add its exam dates here.' : 'Add your exam dates and assignment deadlines with the Add button above. Orbit then schedules what is due first.'} />
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          <ul className="glass divide-y divide-line/[0.08] p-2 sm:p-3" aria-label="Upcoming exams and deadlines">
            {upcoming.length === 0 && <li className="p-6 text-center text-sm text-muted">Nothing upcoming. Add your next exam or deadline with the Add button.</li>}
            {upcoming.map((r) => (
              <DeadlineRow
                key={r.item.id}
                d={d}
                row={r}
                expanded={expanded === r.item.id}
                onToggle={() => setExpanded((e) => (e === r.item.id ? null : r.item.id))}
                onToggleDone={(a) => void updateAssignment(a.id, { status: a.status === 'done' ? 'todo' : 'done' })}
                onEdit={() => (r.kind === 'exam' ? setExamModal({ open: true, exam: r.item }) : setAsgModal({ open: true, assignment: r.item }))}
                onDelete={() => setConfirm({ kind: r.kind === 'exam' ? 'exam' : 'asg', id: r.item.id, name: r.item.title })}
              />
            ))}
          </ul>
          {d.snapshot.topics.length > 0 && <WhatIfSimulator d={d} />}
          {past.length > 0 && (
            <details className="group">
              <summary className="mb-3 flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-muted hover:text-ink">
                Past ({past.length})
                <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden />
              </summary>
              <ul className="glass divide-y divide-line/[0.08] p-2 opacity-80 sm:p-3">
                {past.map((r) => (
                  <DeadlineRow
                    key={r.item.id}
                    d={d}
                    row={r}
                    expanded={false}
                    onToggle={() => undefined}
                    onToggleDone={(a) => void updateAssignment(a.id, { status: a.status === 'done' ? 'todo' : 'done' })}
                    onEdit={() => (r.kind === 'exam' ? setExamModal({ open: true, exam: r.item }) : setAsgModal({ open: true, assignment: r.item }))}
                    onDelete={() => setConfirm({ kind: r.kind === 'exam' ? 'exam' : 'asg', id: r.item.id, name: r.item.title })}
                  />
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      <ExamModal d={d} state={examModal} onClose={() => setExamModal({ open: false })} />
      <AssignmentModal d={d} state={asgModal} onClose={() => setAsgModal({ open: false })} />
      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={`Delete ${confirm?.name}?`}
        description="Linked topics lose this deadline. You can undo right after."
        onConfirm={() => confirm && void (confirm.kind === 'exam' ? deleteExam(confirm.id) : deleteAssignment(confirm.id))}
      />
    </>
  );
}

function DeadlineRow({
  d,
  row,
  expanded,
  onToggle,
  onToggleDone,
  onEdit,
  onDelete,
}: {
  d: Derived;
  row: Row;
  expanded: boolean;
  onToggle: () => void;
  onToggleDone: (a: Assignment) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const subj = d.subjectById.get(row.item.subjectId);
  const day = row.date.slice(0, 10);
  const daysLeft = Math.round((new Date(`${day}T00:00:00`).getTime() - new Date(`${d.today}T00:00:00`).getTime()) / 86_400_000);
  const done = row.kind === 'assignment' && row.item.status === 'done';
  const pred = row.kind === 'exam' ? d.readiness.get(row.item.id) : undefined;
  const urgent = !done && daysLeft >= 0 && daysLeft <= 3;

  return (
    <li className="p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {row.kind === 'assignment' ? (
          <motion.button
            whileTap={{ scale: 0.8 }}
            role="checkbox"
            aria-checked={done}
            aria-label={`Mark ${row.item.title} ${done ? 'not done' : 'done'}`}
            title={done ? 'Mark not done' : 'Mark done'}
            onClick={() => onToggleDone(row.item as Assignment)}
            className={cn('grid h-6 w-6 shrink-0 place-items-center rounded-lg border-2 transition-colors', done ? 'border-mint bg-mint text-on-accent' : 'border-line/25 hover:border-mint')}
          >
            {done && <Check className="h-4 w-4" strokeWidth={3} />}
          </motion.button>
        ) : (
          <span className="grid h-6 w-6 shrink-0 place-items-center text-violet" title="Exam">
            <GraduationCap className="h-5 w-5" aria-label="Exam" />
          </span>
        )}

        <div className="min-w-0 flex-1">
          <p className={cn('truncate text-sm font-semibold text-ink', done && 'text-muted line-through')}>{row.item.title}</p>
          <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
            <span>{row.kind === 'exam' ? 'Exam' : 'Assignment'}</span>
            {subj && (
              <span className="flex items-center gap-1.5">
                · <SubjectDot color={subj.color} glow={false} /> {subj.name}
              </span>
            )}
            <span>
              · {formatFullDate(day)}, {formatTime(row.date.slice(11, 16))}
            </span>
            {row.kind === 'exam' && row.item.location && (
              <span className="flex items-center gap-1">
                · <MapPin className="h-3 w-3" aria-hidden /> {row.item.location}
              </span>
            )}
          </p>
        </div>

        <span className={cn('min-w-[88px] text-right text-sm font-semibold', done ? 'text-mint' : urgent ? 'text-amber' : 'text-muted')}>{done ? 'Done' : inDaysLabel(daysLeft)}</span>

        {pred && daysLeft >= 0 && (
          <button onClick={onToggle} aria-expanded={expanded} className="flex items-center gap-1 rounded-xl border border-line/15 px-3 py-1.5 text-xs text-muted hover:text-ink" title="Show readiness details">
            Readiness <span className={cn('font-mono font-semibold', pred.risk === 'on_track' ? 'text-mint' : pred.risk === 'some_risk' ? 'text-amber' : 'text-rose')}>{pred.readiness}%</span>
            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-180')} aria-hidden />
          </button>
        )}

        <div className="flex shrink-0">
          <IconButton size="sm" label={`Edit ${row.item.title}`} onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton size="sm" label={`Delete ${row.item.title}`} className="hover:text-rose" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" />
          </IconButton>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {expanded && pred && row.kind === 'exam' && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="mt-4 grid items-center gap-6 rounded-2xl border border-line/10 bg-line/[0.03] p-5 sm:grid-cols-[220px_1fr]">
              <ReadinessGauge exam={row.item} subject={subj} prediction={pred} size={180} compact />
              <div className="space-y-3 text-sm">
                <p className="flex items-center gap-1 font-semibold text-ink">
                  How ready you'll be
                  <InfoTip>A prediction for exam day: what you've covered so far, plus the planned sessions you're likely to complete at your usual pace, minus recent skips.</InfoTip>
                </p>
                <p className="text-muted">{pred.message}</p>
                <p className="text-xs text-muted">
                  Covered now: <span className="font-mono text-ink">{Math.round(pred.coverage * 100)}%</span> · Expected by exam day: <span className="font-mono text-ink">{Math.round(pred.projectedCoverage * 100)}%</span>
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {row.item.topicIds.map((id) => {
                    const t = d.topicById.get(id);
                    if (!t) return null;
                    return (
                      <span key={id} className={cn('rounded-full border px-2 py-0.5 text-[11px]', t.status === 'completed' ? 'border-transparent font-medium text-[#0B1020]' : 'border-line/15 text-muted')} style={t.status === 'completed' ? { background: subj?.color } : undefined}>
                        {t.name}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

function ExamModal({ d, state, onClose }: { d: Derived; state: { open: boolean; exam?: Exam }; onClose: () => void }) {
  const create = useDataStore((s) => s.createExam);
  const update = useDataStore((s) => s.updateExam);
  const [form, setForm] = useState({ title: '', subjectId: '', date: '', time: '09:00', location: '', topicIds: [] as string[] });
  const [errors, setErrors] = useState<{ title?: string; date?: string }>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!state.open) return;
    const e = state.exam;
    const subjectId = e?.subjectId ?? d.snapshot.subjects[0]?.id ?? '';
    setForm({
      title: e?.title ?? '',
      subjectId,
      date: e?.date.slice(0, 10) ?? addDays(todayISO(), 14),
      time: e?.date.slice(11, 16) ?? '09:00',
      location: e?.location ?? '',
      topicIds: e?.topicIds ?? (d.topicsBySubject.get(subjectId) ?? []).map((t) => t.id),
    });
    setErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const topics = d.topicsBySubject.get(form.subjectId) ?? [];

  async function submit(e: FormEvent) {
    e.preventDefault();
    const next = { title: form.title.trim().length < 2 ? 'Give the exam a title.' : undefined, date: !form.date ? 'Pick a date.' : undefined };
    setErrors(next);
    if (next.title || next.date) return;
    setSaving(true);
    const payload = { title: form.title.trim(), subjectId: form.subjectId, date: `${form.date}T${form.time}:00`, location: form.location || undefined, topicIds: form.topicIds };
    const ok = state.exam ? await update(state.exam.id, payload) : await create(payload);
    setSaving(false);
    if (ok) onClose();
  }

  return (
    <Modal open={state.open} onClose={onClose} title={state.exam ? 'Edit exam' : 'New exam'} size="lg">
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <div className="grid gap-6 sm:grid-cols-2">
          <Field label="Title" error={errors.title}>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Midterm" />
          </Field>
          <Field label="Subject">
            <Select
              value={form.subjectId}
              onChange={(e) => setForm({ ...form, subjectId: e.target.value, topicIds: (d.topicsBySubject.get(e.target.value) ?? []).map((t) => t.id) })}
            >
              {d.snapshot.subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Date" error={errors.date}>
            <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </Field>
          <Field label="Start time">
            <Input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
          </Field>
        </div>
        <Field label="Location (optional)">
          <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Hall B" />
        </Field>
        <fieldset>
          <legend className="mb-2 text-xs font-medium text-muted">Topics covered</legend>
          {topics.length === 0 ? (
            <p className="text-sm text-muted">This subject has no topics yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {topics.map((t) => {
                const on = form.topicIds.includes(t.id);
                return (
                  <button
                    type="button"
                    key={t.id}
                    aria-pressed={on}
                    onClick={() => setForm({ ...form, topicIds: on ? form.topicIds.filter((x) => x !== t.id) : [...form.topicIds, t.id] })}
                    className={cn('rounded-full border px-3 py-1 text-xs transition-colors', on ? 'border-violet/50 bg-violet/15 text-ink' : 'border-line/15 text-muted hover:text-ink')}
                  >
                    {on && <Check className="mr-1 inline h-3 w-3" />}
                    {t.name}
                  </button>
                );
              })}
            </div>
          )}
        </fieldset>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            {state.exam ? 'Save exam' : 'Add exam'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function AssignmentModal({ d, state, onClose }: { d: Derived; state: { open: boolean; assignment?: Assignment }; onClose: () => void }) {
  const create = useDataStore((s) => s.createAssignment);
  const update = useDataStore((s) => s.updateAssignment);
  const [form, setForm] = useState({ title: '', subjectId: '', date: '', time: '23:59', topicId: '', status: 'todo' as AssignmentStatus });
  const [errors, setErrors] = useState<{ title?: string; date?: string }>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!state.open) return;
    const a = state.assignment;
    setForm({
      title: a?.title ?? '',
      subjectId: a?.subjectId ?? d.snapshot.subjects[0]?.id ?? '',
      date: a?.dueDate.slice(0, 10) ?? addDays(todayISO(), 7),
      time: a?.dueDate.slice(11, 16) ?? '23:59',
      topicId: a?.topicId ?? '',
      status: a?.status ?? 'todo',
    });
    setErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const next = { title: form.title.trim().length < 2 ? 'Give the assignment a title.' : undefined, date: !form.date ? 'Pick a due date.' : undefined };
    setErrors(next);
    if (next.title || next.date) return;
    setSaving(true);
    const payload = { title: form.title.trim(), subjectId: form.subjectId, dueDate: `${form.date}T${form.time}:00`, topicId: form.topicId || undefined, status: form.status };
    const ok = state.assignment ? await update(state.assignment.id, payload) : await create(payload);
    setSaving(false);
    if (ok) onClose();
  }

  return (
    <Modal open={state.open} onClose={onClose} title={state.assignment ? 'Edit assignment' : 'New assignment'}>
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <Field label="Title" error={errors.title}>
          <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Problem set 5" />
        </Field>
        <div className="grid gap-6 sm:grid-cols-2">
          <Field label="Subject">
            <Select value={form.subjectId} onChange={(e) => setForm({ ...form, subjectId: e.target.value, topicId: '' })}>
              {d.snapshot.subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Related topic (optional)">
            <Select value={form.topicId} onChange={(e) => setForm({ ...form, topicId: e.target.value })}>
              <option value="">None</option>
              {(d.topicsBySubject.get(form.subjectId) ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Due date" error={errors.date}>
            <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </Field>
          <Field label="Due time">
            <Input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
          </Field>
        </div>
        <Field label="Status">
          <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as AssignmentStatus })}>
            <option value="todo">To do</option>
            <option value="in_progress">In progress</option>
            <option value="done">Done</option>
          </Select>
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            {state.assignment ? 'Save' : 'Add assignment'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
