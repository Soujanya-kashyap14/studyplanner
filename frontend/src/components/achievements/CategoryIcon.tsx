import { BadgeCheck, BookCheck, GraduationCap, Medal, Star, Trophy } from 'lucide-react';
import type { AchievementCategory } from '@/types';

/** Icon for each kind of achievement. */
export function CategoryIcon({ category, className = 'h-5 w-5' }: { category: AchievementCategory; className?: string }) {
  const Icon = { grades: Medal, exam: GraduationCap, subjects: BadgeCheck, award: Trophy, project: BookCheck, other: Star }[category] ?? Star;
  return <Icon className={className} aria-hidden />;
}
