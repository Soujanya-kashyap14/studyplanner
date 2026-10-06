/**
 * ORBIT SCHEDULER — pure functions, no React, no I/O.
 *
 * Everything here is deterministic given its input, so the whole module can be
 * moved to the backend unchanged (e.g. run in Node, or ported to Python).
 *
 * Concepts
 * --------
 * - lastStudyDay(topic): last calendar day work on a topic is still useful
 *   (the day before its exam / assignment due date).
 * - priorityScore(topic, day): 0..100 weighted mix of urgency, difficulty,
 *   remaining work and subject weakness.
 * - Fixed vs flexible sessions: completed / missed / in-progress / manually
 *   locked / already-started sessions never move. Only future, auto-placed
 *   `planned` sessions are flexible and can be reflowed.
 * - Every mutation returns a ScheduleResult with a change list (what moved,
 *   from where, to where, why) which powers the "What changed" panel.
 */
import type {
  Assignment,
  Availability,
  Exam,
  ID,
  ISODate,
  Mood,
  ReadinessPrediction,
  ScheduleChange,
  ScheduleResult,
  ScheduleWarning,
  SlotRef,
  StudySession,
  Subject,
  Suggestion,
  Topic,
} from '@/types';
import {
  addDays,
  diffDays,
  formatMonthDay,
  formatTime,
  formatWeekday,
  minToTime,
  parseISODate,
  timeToMin,
  toISODate,
} from '@/lib/date';
import { clamp, plural, round1, sum } from '@/lib/utils';
import { bufferDays, partRange, peakHours } from './insights';

/* =========================================================================
 * Inputs
 * ========================================================================= */

export interface SchedulerInput {
  subjects: Subject[];
  topics: Topic[];
  exams: Exam[];
  assignments: Assignment[];
  sessions: StudySession[];
  availability: Availability;
  /** "Today" in the app clock (may be fast-forwarded in demo mode). */
  today: ISODate;
  /** Minutes since midnight right now. Sessions are never placed in the past. */
  nowMin: number;
  sessionMinutes: number;
  breakMinutes: number;
  /** Today's mood check-in, if any. Shapes today's capacity and topic mix. */
  mood?: Mood;
}

export interface GenerateOptions {
  /** Plan today from the start of today's window even if that time has passed (seed data). */
  includePastToday?: boolean;
  /** Hard cap on how far ahead to plan. */
  maxHorizonDays?: number;
}

/** Tunable weights for the priority score (sum to 1). */
export const PRIORITY_WEIGHTS = {
  urgency: 0.35,
  remaining: 0.2,
  importance: 0.2,
  weakness: 0.15,
  difficulty: 0.1,
} as const;

/** Spaced repetition: a finished topic comes back for a short review this many days later. */
export const REVISION_STEPS = [1, 3, 7, 21] as const;
const REVISION_MIN = 25;
/** Priority of a revision by its step: early reviews matter most on the forgetting curve. */
const REVISION_PRIORITY: Record<number, number> = { 1: 85, 3: 75, 7: 65, 21: 55 };

const MIN_CHUNK = 20; // never schedule a session shorter than this (minutes)
const DEFAULT_HORIZON = 28; // topics with no deadline are treated as due in 4 weeks
const MOOD_CAPACITY: Record<Mood, number> = { drained: 0.6, okay: 1, energized: 1.2 };

/* =========================================================================
 * Deadlines, weakness, priority
 * ========================================================================= */

/** Last day a topic can usefully be studied (day before the earliest linked exam/assignment). */
export function lastStudyDay(topic: Topic, exams: Exam[], assignments: Assignment[]): ISODate | undefined {
  const candidates: ISODate[] = [];
  if (topic.deadline) candidates.push(topic.deadline);
  for (const e of exams) {
    if (e.topicIds.includes(topic.id)) candidates.push(addDays(e.date.slice(0, 10), -1));
  }
  for (const a of assignments) {
    if (a.topicId === topic.id && a.status !== 'done') candidates.push(addDays(a.dueDate.slice(0, 10), -1));
  }
  return candidates.sort()[0];
}

/**
 * How much a topic matters for marks, 0..1: its exam weightage relative to the
 * heaviest topic in the same subject, plus a boost when it is frequently asked
 * in previous-year papers. Topics with no weightage info sit in the middle.
 */
export function topicImportance(topic: Topic, siblings: Topic[]): number {
  const max = Math.max(0, ...siblings.map((t) => t.weightage ?? 0));
  const base = max > 0 ? (topic.weightage ?? 0) / max : 0.5;
  return clamp(0.7 * base + (topic.frequentlyAsked ? 0.3 : 0));
}

/** Remaining study minutes for a topic. */
export function remainingMinutes(topic: Topic): number {
  if (topic.status === 'completed') return 0;
  return Math.max(0, Math.round((topic.estimatedHours - topic.completedHours) * 60));
}

/** Progress 0..1 for a list of topics (completed topics count fully). */
export function topicsProgress(topics: Topic[]): number {
  const est = sum(topics.map((t) => t.estimatedHours));
  if (!est) return 0;
  const done = sum(topics.map((t) => (t.status === 'completed' ? t.estimatedHours : Math.min(t.completedHours, t.estimatedHours))));
  return clamp(done / est);
}

export interface SubjectHealth {
  subjectId: ID;
  progress: number; // 0..1
  missRate: number; // 0..1 over the last 14 days
  missed: number;
  completed: number;
  weakness: number; // 0..1, higher = needs more attention
}

export function subjectHealth(subjectId: ID, input: Pick<SchedulerInput, 'topics' | 'sessions' | 'today'>): SubjectHealth {
  const topics = input.topics.filter((t) => t.subjectId === subjectId);
  const progress = topicsProgress(topics);
  const since = addDays(input.today, -14);
  const recent = input.sessions.filter((s) => s.subjectId === subjectId && s.date >= since && s.date <= input.today);
  const missed = recent.filter((s) => s.status === 'missed').length;
  const completed = recent.filter((s) => s.status === 'completed').length;
  const missRate = missed + completed ? missed / (missed + completed) : 0;
  const weakness = clamp(0.55 * (1 - progress) + 0.45 * missRate);
  return { subjectId, progress, missRate, missed, completed, weakness };
}

export interface PriorityBreakdown {
  score: number;
  urgency: number;
  difficulty: number;
  remaining: number;
  weakness: number;
  importance: number;
  daysLeft: number | null;
}

/**
 * Priority score 0..100 for a topic as seen from `onDay`.
 * Weighted mix of: days until deadline, difficulty, remaining progress, subject weakness.
 */
export function priorityScore(
  topic: Topic,
  ctx: { lastDay?: ISODate; weakness: number; onDay: ISODate; importance?: number },
): PriorityBreakdown {
  const importance = ctx.importance ?? 0.35;
  const deadline = ctx.lastDay ?? addDays(ctx.onDay, DEFAULT_HORIZON);
  const daysLeft = diffDays(ctx.onDay, deadline);
  // 0 days left => 1.0 urgency, 21+ days => ~0. Overdue stays at max urgency.
  const urgency = clamp(1 - Math.max(0, daysLeft) / 21);
  const difficulty = (topic.difficulty - 1) / 4;
  const remaining = topic.estimatedHours ? clamp(remainingMinutes(topic) / 60 / topic.estimatedHours) : 0;
  const w = PRIORITY_WEIGHTS;
  const score =
    100 *
    (w.urgency * urgency + w.difficulty * difficulty + w.remaining * remaining + w.weakness * ctx.weakness + w.importance * importance);
  return {
    score: Math.round(score),
    urgency,
    difficulty,
    remaining,
    weakness: ctx.weakness,
    importance,
    daysLeft: ctx.lastDay ? daysLeft : null,
  };
}

