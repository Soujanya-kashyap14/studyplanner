import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Award, Pencil, Plus, Trash2 } from 'lucide-react';
import type { Achievement, AchievementCategory } from '@/types';
import { useDerived } from '@/hooks/useDerived';
import { useDataStore } from '@/store/useDataStore';
import { PageHeader } from '@/components/ui/PageHeader';
import { PageSkeleton } from '@/components/ui/PageSkeleton';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button, IconButton } from '@/components/ui/Button';
import { SubjectDot } from '@/components/ui/Feedback';
import { EmptyState } from '@/components/ui/EmptyState';
import { InfoTip } from '@/components/ui/InfoTip';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { Field, Input, Select } from '@/components/ui/Form';
import { StreakFlame } from '@/components/achievements/StreakFlame';
import { CategoryIcon } from '@/components/achievements/CategoryIcon';
import { ACHIEVEMENT_CATEGORIES, ACHIEVEMENT_TEMPLATES, bestStreak, categoryLabel } from '@/utils/achievements';
import { addDays, formatFullDate, formatWeekday, todayISO } from '@/lib/date';
import { cn, plural } from '@/lib/utils';

type Draft = { open: boolean; achievement?: Achievement; preset?: { title: string; category: AchievementCategory } };

export default function Achievements() {
  const d = useDerived();
  const [modal, setModal] = useState<Draft>({ open: false });
  const [confirm, setConfirm] = useState<Achievement | null>(null);
  const [filter, setFilter] = useState<AchievementCategory | 'all'>('all');
  const remove = useDataStore((s) => s.deleteAchievement);
  const [params, setParams] = useSearchParams();

  // Deep link from the command palette / Home: /achievements?new=1
  useEffect(() => {
    if (params.get('new') !== '1') return;
    setModal({ open: true });
    setParams({}, { replace: true });
  }, [params, setParams]);

  const list = useMemo(() => [...(d?.snapshot.achievements ?? [])].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)), [d]);
  if (!d) return <PageSkeleton variant="list" />;

  const shown = filter === 'all' ? list : list.filter((a) => a.category === filter);
  const usedCats = ACHIEVEMENT_CATEGORIES.filter((c) => list.some((a) => a.category === c.id));
  const days = Array.from({ length: 21 }, (_, i) => addDays(d.today, i - 20));
  const studied = new Set(d.snapshot.sessions.filter((s) => s.status === 'completed').map((s) => s.date));
  const best = bestStreak(d.snapshot.sessions);
  const thisYear = list.filter((a) => a.date.slice(0, 4) === d.today.slice(0, 4)).length;

  return (
    <>
      <PageHeader
        title="Achievements"
        subtitle="Your star log"
        description="Keep your study streak alive, and record the wins you're proud of — good marks, passed exams, awards."
        actions={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setModal({ open: true })}>
            Add achievement
          </Button>
        }
      />

      <div className="flex flex-col gap-8">
        {/* Streak */}
        <GlassCard
          hover={false}
          title={
            <span className="flex items-center gap-1">
              Study streak
              <InfoTip>Days in a row on which you finished at least one study session. Finish one session today to keep it going.</InfoTip>
            </span>
          }
          glow="rgb(var(--amber) / 0.6)"
        >
          <div className="flex flex-col gap-6 md:flex-row md:items-center">
            <div className="flex items-center gap-4">
              <div className="grid h-20 w-20 shrink-0 place-items-center rounded-3xl bg-amber/10">
                <StreakFlame streak={d.streak} size={44} />
              </div>
              <div>
                <p className="font-mono text-4xl font-bold text-ink">{d.streak}</p>
                <p className="text-sm text-muted">
                  {d.streak === 1 ? 'day' : 'days'} in a row · best {plural(best, 'day')}
                </p>
                <p className="mt-1 text-xs text-faint">{d.todayStats.doneMin > 0 ? 'Today counts ✦' : d.streak ? 'Finish a session today to keep it going.' : 'Finish one session to start a streak.'}</p>
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <p className="mb-2 text-xs font-medium text-muted">Last 3 weeks</p>
              <ol className="grid grid-cols-7 gap-1.5 sm:grid-cols-[repeat(21,minmax(0,1fr))]" aria-label="Study days in the last three weeks">
                {days.map((day) => {
                  const on = studied.has(day);
                  return (
                    <li
                      key={day}
                      title={`${formatWeekday(day)} ${day}${on ? ' — studied' : ''}`}
                      aria-label={`${formatWeekday(day)} ${day}: ${on ? 'studied' : 'no study'}`}
                      className={cn('aspect-square rounded-md', on ? 'bg-amber shadow-[0_0_10px_rgb(var(--amber)/0.5)]' : 'bg-line/10', day === d.today && 'ring-2 ring-cyan')}
                    />
                  );
                })}
              </ol>
            </div>
          </div>
        </GlassCard>

        {/* My achievements */}
        <section aria-labelledby="ach-title">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="ach-title" className="text-lg font-semibold text-ink">
                My achievements
              </h2>
              <p className="text-sm text-muted">{list.length ? `${plural(list.length, 'achievement')} recorded · ${thisYear} this year` : 'Nothing recorded yet.'}</p>
            </div>
            {usedCats.length > 1 && (
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Filter by type">
                {[{ id: 'all' as const, label: 'All' }, ...usedCats].map((c) => (
                  <button
                    key={c.id}
                    role="radio"
                    aria-checked={filter === c.id}
                    onClick={() => setFilter(c.id)}
                    className={cn('rounded-full border px-3 py-1.5 text-xs font-medium transition-colors', filter === c.id ? 'border-violet/50 bg-violet/15 text-ink' : 'border-line/15 text-muted hover:text-ink')}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Quick add */}
          <div className="mb-6 flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted">Quick add:</span>
            {ACHIEVEMENT_TEMPLATES.map((t) => (
              <button
                key={t.title}
                onClick={() => setModal({ open: true, preset: t })}
                className="flex items-center gap-1.5 rounded-full border border-line/15 bg-line/[0.03] px-3 py-1.5 text-xs text-ink transition-colors hover:border-violet/40 hover:bg-violet/10"
              >
                <Plus className="h-3 w-3 text-violet" aria-hidden /> {t.title}
              </button>
            ))}
          </div>

          {list.length === 0 ? (
            <div className="glass">
              <EmptyState art="comet" title="Record your first win" description='Got good marks? Passed all your subjects? Add it here — pick a quick-add above or use "Add achievement".' />
            </div>
          ) : (
            <ul className="grid gap-6 md:grid-cols-2">
              <AnimatePresence initial={false}>
                {shown.map((a) => {
                  const subj = a.subjectId ? d.subjectById.get(a.subjectId) : undefined;
                  return (
                    <motion.li key={a.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }}>
                      <GlassCard className="h-full">
                        <div className="flex items-start gap-4">
                          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[linear-gradient(135deg,rgb(var(--amber)),rgb(var(--violet)))] text-white shadow-glow-amber" aria-hidden>
                            <CategoryIcon category={a.category} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-amber">{categoryLabel(a.category)}</p>
                            <h3 className="mt-0.5 text-base font-semibold text-ink">{a.title}</h3>
                            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                              <span>{formatFullDate(a.date)}</span>
                              {subj && (
                                <span className="flex items-center gap-1.5">
                                  · <SubjectDot color={subj.color} glow={false} /> {subj.name}
                                </span>
                              )}
                              {a.result && <span className="rounded-full bg-mint/15 px-2 py-0.5 font-semibold text-mint">{a.result}</span>}
                            </p>
                            {a.note && <p className="mt-2 text-sm text-muted">{a.note}</p>}
                          </div>
                          <div className="flex shrink-0">
                            <IconButton size="sm" label={`Edit ${a.title}`} onClick={() => setModal({ open: true, achievement: a })}>
                              <Pencil className="h-3.5 w-3.5" />
                            </IconButton>
                            <IconButton size="sm" label={`Delete ${a.title}`} className="hover:text-rose" onClick={() => setConfirm(a)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </IconButton>
                          </div>
                        </div>
                      </GlassCard>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ul>
          )}
        </section>
      </div>

      <AchievementModal state={modal} onClose={() => setModal({ open: false })} />
      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} title={`Delete "${confirm?.title}"?`} description="It disappears from your achievements. You can undo right after." onConfirm={() => confirm && void remove(confirm.id)} />
    </>
  );
}

function AchievementModal({ state, onClose }: { state: Draft; onClose: () => void }) {
  const d = useDerived();
  const create = useDataStore((s) => s.createAchievement);
  const update = useDataStore((s) => s.updateAchievement);
  const pending = useDataStore((s) => s.pending['ach:new'] || (state.achievement ? s.pending[`ach:${state.achievement.id}`] : false));
  const [form, setForm] = useState({ title: '', category: 'grades' as AchievementCategory, date: todayISO(), subjectId: '', result: '', note: '' });
  const [errors, setErrors] = useState<{ title?: string; date?: string }>({});

  useEffect(() => {
    if (!state.open) return;
    const a = state.achievement;
    setForm({
      title: a?.title ?? state.preset?.title ?? '',
      category: a?.category ?? state.preset?.category ?? 'grades',
      date: a?.date ?? todayISO(),
      subjectId: a?.subjectId ?? '',
      result: a?.result ?? '',
      note: a?.note ?? '',
    });
    setErrors({});
  }, [state]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const next = {
      title: form.title.trim().length < 2 ? 'Describe the achievement (2+ characters).' : undefined,
      date: !form.date ? 'Pick the date.' : form.date > todayISO() ? 'Pick today or an earlier date — achievements have already happened.' : undefined,
    };
    setErrors(next);
    if (next.title || next.date) return;
    const payload = {
      title: form.title.trim(),
      category: form.category,
      date: form.date,
      subjectId: form.subjectId || undefined,
      result: form.result.trim() || undefined,
      note: form.note.trim() || undefined,
    };
    const ok = state.achievement ? await update(state.achievement.id, payload) : await create(payload);
    if (ok) onClose();
  }

  return (
    <Modal open={state.open} onClose={onClose} title={state.achievement ? 'Edit achievement' : 'Add an achievement'} description="Record a win you're proud of." size="lg">
      <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
        <Field label="What did you achieve?" error={errors.title}>
          <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Got an A in the Physics midterm" maxLength={90} />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Type">
            <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as AchievementCategory })}>
              {ACHIEVEMENT_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Date" error={errors.date}>
            <Input type="date" max={todayISO()} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </Field>
          <Field label="Subject (optional)">
            <Select value={form.subjectId} onChange={(e) => setForm({ ...form, subjectId: e.target.value })}>
              <option value="">Not tied to one subject</option>
              {(d?.snapshot.subjects ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Result (optional)" hint="A grade, score or rank">
            <Input value={form.result} onChange={(e) => setForm({ ...form, result: e.target.value })} placeholder="e.g. A+, 92%, 1st place" maxLength={30} />
          </Field>
        </div>
        <Field label="Note (optional)">
          <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="How it felt, what helped…" maxLength={200} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" icon={<Award className="h-4 w-4" />} loading={pending}>
            {state.achievement ? 'Save changes' : 'Add achievement'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
