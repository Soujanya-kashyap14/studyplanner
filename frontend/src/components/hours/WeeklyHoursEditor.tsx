import { Minus, Plus, AlertTriangle } from 'lucide-react';
import type { Availability, DailyAvailability } from '@/types';
import { formatTime, minToTime, timeToMin } from '@/lib/date';
import { cn } from '@/lib/utils';

export const WEEK_ORDER: { weekday: number; label: string; short: string }[] = [
  { weekday: 1, label: 'Monday', short: 'Mon' },
  { weekday: 2, label: 'Tuesday', short: 'Tue' },
  { weekday: 3, label: 'Wednesday', short: 'Wed' },
  { weekday: 4, label: 'Thursday', short: 'Thu' },
  { weekday: 5, label: 'Friday', short: 'Fri' },
  { weekday: 6, label: 'Saturday', short: 'Sat' },
  { weekday: 0, label: 'Sunday', short: 'Sun' },
];

/** Start times offered: 5:00 am → 11:30 pm in 30-minute steps. */
export const START_OPTIONS = Array.from({ length: 38 }, (_, i) => minToTime(5 * 60 + i * 30));

const DAY_FROM = 5 * 60; // preview bar spans 5 am → midnight
const DAY_SPAN = 19 * 60;
const MAX_HOURS = 12;
const DEFAULT_ON_HOURS = 2;

export const weeklyTotal = (a: Availability) => a.weekly.reduce((s, w) => s + w.hours, 0);
export const endsAfterMidnight = (w: Pick<DailyAvailability, 'startTime' | 'hours'>) => w.hours > 0 && timeToMin(w.startTime) + w.hours * 60 > 24 * 60;
const fmtHours = (h: number) => `${Number.isInteger(h) ? h : h.toFixed(1)}h`;

/** Duration stepper: − / + in half-hour steps. */
export function DurationStepper({ value, onChange, label, min = 0.5, max = MAX_HOURS }: { value: number; onChange: (v: number) => void; label: string; min?: number; max?: number }) {
  return (
    <div className="inline-flex items-center rounded-xl border border-line/15 bg-glass/[var(--glass-alpha)]" role="group" aria-label={label}>
      <button type="button" onClick={() => onChange(Math.max(min, value - 0.5))} disabled={value <= min} aria-label={`${label}: 30 minutes less`} className="grid h-10 w-9 place-items-center rounded-l-xl text-muted hover:bg-line/[0.06] hover:text-ink disabled:opacity-30">
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span className="w-12 text-center font-mono text-sm text-ink" aria-live="polite">
        {fmtHours(value)}
      </span>
      <button type="button" onClick={() => onChange(Math.min(max, value + 0.5))} disabled={value >= max} aria-label={`${label}: 30 minutes more`} className="grid h-10 w-9 place-items-center rounded-r-xl text-muted hover:bg-line/[0.06] hover:text-ink disabled:opacity-30">
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/** Start-time dropdown (12-hour labels). Keeps an off-grid saved value selectable instead of silently changing it. */
export function StartTimeSelect({ value, onChange, label, disabled }: { value: string; onChange: (v: string) => void; label: string; disabled?: boolean }) {
  const options = START_OPTIONS.includes(value) ? START_OPTIONS : [...START_OPTIONS, value].sort();
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      disabled={disabled}
      className="h-10 rounded-xl border border-line/15 bg-glass/[var(--glass-alpha)] px-3 text-sm text-ink focus:border-cyan/60 focus:outline-none focus:ring-2 focus:ring-cyan/40 disabled:opacity-40"
    >
      {options.map((t) => (
        <option key={t} value={t} className="bg-[rgb(var(--bg-1))]">
          {formatTime(t)}
        </option>
      ))}
    </select>
  );
}

/** Read-only bar showing where the window sits in the day, with the range as text beside it. */
export function WindowPreview({ startTime, hours }: { startTime: string; hours: number }) {
  const start = timeToMin(startTime);
  const left = Math.max(0, ((start - DAY_FROM) / DAY_SPAN) * 100);
  const width = Math.min(100 - left, ((hours * 60) / DAY_SPAN) * 100);
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="relative h-2 w-28 shrink-0 overflow-hidden rounded-full bg-line/10 sm:w-36" aria-hidden>
        {hours > 0 && <div className="absolute inset-y-0 rounded-full bg-[linear-gradient(90deg,rgb(var(--violet)),rgb(var(--cyan)))]" style={{ left: `${left}%`, width: `${width}%` }} />}
      </div>
      <span className={cn('truncate text-xs', hours > 0 ? 'text-ink' : 'text-faint')}>
        {hours > 0 ? `${formatTime(startTime)} – ${formatTime(minToTime(Math.min(24 * 60 - 1, start + hours * 60)))}` : 'Day off'}
      </span>
    </div>
  );
}