/** Rank all open topics by priority (used by "Pending topics" and suggestions). */
export function rankTopics(input: SchedulerInput) {
  const ctx = buildContext(input);
  return input.topics
    .filter((t) => t.status !== 'completed')
    .map((t) => ({ topic: t, lastDay: ctx.lastDay.get(t.id), ...ctx.priority(t.id, input.today) }))
    .sort((a, b) => b.score - a.score);
}

/* =========================================================================
 * Shared context
 * ========================================================================= */

interface Ctx {
  input: SchedulerInput;
  topic: Map<ID, Topic>;
  lastDay: Map<ID, ISODate | undefined>;
  weakness: Map<ID, number>;
  priority: (topicId: ID, onDay: ISODate) => PriorityBreakdown;
}

function buildContext(input: SchedulerInput): Ctx {
  const topic = new Map(input.topics.map((t) => [t.id, t]));
  const lastDay = new Map(input.topics.map((t) => [t.id, lastStudyDay(t, input.exams, input.assignments)]));
  const weakness = new Map(input.subjects.map((s) => [s.id, subjectHealth(s.id, input).weakness]));
  const importance = new Map(input.topics.map((t) => [t.id, topicImportance(t, input.topics.filter((x) => x.subjectId === t.subjectId))]));
  const priority = (topicId: ID, onDay: ISODate) => {
    const t = topic.get(topicId)!;
    return priorityScore(t, { lastDay: lastDay.get(topicId), weakness: weakness.get(t.subjectId) ?? 0, importance: importance.get(topicId), onDay });
  };
  return { input, topic, lastDay, weakness, priority };
}

/** Study window for a day in minutes since midnight, or null when unavailable. */
export function dayWindow(
  date: ISODate,
  availability: Availability,
  mood?: Mood,
  today?: ISODate,
): { start: number; end: number } | null {
  const override = availability.overrides.find((o) => o.date === date);
  const weekday = parseISODate(date).getDay();
  const rule = override ?? availability.weekly.find((w) => w.weekday === weekday);
  if (!rule || rule.hours <= 0) return null;
  let minutes = rule.hours * 60;
  if (mood && date === today) minutes *= MOOD_CAPACITY[mood];
  const start = timeToMin(rule.startTime);
  return { start, end: Math.min(24 * 60 - 1, start + Math.round(minutes)) };
}

/* =========================================================================
 * Planner: mutable working copy used by every reflow operation
 * ========================================================================= */

class Planner {
  sessions = new Map<ID, StudySession>();
  private queues = new Map<ISODate, ID[]>();
  private cursorToday: number;
  reasons = new Map<ID, string>();
  /** Sessions temporarily lifted out of every queue while being re-placed. */
  private floating = new Set<ID>();
  private depth = 0;

  constructor(
    public ctx: Ctx,
    opts: { includePastToday?: boolean } = {},
  ) {
    for (const s of ctx.input.sessions) this.sessions.set(s.id, { ...s });
    const n = ctx.input.nowMin;
    this.cursorToday = opts.includePastToday ? 0 : Math.ceil(n / 5) * 5;
  }

  get today() {
    return this.ctx.input.today;
  }

  /** Flexible = future, planned, not locked, not already started. */
  isFlex(s: StudySession): boolean {
    if (s.status !== 'planned' || s.locked) return false;
    if (s.date > this.today) return true;
    return s.date === this.today && timeToMin(s.start) >= this.cursorToday;
  }

  window(date: ISODate) {
    const { availability, mood } = this.ctx.input;
    return dayWindow(date, availability, mood, this.today);
  }

  queue(date: ISODate): ID[] {
    let q = this.queues.get(date);
    if (!q) {
      q = [...this.sessions.values()]
        .filter((s) => s.date === date && this.isFlex(s))
        .sort((a, b) => timeToMin(a.start) - timeToMin(b.start))
        .map((s) => s.id);
      this.queues.set(date, q);
    }
    return q;
  }

  /** Busy intervals that flexible sessions must flow around (end includes the break). */
  private fixedIntervals(date: ISODate): [number, number][] {
    const brk = this.ctx.input.breakMinutes;
    const flexIds = new Set(this.queue(date));
    return [...this.sessions.values()]
      .filter((s) => s.date === date && !flexIds.has(s.id) && !this.floating.has(s.id) && !(s.status === 'planned' && this.isFlex(s)))
      .map((s): [number, number] => {
        const st = timeToMin(s.start);
        const dur = s.status === 'completed' && s.actualMin ? s.actualMin : s.durationMin;
        return [st, st + dur + brk];
      })
      .sort((a, b) => a[0] - b[0]);
  }

  private startCursor(date: ISODate, w: { start: number }) {
    return date === this.today ? Math.max(w.start, this.cursorToday) : w.start;
  }

  /** Earliest start >= cursor that avoids fixed intervals. */
  private fit(cursor: number, dur: number, fixed: [number, number][]) {
    const brk = this.ctx.input.breakMinutes;
    let start = cursor;
    for (const [fs, fe] of fixed) if (start < fe && start + dur + brk > fs) start = Math.max(start, fe);
    return start;
  }

  /**
   * Lay out a day's flexible queue sequentially in its window.
   * Returns ids that no longer fit (overflow), already removed from the queue.
   */
  pack(date: ISODate): ID[] {
    const q = this.queue(date);
    const w = this.window(date);
    if (!w) {
      this.queues.set(date, []);
      q.forEach((id) => this.floating.add(id));
      return q;
    }
    const brk = this.ctx.input.breakMinutes;
    const fixed = this.fixedIntervals(date);
    let cursor = this.startCursor(date, w);
    const placed: ID[] = [];
    const overflow: ID[] = [];
    for (const id of q) {
      const s = this.sessions.get(id)!;
      if (overflow.length) {
        this.floating.add(id);
        overflow.push(id);
        continue;
      }
      const start = this.fit(cursor, s.durationMin, fixed);
      if (start + s.durationMin > w.end) {
        overflow.push(id);
        this.floating.add(id);
        continue;
      }
      s.date = date;
      s.start = minToTime(start);
      cursor = start + s.durationMin + brk;
      placed.push(id);
      this.floating.delete(id);
    }
    this.queues.set(date, placed);
    return overflow;
  }

  /** Largest block of free minutes left in a day after packing its queue. */
  room(date: ISODate): number {
    const w = this.window(date);
    if (!w) return 0;
    const brk = this.ctx.input.breakMinutes;
    const busy = [
      ...this.fixedIntervals(date),
      ...this.queue(date).map((id): [number, number] => {
        const s = this.sessions.get(id)!;
        const st = timeToMin(s.start);
        return [st, st + s.durationMin + brk];
      }),
    ].sort((a, b) => a[0] - b[0]);
    let cursor = this.startCursor(date, w);
    let best = 0;
    for (const [s, e] of busy) {
      if (s > cursor) best = Math.max(best, Math.min(s - brk, w.end) - cursor);
      cursor = Math.max(cursor, e);
    }
    best = Math.max(best, w.end - cursor);
    return Math.max(0, best);
  }

