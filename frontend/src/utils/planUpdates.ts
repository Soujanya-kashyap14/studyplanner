/**
 * Turns raw scheduler change logs into plain language for the "Plan updates" drawer
 * and toasts: one headline per update, entries grouped and de-duplicated.
 */
import type { ChangeLog, ScheduleChange, Snapshot } from '@/types';
import { formatTime, formatWeekday, relativeDay } from '@/lib/date';
import { plural } from '@/lib/utils';

export interface UpdateGroup {
  id: 'moved' | 'shifted' | 'added' | 'removed' | 'risk';
  title: string;
  items: { sessionId: string; topic: string; subjectId: string; text: string; reason?: string }[];
}

export interface DescribedUpdate {
  id: string;
  createdAt: string;
  headline: string;
  groups: UpdateGroup[];
  warnings: string[];
}

const slot = (s: { date: string; start: string }) => `${relativeDay(s.date)}, ${formatTime(s.start)}`;

/** Keep one entry per (session, kind) — the last one wins. */
function dedupe(changes: ScheduleChange[]) {
  const m = new Map<string, ScheduleChange>();
  for (const c of changes) m.set(`${c.sessionId}:${c.kind}`, c);
  return [...m.values()];
}

export function describeLog(log: ChangeLog, snap: Pick<Snapshot, 'topics'>): DescribedUpdate {
  const name = (topicId: string) => snap.topics.find((t) => t.id === topicId)?.name ?? 'a topic';
  const changes = dedupe(log.changes);
  const moved = changes.filter((c) => c.kind === 'moved' && c.from && c.to);
  const otherDay = moved.filter((c) => c.from!.date !== c.to!.date);
  const sameDay = moved.filter((c) => c.from!.date === c.to!.date);
  const added = changes.filter((c) => c.kind === 'added');
  const removed = changes.filter((c) => c.kind === 'removed');
  const risk = changes.filter((c) => c.kind === 'flagged');
  const n = moved.length;
  const sessions = (k: number) => plural(k, 'session');

  let headline = log.summary;
  switch (log.trigger) {
    case 'Missed session': {
      const m = moved.find((c) => c.reason.startsWith('Missed')) ?? moved[0];
      headline = m
        ? `${sessions(n)} moved because you skipped ${name(m.topicId)} on ${formatWeekday(m.from!.date)}`
        : 'You skipped a session — nothing else needed to move';
      break;
    }
    case 'New day':
      headline = `${sessions(n)} moved because some of yesterday's sessions weren't done`;
      break;
    case 'Finished early': {
      const t = moved[0] ?? removed[0];
      headline = n ? `You finished early — ${sessions(n)} moved earlier${t ? ` (starting with ${name(t.topicId)})` : ''}` : 'You finished early — nothing needed to move';
      break;
    }
    case 'Topic complete': {
      const r = removed[0];
      headline = `${r ? name(r.topicId) : 'A topic'} is complete — ${plural(removed.length, 'upcoming session')} no longer needed${n ? `, ${n} moved earlier` : ''}`;
      break;
    }
    case 'Manual move': {
      const self = moved.find((c) => c.reason === 'Moved by you');
      headline = self ? `You moved ${name(self.topicId)} to ${slot(self.to!)}${n > 1 ? ` — ${sessions(n - 1)} adjusted around it` : ''}` : `${sessions(n)} adjusted after your change`;
      break;
    }
    case 'Mood check-in':
      headline = n ? `Today adjusted for your energy — ${sessions(n)} moved` : 'Energy saved — your plan stays as it is';
      break;
    case 'Study hours changed':
      headline = n ? `Plan updated: ${sessions(n)} moved to fit your new hours` : 'Plan updated: every session still fits your new hours';
      break;
    case 'Extra session': {
      const a = added[0];
      headline = a ? `Added an extra ${name(a.topicId)} session on ${slot(a.to!)}` : 'Added an extra session';
      break;
    }
    case 'Plan generated':
      headline = log.summary;
      break;
  }

  const groups: UpdateGroup[] = [];
  if (otherDay.length)
    groups.push({
      id: 'moved',
      title: `Moved to another day (${otherDay.length})`,
      items: otherDay.map((c) => ({ sessionId: c.sessionId, topic: name(c.topicId), subjectId: c.subjectId, text: `${slot(c.from!)} → ${slot(c.to!)}`, reason: plainReason(c.reason, name(c.topicId)) })),
    });
  if (sameDay.length)
    groups.push({
      id: 'shifted',
      title: `New time, same day (${sameDay.length})`,
      items: sameDay.map((c) => ({ sessionId: c.sessionId, topic: name(c.topicId), subjectId: c.subjectId, text: `${relativeDay(c.from!.date)}: ${formatTime(c.from!.start)} → ${formatTime(c.to!.start)}` })),
    });
  if (added.length && log.trigger !== 'Plan generated')
    groups.push({ id: 'added', title: `Added (${added.length})`, items: added.map((c) => ({ sessionId: c.sessionId, topic: name(c.topicId), subjectId: c.subjectId, text: c.to ? slot(c.to) : '' })) });
  if (removed.length)
    groups.push({ id: 'removed', title: `No longer needed (${removed.length})`, items: removed.map((c) => ({ sessionId: c.sessionId, topic: name(c.topicId), subjectId: c.subjectId, text: c.from ? `was ${slot(c.from)}` : '' })) });
  if (risk.length)
    groups.push({ id: 'risk', title: `After the deadline (${risk.length})`, items: risk.map((c) => ({ sessionId: c.sessionId, topic: name(c.topicId), subjectId: c.subjectId, text: c.to ? slot(c.to) : '', reason: c.reason })) });

  return { id: log.id, createdAt: log.createdAt, headline, groups, warnings: [...new Set(log.warnings.map((w) => w.message))] };
}

/** Scheduler reasons are already sentences; trim the technical bits. */
function plainReason(r: string, topic: string) {
  if (r.startsWith(`Bumped for higher-priority ${topic};`)) return 'Pushed back so the more urgent session could go first' + r.slice(r.indexOf(';')).replace(';', ' —');
  return r.replace(/^Bumped for higher-priority /, 'Made room for ').replace(/; its deadline is/, ' — its deadline is');
}
