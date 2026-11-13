import {
  compareEvents,
  type DomainEvent,
  type DomainEventOf,
  type Mode,
} from '../domain/events';
import { deriveState } from '../domain/state';

export type TimerPhase =
  'idle' | 'focus' | 'paused' | 'short-break' | 'long-break';

export interface TimerView {
  phase: TimerPhase;
  /** Milliseconds left in the current phase (0 when idle). */
  remainingMs: number;
  /** Full length of the current phase (0 when idle). */
  totalMs: number;
  pomodoroId?: string;
  taskId?: string;
  mode?: Mode;
  /** Completed rounds of the running set of `setSize`; 0 after a long break. */
  completedInSet: number;
}

export interface TimerDerivation {
  view: TimerView;
  /** `pomodoro.completed` events the timestamps imply but the log does not hold yet. */
  due: DomainEventOf<'pomodoro.completed'>[];
}

interface Round {
  id: string;
  taskId: string;
  mode: Mode;
  focusMs: number;
  startedAt: number;
  pausedMs: number;
  pausedAt?: number;
}

const MIN = 60_000;

/**
 * Timer state is a pure function of the event log and the current time (FR-103): no tick
 * counting, so reload, tab switch and device sleep cannot drift it. A round whose end lies in
 * the past counts as completed at its end time; `due` lists the completion events to write
 * (deterministic id `completed:<pomodoroId>`, so two tabs writing it merge to one).
 */
export function deriveTimer(
  log: readonly DomainEvent[],
  now: number,
): TimerDerivation {
  const seen = new Set<string>();
  const events = log
    .filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)))
    .sort(compareEvents);
  const settings = deriveState(events).settings;
  const loggedCompletions = new Set(
    events.flatMap((e) =>
      e.type === 'pomodoro.completed' ? [e.payload.pomodoroId] : [],
    ),
  );

  let round: Round | undefined;
  let completed = 0;
  let breakStart: number | undefined;
  const due: TimerDerivation['due'] = [];

  const endAt = (r: Round) => r.startedAt + r.focusMs + r.pausedMs;
  const complete = (at: number) => {
    if (!round) return;
    completed += 1;
    breakStart = at;
    if (!loggedCompletions.has(round.id))
      due.push({
        id: `completed:${round.id}`,
        at,
        type: 'pomodoro.completed',
        payload: { pomodoroId: round.id },
      });
    round = undefined;
  };
  /** Completes the running round if its end is not after `until`. */
  const settle = (until: number) => {
    if (round && round.pausedAt === undefined && endAt(round) <= until)
      complete(endAt(round));
  };

  for (const e of events) {
    settle(e.at);
    switch (e.type) {
      case 'pomodoro.started':
        round = {
          id: e.payload.pomodoroId,
          taskId: e.payload.taskId,
          mode: e.payload.mode,
          focusMs: e.payload.focusMinutes * MIN,
          startedAt: e.at,
          pausedMs: 0,
        };
        breakStart = undefined;
        break;
      case 'pomodoro.paused':
        if (round?.id === e.payload.pomodoroId && round.pausedAt === undefined)
          round.pausedAt = e.at;
        break;
      case 'pomodoro.resumed':
        if (
          round?.id === e.payload.pomodoroId &&
          round.pausedAt !== undefined
        ) {
          round.pausedMs += e.at - round.pausedAt;
          round.pausedAt = undefined;
        }
        break;
      case 'pomodoro.completed':
        if (round?.id === e.payload.pomodoroId) complete(e.at);
        break;
      case 'pomodoro.aborted':
        if (round?.id === e.payload.pomodoroId) {
          round = undefined;
          breakStart = undefined;
        }
        break;
      case 'break.skipped':
        breakStart = undefined;
        break;
    }
    // A long break ends the set; the next round starts a new one.
  }
  settle(now);

  const inSet = completed % settings.setSize;
  const base = { completedInSet: inSet };

  if (round) {
    const r = round;
    const total = r.focusMs;
    const active =
      (r.pausedAt ?? Math.max(now, r.startedAt)) - r.startedAt - r.pausedMs;
    return {
      due,
      view: {
        ...base,
        phase: r.pausedAt === undefined ? 'focus' : 'paused',
        totalMs: total,
        remainingMs: Math.min(total, Math.max(0, total - active)),
        pomodoroId: r.id,
        taskId: r.taskId,
        mode: r.mode,
      },
    };
  }

  if (breakStart !== undefined) {
    const long = completed > 0 && inSet === 0;
    const total =
      (long ? settings.longBreakMinutes : settings.shortBreakMinutes) * MIN;
    const remaining = breakStart + total - now;
    if (remaining > 0)
      return {
        due,
        view: {
          ...base,
          phase: long ? 'long-break' : 'short-break',
          totalMs: total,
          remainingMs: remaining,
        },
      };
  }
  return { due, view: { ...base, phase: 'idle', totalMs: 0, remainingMs: 0 } };
}
