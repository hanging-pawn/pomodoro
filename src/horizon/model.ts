import type { AppState, Task } from '../domain/state';

export interface HorizonLine {
  project: string;
  targetDate: string;
  /** Whole days from today to the target date; negative once it has passed (FR-608). */
  daysLeft: number;
  /** Position of «today» on the line from the project's start to its target, 0..1 (FR-607). */
  today: number;
  /** First open task without subtasks, planned-today tasks first, then oldest (FR-607). */
  nextTaskId?: string;
  done: number;
  total: number;
}

const DAY_MS = 86_400_000;

/** Whole days between two local days `YYYY-MM-DD`; DST-safe through UTC. */
export function daysBetween(from: string, to: string): number {
  const utc = (d: string) => {
    const [y, m, day] = d.split('-').map(Number) as [number, number, number];
    return Date.UTC(y, m - 1, day);
  };
  return Math.round((utc(to) - utc(from)) / DAY_MS);
}

export function localDay(at: number): string {
  const d = new Date(at);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Projects with a target date as lines up to it, nearest target first. */
export function deriveHorizon(state: AppState, now: number): HorizonLine[] {
  const today = localDay(now);
  const planned = new Set(state.plans[today] ?? []);
  const lines = Object.entries(state.projects).map(
    ([project, { targetDate }]) => {
      const tasks = Object.values(state.tasks).filter(
        (t) => t.project === project && !t.subtasks,
      );
      const open = tasks
        .filter((t: Task) => !t.done)
        .sort(
          (a, b) =>
            Number(planned.has(b.id)) - Number(planned.has(a.id)) ||
            a.createdAt - b.createdAt,
        );
      const start = tasks.length
        ? localDay(Math.min(...tasks.map((t) => t.createdAt)))
        : today;
      const span = daysBetween(start, targetDate);
      const gone = daysBetween(start, today);
      return {
        project,
        targetDate,
        daysLeft: daysBetween(today, targetDate),
        today: span <= 0 ? 1 : Math.min(1, Math.max(0, gone / span)),
        nextTaskId: open[0]?.id,
        done: tasks.length - open.length,
        total: tasks.length,
      };
    },
  );
  return lines.sort((a, b) => a.targetDate.localeCompare(b.targetDate));
}