  remove(id: ID) {
    const s = this.sessions.get(id);
    if (!s) return;
    this.queues.set(s.date, this.queue(s.date).filter((x) => x !== id));
    this.floating.add(id);
  }

  /** Mark a session as fixed in place (no longer floating) — used for manual moves. */
  pin(id: ID) {
    this.floating.delete(id);
  }

  /** Append to the end of a day's queue. */
  enqueue(date: ISODate, id: ID) {
    const q = this.queue(date).filter((x) => x !== id);
    q.push(id);
    this.queues.set(date, q);
    this.sessions.get(id)!.date = date;
    this.floating.delete(id);
  }

  /** Priority of a session on a day: topic priority, or a fixed score for revisions. */
  prio(id: ID, date: ISODate): number {
    const s = this.sessions.get(id)!;
    return s.kind === 'revision' ? REVISION_PRIORITY[s.revisionStep ?? 7] ?? 60 : this.ctx.priority(s.topicId, date).score;
  }

  /** Reorder a day's flexible queue (stable). */
  sortQueue(date: ISODate, cmp: (a: StudySession, b: StudySession) => number) {
    const q = [...this.queue(date)].sort((a, b) => cmp(this.sessions.get(a)!, this.sessions.get(b)!));
    this.queues.set(date, q);
  }

  /** Days whose study window disappeared (rest day, day off): move their sessions to the next free slot. */
  evacuateClosedDays(reason: string) {
    const dates = [...new Set([...this.sessions.values()].filter((s) => this.isFlex(s)).map((s) => s.date))].sort();
    for (const d of dates) {
      if (this.window(d)) continue;
      for (const o of this.pack(d)) this.place(o, addDays(d, 1), reason);
    }
  }

  /** Insert into a day's queue so higher-priority topics come first. */
  insertByPriority(date: ISODate, id: ID) {
    const s = this.sessions.get(id)!;
    const q = this.queue(date).filter((x) => x !== id);
    const p = this.prio(id, date);
    const idx = q.findIndex((x) => this.prio(x, date) < p);
    q.splice(idx === -1 ? q.length : idx, 0, id);
    this.queues.set(date, q);
    s.date = date; // tentative; pack() assigns the start time
    this.floating.delete(id);
  }

  lowestPriorityIn(date: ISODate) {
    const q = this.queue(date);
    if (!q.length) return Infinity;
    return Math.min(...q.map((id) => this.prio(id, date)));
  }

  topicName(id: ID) {
    return this.ctx.topic.get(this.sessions.get(id)!.topicId)?.name ?? 'session';
  }

  /**
   * Place a flexible session in the next available slot on/after `from`.
   * 1. First day with enough room before the deadline.
   * 2. Otherwise bump lower-priority work on the earliest feasible day (cascades).
   * 3. Otherwise first free day after the deadline, flagged at risk.
   */
  place(id: ID, from: ISODate, reason: string, opts: { limit?: ISODate; dropIfLate?: boolean } = {}) {
    const s = this.sessions.get(id)!;
    this.remove(id);
    const last = this.ctx.lastDay.get(s.topicId);
    const limit = opts.limit ?? last ?? addDays(this.today, DEFAULT_HORIZON);
    this.reasons.set(id, reason);
    this.depth++;

    try {
      // 1) Next free slot before the deadline.
      for (let d = from; d <= limit; d = addDays(d, 1)) {
        if (this.room(d) >= s.durationMin) {
          this.insertByPriority(d, id);
          this.cascade(this.pack(d), d, `Shifted to make room for ${this.topicName(id)}`);
          s.atRisk = false;
          return;
        }
      }
      // 2) No free room before the deadline: bump lower-priority work (bounded depth).
      if (this.depth < 10) {
        const p = (d: ISODate) => this.prio(id, d);
        for (let d = from; d <= limit; d = addDays(d, 1)) {
          if (!this.window(d) || this.lowestPriorityIn(d) >= p(d)) continue;
          this.insertByPriority(d, id);
          const overflow = this.pack(d);
          if (overflow.includes(id)) continue; // still did not fit, try the next day
          const deadlineLabel = (oid: ID) => {
            const ld = this.ctx.lastDay.get(this.sessions.get(oid)!.topicId);
            return ld ? `its deadline is ${formatWeekday(addDays(ld, 1))} ${formatMonthDay(addDays(ld, 1))}` : 'it has no deadline yet';
          };
          for (const o of overflow) {
            this.place(o, addDays(d, 1), `Bumped for higher-priority ${this.topicName(id)}; ${deadlineLabel(o)}`);
          }
          s.atRisk = false;
          return;
        }
      }
      // 3) After the deadline — keep the work but flag it (optional work is simply dropped).
      if (opts.dropIfLate) {
        this.sessions.delete(id);
        this.floating.delete(id);
        return;
      }
      const after = last && last >= from ? addDays(last, 1) : from;
      for (let d = after, i = 0; i < 60; d = addDays(d, 1), i++) {
        if (this.room(d) >= s.durationMin) {
          this.enqueue(d, id);
          this.cascade(this.pack(d), d, reason);
          s.atRisk = Boolean(last && d > last);
          return;
        }
      }
    } finally {
      this.depth--;
    }
  }

  private cascade(overflow: ID[], d: ISODate, reason: string) {
    for (const o of overflow) this.place(o, addDays(d, 1), reason);
  }

  /** Pull later work into free time on [from .. from+lookaheadDays]. */
  pullForward(from: ISODate, days: number, reason: string) {
    const horizonEnd = this.lastPlannedDate();
    for (let d = from, i = 0; i < days; d = addDays(d, 1), i++) {
      for (let guard = 0; guard < 6; guard++) {
        const room = this.room(d);
        if (room < MIN_CHUNK) break;
        const candidate = [...this.sessions.values()]
          .filter((s) => this.isFlex(s) && s.kind !== 'revision' && s.date > d && s.date <= horizonEnd && s.durationMin <= room)
          .sort((a, b) => this.prio(b.id, d) - this.prio(a.id, d))[0];
        if (!candidate) break;
        this.remove(candidate.id);
        const origin = candidate.date;
        this.enqueue(d, candidate.id);
        this.pack(d);
        this.pack(origin);
        this.reasons.set(candidate.id, reason);
      }
    }
  }

  lastPlannedDate(): ISODate {
    let max = this.today;
    for (const s of this.sessions.values()) if (s.status === 'planned' && s.date > max) max = s.date;
    return max;
  }

  /** Recompute at-risk flags for every future planned session. */
  refreshRisk() {
    for (const s of this.sessions.values()) {
      if (s.status !== 'planned') {
        s.atRisk = false;
        continue;
      }
      const last = this.ctx.lastDay.get(s.topicId);
      s.atRisk = Boolean(last && s.date > last);
    }
  }

  result(before: StudySession[], trigger: string): ScheduleResult {
    this.refreshRisk();
    const sessions = [...this.sessions.values()].sort((a, b) =>
      a.date === b.date ? timeToMin(a.start) - timeToMin(b.start) : a.date < b.date ? -1 : 1,
    );
    const { changes, warnings } = diffSessions(before, sessions, this.reasons, this.ctx);
    return { sessions, changes, warnings, summary: summarize(trigger, changes, warnings) };
  }
}

