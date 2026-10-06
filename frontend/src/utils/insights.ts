/**
 * ORBIT INSIGHTS — pure functions that learn from the student's history.
 * No React, no I/O: shared by the browser and the API like the scheduler.
 *
 * - Peak hours: which part of the day the student actually finishes sessions in.
 * - Buffer days: the day before each exam is kept free of new work for catch-up.
 * - Burnout guard: repeated "drained" check-ins or a long run of heavy days earn a rest day.
 */
import type { Availability, AvailabilityOverride, Exam, ISODate, MoodCheckIn, StudySession } from '@/types';
import { addDays, parseISODate, timeToMin } from '@/lib/date';
import { sum } from '@/lib/utils';

/* =========================================================================
 * Peak hours
 * ========================================================================= */

export type DayPart = 'morning' | 'afternoon' | 'evening' | 'night';

export const DAY_PARTS: { part: DayPart; label: string; from: number; to: number }[] = [
  { part: 'morning', label: 'Morning (before 12 pm)', from: 0, to: 12 * 60 },
  { part: 'afternoon', label: 'Afternoon (12–5 pm)', from: 12 * 60, to: 17 * 60 },
  { part: 'evening', label: 'Evening (5–9 pm)', from: 17 * 60, to: 21 * 60 },
  { part: 'night', label: 'Night (after 9 pm)', from: 21 * 60, to: 24 * 60 },
];

/** Sessions needed in a part of the day before its completion rate is trusted. */
const MIN_SAMPLES = 4;

export interface PartStats {
  part: DayPart;
  label: string;
  completed: number;
  missed: number;
  /** completed ÷ (completed + missed), or null with too little data. */
  rate: number | null;
}

export interface PeakHours {
  parts: PartStats[];
  /** Best part of the day, when the data clearly shows one. */
  peak: PartStats | null;
  /** Weakest part with enough data. */
  low: PartStats | null;
}

const partOf = (start: string): DayPart => {
  const m = timeToMin(start);
  return DAY_PARTS.find((p) => m >= p.from && m < p.to)?.part ?? 'night';
};

/**
 * Completion rate per part of the day, from finished vs. missed sessions.
 * A peak is reported only when it beats the next-best part by 10+ points.
 */
export function peakHours(sessions: StudySession[]): PeakHours {
  const parts: PartStats[] = DAY_PARTS.map(({ part, label }) => {
    const xs = sessions.filter((s) => (s.status === 'completed' || s.status === 'missed') && partOf(s.start) === part);
    const completed = xs.filter((s) => s.status === 'completed').length;
    const missed = xs.length - completed;
    return { part, label, completed, missed, rate: xs.length >= MIN_SAMPLES ? completed / xs.length : null };
  });
  const rated = parts.filter((p) => p.rate !== null).sort((a, b) => b.rate! - a.rate!);
  const peak = rated.length >= 2 && rated[0].rate! - rated[1].rate! >= 0.1 ? rated[0] : null;
  const low = rated.length >= 2 ? rated[rated.length - 1] : null;
  return { parts, peak, low };
}

/** Start/end minutes of a part of the day. */
export const partRange = (part: DayPart) => DAY_PARTS.find((p) => p.part === part)!;

/* =========================================================================
 * Buffer days
 * ========================================================================= */

/**
 * The day before each upcoming exam, kept free of newly generated work so missed
 * sessions have somewhere to land. Only days after today qualify (an exam
 * tomorrow still gets today's study time).
 */
export function bufferDays(exams: Exam[], availability: Availability, today: ISODate): Set<ISODate> {
  if (availability.bufferBeforeExams === false) return new Set();
  return new Set(
    exams
      .map((e) => addDays(e.date.slice(0, 10), -1))
      .filter((d) => d > today),
  );
}

/* =========================================================================
 * Burnout guard
 * ========================================================================= */

export const BURNOUT_NOTE = 'Rest day — burnout guard';
/** A day with at least this much finished study counts as heavy. */
const HEAVY_DAY_MIN = 180;

export interface RestDayPlan {
  override: AvailabilityOverride;
  /** Plain-language reasons, shown to the student. */
  reasons: string[];
}

/**
 * Decide whether today's check-in should earn a rest day, and which day.
 * Triggers (any one):
 *  - 2+ "drained" check-ins in the last 4 days (today included)
 *  - "drained" today after studying 6+ days in a row
 *  - 5+ heavy days (3h+ finished) in a row
 * Never more than one guard rest day per week, never on an exam day or the day before one.
 */
export function planRestDay(args: {
  today: ISODate;
  mood: MoodCheckIn['mood'];
  moods: MoodCheckIn[];
  sessions: StudySession[];
  exams: Exam[];
  availability: Availability;
}): RestDayPlan | null {
  const { today, mood, moods, sessions, exams, availability } = args;
  if (availability.burnoutGuard === false) return null;

  const recentGuard = availability.overrides.some((o) => o.source === 'burnout_guard' && o.date >= addDays(today, -6) && o.date <= addDays(today, 7));
  if (recentGuard) return null;

  const window4 = addDays(today, -3);
  const drained = moods.filter((m) => m.date >= window4 && m.date < today && m.mood === 'drained').length + (mood === 'drained' ? 1 : 0);

  const minutesOn = (d: ISODate) => sum(sessions.filter((s) => s.date === d && s.status === 'completed').map((s) => s.actualMin ?? s.durationMin));
  let streak = 0;
  for (let d = minutesOn(today) > 0 ? today : addDays(today, -1); minutesOn(d) > 0 && streak < 60; d = addDays(d, -1)) streak++;
  let heavy = 0;
  for (let d = minutesOn(today) >= HEAVY_DAY_MIN ? today : addDays(today, -1); minutesOn(d) >= HEAVY_DAY_MIN && heavy < 60; d = addDays(d, -1)) heavy++;

  const reasons: string[] = [];
  if (drained >= 2) reasons.push(`You've felt drained ${drained} times in the last 4 days.`);
  if (mood === 'drained' && streak >= 6) reasons.push(`You've studied ${streak} days in a row without a break.`);
  if (heavy >= 5) reasons.push(`${heavy} heavy days in a row (3h+ each).`);
  if (!reasons.length) return null;

  const examDays = new Set(exams.map((e) => e.date.slice(0, 10)));
  const nearExam = (d: ISODate) => examDays.has(d) || examDays.has(addDays(d, 1));
  const weekday = (d: ISODate) => parseISODate(d).getDay();
  const hoursOn = (d: ISODate) => (availability.overrides.find((o) => o.date === d) ?? availability.weekly.find((w) => w.weekday === weekday(d)))?.hours ?? 0;

  for (let i = 1; i <= 4; i++) {
    const d = addDays(today, i);
    if (nearExam(d) || hoursOn(d) <= 0) continue;
    return { override: { date: d, hours: 0, startTime: '09:00', note: BURNOUT_NOTE, source: 'burnout_guard' }, reasons };
  }
  return null;
}
