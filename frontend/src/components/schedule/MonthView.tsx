import { useState } from 'react';
import { motion } from 'framer-motion';
import type { ISODate, SlotRef, StudySession } from '@/types';
import type { Derived } from '@/hooks/useDerived';
import { addDays, formatWeekday, parseISODate, startOfWeek } from '@/lib/date';
import { alpha, cn } from '@/lib/utils';
import { REFLOW_SPRING } from './SessionBlock';

interface Props {
  d: Derived;
  anchor: ISODate; // any day in the month
  hot: Set<string>;
  onPickDay: (day: ISODate) => void;
  onMove: (id: string, to: SlotRef) => void;
  onOpen: (s: StudySession, anchor: DOMRect) => void;
}

/** Month grid: session chips per day (drag a chip to another day, keeping its start time). */
export function MonthView({ d, anchor, hot, onPickDay, onMove, onOpen }: Props) {
  const a = parseISODate(anchor);
  const first = `${a.getFullYear()}-${String(a.getMonth() + 1).padStart(2, '0')}-01`;
  const gridStart = startOfWeek(first);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const month = a.getMonth();
  const [over, setOver] = useState<ISODate | null>(null);
  const byDay = new Map<ISODate, StudySession[]>();
  for (const s of d.snapshot.sessions) (byDay.get(s.date) ?? byDay.set(s.date, []).get(s.date)!).push(s);
  const examDays = new Map(d.deadlines.map((x) => [x.date.slice(0, 10), x]));

  return (
    <div role="grid" aria-label="Month calendar">
      <div className="grid grid-cols-7 gap-1.5 pb-2" role="row">
        {cells.slice(0, 7).map((c) => (
          <div key={c} role="columnheader" className="text-center font-mono text-[10px] uppercase tracking-widest text-faint">
            {formatWeekday(c)}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {cells.map((day) => {
          const inMonth = parseISODate(day).getMonth() === month;
          const list = (byDay.get(day) ?? []).sort((x, y) => x.start.localeCompare(y.start));
          const deadline = examDays.get(day);
          const isToday = day === d.today;
          return (
            <div
              key={day}
              role="gridcell"
              onDragOver={(e) => {
                if (day < d.today) return;
                e.preventDefault();
                setOver(day);
              }}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                const id = e.dataTransfer.getData('text/plain');
                const s = d.snapshot.sessions.find((x) => x.id === id);
                if (s) onMove(id, { date: day, start: s.start });
              }}
              className={cn(
                'min-h-[92px] rounded-xl border p-1.5 transition-colors sm:min-h-[108px]',
                inMonth ? 'border-line/10 bg-line/[0.03]' : 'border-transparent opacity-40',
                over === day && 'border-cyan bg-cyan/10',
                isToday && 'border-violet/50',
              )}
            >
              <button onClick={() => onPickDay(day)} className="mb-1 flex w-full items-center justify-between rounded-md px-1 text-left" aria-label={`Open ${day}`}>
                <span className={cn('font-mono text-xs', isToday ? 'font-bold text-cyan' : 'text-muted')}>{parseISODate(day).getDate()}</span>
                {deadline && (
                  <span className={cn('h-1.5 w-1.5 rounded-full', deadline.kind === 'exam' ? 'bg-amber shadow-[0_0_6px_rgb(var(--amber))]' : 'bg-cyan')} title={deadline.title} />
                )}
              </button>
              <div className="flex flex-col gap-0.5">
                {list.slice(0, 4).map((s) => {
                  const c = d.subjectById.get(s.subjectId)?.color ?? '#888';
                  return (
                    <motion.div key={s.id} layoutId={`m-${s.id}`} transition={{ layout: REFLOW_SPRING }}>
                      <div
                        draggable={s.status === 'planned'}
                        onDragStart={(e) => e.dataTransfer.setData('text/plain', s.id)}
                        role="button"
                        tabIndex={0}
                        onClick={(e) => onOpen(s, e.currentTarget.getBoundingClientRect())}
                        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpen(s, e.currentTarget.getBoundingClientRect()))}
                        className={cn(
                          'cursor-pointer truncate rounded-md px-1.5 py-0.5 text-[11px] font-medium text-ink',
                          s.status === 'planned' && 'cursor-grab',
                          s.status === 'missed' && 'line-through opacity-50',
                          hot.has(s.id) && 'ring-2 ring-cyan',
                        )}
                        style={{ background: alpha(c, 0.25), borderLeft: `2px solid ${c}` }}
                        title={d.topicById.get(s.topicId)?.name}
                      >
                        {d.topicById.get(s.topicId)?.name}
                      </div>
                    </motion.div>
                  );
                })}
                {list.length > 4 && <span className="px-1 text-[10px] text-faint">+{list.length - 4} more</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
