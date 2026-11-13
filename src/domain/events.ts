/**
 * Domain events: the append-only log is the single source of truth (ADR 0002).
 * Every fact the app records is one event; current state is derived from the log.
 */

export type Mode = 'strict' | 'flexible';
export type InterruptionType = 'internal' | 'external';

export interface Settings {
  focusMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  setSize: number;
  mode: Mode;
  coinsPerPomodoro: number;
  setBonus: number;
}

export const DEFAULT_SETTINGS: Settings = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  setSize: 4,
  mode: 'strict',
  coinsPerPomodoro: 10,
  setBonus: 10,
};

export interface TaskFields {
  title: string;
  project?: string;
  estimate: number;
}

export interface EventPayloads {
  'task.created': { taskId: string } & TaskFields;
  'task.changed': {
    taskId: string;
    changes: Partial<TaskFields> & { done?: boolean };
  };
  'task.deleted': { taskId: string };
  'pomodoro.started': {
    pomodoroId: string;
    taskId: string;
    mode: Mode;
    focusMinutes: number;
  };
  'pomodoro.completed': { pomodoroId: string };
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
  'reward.redeemed': { rewardId: string; title: string; price: number };
  'settings.changed': { changes: Partial<Settings> };
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
  'pomodoro.started',
  'pomodoro.completed',
  'pomodoro.aborted',
  'coins.earned',
  'reward.redeemed',
  'settings.changed',
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