/* =========================================================================
 * Diffing → "What changed"
 * ========================================================================= */

function diffSessions(before: StudySession[], after: StudySession[], reasons: Map<ID, string>, ctx: Ctx) {
  const prev = new Map(before.map((s) => [s.id, s]));
  const next = new Map(after.map((s) => [s.id, s]));
  const changes: ScheduleChange[] = [];
  const slot = (s: StudySession): SlotRef => ({ date: s.date, start: s.start });

  for (const s of after) {
    if (s.status === 'missed' && !prev.has(s.id)) continue; // missed records are history, not changes
    const p = prev.get(s.id);
    if (!p) {
      changes.push({ sessionId: s.id, topicId: s.topicId, subjectId: s.subjectId, kind: 'added', from: null, to: slot(s), reason: reasons.get(s.id) ?? 'New session added to the plan' });
    } else if (p.date !== s.date || p.start !== s.start) {
      const sameDay = p.date === s.date;
      const fallback = sameDay
        ? timeToMin(s.start) > timeToMin(p.start)
          ? 'Shifted later in the day to fit new work'
          : 'Moved up — earlier time freed up'
        : 'Moved to keep the plan inside your available hours';
      changes.push({ sessionId: s.id, topicId: s.topicId, subjectId: s.subjectId, kind: 'moved', from: slot(p), to: slot(s), reason: reasons.get(s.id) ?? fallback });
    } else if (p.durationMin !== s.durationMin) {
      changes.push({ sessionId: s.id, topicId: s.topicId, subjectId: s.subjectId, kind: 'shortened', from: slot(p), to: slot(s), reason: reasons.get(s.id) ?? 'Shortened to fit' });
    }
    if (s.atRisk && !p?.atRisk && s.status === 'planned') {
      const last = ctx.lastDay.get(s.topicId);
      changes.push({
        sessionId: s.id,
        topicId: s.topicId,
        subjectId: s.subjectId,
        kind: 'flagged',
        from: null,
        to: slot(s),
        reason: last ? `Lands after the deadline (${formatWeekday(addDays(last, 1))} ${formatMonthDay(addDays(last, 1))})` : 'Deadline at risk',
      });
    }
  }
  for (const p of before) {
    if (!next.has(p.id) && p.status === 'planned') {
      changes.push({ sessionId: p.id, topicId: p.topicId, subjectId: p.subjectId, kind: 'removed', from: slot(p), to: null, reason: reasons.get(p.id) ?? 'No longer needed' });
    }
  }

  // Deadline warnings per topic.
  const warnings: ScheduleWarning[] = [];
  const atRiskTopics = new Set(after.filter((s) => s.atRisk && s.status === 'planned').map((s) => s.topicId));
  for (const topicId of atRiskTopics) {
    const t = ctx.topic.get(topicId);
    const last = ctx.lastDay.get(topicId);
    if (!t || !last) continue;
    const late = sum(after.filter((s) => s.topicId === topicId && s.atRisk && s.status === 'planned').map((s) => s.durationMin));
    warnings.push({
      topicId,
      severity: 'danger',
      message: `${t.name}: ${round1(late / 60)}h of study won't fit before ${formatWeekday(addDays(last, 1))} ${formatMonthDay(addDays(last, 1))}. Add availability or trim scope.`,
    });
  }
  return { changes, warnings };
}

function summarize(trigger: string, changes: ScheduleChange[], warnings: ScheduleWarning[]) {
  const moved = changes.filter((c) => c.kind === 'moved').length;
  const added = changes.filter((c) => c.kind === 'added').length;
  const removed = changes.filter((c) => c.kind === 'removed').length;
  const parts: string[] = [];
  if (moved) parts.push(`${plural(moved, 'session')} moved`);
  if (added) parts.push(`${added} added`);
  if (removed) parts.push(`${removed} removed`);
  if (warnings.length) parts.push(`${warnings.length} at risk`);
  if (!parts.length) return `${trigger}: no changes needed`;
  return `${trigger}: ${parts.join(', ')}`;
}

/* =========================================================================
 * Public operations
 * ========================================================================= */

