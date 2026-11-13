import {
  newEvent,
  type DomainEvent,
  type InterruptionType,
} from '../domain/events';
import { deriveState } from '../domain/state';
import { deriveTimer, type TimerView } from './cycle';

/** The slice of the store the timer needs (the real `Store` satisfies it). */
export interface TimerLog {
  events(): Promise<DomainEvent[]>;
  append(...events: DomainEvent[]): Promise<void>;
}

export type PhaseEnd = 'focus' | 'break';

export interface TimerOptions {
  log: TimerLog;
  /** Clock, defaults to `Date.now`; tests pass a fake. */
  now?: () => number;
  /** Called after every state change; `end` is set once when a focus round or break ran out. */
  onChange?: (view: TimerView, end?: PhaseEnd) => void;
}

export interface Timer {
  readonly view: TimerView;
  /** Re-reads the log, writes due completions, notifies. Call on every tick and on visibility change. */
  refresh(): Promise<void>;
  start(taskId: string): Promise<void>;
  /** Strict mode rejects; only flexible mode may pause (FR-107). */
  pause(): Promise<void>;
  resume(): Promise<void>;
  abort(interruption: InterruptionType): Promise<void>;
  skipBreak(): Promise<void>;
  onChange(listener: (view: TimerView, end?: PhaseEnd) => void): () => void;
}

const IDLE: TimerView = {
  phase: 'idle',
  remainingMs: 0,
  totalMs: 0,
  completedInSet: 0,
};

export function createTimer(options: TimerOptions): Timer {
  const now = options.now ?? Date.now;
  const listeners = new Set<(v: TimerView, end?: PhaseEnd) => void>();
  if (options.onChange) listeners.add(options.onChange);
  let view = IDLE;
  /** A user action ending a phase early is not announced. */
  let quiet = false;

  const refresh = async () => {
    const log = await options.log.events();
    const { view: next, due } = deriveTimer(log, now());
    if (due.length) await options.log.append(...due);
    const prev = view;
    view = next;
    let end: PhaseEnd | undefined;
    if (quiet) end = undefined;
    else if (prev.phase === 'focus' && due.length) end = 'focus';
    else if (
      (prev.phase === 'short-break' || prev.phase === 'long-break') &&
      next.phase === 'idle'
    )
      end = 'break';
    listeners.forEach((l) => l(view, end));
  };

  const write = async (...events: DomainEvent[]) => {
    await options.log.append(...events);
    await refresh();
  };

  const running = () => {
    if (!view.pomodoroId) throw new Error('No round is running');
    return view.pomodoroId;
  };

  return {
    get view() {
      return view;
    },
    refresh,
    async start(taskId) {
      await refresh();
      if (view.phase === 'focus' || view.phase === 'paused') return;
      const { settings } = deriveState(await options.log.events());
      await write(
        newEvent(
          'pomodoro.started',
          {
            pomodoroId: crypto.randomUUID(),
            taskId,
            mode: settings.mode,
            focusMinutes: settings.focusMinutes,
          },
          now(),
        ),
      );
    },
    async pause() {
      await refresh();
      if (view.mode === 'strict')
        throw new Error('Pause is not available in strict mode');
      if (view.phase !== 'focus') return;
      await write(
        newEvent('pomodoro.paused', { pomodoroId: running() }, now()),
      );
    },
    async resume() {
      await refresh();
      if (view.phase !== 'paused') return;
      await write(
        newEvent('pomodoro.resumed', { pomodoroId: running() }, now()),
      );
    },
    async abort(interruption) {
      await refresh();
      if (view.phase !== 'focus' && view.phase !== 'paused') return;
      const worked = view.totalMs - view.remainingMs;
      await write(
        newEvent(
          'pomodoro.aborted',
          {
            pomodoroId: running(),
            interruption,
            workedMinutes: Math.floor(worked / 60_000),
          },
          now(),
        ),
      );
    },
    async skipBreak() {
      await refresh();
      if (view.phase !== 'short-break' && view.phase !== 'long-break') return;
      quiet = true;
      try {
        await write(newEvent('break.skipped', {}, now()));
      } finally {
        quiet = false;
      }
    },
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
