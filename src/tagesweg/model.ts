import type { AppState } from '../domain/state';
import { todayView } from '../tasks/inventory';
import type { TimerView } from '../timer/cycle';

export type StationState = 'done' | 'current' | 'open';

export type TagesRow =
  | {
      kind: 'task';
      taskId: string;
      title: string;
      stations: StationState[];
      unplanned: boolean;
    }
  | {
      kind: 'reward';
      rewardId: string;
      title: string;
      price: number;
      reached: boolean;
      toGo: number;
    };

export interface Tagesweg {
  rows: TagesRow[];
  coins: number;
  showCoins: boolean;
  /** First task with an open round; the location dot sits at its first open station. */
  currentTaskId?: string;
  /** Set during a round: only this task and its path piece are shown (FR-604); progress 0..1 of the piece walked. */
  zoom?: { taskId: string; progress: number };
}

/**
 * The day as a path (FR-602/603): pure function of state, timer view and clock.
 * A reward row follows the task in which the projected balance (current coins plus
 * `coinsPerPomodoro` per open round up to that task) first reaches its price; rewards
 * that stay out of reach go to the end. At most the two cheapest rewards are shown (calm, FR-601).
 */
export function deriveTagesweg(
  state: AppState,
  timer: TimerView,
  now: number,
): Tagesweg {
  const { tasks, unplanned } = todayView(state, now);
  const { coinsPerPomodoro, gamification } = state.settings;
  const gamified = gamification !== 'off';
  const planned = [...tasks, ...unplanned];

  let currentTaskId: string | undefined;
  const taskRows = planned.map((task) => {
    const total = Math.max(task.estimate, task.actual + 1);
    const stations: StationState[] = Array.from({ length: total }, (_, i) =>
      i < task.actual ? 'done' : 'open',
    );
    if (!currentTaskId) {
      currentTaskId = task.id;
      stations[task.actual] = 'current';
    }
    return {
      task,
      stations,
      open: stations.filter((s) => s !== 'done').length,
    };
  });

  const rewards = gamified
    ? Object.values(state.rewards)
        .sort((a, b) => a.price - b.price)
        .slice(0, 2)
    : [];
  const rows: TagesRow[] = [];
  let projected = state.coins;
  const pending = [...rewards];
  const reward = (r: (typeof rewards)[number]): TagesRow => ({
    kind: 'reward',
    rewardId: r.id,
    title: r.title,
    price: r.price,
    reached: state.coins >= r.price,
    toGo: Math.max(0, r.price - state.coins),
  });
  // Rewards already affordable come first, before the first task.
  while (pending[0] && state.coins >= pending[0].price)
    rows.push(reward(pending.shift()!));
  for (const { task, stations, open } of taskRows) {
    rows.push({
      kind: 'task',
      taskId: task.id,
      title: task.title,
      stations,
      unplanned: !!task.unplanned,
    });
    projected += open * coinsPerPomodoro;
    while (pending[0] && projected >= pending[0].price)
      rows.push(reward(pending.shift()!));
  }
  for (const r of pending) rows.push(reward(r));

  const running = timer.phase === 'focus' || timer.phase === 'paused';
  const zoom =
    running && timer.taskId
      ? {
          taskId: timer.taskId,
          progress:
            timer.totalMs > 0 ? 1 - timer.remainingMs / timer.totalMs : 0,
        }
      : undefined;

  return {
    rows,
    coins: state.coins,
    showCoins: gamified,
    currentTaskId,
    zoom,
  };
}