let idCounter = 0;
const newSessionId = () => `ses_${Date.now().toString(36)}${(idCounter++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

const isRevision = (s: StudySession) => s.kind === 'revision';

/**
 * Spaced repetition: schedule the short reviews a finished topic is still owed
 * (1, 3, 7 and 21 days after `completedOn`). Steps already in the past, already
 * scheduled, or after the topic's exam are skipped. A review that finds no room
 * within two days of its target is dropped rather than pushed late.
 */
function ensureRevisions(planner: Planner, topicId: ID, completedOn: ISODate) {
  const { ctx } = planner;
  const t = ctx.topic.get(topicId);
  if (!t) return;
  const today = ctx.input.today;
  const last = ctx.lastDay.get(topicId);
  const dur = Math.max(MIN_CHUNK, Math.min(REVISION_MIN, ctx.input.sessionMinutes));
  const have = new Set([...planner.sessions.values()].filter((s) => s.topicId === topicId && isRevision(s)).map((s) => s.revisionStep));
  for (const step of REVISION_STEPS) {
    const target = addDays(completedOn, step);
    if (target <= today || have.has(step) || (last && target > last)) continue;
    const s: StudySession = { id: newSessionId(), topicId, subjectId: t.subjectId, date: target, start: '00:00', durationMin: dur, status: 'planned', source: 'auto', kind: 'revision', revisionStep: step };
    planner.sessions.set(s.id, s);
    const limit = last && last < addDays(target, 2) ? last : addDays(target, 2);
    planner.place(s.id, target, `Revision of ${t.name} (day ${step}) — a quick review so it sticks`, { limit, dropIfLate: true });
  }
}

/** Drop a topic's planned revisions and schedule a fresh set from today (topic just finished). */
function restartRevisions(planner: Planner, topicId: ID) {
  for (const s of [...planner.sessions.values()]) {
    if (s.topicId === topicId && isRevision(s) && s.status === 'planned') {
      planner.remove(s.id);
      planner.sessions.delete(s.id);
    }
  }
  ensureRevisions(planner, topicId, planner.ctx.input.today);
}

/**
 * Peak hours: when the student's history shows a clearly better part of the day,
 * hard topics (difficulty 4+) are ordered into that part of each day's window.
 */
function orderByPeak(planner: Planner, day: ISODate, peak: ReturnType<typeof peakHours>['peak']) {
  const w = planner.window(day);
  if (!peak || !w) return;
  const r = partRange(peak.part);
  const from = Math.max(w.start, r.from);
  const to = Math.min(w.end, r.to);
  if (to <= from) return;
  const hardFirst = (from + to) / 2 <= (w.start + w.end) / 2;
  const hard = (s: StudySession) => (planner.ctx.topic.get(s.topicId)?.difficulty ?? 0) >= 4 && !isRevision(s);
  planner.sortQueue(day, (a, b) => (hardFirst ? Number(hard(b)) - Number(hard(a)) : Number(hard(a)) - Number(hard(b))));
}

/**
 * Generate a full plan from today. Keeps history, locked sessions and
 * sessions already underway; replaces every other future planned session.
 * Distributes topics highest-priority first, balancing daily load so the
 * tightest deadline still gets enough hours.
 */
export function generatePlan(input: SchedulerInput, opts: GenerateOptions = {}): ScheduleResult {
  const ctx = buildContext(input);
  const completedIds = new Set(input.topics.filter((t) => t.status === 'completed').map((t) => t.id));
  const keep = input.sessions.filter(
    (s) =>
      s.status !== 'planned' ||
      s.locked ||
      (isRevision(s) && completedIds.has(s.topicId)) ||
      s.date < input.today ||
      (s.date === input.today && !opts.includePastToday && timeToMin(s.start) < input.nowMin),
  );
  const planner = new Planner({ ...ctx, input: { ...input, sessions: keep } }, opts);
  const { sessionMinutes, breakMinutes, today, mood } = input;

  // Minutes still needed per topic, minus work already locked in the future.
  const need = new Map<ID, number>();
  for (const t of input.topics) {
    const locked = sum(keep.filter((s) => s.topicId === t.id && s.status === 'planned' && s.date >= today && !isRevision(s)).map((s) => s.durationMin));
    const m = remainingMinutes(t) - locked;
    if (m > 0) need.set(t.id, m);
  }

  const lastDeadline = [...need.keys()].map((id) => ctx.lastDay.get(id) ?? addDays(today, 14)).sort().pop() ?? addDays(today, 7);
  const horizonDays = clamp(diffDays(today, lastDeadline) + 1, 7, opts.maxHorizonDays ?? 42);
  const days = Array.from({ length: horizonDays }, (_, i) => addDays(today, i));

  // Recently finished topics get the spaced reviews they are still owed (placed first: they are time-sensitive).
  for (const t of input.topics) {
    if (t.status === 'completed' && t.completedAt) ensureRevisions(planner, t.id, t.completedAt.slice(0, 10));
  }

  const peak = peakHours(input.sessions).peak;
  const capacity = new Map(days.map((d) => [d, planner.room(d)]));
  const deadlines = [...new Set([...need.keys()].map((id) => ctx.lastDay.get(id) ?? lastDeadline))].sort();
  const demandUntil = (dl: ISODate) => sum([...need.entries()].filter(([id]) => (ctx.lastDay.get(id) ?? lastDeadline) <= dl).map(([, m]) => m * (1 + breakMinutes / sessionMinutes)));
  const capUntil = (dl: ISODate) => sum(days.filter((d) => d <= dl).map((d) => capacity.get(d) ?? 0));

  // Buffer days: the day before each exam stays free of new work, so misses have somewhere to go —
  // but only when everything due still fits without that day. A buffer never costs a topic.
  const buffers = new Set<ISODate>();
  for (const b of [...bufferDays(input.exams, input.availability, today)].sort()) {
    const room = capacity.get(b);
    if (!room) continue;
    capacity.set(b, 0);
    if (deadlines.every((dl) => dl < b || demandUntil(dl) <= capUntil(dl) * 0.95)) buffers.add(b);
    else capacity.set(b, room);
  }

  // Balanced load factor: the tightest "demand before deadline / capacity before deadline" ratio.
  let ratio = 0;
  for (const dl of deadlines) {
    const cap = capUntil(dl);
    if (cap) ratio = Math.max(ratio, demandUntil(dl) / cap);
  }
  const loadFactor = clamp(ratio * 1.1, 0.55, 1);

  for (const day of days) {
    let budget = Math.round((capacity.get(day) ?? 0) * loadFactor);
    const perTopicToday = new Map<ID, number>();
    let prevTopic: ID | null = null;
    while (budget >= MIN_CHUNK && need.size) {
      // Earliest-deadline guard: if some deadline group can only just fit in the
      // capacity left before it, only topics from that group may be picked.
      const capLeftUntil = (dl: ISODate) => budget + sum(days.filter((x) => x > day && x <= dl).map((x) => capacity.get(x) ?? 0));
      let tight: ISODate | null = null;
      for (const dl of deadlines) {
        if (dl < day) continue;
        const demand = sum([...need.entries()].filter(([id]) => (ctx.lastDay.get(id) ?? lastDeadline) <= dl).map(([, m]) => m * (1 + breakMinutes / sessionMinutes)));
        if (demand >= capLeftUntil(dl) * 0.85) {
          tight = dl;
          break;
        }
      }
      const pick = [...need.keys()]
        .filter((id) => !tight || (ctx.lastDay.get(id) ?? lastDeadline) <= tight)
        .filter((id) => (perTopicToday.get(id) ?? 0) < (tight ? 3 : 2))
        .filter((id) => !(day === today && mood === 'drained' && ctx.topic.get(id)!.difficulty >= 4))
        .map((id) => {
          const t = ctx.topic.get(id)!;
          let score = ctx.priority(id, day).score;
          const last = ctx.lastDay.get(id);
          if (last && day > last) score -= 25; // past its deadline: still possible, but last resort
          if (id === prevTopic) score -= 20; // interleave subjects
          if (day === today && mood === 'energized' && t.difficulty >= 4) score += 12;
          return { id, score };
        })
        .sort((a, b) => b.score - a.score)[0];
      if (!pick) break;
      const remaining = need.get(pick.id)!;
      let dur = Math.min(sessionMinutes, Math.ceil(remaining / 5) * 5);
      // Never leave a leftover shorter than a session can be (a 60-min topic is one 60-min session, not 50 + 10),
      // and round a tiny remainder up — otherwise it could never be placed and would block the whole day.
      if (remaining > dur && remaining - dur < MIN_CHUNK) dur = Math.ceil(remaining / 5) * 5;
      dur = Math.max(dur, MIN_CHUNK);
      if (dur + breakMinutes > budget) dur = Math.floor((budget - breakMinutes) / 5) * 5;
      if (dur < MIN_CHUNK) break; // the day is full
      const t = ctx.topic.get(pick.id)!;
      const s: StudySession = {
        id: newSessionId(),
        topicId: t.id,
        subjectId: t.subjectId,
        date: day,
        start: '00:00',
        durationMin: dur,
        status: 'planned',
        source: 'auto',
      };
      planner.sessions.set(s.id, s);
      planner.enqueue(day, s.id);
      budget -= dur + breakMinutes;
      perTopicToday.set(pick.id, (perTopicToday.get(pick.id) ?? 0) + 1);
      prevTopic = pick.id;
      if (remaining - dur <= 0) need.delete(pick.id);
      else need.set(pick.id, remaining - dur);
    }
    orderByPeak(planner, day, peak);
    for (const o of planner.pack(day)) planner.place(o, addDays(day, 1), 'Overflowed its day');
  }

  // Anything still unplaced goes after the horizon (and will be flagged).
  for (const [topicId, m] of need) {
    let left = m;
    while (left >= MIN_CHUNK / 2) {
      const t = ctx.topic.get(topicId)!;
      const dur = Math.max(MIN_CHUNK, Math.min(sessionMinutes, Math.ceil(left / 5) * 5));
      const s: StudySession = { id: newSessionId(), topicId, subjectId: t.subjectId, date: today, start: '00:00', durationMin: dur, status: 'planned', source: 'auto' };
      planner.sessions.set(s.id, s);
      planner.place(s.id, addDays(today, horizonDays), 'Not enough hours before the deadline');
      left -= dur;
    }
  }

  // Repair pass: the greedy fill can leave room before a deadline while some work landed after it.
  // Pull late sessions back (earliest deadline first) into any free slot before their deadline.
  const late = [...planner.sessions.values()]
    .filter((s) => planner.isFlex(s) && !isRevision(s) && ctx.lastDay.get(s.topicId) && s.date > ctx.lastDay.get(s.topicId)!)
    .sort((a, b) => ctx.lastDay.get(a.topicId)!.localeCompare(ctx.lastDay.get(b.topicId)!));
  for (const s of late) {
    const origin = s.date;
    planner.place(s.id, today, 'Pulled before its deadline');
    if (s.date !== origin) planner.pack(origin);
  }

  const res = planner.result(input.sessions, 'Plan generated');
  const added = res.sessions.filter((s) => s.status === 'planned' && s.date >= today && !isRevision(s)).length;
  const revisions = res.sessions.filter((s) => s.status === 'planned' && s.date >= today && isRevision(s)).length;
  const spanDays = new Set(res.sessions.filter((s) => s.status === 'planned' && s.date >= today).map((s) => s.date)).size;
  return {
    ...res,
    // A regeneration replaces sessions wholesale; the panel shows one summary line instead of 40 diffs.
    changes: res.changes.filter((c) => c.kind === 'flagged'),
    summary: added
      ? `Plan created: ${plural(added, 'session')}${revisions ? ` + ${plural(revisions, 'revision')}` : ''} across ${plural(spanDays, 'day')}${buffers.size ? `, ${plural(buffers.size, 'buffer day')} kept free` : ''}${res.warnings.length ? ` (${res.warnings.length} ${res.warnings.length === 1 ? 'topic' : 'topics'} at risk)` : ''}.`
      : 'Nothing to schedule yet — add topics with estimated hours, then generate again',
  };
}

/**
 * A session was missed. Its slot is kept as a "missed" record (history), and the
 * session itself moves to the next available slot before its deadline.
 */
export function rescheduleMissed(input: SchedulerInput, sessionIds: ID[], trigger = 'Plan updated'): ScheduleResult {
  const ctx = buildContext(input);
  const planner = new Planner(ctx);
  const before = input.sessions;

  // Highest priority first so the most urgent work gets the nearest slots.
  const ordered = [...sessionIds].sort(
    (a, b) => ctx.priority(planner.sessions.get(b)!.topicId, input.today).score - ctx.priority(planner.sessions.get(a)!.topicId, input.today).score,
  );

  for (const id of ordered) {
    const s = planner.sessions.get(id);
    if (!s) continue;
    planner.remove(id);
    // Keep the missed slot as history under a new id; the original id travels (so the UI animates it).
    const record: StudySession = { ...s, id: `${id}_m${Date.now().toString(36)}`, status: 'missed', locked: true, rescheduledTo: id, atRisk: false };
    planner.sessions.set(record.id, record);
    s.status = 'planned';
    s.locked = false;
    s.source = 'auto';
    const last = ctx.lastDay.get(s.topicId);
    const when = `${formatWeekday(s.date)} ${formatTime(s.start)}`;
    const reason = last
      ? `Missed ${when} — moved to the next free slot before ${formatWeekday(addDays(last, 1))}'s deadline`
      : `Missed ${when} — moved to the next free slot`;
    const from = s.date >= input.today ? s.date : input.today;
    // Original slot is now a fixed missed record; repack that day so later sessions close up.
    if (s.date >= input.today) planner.pack(s.date);
    planner.place(id, from, reason);
  }
  return planner.result(before, trigger);
}

