import type { ISODate, TimeOfDay } from '@/types';
import { now } from './clock';

/** Pure date helpers working on local calendar days ('YYYY-MM-DD'). */

export const pad = (n: number) => String(n).padStart(2, '0');

export function toISODate(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseISODate(s: ISODate): Date {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(date: ISODate, n: number): ISODate {
  const d = parseISODate(date);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/** Whole calendar days from a to b (b - a). */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((parseISODate(b).getTime() - parseISODate(a).getTime()) / 86_400_000);
}

export const todayISO = (): ISODate => toISODate(now());

export function timeToMin(t: TimeOfDay): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export function minToTime(min: number): TimeOfDay {
  const m = Math.max(0, Math.min(24 * 60 - 1, Math.round(min)));
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

export function nowMinutes(): number {
  const d = now();
  return d.getHours() * 60 + d.getMinutes();
}

export function startOfWeek(date: ISODate, weekStartsOn = 1): ISODate {
  const d = parseISODate(date);
  const diff = (d.getDay() - weekStartsOn + 7) % 7;
  return addDays(date, -diff);
}

export function rangeDays(start: ISODate, count: number): ISODate[] {
  return Array.from({ length: count }, (_, i) => addDays(start, i));
}

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(undefined, opts);
const weekdayShort = fmt({ weekday: 'short' });
const weekdayLong = fmt({ weekday: 'long' });
const monthDay = fmt({ month: 'short', day: 'numeric' });
const fullDate = fmt({ weekday: 'long', month: 'long', day: 'numeric' });
const monthYear = fmt({ month: 'long', year: 'numeric' });

export const formatWeekday = (d: ISODate) => weekdayShort.format(parseISODate(d));
export const formatWeekdayLong = (d: ISODate) => weekdayLong.format(parseISODate(d));
export const formatMonthDay = (d: ISODate) => monthDay.format(parseISODate(d));
export const formatFullDate = (d: ISODate) => fullDate.format(parseISODate(d));
export const formatMonthYear = (d: ISODate) => monthYear.format(parseISODate(d));

/** 'HH:mm' -> '6:30 pm'. Always 12-hour with am/pm, everywhere in the app. */
export function formatTime(t: TimeOfDay): string {
  const [h, m] = t.split(':').map(Number);
  const hh = ((h + 11) % 12) + 1;
  return `${hh}:${pad(m)} ${h < 12 || h === 24 ? 'am' : 'pm'}`;
}

/** Minutes since midnight -> '6:30 pm'. */
export const formatMinutes = (min: number) => formatTime(minToTime(min));

/** Hour of day -> '9 am' (calendar gutters). */
export function formatHour(h: number): string {
  if (h === 0 || h === 24) return '12 am';
  if (h === 12) return '12 pm';
  return h < 12 ? `${h} am` : `${h - 12} pm`;
}

/** 'HH:mm' + duration -> '6:00 pm – 7:30 pm'. */
export const formatRange = (start: TimeOfDay, durationMin: number) => `${formatTime(start)} – ${formatMinutes(timeToMin(start) + durationMin)}`;

/** Plain-language distance: "Today", "Tomorrow", "In 6 days", "Yesterday", "3 days ago". */
export function inDaysLabel(days: number): string {
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  return days > 0 ? `In ${days} days` : `${-days} days ago`;
}

/** "Today", "Tomorrow", "Yesterday", or "Thu, Oct 9". */
export function relativeDay(d: ISODate): string {
  const delta = diffDays(todayISO(), d);
  if (delta === 0) return 'Today';
  if (delta === 1) return 'Tomorrow';
  if (delta === -1) return 'Yesterday';
  return `${formatWeekday(d)}, ${formatMonthDay(d)}`;
}

export function formatDuration(min: number): string {
  if (min < 60) return `${Math.round(min)}m`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function greetingFor(d: Date): string {
  const h = d.getHours();
  if (h < 5) return 'Still up';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}
