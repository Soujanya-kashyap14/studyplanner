import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CalendarPlus, CalendarX2, Clock, Save, ShieldCheck, Trash2 } from 'lucide-react';
import type { Availability as Avail, AvailabilityOverride } from '@/types';
import { useDerived } from '@/hooks/useDerived';
import { useDataStore } from '@/store/useDataStore';
import { PageHeader } from '@/components/ui/PageHeader';
import { PageSkeleton } from '@/components/ui/PageSkeleton';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button, IconButton } from '@/components/ui/Button';
import { Field, Input, Toggle } from '@/components/ui/Form';
import { DurationStepper, StartTimeSelect, WeeklyHoursEditor } from '@/components/hours/WeeklyHoursEditor';
import { addDays, formatMonthDay, formatTime, formatWeekday, todayISO } from '@/lib/date';
import { cn } from '@/lib/utils';

/** "Wed 14 Oct: 1h from 6:00 pm, Family dinner" */
function describeOverride(o: AvailabilityOverride) {
  const day = `${formatWeekday(o.date)} ${formatMonthDay(o.date)}`;
  const what = o.hours > 0 ? `${o.hours}h from ${formatTime(o.startTime)}` : 'Day off';
  return { day, what, note: o.note };
}

export default function Availability() {
  const d = useDerived();
  const save = useDataStore((s) => s.updateAvailability);
  const saving = useDataStore((s) => s.pending.availability);
  const [draft, setDraft] = useState<Avail | null>(null);
  const [ov, setOv] = useState({ date: '', dayOff: false, startTime: '18:00', hours: 1, note: '' });
  const [ovError, setOvError] = useState<string>();

  useEffect(() => {
    if (d && !draft) setDraft(structuredClone(d.snapshot.availability));
  }, [d, draft]);

  const dirty = useMemo(() => !!d && !!draft && JSON.stringify(draft) !== JSON.stringify(d.snapshot.availability), [d, draft]);

  // Warn before closing the tab with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const onUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [dirty]);

  if (!d || !draft) return <PageSkeleton variant="list" />;

  const discard = () => setDraft(structuredClone(d.snapshot.availability));
  const doSave = async () => {
    if (await save(draft)) setDraft(null); // re-sync from the saved snapshot
  };

  function addOverride(e: FormEvent) {
    e.preventDefault();
    if (!ov.date) return setOvError('Pick a date.');
    if (ov.date < todayISO()) return setOvError('Pick today or a later date.');
    setOvError(undefined);
    const o: AvailabilityOverride = { date: ov.date, hours: ov.dayOff ? 0 : ov.hours, startTime: ov.startTime, note: ov.note.trim() || undefined };
    setDraft({ ...draft!, overrides: [...draft!.overrides.filter((x) => x.date !== o.date), o].sort((a, b) => a.date.localeCompare(b.date)) });
    setOv({ date: '', dayOff: false, startTime: '18:00', hours: 1, note: '' });
  }

  return (
    <>
      <PageHeader
        title="My Study Hours"
        subtitle="When your sky is open"
        description="Orbit only schedules sessions inside these hours."
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <AnimatePresence>
              {dirty && (
                <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-1.5 text-xs font-medium text-amber" role="status">
                  <span className="h-2 w-2 rounded-full bg-amber" aria-hidden /> Unsaved changes
                </motion.span>
              )}
            </AnimatePresence>
            {dirty && (
              <button onClick={discard} className="text-xs font-medium text-muted underline-offset-4 hover:text-ink hover:underline">
                Discard changes
              </button>
            )}
            <Button size="lg" icon={<Save className="h-4 w-4" />} disabled={!dirty} loading={saving} onClick={() => void doSave()}>
              Save &amp; update plan
            </Button>
          </div>
        }
      />

      <div className="flex flex-col gap-8">
        <GlassCard
          title={
            <span className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-violet" aria-hidden /> Every week
            </span>
          }
          hover={false}
        >
          <p className="-mt-2 mb-5 text-sm text-muted">Turn on the days you can study, pick a start time and how long. Use a preset to fill many days at once.</p>
          <WeeklyHoursEditor value={draft} onChange={setDraft} />
        </GlassCard>

        <GlassCard
          title={
            <span className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-mint" aria-hidden /> Protect your plan
            </span>
          }
          hover={false}
        >
          <div className="flex flex-col gap-5">
            <Toggle
              checked={draft.bufferBeforeExams !== false}
              onChange={(v) => setDraft({ ...draft, bufferBeforeExams: v })}
              label="Buffer day before each exam"
              description="Orbit keeps the day before an exam free of new work, so missed sessions have somewhere to catch up."
            />
            <Toggle
              checked={draft.burnoutGuard !== false}
              onChange={(v) => setDraft({ ...draft, burnoutGuard: v })}
              label="Burnout guard"
              description="After repeated “drained” check-ins or a long run of heavy days, Orbit adds a rest day and tells you why."
            />
          </div>
        </GlassCard>

        <GlassCard
          title={
            <span className="flex items-center gap-2">
              <CalendarX2 className="h-4 w-4 text-cyan" aria-hidden /> Exceptions for specific dates
            </span>
          }
          hover={false}
        >
          <p className="-mt-2 mb-5 text-sm text-muted">A busy evening or a day off? Add it here and it replaces the weekly hours for that date only.</p>
          <form onSubmit={addOverride} className="grid gap-5 rounded-2xl border border-line/10 bg-line/[0.03] p-5 md:grid-cols-2" noValidate>
            <Field label="Date" error={ovError} hint={`For example ${formatWeekday(addDays(todayISO(), 8))} ${formatMonthDay(addDays(todayISO(), 8))}`}>
              <Input type="date" min={todayISO()} value={ov.date} onChange={(e) => setOv({ ...ov, date: e.target.value })} />
            </Field>
            <Field label="Note (optional)">
              <Input value={ov.note} onChange={(e) => setOv({ ...ov, note: e.target.value })} placeholder="e.g. Family dinner" maxLength={40} />
            </Field>
            <div className="md:col-span-2">
              <Toggle checked={ov.dayOff} onChange={(v) => setOv({ ...ov, dayOff: v })} label="Day off" description="No study at all on this date." />
            </div>
            {!ov.dayOff && (
              <div className="flex flex-wrap items-end gap-4 md:col-span-2">
                <label className="text-xs font-medium text-muted">
                  Start time
                  <div className="mt-1.5">
                    <StartTimeSelect value={ov.startTime} label="Exception start time" onChange={(startTime) => setOv({ ...ov, startTime })} />
                  </div>
                </label>
                <div className="text-xs font-medium text-muted">
                  How long
                  <div className="mt-1.5">
                    <DurationStepper value={ov.hours} label="Exception study time" onChange={(hours) => setOv({ ...ov, hours })} />
                  </div>
                </div>
              </div>
            )}
            <div className="md:col-span-2">
              <Button type="submit" variant="secondary" icon={<CalendarPlus className="h-4 w-4" />}>
                Add exception
              </Button>
            </div>
          </form>

          {draft.overrides.length > 0 ? (
            <ul className="mt-6 grid gap-3 md:grid-cols-2">
              <AnimatePresence initial={false}>
                {draft.overrides.map((o) => {
                  const x = describeOverride(o);
                  const past = o.date < todayISO();
                  return (
                    <motion.li key={o.date} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: past ? 0.5 : 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }} className="flex items-center gap-3 rounded-2xl border border-line/10 bg-line/[0.03] p-4">
                      <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-xl', o.hours === 0 ? 'bg-rose/15 text-rose' : 'bg-cyan/15 text-cyan')} aria-hidden>
                        {o.hours === 0 ? <CalendarX2 className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                      </span>
                      <p className="min-w-0 flex-1 text-sm text-ink">
                        <span className="font-semibold">{x.day}:</span> {x.what}
                        {x.note && <span className="text-muted">, {x.note}</span>}
                        {past && <span className="ml-1 text-xs text-faint">(past)</span>}
                      </p>
                      <IconButton size="sm" label={`Remove exception on ${x.day}`} className="hover:text-rose" onClick={() => setDraft({ ...draft, overrides: draft.overrides.filter((y) => y.date !== o.date) })}>
                        <Trash2 className="h-4 w-4" />
                      </IconButton>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ul>
          ) : (
            <p className="mt-6 text-sm text-faint">No exceptions yet.</p>
          )}
        </GlassCard>
      </div>

    </>
  );
}