/**
 * Session finished. If it finished early or its topic is now done,
 * free time is reclaimed by pulling upcoming work forward.
 * `topicDone` = the topic reached its estimate (remove its remaining sessions).
 */
export function rescheduleAfterCompletion(input: SchedulerInput, sessionId: ID, topicDone: boolean): ScheduleResult {
  const ctx = buildContext(input);
  const planner = new Planner(ctx);
  const done = planner.sessions.get(sessionId);
  if (!done) return planner.result(input.sessions, 'Plan updated');

  if (topicDone) {
    for (const s of [...planner.sessions.values()]) {
      if (s.topicId === done.topicId && s.status === 'planned' && s.id !== sessionId && !isRevision(s)) {
        planner.remove(s.id);
        planner.sessions.delete(s.id);
        planner.reasons.set(s.id, `${ctx.topic.get(s.topicId)?.name} is complete — session no longer needed`);
      }
    }
    restartRevisions(planner, done.topicId);
  }
  const early = done.actualMin != null && done.actualMin < done.durationMin;
  // Today's remaining sessions close the gap, then upcoming work fills spare time.
  planner.pack(input.today);
  planner.pack(addDays(input.today, 1));
  planner.pullForward(input.today, 3, early ? 'Finished early — pulled forward into freed time' : 'Time freed up — pulled forward');
  return planner.result(input.sessions, early ? 'Finished early' : 'Plan updated');
}

/** Topic marked complete from the Subjects page: drop its remaining sessions and compact. */
export function rescheduleTopicCompleted(input: SchedulerInput, topicId: ID): ScheduleResult {
  const ctx = buildContext(input);
  const planner = new Planner(ctx);
  const touched = new Set<ISODate>();
  for (const s of [...planner.sessions.values()]) {
    if (s.topicId === topicId && planner.isFlex(s) && !isRevision(s)) {
      planner.remove(s.id);
      planner.sessions.delete(s.id);
      touched.add(s.date);
      planner.reasons.set(s.id, `${ctx.topic.get(topicId)?.name} is complete — session no longer needed`);
    }
  }
  for (const d of touched) planner.pack(d);
  restartRevisions(planner, topicId);
  planner.pullForward(input.today, 3, 'Time freed up — pulled forward');
  return planner.result(input.sessions, 'Topic complete');
}

/**
 * User dragged a session to a new slot. It becomes locked there; other
 * sessions on both days reflow around it and the deadline is re-validated.
 */
export function moveSession(input: SchedulerInput, sessionId: ID, to: SlotRef): ScheduleResult {
  const ctx = buildContext(input);
  const planner = new Planner(ctx);
  const s = planner.sessions.get(sessionId);
  if (!s) return planner.result(input.sessions, 'Plan updated');
  const fromDate = s.date;
  planner.remove(sessionId);
  // Make sure the target queue is materialized before the session becomes fixed there.
  planner.queue(to.date);
  s.date = to.date;
  s.start = to.start;
  s.locked = true;
  s.source = 'manual';
  planner.pin(sessionId);
  planner.reasons.set(sessionId, 'Moved by you');

  // Close the gap in the origin day, then reflow the target day around the locked block.
  if (fromDate !== to.date && fromDate >= input.today) planner.pack(fromDate);
  const overflow = planner.pack(to.date);
  // Search from today: the slot the user just vacated is often the best home for bumped work.
  for (const o of overflow) planner.place(o, input.today, `Bumped by your manual move of ${ctx.topic.get(s.topicId)?.name}`);

  const res = planner.result(input.sessions, 'Plan updated');
  const last = ctx.lastDay.get(s.topicId);
  if (last && to.date > last) {
    res.warnings.unshift({
      topicId: s.topicId,
      severity: 'warning',
      message: `${ctx.topic.get(s.topicId)?.name} now sits after its deadline (${formatWeekday(addDays(last, 1))} ${formatMonthDay(addDays(last, 1))}).`,
    });
  }
  return res;
}

/**
 * Mood check-in for today.
 * - drained: today's capacity shrinks to 60%; hard topics (difficulty >= 4) move to later days.
 * - energized: capacity grows 20%; the hardest high-priority session from the next 3 days is pulled into today.
 * - okay: nothing moves.
 * Returns plain-language `explanation` lines for the UI.
 */
