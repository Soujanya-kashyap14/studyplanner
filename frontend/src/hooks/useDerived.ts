import { useMemo } from 'react';
import type { Exam, ID, StudySession, Subject, Topic } from '@/types';
import { useDataStore } from '@/store/useDataStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useUIStore } from '@/store/useUIStore';
import { nowMinutes, todayISO, diffDays, addDays } from '@/lib/date';
import {
  computeStreak,
  lastStudyDay,
  predictReadiness,
  rankTopics,
  smartSuggestions,
  subjectHealth,
  topicsProgress,
  type SchedulerInput,
} from '@/utils/scheduler';
import { buildRuleBriefing } from '@/services';
import { sum } from '@/lib/utils';

export type Deadline =
  | { kind: 'exam'; id: ID; title: string; subjectId: ID; date: string; daysLeft: number; exam: Exam }
  | { kind: 'assignment'; id: ID; title: string; subjectId: ID; date: string; daysLeft: number; done: boolean };

/**
 * Everything computed from the snapshot, memoized. Pages read from here
 * instead of re-deriving, so all views stay consistent after each mutation.
 */
export function useDerived() {
  const snapshot = useDataStore((s) => s.snapshot);
  const user = useAuthStore((s) => s.user);
  // Re-derive when demo time travel changes "today".
  const clockOffset = useUIStore((s) => s.clockOffsetDays);

  return useMemo(() => {
    if (!snapshot) return null;
    const today = todayISO();
    const input: SchedulerInput = {
      subjects: snapshot.subjects,
      topics: snapshot.topics,
      exams: snapshot.exams,
      assignments: snapshot.assignments,
      sessions: snapshot.sessions,
      availability: snapshot.availability,
      today,
      nowMin: nowMinutes(),
      sessionMinutes: user?.preferredSessionMinutes ?? 50,
      breakMinutes: user?.breakMinutes ?? 10,
      mood: snapshot.moods.find((m) => m.date === today)?.mood,
    };

    const subjectById = new Map<ID, Subject>(snapshot.subjects.map((s) => [s.id, s]));
    const topicById = new Map<ID, Topic>(snapshot.topics.map((t) => [t.id, t]));
    const topicsBySubject = new Map<ID, Topic[]>(
      snapshot.subjects.map((s) => [s.id, snapshot.topics.filter((t) => t.subjectId === s.id).sort((a, b) => a.order - b.order)]),
    );
    const health = new Map(snapshot.subjects.map((s) => [s.id, subjectHealth(s.id, input)]));
    const deadlineOf = new Map(snapshot.topics.map((t) => [t.id, lastStudyDay(t, snapshot.exams, snapshot.assignments)]));

    const overallProgress = topicsProgress(snapshot.topics);
    const todaySessions = snapshot.sessions
      .filter((s) => s.date === today)
      .sort((a, b) => a.start.localeCompare(b.start));
    const upcomingSessions = snapshot.sessions
      .filter((s) => (s.status === 'planned' || s.status === 'in_progress') && s.date >= today)
      .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
    const nextSession: StudySession | undefined =
      upcomingSessions.find((s) => s.status === 'in_progress') ?? upcomingSessions.find((s) => s.date > today || s.start >= toHHMM(nowMinutes() - 30));

    const deadlines: Deadline[] = [
      ...snapshot.exams.map(
        (e): Deadline => ({ kind: 'exam', id: e.id, title: e.title, subjectId: e.subjectId, date: e.date, daysLeft: diffDays(today, e.date.slice(0, 10)), exam: e }),
      ),
      ...snapshot.assignments.map(
        (a): Deadline => ({ kind: 'assignment', id: a.id, title: a.title, subjectId: a.subjectId, date: a.dueDate, daysLeft: diffDays(today, a.dueDate.slice(0, 10)), done: a.status === 'done' }),
      ),
    ].sort((a, b) => a.date.localeCompare(b.date));

    const readiness = new Map(snapshot.exams.map((e) => [e.id, predictReadiness(e, input)]));
    const ranked = rankTopics(input);
    const suggestions = smartSuggestions(input);
    const streak = computeStreak(snapshot.sessions, today);
    const briefing = buildRuleBriefing(snapshot, user, input);
    const todayMood = input.mood;

    // Overdue = open topic whose last study day has passed.
    const overdueTopicIds = new Set(
      snapshot.topics.filter((t) => t.status !== 'completed' && (deadlineOf.get(t.id) ?? '9999') < today).map((t) => t.id),
    );
    const atRiskTopicIds = new Set(snapshot.sessions.filter((s) => s.atRisk && s.status === 'planned').map((s) => s.topicId));

    const weekStart = addDays(today, -6);
    const weekCompleted = snapshot.sessions.filter((s) => s.status === 'completed' && s.date >= weekStart && s.date <= today);
    const weekMissed = snapshot.sessions.filter((s) => s.status === 'missed' && s.date >= weekStart && s.date <= today);
    const weekHours = sum(weekCompleted.map((s) => s.actualMin ?? s.durationMin)) / 60;
    const todayDoneMin = sum(todaySessions.filter((s) => s.status === 'completed').map((s) => s.actualMin ?? s.durationMin));
    const todayPlannedMin = sum(todaySessions.filter((s) => s.status !== 'missed').map((s) => s.durationMin));

    return {
      today,
      input,
      snapshot,
      subjectById,
      topicById,
      topicsBySubject,
      health,
      deadlineOf,
      overallProgress,
      todaySessions,
      upcomingSessions,
      nextSession,
      deadlines,
      readiness,
      ranked,
      suggestions,
      streak,
      briefing,
      todayMood,
      overdueTopicIds,
      atRiskTopicIds,
      week: { completed: weekCompleted.length, missed: weekMissed.length, hours: weekHours },
      todayStats: { doneMin: todayDoneMin, plannedMin: todayPlannedMin },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot, user, clockOffset]);
}

const toHHMM = (m: number) => {
  const x = Math.max(0, m);
  return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`;
};

export type Derived = NonNullable<ReturnType<typeof useDerived>>;
