import type { Recurrence } from '../domain/events';

export type { Recurrence };
export const RECURRENCES: readonly Recurrence[] = [
  'daily',
  'weekdays',
  'weekly',
];

const parse = (day: string) => {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d));
};
const format = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (day: string, n: number) => {
  const d = parse(day);
  d.setUTCDate(d.getUTCDate() + n);
  return format(d);
};

/** Overdue = a due day (`YYYY-MM-DD`) before today (FR-208). String order equals date order. */
export function isOverdue(due: string | undefined, today: string): boolean {
  return !!due && due < today;
}

/**
 * Due day of the next instance (FR-207): one step from the previous due day (from `today` when
 * there was none), then on until it lies after `today`, so finishing late never creates an
 * instance that is already overdue. `weekly` keeps the weekday of the due day; `weekdays` skips Sat/Sun.
 */
export function nextDue(
  recurrence: Recurrence,
  due: string | undefined,
  today: string,
): string {
  const step = (day: string) => {
    if (recurrence === 'weekly') return addDays(day, 7);
    let next = addDays(day, 1);
    if (recurrence === 'weekdays')
      while ([0, 6].includes(parse(next).getUTCDay())) next = addDays(next, 1);
    return next;
  };
  let next = step(due || today);
  while (next <= today) next = step(next);
  return next;
}