export function applyMood(input: SchedulerInput, mood: Mood): ScheduleResult & { explanation: string[] } {
  const withMood = { ...input, mood };
  const ctx = buildContext(withMood);
  const planner = new Planner(ctx);
  const today = input.today;
  const explanation: string[] = [];
  // A rest day may have just been added (burnout guard): clear it first.
  planner.evacuateClosedDays('Rest day — moved so you can recharge');

  if (mood === 'drained') {
    const hard = planner.queue(today).filter((id) => ctx.topic.get(planner.sessions.get(id)!.topicId)!.difficulty >= 4);
    for (const id of hard) {
      planner.place(id, addDays(today, 1), `Low-energy day — ${planner.topicName(id)} is hard, so it moved to a fresher day`);
    }
    const overflow = planner.pack(today);
    for (const id of overflow) planner.place(id, addDays(today, 1), "Lightened today's load to 60% while you recharge");
    explanation.push("You're running low, so today is lighter: about 60% of your usual hours.");
    if (hard.length) explanation.push(`Moved ${plural(hard.length, 'hard topic')} to later days — easier review stays today.`);
    explanation.push('Tip: a 25-minute session still counts. Rest is part of the plan.');
  } else if (mood === 'energized') {
    planner.pack(today);
    const room = planner.room(today);
    const candidate = [...planner.sessions.values()]
      .filter((s) => planner.isFlex(s) && !isRevision(s) && s.date > today && s.date <= addDays(today, 3) && s.durationMin <= room)
      .filter((s) => ctx.topic.get(s.topicId)!.difficulty >= 3)
      .sort((a, b) => {
        const ta = ctx.topic.get(a.topicId)!;
        const tb = ctx.topic.get(b.topicId)!;
        return tb.difficulty - ta.difficulty || ctx.priority(b.topicId, today).score - ctx.priority(a.topicId, today).score;
      })[0];
    explanation.push("You're energized — today's window stretches a little (+20%).");
    if (candidate) {
      const origin = candidate.date;
      planner.remove(candidate.id);
      planner.insertByPriority(today, candidate.id);
      planner.pack(today);
      planner.pack(origin);
      planner.reasons.set(candidate.id, `You're energized — pulled ${ctx.topic.get(candidate.topicId)?.name} forward while focus is high`);
      explanation.push(`Pulled ${ctx.topic.get(candidate.topicId)?.name} forward from ${formatWeekday(origin)} — tackle the hard stuff while you're sharp.`);
    } else {
      explanation.push('No hard topic fit today, so your plan stays as is. Use the extra energy to go deep.');
    }
  } else {
    explanation.push('Steady day. Your plan stays exactly as scheduled.');
  }
  return { ...planner.result(input.sessions, 'Mood check-in'), explanation };
}

/**
 * Demo / day rollover: every planned session before today is marked missed
 * and rescheduled. This is what Demo Mode's "fast-forward" triggers.
 */
export function rolloverPastSessions(input: SchedulerInput): ScheduleResult {
  const overdue = input.sessions.filter((s) => s.status === 'planned' && s.date < input.today).map((s) => s.id);
  if (!overdue.length) return { sessions: input.sessions, changes: [], warnings: [], summary: 'Nothing to reschedule' };
  return rescheduleMissed(input, overdue, 'New day');
}

/**
 * Study hours changed: re-fit every future planned session into the new windows.
 * Sessions that still fit keep their day (times may shift); the rest move to the
 * next free slot before their deadline.
 */
export function reflowForAvailability(input: SchedulerInput): ScheduleResult {
  const ctx = buildContext(input);
  const planner = new Planner(ctx);
  const dates = [...new Set(input.sessions.filter((s) => s.status === 'planned' && s.date >= input.today).map((s) => s.date))].sort();
  for (const day of dates) {
    for (const o of planner.pack(day)) planner.place(o, addDays(day, 1), 'No longer fits your study hours that day — moved to the next free slot');
  }
  return planner.result(input.sessions, 'Study hours changed');
}

/** Add one extra session for a topic in the next available slot (Smart Suggestions). */
export function addExtraSession(input: SchedulerInput, topicId: ID, minutes?: number): ScheduleResult {
  const ctx = buildContext(input);
  const planner = new Planner(ctx);
  const t = ctx.topic.get(topicId);
  if (!t) return planner.result(input.sessions, 'Plan updated');
  const s: StudySession = {
    id: newSessionId(),
    topicId,
    subjectId: t.subjectId,
    date: input.today,
    start: '00:00',
    durationMin: minutes ?? input.sessionMinutes,
    status: 'planned',
    source: 'auto',
  };
  planner.sessions.set(s.id, s);
  planner.place(s.id, input.today, `Extra session for ${t.name} — suggested to strengthen a weak subject`);
  return planner.result(input.sessions, 'Extra session added');
}

/* =========================================================================
 * Predictions
 * ========================================================================= */

/** Historic completion rate (completed / (completed + missed)), defaulting to 0.8 with no history. */
export function completionRate(sessions: StudySession[], subjectId?: ID): number {
  const xs = sessions.filter((s) => (!subjectId || s.subjectId === subjectId) && (s.status === 'completed' || s.status === 'missed'));
  if (!xs.length) return 0.8;
  return xs.filter((s) => s.status === 'completed').length / xs.length;
}

/**
 * Readiness for an exam: coverage now, projected coverage if the remaining plan
 * is followed at your historic completion rate, minus recent misses.
 */
export function predictReadiness(exam: Exam, input: SchedulerInput): ReadinessPrediction {
  const examDay = exam.date.slice(0, 10);
  const topics = input.topics.filter((t) => (exam.topicIds.length ? exam.topicIds.includes(t.id) : t.subjectId === exam.subjectId));
  const est = sum(topics.map((t) => t.estimatedHours)) || 1;
  const doneOf = (t: Topic) => (t.status === 'completed' ? t.estimatedHours : Math.min(t.completedHours, t.estimatedHours));
  const done = sum(topics.map(doneOf));
  const rate = completionRate(input.sessions, exam.subjectId);
  const plannedOf = (t: Topic) =>
    sum(input.sessions.filter((s) => s.topicId === t.id && s.status === 'planned' && !isRevision(s) && s.date >= input.today && s.date < examDay).map((s) => s.durationMin)) / 60;
  const plannedHrs = sum(topics.map(plannedOf));
  // Marks-weighted when the student entered weightage; otherwise weighted by study hours.
  const weighted = topics.some((t) => (t.weightage ?? 0) > 0);
  const avgW = weighted ? sum(topics.map((t) => t.weightage ?? 0)) / topics.filter((t) => (t.weightage ?? 0) > 0).length : 0;
  const weightOf = (t: Topic) => (weighted ? t.weightage ?? avgW : t.estimatedHours);
  const totalW = sum(topics.map(weightOf)) || 1;
  const frac = (t: Topic, extra: number) => (t.estimatedHours ? clamp((doneOf(t) + extra) / t.estimatedHours) : 1);
  const coverage = clamp(sum(topics.map((t) => weightOf(t) * frac(t, 0))) / totalW);
  const projectedCoverage = clamp(sum(topics.map((t) => weightOf(t) * frac(t, plannedOf(t) * rate))) / totalW);
  const recentMisses = input.sessions.filter((s) => s.subjectId === exam.subjectId && s.status === 'missed' && s.date >= addDays(input.today, -7)).length;
  const daysLeft = diffDays(input.today, examDay);
  const readiness = Math.round(clamp(100 * (0.75 * projectedCoverage + 0.25 * rate) - Math.min(10, recentMisses * 2), 0, 100));
  const risk: ReadinessPrediction['risk'] = readiness >= 80 ? 'on_track' : readiness >= 60 ? 'some_risk' : 'at_risk';

  const open = topics
    .filter((t) => t.status !== 'completed')
    .map((t) => ({ t, ratio: t.estimatedHours ? t.completedHours / t.estimatedHours : 1 }))
    .sort((a, b) => a.ratio - b.ratio);
  const weakest = open[0]?.t.name;
  const gapHrs = round1(Math.max(0, est - done - plannedHrs * rate));
  let message: string;
  if (!open.length) message = 'Every topic is covered. Switch to past papers and light review.';
  else if (risk === 'on_track') message = `On track. ${weakest} is your last big push — keep the rhythm.`;
  else if (risk === 'some_risk') message = `Slightly behind on ${weakest}. One extra session this week closes the gap.`;
  else message = `About ${gapHrs}h short at your current pace — ${weakest} needs attention before T-0.`;

  return { examId: exam.id, readiness, coverage, projectedCoverage, daysLeft, risk, message };
}

