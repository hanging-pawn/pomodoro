/**
 * Domain events: the append-only log is the single source of truth (ADR 0002).
 * Every fact the app records is one event; current state is derived from the log.
 */

export type Mode = 'strict' | 'flexible';
/** FR-405: «off» hides coins, shop and streak; «subtle» shows balance and shop; «full» adds the streak. */
export type GamificationLevel = 'off' | 'subtle' | 'full';
export type InterruptionType = 'internal' | 'external';

export interface Settings {
  focusMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  setSize: number;
  mode: Mode;
  coinsPerPomodoro: number;
  setBonus: number;
  /** Pomodoro budget per day for the Today plan (FR-203). */
  dailyBudget: number;
  gamification: GamificationLevel;
  /** Completed rounds that make a day count for the streak (FR-404). */
  dailyGoal: number;
  /** Consecutive missed days a streak survives (FR-404). */
  streakGraceDays: number;
  /** The streak can be turned off on its own (FR-404). */
  streakEnabled: boolean;
  /** Remaining time as digits all the time instead of on tap only (FR-606). */
  digitsAlways: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  setSize: 4,
  mode: 'strict',
  coinsPerPomodoro: 10,
  setBonus: 10,
  dailyBudget: 8,
  gamification: 'full',
  dailyGoal: 4,
  streakGraceDays: 1,
  streakEnabled: true,
  digitsAlways: false,
};

export type Recurrence = 'daily' | 'weekdays' | 'weekly';

export interface TaskFields {
  title: string;
  project?: string;
  estimate: number;
  /** Local day `YYYY-MM-DD`; an empty string in `task.changed` clears it (FR-208). */
  due?: string;
  /** Next instance appears when the task is done (FR-207); an empty string in `task.changed` clears it. */
  recurrence?: Recurrence | '';
}

export interface EventPayloads {
  /** `unplanned`: added during the day, shown in «Unplanned & urgent» and marked U (FR-204). */
  'task.created': {
    taskId: string;
    unplanned?: boolean;
    parentId?: string;
  } & TaskFields;
  'task.changed': {
    taskId: string;
    changes: Partial<TaskFields> & { done?: boolean };
  };
  'task.deleted': { taskId: string };
  /** Second estimate when the actual exceeded the first (FR-304); the first estimate stays untouched. */
  'task.reestimated': { taskId: string; estimate: number };
  /** The ordered Today plan of one local day (`YYYY-MM-DD`); the latest event for a day wins. */
  'plan.changed': { day: string; taskIds: string[] };
  'pomodoro.started': {
    pomodoroId: string;
    taskId: string;
    mode: Mode;
    focusMinutes: number;
  };
  'pomodoro.completed': { pomodoroId: string };
  /** Flexible mode only: the round clock stops until `pomodoro.resumed`. */
  'pomodoro.paused': { pomodoroId: string };
  'pomodoro.resumed': { pomodoroId: string };
  /** The user ends a break early and stays idle until the next round. */
  'break.skipped': Record<string, never>;
  /** An interruption noted during a round without stopping it (FR-205). */
  'interruption.parked': {
    text: string;
    kind: InterruptionType;
    pomodoroId?: string;
    taskId?: string;
  };
  'pomodoro.aborted': {
    pomodoroId: string;
    interruption: InterruptionType;
    workedMinutes: number;
  };
  'coins.earned': {
    amount: number;
    reason: 'pomodoro' | 'set-bonus' | 'partial';
    pomodoroId?: string;
  };
  /** Creates or edits a shop reward; the latest event per `rewardId` wins (FR-408). */
  'reward.saved': { rewardId: string; title: string; price: number };
  'reward.deleted': { rewardId: string };
  /** Marks that the localized template rewards were written once, so deleting them sticks. */
  'rewards.seeded': { locale: string };
  'reward.redeemed': { rewardId: string; title: string; price: number };
  /** A random bonus was drawn from the user's own list after a full set (FR-406); the projection ignores it. */
  'bonus.drawn': { title: string };
  'settings.changed': { changes: Partial<Settings> };
  /** Usage events, recorded only in beta mode (FR-505); the projection ignores them. */
  'usage.view-opened': { view: string };
  'usage.feature-used': { feature: string };
  /** Only the error kind (e.g. `TypeError`), never the message: it may hold user content. */
  'usage.error': { kind: string };
}

export type EventType = keyof EventPayloads;

export interface DomainEventOf<T extends EventType> {
  /** Globally unique id; merging two logs (import, sync, beta upload) deduplicates by it. */
  id: string;
  /** Milliseconds since epoch when the fact happened. */
  at: number;
  type: T;
  payload: EventPayloads[T];
}

export type DomainEvent = { [T in EventType]: DomainEventOf<T> }[EventType];

export const EVENT_TYPES: readonly EventType[] = [
  'task.created',
  'task.changed',
  'task.deleted',
  'task.reestimated',
  'plan.changed',
  'pomodoro.started',
  'pomodoro.completed',
  'pomodoro.paused',
  'pomodoro.resumed',
  'break.skipped',
  'interruption.parked',
  'pomodoro.aborted',
  'coins.earned',
  'reward.saved',
  'reward.deleted',
  'rewards.seeded',
  'reward.redeemed',
  'bonus.drawn',
  'settings.changed',
  'usage.view-opened',
  'usage.feature-used',
  'usage.error',
];

export function newEvent<T extends EventType>(
  type: T,
  payload: EventPayloads[T],
  at: number = Date.now(),
): DomainEventOf<T> {
  return { id: crypto.randomUUID(), at, type, payload };
}

/** Deterministic log order: by time, ties broken by id, so every device derives the same state. */
export function compareEvents(a: DomainEvent, b: DomainEvent): number {
  return a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
