import {
  compareEvents,
  DEFAULT_SETTINGS,
  type DomainEvent,
  type EventPayloads,
  type InterruptionType,
  type Mode,
  type Recurrence,
  type Settings,
} from './events';

export interface Task {
  id: string;
  title: string;
  project?: string;
  estimate: number;
  /** Local day `YYYY-MM-DD` (FR-208); empty or missing = none. */
  due?: string;
  /** Next instance on done (FR-207); empty or missing = does not repeat. */
  recurrence?: Recurrence | '';
  /** Second estimate (FR-304), kept apart from `estimate`. */
  secondEstimate?: number;
  /** Set on a subtask: id of its parent (one level only, FR-209). */
  parentId?: string;
  /** Parents only: subtasks done of total; `estimate` and `actual` are then the sums over the subtasks. */
  subtasks?: { done: number; total: number };
  /** Added during the day (FR-204). */
  unplanned?: boolean;
  /** Completed pomodoros credited to this task. */
  actual: number;
  done: boolean;
  createdAt: number;
}

/** An interruption note parked during a round (FR-205). */
export interface ParkedNote {
  id: string;
  text: string;
  kind: InterruptionType;
  pomodoroId?: string;
  taskId?: string;
  at: number;
}

/** One finished or aborted round with its day, for the day close (FR-302). */
export interface RoundRecord {
  taskId?: string;
  at: number;
  kind: 'completed' | 'aborted';
  interruption?: InterruptionType;
}

export interface Reward {
  id: string;
  title: string;
  price: number;
}

export interface AppState {
  tasks: Record<string, Task>;
  pomodoros: { completed: number; aborted: number };
  /** Ordered task ids per local day, as last planned (may hold done or deleted tasks). */
  plans: Record<string, string[]>;
  /** Parked interruption notes in log order. */
  parked: ParkedNote[];
  /** Completed and aborted rounds in log order. */
  rounds: RoundRecord[];
  rewards: Record<string, Reward>;
  rewardsSeeded: boolean;
  /** Balance: finished rounds, set bonus, flexible partial credit, minus redemptions (FR-401–403). */
  coins: number;
  redemptions: (EventPayloads['reward.redeemed'] & { at: number })[];
  settings: Settings;
  /** Time of the latest round end or plan change (task or Today plan edited); 0 = none (FR-603). */
  pathChangedAt: number;
}

/** A round end or a plan change: only these move the approximate reward time (FR-603). */
const PATH_EVENTS = new Set<DomainEvent['type']>([
  'task.created',
  'task.changed',
  'task.deleted',
  'task.reestimated',
  'plan.changed',
  'pomodoro.completed',
  'pomodoro.aborted',
]);

/** Pure projection of the event log; same set of events → same state, whatever order or duplicates. */
export function deriveState(log: readonly DomainEvent[]): AppState {
  const seen = new Set<string>();
  const events = log
    .filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)))
    .sort(compareEvents);

  const state: AppState = {
    tasks: {},
    pomodoros: { completed: 0, aborted: 0 },
    plans: {},
    parked: [],
    rounds: [],
    rewards: {},
    rewardsSeeded: false,
    coins: 0,
    redemptions: [],
    settings: { ...DEFAULT_SETTINGS },
    pathChangedAt: 0,
  };
  const pomodoroTask = new Map<string, string>();
  const rounds = new Map<string, { mode: Mode; focusMinutes: number }>();

  const settings = state.settings;
  for (const e of events) {
    if (PATH_EVENTS.has(e.type))
      state.pathChangedAt = Math.max(state.pathChangedAt, e.at);
    switch (e.type) {
      case 'task.created': {
        const { taskId, ...fields } = e.payload;
        state.tasks[taskId] = {
          id: taskId,
          ...fields,
          actual: 0,
          done: false,
          createdAt: e.at,
        };
        break;
      }
      case 'task.changed': {
        const task = state.tasks[e.payload.taskId];
        if (task) Object.assign(task, e.payload.changes);
        break;
      }
      case 'task.deleted':
        delete state.tasks[e.payload.taskId];
        break;
      case 'task.reestimated': {
        const task = state.tasks[e.payload.taskId];
        if (task) task.secondEstimate = e.payload.estimate;
        break;
      }
      case 'plan.changed':
        state.plans[e.payload.day] = [...e.payload.taskIds];
        break;
      case 'pomodoro.started':
        pomodoroTask.set(e.payload.pomodoroId, e.payload.taskId);
        rounds.set(e.payload.pomodoroId, {
          mode: e.payload.mode,
          focusMinutes: e.payload.focusMinutes,
        });
        break;
      case 'pomodoro.completed': {
        state.pomodoros.completed += 1;
        state.coins += settings.coinsPerPomodoro;
        // The set bonus belongs to strict rounds only (FR-401/403).
        if (
          rounds.get(e.payload.pomodoroId)?.mode !== 'flexible' &&
          state.pomodoros.completed % settings.setSize === 0
        )
          state.coins += settings.setBonus;
        const task = state.tasks[pomodoroTask.get(e.payload.pomodoroId) ?? ''];
        if (task) task.actual += 1;
        state.rounds.push({
          taskId: pomodoroTask.get(e.payload.pomodoroId),
          at: e.at,
          kind: 'completed',
        });
        break;
      }
      case 'interruption.parked':
        state.parked.push({ id: e.id, ...e.payload, at: e.at });
        break;
      case 'pomodoro.aborted': {
        state.pomodoros.aborted += 1;
        state.rounds.push({
          taskId: pomodoroTask.get(e.payload.pomodoroId),
          at: e.at,
          kind: 'aborted',
          interruption: e.payload.interruption,
        });
        // Strict: nothing. Flexible: ⌊coinsPerPomodoro × worked / focus⌋ (FR-403).
        const round = rounds.get(e.payload.pomodoroId);
        if (round?.mode === 'flexible' && round.focusMinutes > 0)
          state.coins += Math.floor(
            (settings.coinsPerPomodoro * e.payload.workedMinutes) /
              round.focusMinutes,
          );
        break;
      }
      case 'reward.saved': {
        const { rewardId, ...fields } = e.payload;
        state.rewards[rewardId] = { id: rewardId, ...fields };
        break;
      }
      case 'reward.deleted':
        delete state.rewards[e.payload.rewardId];
        break;
      case 'rewards.seeded':
        state.rewardsSeeded = true;
        break;
      case 'coins.earned':
        // Round coins are derived above; an event tied to a round is legacy and ignored, a free one is an adjustment.
        if (!e.payload.pomodoroId) state.coins += e.payload.amount;
        break;
      case 'reward.redeemed':
        state.coins -= e.payload.price;
        state.redemptions.push({ ...e.payload, at: e.at });
        break;
      case 'settings.changed':
        Object.assign(state.settings, e.payload.changes);
        break;
    }
  }
  // Subtasks roll up into their parent (FR-209); orphans (parent deleted) count as top-level tasks.
  for (const task of Object.values(state.tasks)) {
    if (task.parentId && !state.tasks[task.parentId]) delete task.parentId;
  }
  const children = new Map<string, Task[]>();
  for (const task of Object.values(state.tasks))
    if (task.parentId)
      children.set(task.parentId, [
        ...(children.get(task.parentId) ?? []),
        task,
      ]);
  for (const [parentId, subs] of children) {
    const parent = state.tasks[parentId]!;
    parent.estimate = subs.reduce((n, x) => n + x.estimate, 0);
    parent.actual = subs.reduce((n, x) => n + x.actual, 0);
    parent.subtasks = {
      done: subs.filter((x) => x.done).length,
      total: subs.length,
    };
  }
  return state;
}
