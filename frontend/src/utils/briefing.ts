import type { DailyBriefing, Snapshot, User } from '@/types';
import { now } from '@/lib/clock';
import { addDays, diffDays, formatDuration, greetingFor, todayISO } from '@/lib/date';
import { plural, sum } from '@/lib/utils';
import { computeStreak, predictReadiness, rankTopics, type SchedulerInput } from '@/utils/scheduler';

/**
 * Rule-based daily briefing. Deterministic, instant, and good enough to demo.
 * Mirrors the shape an LLM call will return later.
 */
export function buildRuleBriefing(snap: Snapshot, user: User | null, input: SchedulerInput): DailyBriefing {
  const today = todayISO();
  const first = user?.name.split(' ')[0];
  const greeting = `${greetingFor(now())}${first ? `, ${first}` : ''}.`;
  const lines: string[] = [];

  const todays = snap.sessions.filter((s) => s.date === today && (s.status === 'planned' || s.status === 'in_progress'));
  const done = snap.sessions.filter((s) => s.date === today && s.status === 'completed').length;
  if (todays.length) {
    lines.push(`${plural(todays.length, 'session')} left today (${formatDuration(sum(todays.map((s) => s.durationMin)))})${done ? ` — ${done} already done` : ''}.`);
  } else if (done) {
    lines.push(`All ${plural(done, 'session')} done for today. The sky is yours.`);
  } else {
    lines.push('Nothing scheduled today — a quiet orbit. Rest counts too.');
  }

  const upcoming = [...snap.exams].filter((e) => e.date.slice(0, 10) >= today).sort((a, b) => (a.date < b.date ? -1 : 1))[0];
  if (upcoming) {
    const subj = snap.subjects.find((s) => s.id === upcoming.subjectId);
    const days = diffDays(today, upcoming.date.slice(0, 10));
    const r = predictReadiness(upcoming, input);
    lines.push(`${subj?.name ?? upcoming.title} exam ${days === 0 ? 'is today' : days === 1 ? 'is tomorrow' : `in ${days} days`} — readiness ${r.readiness}%.`);
  }

  // "Behind" = an open topic with a recent miss, or the top-priority topic with < 40% done.
  const recentMiss = snap.sessions
    .filter((s) => s.status === 'missed' && s.date >= addDays(today, -4))
    .map((s) => snap.topics.find((t) => t.id === s.topicId))
    .find((t) => t && t.status !== 'completed');
  const top = rankTopics(input)[0];
  if (recentMiss) lines.push(`You're slightly behind on ${recentMiss.name} — the plan already made room for it.`);
  else if (top && top.topic.completedHours / top.topic.estimatedHours < 0.4) lines.push(`${top.topic.name} is your highest priority right now.`);

  const streak = computeStreak(snap.sessions, today);
  if (streak >= 2) lines.push(`${streak}-day streak. One session keeps the flame lit.`);

  return { greeting, lines, generatedBy: 'rules' };
}
