import {
  compareEvents,
  DEFAULT_SETTINGS,
  type DomainEvent,
  type EventPayloads,
  type InterruptionType,
  type Settings,
} from './events';

export interface Task {
  id: string;
  title: string;
  project?: string;
  estimate: number;
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

export interface AppState {
  tasks: Record<string, Task>;
  pomodoros: { completed: number; aborted: number };
  /** Ordered task ids per local day, as last planned (may hold done or deleted tasks). */
  plans: Record<string, string[]>;
  /** Parked interruption notes in log order. */
  parked: ParkedNote[];
  coins: number;
  redemptions: (EventPayloads['reward.redeemed'] & { at: number })[];
  settings: Settings;
}

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
    coins: 0,
    redemptions: [],
    settings: { ...DEFAULT_SETTINGS },
  };
  const pomodoroTask = new Map<string, string>();

  for (const e of events) {
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
      case 'plan.changed':
        state.plans[e.payload.day] = [...e.payload.taskIds];
        break;
      case 'pomodoro.started':
        pomodoroTask.set(e.payload.pomodoroId, e.payload.taskId);
        break;
      case 'pomodoro.completed': {
        state.pomodoros.completed += 1;
        const task = state.tasks[pomodoroTask.get(e.payload.pomodoroId) ?? ''];
        if (task) task.actual += 1;
        break;
      }
      case 'interruption.parked':
        state.parked.push({ id: e.id, ...e.payload, at: e.at });
        break;
      case 'pomodoro.aborted':
        state.pomodoros.aborted += 1;
        break;
      case 'coins.earned':
        state.coins += e.payload.amount;
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
  return state;
}
