/**
 * Achievements are recorded by the student (good marks, passed all subjects…).
 * This module holds the shared vocabulary for them plus streak helpers.
 */
import type { AchievementCategory, ISODate, StudySession } from '@/types';
import { addDays } from '@/lib/date';

export const ACHIEVEMENT_CATEGORIES: { id: AchievementCategory; label: string; hint: string }[] = [
  { id: 'grades', label: 'Good marks', hint: 'A great score or grade' },
  { id: 'exam', label: 'Passed an exam', hint: 'Cleared a test or exam' },
  { id: 'subjects', label: 'Passed all subjects', hint: 'A whole term or semester cleared' },
  { id: 'award', label: 'Award or rank', hint: 'Prize, rank, scholarship, competition' },
  { id: 'project', label: 'Project or course', hint: 'Finished a project, course or certificate' },
  { id: 'other', label: 'Something else', hint: 'Any win worth remembering' },
];

export const categoryLabel = (c: AchievementCategory) => ACHIEVEMENT_CATEGORIES.find((x) => x.id === c)?.label ?? 'Achievement';

/** One-click starting points shown above the form. */
export const ACHIEVEMENT_TEMPLATES: { title: string; category: AchievementCategory }[] = [
  { title: 'Got good marks', category: 'grades' },
  { title: 'Passed all my subjects', category: 'subjects' },
  { title: 'Cleared my exam', category: 'exam' },
  { title: 'Topped the class', category: 'award' },
  { title: 'Won a competition', category: 'award' },
  { title: 'Finished a course', category: 'project' },
];

/** Longest run of consecutive days with at least one completed session. */
export function bestStreak(sessions: StudySession[]): number {
  const days = [...new Set(sessions.filter((x) => x.status === 'completed').map((x) => x.date))].sort();
  let best = 0;
  let run = 0;
  let prev: ISODate | null = null;
  for (const d of days) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}