/** Smart suggestions: weak subjects (low progress or many misses) get extra time recommendations. */
export function smartSuggestions(input: SchedulerInput): Suggestion[] {
  const out: Suggestion[] = [];
  for (const subj of input.subjects) {
    const h = subjectHealth(subj.id, input);
    const topics = input.topics.filter((t) => t.subjectId === subj.id);
    const remainingHrs = sum(topics.map(remainingMinutes)) / 60;
    if (remainingHrs <= 0) continue;
    if (h.weakness < 0.4 && h.missed < 2) continue;
    const extra = Math.min(180, Math.max(45, Math.round((remainingHrs * 60 * h.weakness * 0.35) / 15) * 15));
    const reasons: string[] = [];
    if (h.missed >= 2) reasons.push(`${h.missed} missed sessions in the last two weeks`);
    if (h.progress < 0.5) reasons.push(`only ${Math.round(h.progress * 100)}% covered`);
    out.push({
      id: `sug_${subj.id}`,
      subjectId: subj.id,
      title: `${subj.name} needs a little more orbit time`,
      detail: `${reasons.join(' and ') || 'progress is lagging'}. Add about ${extra} min this week.`,
      extraMinutesPerWeek: extra,
      severity: h.weakness > 0.6 ? 'danger' : h.weakness > 0.45 ? 'warning' : 'info',
    });
  }
  return out.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'danger' ? -1 : b.severity === 'danger' ? 1 : a.severity === 'warning' ? -1 : 1));
}

/**
 * Projection for the analytics chart: cumulative actual hours so far and a
 * forecast based on your average daily hours over the last 7 days.
 */
export function projectProgress(input: SchedulerInput, daysBack = 14, daysAhead = 14) {
  const totalEst = sum(input.topics.map((t) => t.estimatedHours));
  const doneByDay = new Map<ISODate, number>();
  for (const s of input.sessions) {
    if (s.status === 'completed') doneByDay.set(s.date, (doneByDay.get(s.date) ?? 0) + (s.actualMin ?? s.durationMin) / 60);
  }
  const plannedByDay = new Map<ISODate, number>();
  for (const s of input.sessions) {
    if (s.status === 'planned' && s.date >= input.today) plannedByDay.set(s.date, (plannedByDay.get(s.date) ?? 0) + s.durationMin / 60);
  }
  const doneNow = sum(input.topics.map((t) => (t.status === 'completed' ? t.estimatedHours : Math.min(t.completedHours, t.estimatedHours))));
  const recent = sum(Array.from({ length: 7 }, (_, i) => doneByDay.get(addDays(input.today, -i - 1)) ?? 0)) / 7;
  const rate = completionRate(input.sessions);

  // Walk backwards from today's coverage to reconstruct the past curve.
  const points: { date: ISODate; actual?: number; planned?: number; predicted?: number }[] = [];
  let cum = doneNow;
  const past: { date: ISODate; actual: number }[] = [];
  for (let i = 0; i <= daysBack; i++) {
    const d = addDays(input.today, -i);
    past.unshift({ date: d, actual: round1((cum / totalEst) * 100) });
    cum -= doneByDay.get(d) ?? 0;
  }
  points.push(...past);
  let planned = doneNow;
  let predicted = doneNow;
  for (let i = 1; i <= daysAhead; i++) {
    const d = addDays(input.today, i);
    planned += plannedByDay.get(d) ?? 0;
    predicted += recent; // past performance: average actual hours/day over the last week
    points.push({ date: d, planned: round1(clamp(planned / totalEst) * 100), predicted: round1(clamp(predicted / totalEst) * 100) });
  }
  // Join the lines at today.
  const t = points[daysBack];
  t.planned = t.actual;
  t.predicted = t.actual;
  return { points, avgDailyHours: round1(recent), completionRate: rate };
}

/* =========================================================================
 * "What if" simulator
 * ========================================================================= */

export interface WhatIfResult {
  /** Change applied to every study day, in hours. */
  deltaHours: number;
  weeklyHoursBefore: number;
  weeklyHoursAfter: number;
  exams: { examId: ID; before: ReadinessPrediction; after: ReadinessPrediction }[];
}

/** Every study day (days that already have hours) gets `deltaHours` more or less, 0..16h. */
export function adjustWeeklyHours(availability: Availability, deltaHours: number): Availability {
  return {
    ...availability,
    weekly: availability.weekly.map((w) => (w.hours > 0 ? { ...w, hours: clamp(w.hours + deltaHours, 0, 16) } : w)),
  };
}

/**
 * Re-plan from today with each study day `deltaHours` longer/shorter and compare
 * the readiness of every upcoming exam against a re-plan with today's hours.
 * Nothing is saved — this powers the "What if I study 1 hour less?" slider.
 */
export function simulateWhatIf(input: SchedulerInput, deltaHours: number): WhatIfResult {
  const upcoming = input.exams.filter((e) => e.date.slice(0, 10) >= input.today);
  const weekly = (a: Availability) => sum(a.weekly.map((w) => w.hours));
  const baseline = { ...input, sessions: generatePlan(input).sessions };
  const changedAvailability = adjustWeeklyHours(input.availability, deltaHours);
  const changedInput = { ...input, availability: changedAvailability };
  const changed = { ...changedInput, sessions: generatePlan(changedInput).sessions };
  return {
    deltaHours,
    weeklyHoursBefore: weekly(input.availability),
    weeklyHoursAfter: weekly(changedAvailability),
    exams: upcoming.map((e) => ({ examId: e.id, before: predictReadiness(e, baseline), after: predictReadiness(e, changed) })),
  };
}

/** Consecutive days (ending today, or yesterday if nothing yet today) with >= 1 completed session. */
export function computeStreak(sessions: StudySession[], today: ISODate): number {
  const days = new Set(sessions.filter((s) => s.status === 'completed').map((s) => s.date));
  let d = days.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (days.has(d)) {
    streak++;
    d = addDays(d, -1);
  }
  return streak;
}

export const isoToday = (d: Date) => toISODate(d);
