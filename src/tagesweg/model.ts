import type { AppState } from '../domain/state';
import { dayKey, todayView } from '../tasks/inventory';
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
      /** Approximate time the reward is reached by the plan (FR-603); unset when reached or out of reach. */
      etaAt?: number;
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
  const { coinsPerPomodoro, gamification, focusMinutes, shortBreakMinutes } =
    state.settings;
  const gamified = gamification !== 'off';
  const planned = [...tasks, ...unplanned];

  // A task has as many stations as estimated (or more if already worked past it); one that has
  // reached its estimate gets no extra station, so the location moves on to the next task (FR-602).
  // Only when no planned round is left does the first task get one more, so a round can still start.
  const totals = planned.map((task) => Math.max(task.estimate, task.actual));
  if (planned.length && planned.every((task, i) => task.actual >= totals[i]!))
    totals[0] = planned[0]!.actual + 1;
  let currentTaskId: string | undefined;
  const taskRows = planned.map((task, i) => {
    const stations: StationState[] = Array.from(
      { length: totals[i]! },
      (_, n) => (n < task.actual ? 'done' : 'open'),
    );
    if (!currentTaskId && task.actual < stations.length) {
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
  // The time moves only at a round end or a plan change, never with the clock (FR-603).
  const anchor = state.pathChangedAt || now;
  const roundMs = (focusMinutes + shortBreakMinutes) * 60_000;
  const openRounds = taskRows.reduce((n, r) => n + r.open, 0);
  const reward = (r: (typeof rewards)[number]): TagesRow => {
    const toGo = Math.max(0, r.price - state.coins);
    const rounds =
      coinsPerPomodoro > 0 ? Math.ceil(toGo / coinsPerPomodoro) : Infinity;
    return {
      kind: 'reward',
      rewardId: r.id,
      title: r.title,
      price: r.price,
      reached: toGo === 0,
      toGo,
      ...(toGo > 0 && rounds <= openRounds
        ? { etaAt: anchor + rounds * roundMs }
        : {}),
    };
  };
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

/** Rounds completed today against the rounds planned for today (plan plus unplanned tasks), for the day bar (FR-407). */
export function deriveDayProgress(
  state: AppState,
  now: number,
): { done: number; planned: number } {
  const day = dayKey(now);
  const done = state.rounds.filter(
    (r) => r.kind === 'completed' && dayKey(r.at) === day,
  ).length;
  const ids = new Set((state.plans[day] ?? []).filter((id) => state.tasks[id]));
  for (const t of Object.values(state.tasks))
    if (t.unplanned && dayKey(t.createdAt) === day) ids.add(t.id);
  // A subtask already counted through its planned parent adds nothing (FR-209).
  const planned = [...ids]
    .map((id) => state.tasks[id]!)
    .filter((t) => !(t.parentId && ids.has(t.parentId)))
    .reduce((n, t) => n + t.estimate, 0);
  return { done, planned };
}
