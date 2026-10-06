import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, CalendarClock, Check, Lock, Play, RotateCcw, SkipForward, X } from 'lucide-react';
import type { StudySession } from '@/types';
import type { Derived } from '@/hooks/useDerived';
import { useDataStore } from '@/store/useDataStore';
import { useUIStore } from '@/store/useUIStore';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Form';
import { StartTimeSelect } from '@/components/hours/WeeklyHoursEditor';
import { formatDuration, formatFullDate, formatRange, nowMinutes, relativeDay, timeToMin, todayISO } from '@/lib/date';
import { useMedia } from '@/hooks/useMotion';

const W = 320;

/**
 * Small popover next to a calendar block: Start · Mark done · Skip · Reschedule.
 * On phones it becomes a bottom sheet. Esc or clicking outside closes it.
 */
export function SessionPopover({ d, session, anchor, onClose }: { d: Derived; session: StudySession | null; anchor: DOMRect | null; onClose: () => void }) {
  const setStatus = useDataStore((s) => s.setSessionStatus);
  const move = useDataStore((s) => s.moveSession);
  const pending = useDataStore((s) => (session ? s.pending[`session:${session.id}`] : false));
  const openFocus = useUIStore((s) => s.openFocus);
  const mobile = !useMedia('(min-width: 640px)');
  const [view, setView] = useState<'actions' | 'reschedule' | 'early'>('actions');
  const [to, setTo] = useState({ date: '', start: '17:00' });
  const [minutes, setMinutes] = useState('25');
  const [error, setError] = useState<string>();
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: 0, top: 0 });

  useEffect(() => {
    if (!session) return;
    setView('actions');
    setError(undefined);
    setTo({ date: session.date < todayISO() ? todayISO() : session.date, start: session.start });
    setMinutes(String(Math.max(5, Math.round(session.durationMin / 2))));
  }, [session]);

  // Position beside the block, kept inside the viewport.
  useLayoutEffect(() => {
    if (!anchor || mobile) return;
    const h = panel.current?.offsetHeight ?? 260;
    const right = anchor.right + 12 + W < window.innerWidth;
    const left = right ? anchor.right + 12 : Math.max(12, anchor.left - W - 12);
    const top = Math.min(Math.max(84, anchor.top), window.innerHeight - h - 12);
    setPos({ left, top });
  }, [anchor, mobile, view, session]);

  useEffect(() => {
    if (!session) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const onDown = (e: MouseEvent) => !panel.current?.contains(e.target as Node) && onClose();
    window.addEventListener('keydown', onKey);
    const t = window.setTimeout(() => {
      document.addEventListener('mousedown', onDown);
      panel.current?.querySelector<HTMLElement>('button')?.focus();
    }, 0);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [session, onClose]);

  const act = async (fn: () => Promise<unknown>) => {
    await fn();
    onClose();
  };

  const body = session && (() => {
    const topic = d.topicById.get(session.topicId);
    const subject = d.subjectById.get(session.subjectId);
    const open = session.status === 'planned' || session.status === 'in_progress';
    const replacement = session.rescheduledTo ? d.snapshot.sessions.find((x) => x.id === session.rescheduledTo) : undefined;
    return (
      <>
        <div className="mb-4 flex items-start gap-3">
          <span className="mt-1 h-10 w-1.5 shrink-0 rounded-full" style={{ background: subject?.color }} aria-hidden />
          <div className="min-w-0 flex-1">
            <p id="pop-title" className="font-display text-base font-semibold text-ink">
              {topic?.name}
            </p>
            <p className="text-xs text-muted">
              {subject?.name} · {relativeDay(session.date)}, {formatRange(session.start, session.durationMin)}
            </p>
            {session.locked && session.status === 'planned' && (
              <p className="mt-1 flex items-center gap-1 text-[11px] text-faint">
                <Lock className="h-3 w-3" aria-hidden /> Pinned — you placed it here, so Orbit won't move it.
              </p>
            )}
            {session.atRisk && <p className="mt-1 text-[11px] text-amber">Lands after its deadline.</p>}
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-faint hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        </div>

        {!open && (
          <div className="space-y-3 text-sm text-muted">
            {session.status === 'completed' && <p>Done — {formatDuration(session.actualMin ?? session.durationMin)} studied.</p>}
            {session.status === 'missed' && <p>Skipped. {replacement ? `Moved to ${relativeDay(replacement.date)}, ${formatRange(replacement.start, replacement.durationMin)}.` : 'Its time went back into your plan.'}</p>}
            {session.status === 'completed' && (
              <Button variant="ghost" size="sm" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={() => act(() => setStatus(session.id, 'planned'))}>
                Undo done
              </Button>
            )}
          </div>
        )}

        {open && view === 'actions' && (
          <div className="grid grid-cols-2 gap-2">
            <Button icon={<Play className="h-4 w-4" fill="currentColor" />} onClick={() => { openFocus(session.id); onClose(); }}>
              Start
            </Button>
            <Button variant="secondary" icon={<Check className="h-4 w-4 text-mint" />} loading={pending} onClick={() => act(() => setStatus(session.id, 'completed'))}>
              Mark done
            </Button>
            <Button variant="secondary" icon={<SkipForward className="h-4 w-4" />} disabled={pending} onClick={() => act(() => setStatus(session.id, 'missed'))} title="Orbit moves it to the next free slot before its deadline">
              Skip
            </Button>
            <Button variant="secondary" icon={<CalendarClock className="h-4 w-4" />} disabled={session.status !== 'planned'} onClick={() => setView('reschedule')}>
              Reschedule
            </Button>
            <button onClick={() => setView('early')} className="col-span-2 mt-1 text-left text-xs text-cyan hover:underline">
              Finished early? Log the minutes you studied
            </button>
          </div>
        )}

        {open && view === 'reschedule' && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!to.date) return setError('Pick a day.');
              if (to.date < todayISO() || (to.date === todayISO() && timeToMin(to.start) < nowMinutes())) return setError('Pick a time that has not passed yet.');
              void act(() => move(session.id, to));
            }}
          >
            <p className="text-xs text-muted">Pick a new time. The session is pinned there and the rest of your plan adjusts around it.</p>
            <label className="block text-xs font-medium text-muted">
              Day
              <Input type="date" min={todayISO()} value={to.date} onChange={(e) => setTo({ ...to, date: e.target.value })} className="mt-1" />
            </label>
            <label className="block text-xs font-medium text-muted">
              Start time
              <div className="mt-1">
                <StartTimeSelect value={to.start} label="New start time" onChange={(start) => setTo({ ...to, start })} />
              </div>
            </label>
            {to.date && <p className="text-xs text-ink">{formatFullDate(to.date)}, {formatRange(to.start, session.durationMin)}</p>}
            {error && <p className="text-xs text-rose" role="alert">{error}</p>}
            <div className="flex justify-between gap-2">
              <Button type="button" variant="ghost" size="sm" icon={<ArrowLeft className="h-3.5 w-3.5" />} onClick={() => setView('actions')}>
                Back
              </Button>
              <Button type="submit" size="sm" loading={pending}>
                Move session
              </Button>
            </div>
          </form>
        )}

        {open && view === 'early' && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const m = Number(minutes);
              if (!(m > 0 && m < session.durationMin)) return setError(`Enter between 1 and ${session.durationMin - 1} minutes.`);
              void act(() => setStatus(session.id, 'completed', m));
            }}
          >
            <label className="block text-xs font-medium text-muted">
              Minutes you studied (planned {session.durationMin})
              <Input type="number" min={1} max={session.durationMin - 1} value={minutes} onChange={(e) => setMinutes(e.target.value)} className="mt-1" />
            </label>
            <p className="text-xs text-muted">Orbit will pull later sessions into the time you freed up.</p>
            {error && <p className="text-xs text-rose" role="alert">{error}</p>}
            <div className="flex justify-between gap-2">
              <Button type="button" variant="ghost" size="sm" icon={<ArrowLeft className="h-3.5 w-3.5" />} onClick={() => setView('actions')}>
                Back
              </Button>
              <Button type="submit" size="sm" loading={pending}>
                Log &amp; mark done
              </Button>
            </div>
          </form>
        )}
      </>
    );
  })();

  return createPortal(
    <AnimatePresence>
      {session && (
        <motion.div
          ref={panel}
          role="dialog"
          aria-labelledby="pop-title"
          initial={mobile ? { y: '100%' } : { opacity: 0, scale: 0.96 }}
          animate={mobile ? { y: 0 } : { opacity: 1, scale: 1 }}
          exit={mobile ? { y: '100%' } : { opacity: 0, scale: 0.96 }}
          transition={{ duration: 0.16 }}
          className={mobile ? 'glass-strong fixed inset-x-0 bottom-0 z-[75] rounded-b-none rounded-t-3xl p-5 pb-8' : 'glass-strong fixed z-[75] rounded-2xl p-5 shadow-2xl'}
          style={mobile ? undefined : { left: pos.left, top: pos.top, width: W }}
        >
          {body}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
