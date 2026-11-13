import type { AppState } from '../domain/state';
import { dayKey } from '../tasks/inventory';

export interface DayCloseRow {
  taskId: string;
  title: string;
  estimate: number;
  /** Rounds completed on this day. */
  actual: number;
  /** actual − estimate; positive = over. */
  difference: number;
  /** Second estimate, shown apart from the first (FR-304). */
  secondEstimate?: number;
  /** The second estimate may be entered once the actual exceeds the estimate (FR-304). */
  canReestimate: boolean;
}

export interface DayClose {
  day: string;
  rows: DayCloseRow[];
  /** Interruptions of the day: parked notes plus aborted rounds, by type. */
  interruptions: { internal: number; external: number };
}

/**
 * Day close (FR-302): the tasks planned for the day plus any task worked on that day;
 * subtasks count under their parent. `actual` counts the rounds completed on that day only.
 */
export function deriveDayClose(state: AppState, now: number): DayClose {
  const day = dayKey(now);
  const top = (id: string) => state.tasks[id]?.parentId ?? id;
  const worked = state.rounds
    .filter((r) => r.kind === 'completed' && r.taskId && dayKey(r.at) === day)
    .map((r) => top(r.taskId!));
  const ids = [
    ...new Set([...(state.plans[day] ?? []).map(top), ...worked]),
  ].filter((id) => state.tasks[id]);

  const rows = ids.map((id): DayCloseRow => {
    const task = state.tasks[id]!;
    const actual = worked.filter((w) => w === id).length;
    return {
      taskId: id,
      title: task.title,
      estimate: task.estimate,
      actual,
      difference: actual - task.estimate,
      secondEstimate: task.secondEstimate,
      canReestimate: actual > task.estimate,
    };
  });

  const interruptions = { internal: 0, external: 0 };
  for (const n of state.parked)
    if (dayKey(n.at) === day) interruptions[n.kind]++;
  for (const r of state.rounds)
    if (r.kind === 'aborted' && r.interruption && dayKey(r.at) === day)
      interruptions[r.interruption]++;
  return { day, rows, interruptions };
}
