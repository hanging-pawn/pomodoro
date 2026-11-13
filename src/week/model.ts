import type { AppState } from '../domain/state';
import { dayKey } from '../tasks/inventory';

export interface ProjectCount {
  /** Empty string = tasks without a project (listed last). */
  project: string;
  completed: number;
}

export interface WeekDay {
  day: string;
  completed: number;
  projects: ProjectCount[];
}

export interface Week {
  days: WeekDay[];
  total: number;
  projects: ProjectCount[];
  /** Pomodoros planned for the week: sum of the estimates of the tasks in each day's plan. */
  planned: number;
  /** Rounds completed on planned tasks on their planned day, capped at the estimate per task and day. */
  fulfilled: number;
  /** Plan fulfilment, whole percent; 0 when nothing is planned. */
  percent: number;
}

function sortProjects(counts: Map<string, number>): ProjectCount[] {
  return [...counts]
    .map(([project, completed]) => ({ project, completed }))
    .sort(
      (a, b) =>
        Number(a.project === '') - Number(b.project === '') ||
        b.completed - a.completed ||
        a.project.localeCompare(b.project),
    );
}

/**
 * Week overview (FR-303): Monday to Sunday of the week containing `now`; completed pomodoros per day
 * and per project (a subtask counts for its parent's project when it has none), plan fulfilment.
 */
export function deriveWeek(state: AppState, now: number): Week {
  const start = new Date(now);
  start.setHours(12, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const dayKeys = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return dayKey(d.getTime());
  });

  const top = (id: string) => state.tasks[id]?.parentId ?? id;
  const projectOf = (id: string) =>
    state.tasks[id]?.project || state.tasks[top(id)]?.project || '';

  const perDay = new Map(dayKeys.map((d) => [d, new Map<string, number>()]));
  const weekTotals = new Map<string, number>();
  const doneByTaskDay = new Map<string, number>();
  for (const r of state.rounds) {
    if (r.kind !== 'completed') continue;
    const day = dayKey(r.at);
    const counts = perDay.get(day);
    if (!counts) continue;
    const project = r.taskId ? projectOf(r.taskId) : '';
    counts.set(project, (counts.get(project) ?? 0) + 1);
    weekTotals.set(project, (weekTotals.get(project) ?? 0) + 1);
    if (r.taskId) {
      const key = `${day}|${top(r.taskId)}`;
      doneByTaskDay.set(key, (doneByTaskDay.get(key) ?? 0) + 1);
    }
  }

  let planned = 0;
  let fulfilled = 0;
  for (const day of dayKeys) {
    const ids = [...new Set((state.plans[day] ?? []).map(top))].filter(
      (id) => state.tasks[id],
    );
    for (const id of ids) {
      const estimate = state.tasks[id]!.estimate;
      planned += estimate;
      fulfilled += Math.min(estimate, doneByTaskDay.get(`${day}|${id}`) ?? 0);
    }
  }

  const days = dayKeys.map((day): WeekDay => {
    const counts = perDay.get(day)!;
    return {
      day,
      completed: [...counts.values()].reduce((a, b) => a + b, 0),
      projects: sortProjects(counts),
    };
  });
  return {
    days,
    total: days.reduce((n, d) => n + d.completed, 0),
    projects: sortProjects(weekTotals),
    planned,
    fulfilled,
    percent: planned === 0 ? 0 : Math.round((fulfilled / planned) * 100),
  };
}
