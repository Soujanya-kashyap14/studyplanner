import { BarChart3, BookOpen, CalendarRange, Clock, GraduationCap, Home, Settings, Trophy, type LucideIcon } from 'lucide-react';

export type NavGroup = 'today' | 'setup' | 'insights' | 'account';

export interface NavItem {
  to: string;
  /** Plain-language label shown in the sidebar, bottom nav and page titles. */
  label: string;
  icon: LucideIcon;
  group: NavGroup;
  /** One-line description (tooltips, "More" sheet). */
  hint: string;
}

export const NAV_GROUPS: Record<NavGroup, string> = {
  today: 'Today',
  setup: 'Set up',
  insights: 'Insights',
  account: 'Account',
};

/** Navigation in workflow order: daily use first, then set-up pages in the order you fill them in. */
export const NAV: NavItem[] = [
  { to: '/', label: 'Home', icon: Home, group: 'today', hint: 'What to do today' },
  { to: '/plan', label: 'Study Plan', icon: CalendarRange, group: 'today', hint: 'Your schedule' },
  { to: '/subjects', label: 'Subjects & Topics', icon: BookOpen, group: 'setup', hint: 'What you study' },
  { to: '/exams', label: 'Exams & Deadlines', icon: GraduationCap, group: 'setup', hint: 'When things are due' },
  { to: '/availability', label: 'My Study Hours', icon: Clock, group: 'setup', hint: 'When you can study' },
  { to: '/analytics', label: 'Progress', icon: BarChart3, group: 'insights', hint: 'How it is going' },
  { to: '/achievements', label: 'Achievements', icon: Trophy, group: 'insights', hint: 'Streaks & badges' },
  { to: '/settings', label: 'Settings', icon: Settings, group: 'account', hint: 'Profile, theme, demo' },
];

export const navLabelFor = (pathname: string) => NAV.find((n) => (n.to === '/' ? pathname === '/' : pathname.startsWith(n.to)))?.label ?? 'Orbit';