/** Small on/off switch used per row. */
function DayToggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className={cn('relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors', on ? 'border-violet/50 bg-violet/80' : 'border-line/15 bg-line/10')}>
      <span className={cn('h-4 w-4 rounded-full shadow transition-transform', on ? 'translate-x-6 bg-white' : 'translate-x-1 bg-muted')} />
    </button>
  );
}

/**
 * One row per day: [on/off] [Day] [Start time] [Duration −/+] [preview + "6:00 pm – 7:30 pm"],
 * plus quick presets and a live weekly total.
 */
export function WeeklyHoursEditor({ value, onChange }: { value: Availability; onChange: (a: Availability) => void }) {
  const get = (weekday: number): DailyAvailability => value.weekly.find((w) => w.weekday === weekday) ?? { weekday, hours: 0, startTime: '17:00' };
  const setDay = (weekday: number, p: Partial<DailyAvailability>) => {
    const exists = value.weekly.some((w) => w.weekday === weekday);
    const weekly = exists ? value.weekly.map((w) => (w.weekday === weekday ? { ...w, ...p } : w)) : [...value.weekly, { ...get(weekday), ...p }];
    onChange({ ...value, weekly });
  };
  const setAll = (fn: (w: DailyAvailability) => DailyAvailability) => onChange({ ...value, weekly: WEEK_ORDER.map(({ weekday }) => fn(get(weekday))) });
  const monday = get(1);
  const total = weeklyTotal(value);

  const presets: { label: string; hint: string; apply: () => void }[] = [
    { label: 'Same for all weekdays', hint: "Copy Monday to Tue–Fri", apply: () => setAll((w) => (w.weekday >= 1 && w.weekday <= 5 ? { ...w, hours: monday.hours, startTime: monday.startTime } : w)) },
    { label: 'Copy Monday to all days', hint: 'Every day like Monday', apply: () => setAll((w) => ({ ...w, hours: monday.hours, startTime: monday.startTime })) },
    { label: 'Light week', hint: '1h every day', apply: () => setAll((w) => ({ ...w, hours: 1 })) },
    { label: 'Exam week', hint: '4h every day', apply: () => setAll((w) => ({ ...w, hours: 4, startTime: timeToMin(w.startTime) > 19 * 60 ? '16:00' : w.startTime })) },
  ];

  return (
    <div>
      <div className="mb-5 flex flex-wrap gap-2" aria-label="Quick presets">
        {presets.map((p) => (
          <button key={p.label} type="button" onClick={p.apply} title={p.hint} className="rounded-xl border border-line/15 bg-line/[0.03] px-3 py-2 text-left text-xs transition-colors hover:border-violet/40 hover:bg-violet/10">
            <span className="block font-semibold text-ink">{p.label}</span>
            <span className="block text-[11px] text-muted">{p.hint}</span>
          </button>
        ))}
      </div>

      <ul className="divide-y divide-line/[0.08]">
        {WEEK_ORDER.map(({ weekday, label, short }) => {
          const w = get(weekday);
          const on = w.hours > 0;
          const late = endsAfterMidnight(w);
          return (
            <li key={weekday} className="py-3">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                <div className="flex w-36 items-center gap-3">
                  <DayToggle on={on} label={`Study on ${label}`} onChange={(v) => setDay(weekday, { hours: v ? DEFAULT_ON_HOURS : 0 })} />
                  <span className={cn('text-sm font-medium', on ? 'text-ink' : 'text-faint')}>
                    <span className="sm:hidden">{short}</span>
                    <span className="hidden sm:inline">{label}</span>
                  </span>
                </div>
                {on ? (
                  <>
                    <StartTimeSelect value={w.startTime} label={`${label} start time`} onChange={(t) => setDay(weekday, { startTime: t })} />
                    <DurationStepper value={w.hours} label={`${label} study time`} onChange={(h) => setDay(weekday, { hours: h })} />
                  </>
                ) : (
                  <span className="text-xs text-faint">Not studying — turn on to add hours</span>
                )}
                <div className="ml-auto min-w-0">
                  <WindowPreview startTime={w.startTime} hours={w.hours} />
                </div>
              </div>
              {late && (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-amber">
                  <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> This runs past midnight — Orbit stops scheduling at 11:59 pm. Start earlier or shorten it.
                </p>
              )}
            </li>
          );
        })}
      </ul>

      <p className={cn('mt-4 rounded-2xl border p-3 text-sm', total > 0 ? 'border-mint/25 bg-mint/[0.05] text-ink' : 'border-amber/35 bg-amber/[0.07] text-amber')} role="status">
        {total > 0 ? (
          <>
            You study <span className="font-mono font-semibold">{fmtHours(total)}</span> per week.
          </>
        ) : (
          'You have 0 study hours — Orbit has nowhere to put sessions. Turn on at least one day.'
        )}
      </p>
    </div>
  );
}
