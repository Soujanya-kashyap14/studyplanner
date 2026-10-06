import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { AnimatePresence } from 'framer-motion';
import type { ISODate, SlotRef, StudySession } from '@/types';
import type { Derived } from '@/hooks/useDerived';
import { dayWindow } from '@/utils/scheduler';
import { bufferDays } from '@/utils/insights';
import { formatHour, formatMinutes, formatMonthDay, formatWeekday, minToTime, nowMinutes, timeToMin } from '@/lib/date';
import { useTick } from '@/hooks/useMotion';
import { cn } from '@/lib/utils';
import { SessionBlock } from './SessionBlock';

const HOUR_PX = 64;
const SNAP = 15;
const FIRST_HOUR = 6; // the grid always spans 6 am → midnight; the body scrolls
const LAST_HOUR = 24;

interface Props {
  d: Derived;
  days: ISODate[];
  hot: Set<string>;
  focusId: string | null;
  onOpen: (s: StudySession, anchor: DOMRect) => void;
  onMove: (id: string, to: SlotRef) => void;
}

/**
 * Time-grid calendar (1–7 day columns). The day headers stay put; the hour grid
 * is the page's only inner scroll area (600px tall) and opens at the current time.
 */
export function WeekView({ d, days, hot, focusId, onOpen, onMove }: Props) {
  useTick(60_000);
  const buffers = useMemo(() => bufferDays(d.snapshot.exams, d.snapshot.availability, d.today), [d]);
  const [dragging, setDragging] = useState<StudySession | null>(null);
  const [preview, setPreview] = useState<{ date: ISODate; min: number } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  const sessionsByDay = useMemo(() => {
    const m = new Map<ISODate, StudySession[]>();
    for (const day of days) m.set(day, []);
    for (const s of d.snapshot.sessions) m.get(s.date)?.push(s);
    return m;
  }, [d.snapshot.sessions, days]);

  // Earliest sessions might start before 6 am; extend the grid if so.
  const startH = useMemo(() => {
    let lo = FIRST_HOUR * 60;
    for (const day of days) for (const s of sessionsByDay.get(day) ?? []) lo = Math.min(lo, timeToMin(s.start));
    return Math.floor(lo / 60);
  }, [days, sessionsByDay]);
  const endH = LAST_HOUR;
  const top = (min: number) => ((min - startH * 60) / 60) * HOUR_PX;
  const height = (endH - startH) * HOUR_PX;
  const nowMin = nowMinutes();
  const showsToday = days.includes(d.today);

  // Open at "now" when today is visible, otherwise at the first session / study window.
  const dayKey = days.join(',');
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    let target: number;
    if (showsToday) target = nowMin - 60;
    else {
      const firsts = days.flatMap((day) => (sessionsByDay.get(day) ?? []).map((s) => timeToMin(s.start)));
      const windows = days.map((day) => dayWindow(day, d.snapshot.availability)?.start ?? 24 * 60);
      target = Math.min(...firsts, ...windows) - 30;
      if (!Number.isFinite(target) || target >= 24 * 60) target = 16 * 60;
    }
    el.scrollTo({ top: Math.max(0, top(target)), behavior: 'smooth' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayKey]);

  const minuteFromEvent = (e: DragEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const raw = startH * 60 + ((e.clientY - rect.top) / HOUR_PX) * 60;
    return Math.max(startH * 60, Math.min(endH * 60 - SNAP, Math.round((raw - 10) / SNAP) * SNAP));
  };

  const cols = { gridTemplateColumns: `56px repeat(${days.length}, minmax(0, 1fr))` };
  const minWidth = days.length > 1 ? 'min-w-[720px]' : 'min-w-0';

  return (
    <div className="overflow-x-auto" role="region" aria-label={days.length > 1 ? 'Week calendar' : 'Day calendar'}>
      <div className={minWidth}>
        {/* Day headers (fixed) */}
        <div className="grid border-b border-line/10 pb-3" style={cols}>
          <div />
          {days.map((day) => {
            const isToday = day === d.today;
            const w = dayWindow(day, d.snapshot.availability);
            const override = d.snapshot.availability.overrides.find((o) => o.date === day);
            return (
              <div key={day} className="px-1 text-center">
                <p className={cn('text-xs font-medium', isToday ? 'text-cyan' : 'text-muted')}>{formatWeekday(day)}</p>
                <p className={cn('mx-auto mt-1 grid h-8 w-8 place-items-center rounded-full font-display text-sm font-semibold', isToday ? 'bg-[linear-gradient(135deg,rgb(var(--violet)),rgb(var(--cyan)))] text-on-accent' : 'text-ink')}>
                  {formatMonthDay(day).replace(/\D+/g, '')}
                </p>
                <p
                  className={cn('mt-1 truncate text-[11px]', buffers.has(day) && w ? 'text-cyan' : 'text-faint')}
                  title={override?.note ?? (buffers.has(day) && w ? 'Buffer day before an exam: kept free of new work so missed sessions can catch up here' : w ? 'Study hours you set for this day in My Study Hours' : undefined)}
                >
                  {override?.note ?? (w ? `${((w.end - w.start) / 60).toFixed(1).replace('.0', '')}h ${buffers.has(day) ? 'buffer' : 'study'}` : 'day off')}
                </p>
              </div>
            );
          })}
        </div>

        {/* Hour grid — the only inner scroll area */}
        <div ref={scroller} className="h-[600px] overflow-y-auto" tabIndex={0} aria-label="Scrollable hours">
          <div className="grid pt-2" style={cols}>
            <div className="relative" style={{ height }}>
              {Array.from({ length: endH - startH }, (_, i) => (
                <span key={i} className="absolute right-2 -translate-y-1/2 text-[11px] text-faint" style={{ top: i * HOUR_PX }}>
                  {i === 0 ? '' : formatHour(startH + i)}
                </span>
              ))}
            </div>

            {days.map((day) => {
              const w = dayWindow(day, d.snapshot.availability, d.todayMood, d.today);
              const isToday = day === d.today;
              const past = day < d.today;
              return (
                <div
                  key={day}
                  className={cn('relative border-l border-line/10', past && 'bg-line/[0.02]')}
                  style={{ height }}
                  onDragOver={(e) => {
                    if (!dragging || past) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    const min = minuteFromEvent(e);
                    if (preview?.date !== day || preview.min !== min) setPreview({ date: day, min });
                  }}
                  onDragLeave={() => setPreview(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    const id = e.dataTransfer.getData('text/plain');
                    const min = minuteFromEvent(e);
                    setPreview(null);
                    setDragging(null);
                    if (id) onMove(id, { date: day, start: minToTime(min) });
                  }}
                >
                  {Array.from({ length: endH - startH }, (_, i) => (
                    <span key={i} aria-hidden className="absolute inset-x-0 border-t border-line/[0.07]" style={{ top: i * HOUR_PX }} />
                  ))}
                  {w && <div aria-hidden className="absolute inset-x-0.5 rounded-lg border border-dashed border-violet/20 bg-violet/[0.06]" style={{ top: top(w.start), height: ((w.end - w.start) / 60) * HOUR_PX }} />}
                  {isToday && nowMin / 60 >= startH && (
                    <div aria-hidden className="absolute inset-x-0 z-[2] flex items-center" style={{ top: top(nowMin) }}>
                      <span className="-ml-1 h-2 w-2 rounded-full bg-amber shadow-[0_0_8px_rgb(var(--amber))]" />
                      <span className="h-px flex-1 bg-amber/80" />
                    </div>
                  )}
                  {preview && preview.date === day && dragging && (
                    <div aria-hidden className="absolute inset-x-1 z-[4] rounded-xl border-2 border-dashed border-cyan bg-cyan/10" style={{ top: top(preview.min), height: (dragging.durationMin / 60) * HOUR_PX }}>
                      <span className="absolute -top-6 left-1 whitespace-nowrap rounded bg-cyan px-1.5 py-0.5 text-[11px] font-bold text-on-accent">{formatMinutes(preview.min)}</span>
                    </div>
                  )}
                  <AnimatePresence>
                    {(sessionsByDay.get(day) ?? []).map((s) => (
                      <SessionBlock
                        key={s.id}
                        s={s}
                        d={d}
                        hot={hot.has(s.id) || focusId === s.id}
                        dimmed={!!focusId && focusId !== s.id}
                        style={{ top: top(timeToMin(s.start)) + 1, height: Math.max(26, (s.durationMin / 60) * HOUR_PX - 3) }}
                        compact={s.durationMin < 30}
                        onOpen={onOpen}
                        onDragStart={past ? undefined : setDragging}
                        onDragEnd={() => {
                          setDragging(null);
                          setPreview(null);
                        }}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
