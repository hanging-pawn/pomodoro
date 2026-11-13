import { describe, expect, it } from 'vitest';
import type { DomainEvent } from '../domain/events';
import { deriveTimer } from './cycle';

const MIN = 60_000;
const T0 = Date.UTC(2026, 10, 13, 9, 0, 0);

let n = 0;
const ev = (
  at: number,
  type: DomainEvent['type'],
  payload: object,
  id = `e${++n}`,
): DomainEvent => ({ id, at, type, payload }) as DomainEvent;

const started = (at: number, pomodoroId: string, mode = 'strict') =>
  ev(at, 'pomodoro.started', {
    pomodoroId,
    taskId: 't1',
    mode,
    focusMinutes: 25,
  });
const completed = (at: number, pomodoroId: string) =>
  ev(at, 'pomodoro.completed', { pomodoroId }, `completed:${pomodoroId}`);

describe('deriveTimer: the Cirillo cycle (FR-101)', () => {
  it('is idle with an empty log', () => {
    expect(deriveTimer([], T0).view.phase).toBe('idle');
  });

  it('counts down a running focus round from timestamps', () => {
    const { view } = deriveTimer([started(T0, 'p1')], T0 + 10 * MIN);
    expect(view).toMatchObject({
      phase: 'focus',
      pomodoroId: 'p1',
      remainingMs: 15 * MIN,
      totalMs: 25 * MIN,
      mode: 'strict',
    });
  });

  it('runs 4 rounds: three 5-minute breaks, the 4th break 15 minutes', () => {
    const log: DomainEvent[] = [];
    let t = T0;
    const breaks: number[] = [];
    for (let i = 1; i <= 4; i++) {
      log.push(started(t, `p${i}`));
      t += 25 * MIN;
      log.push(completed(t, `p${i}`));
      const view = deriveTimer(log, t + 1000).view;
      breaks.push(view.totalMs);
      expect(view.phase).toBe(i === 4 ? 'long-break' : 'short-break');
      t += breaks[i - 1]!;
    }
    expect(breaks).toEqual([5 * MIN, 5 * MIN, 5 * MIN, 15 * MIN]);
    expect(deriveTimer(log, t).view.phase).toBe('idle');
  });

  it('starts the next cycle with a short break again after the long break', () => {
    const log: DomainEvent[] = [];
    let t = T0;
    for (let i = 1; i <= 5; i++) {
      log.push(started(t, `p${i}`), completed(t + 25 * MIN, `p${i}`));
      t += 25 * MIN + (i === 4 ? 15 : 5) * MIN;
    }
    // After the 5th round (position 1 of the new set) a short break runs.
    expect(deriveTimer(log, t - 5 * MIN + 1).view.phase).toBe('short-break');
  });

  it('completes a round by timestamp even when no event was written, and reports it as due', () => {
    const { view, due } = deriveTimer([started(T0, 'p1')], T0 + 27 * MIN);
    expect(view.phase).toBe('short-break');
    expect(view.remainingMs).toBe(3 * MIN);
    expect(due).toHaveLength(1);
    expect(due[0]).toMatchObject({
      id: 'completed:p1',
      type: 'pomodoro.completed',
      at: T0 + 25 * MIN,
    });
  });

  it('reports nothing due once the completed event is in the log', () => {
    const log = [started(T0, 'p1'), completed(T0 + 25 * MIN, 'p1')];
    expect(deriveTimer(log, T0 + 26 * MIN).due).toEqual([]);
  });

  it('survives a reload at minute 10 with at most 1 s deviation (FR-103)', () => {
    const log = [started(T0, 'p1')];
    const before = deriveTimer(log, T0 + 10 * MIN).view.remainingMs;
    // Reload: the same log, a few hundred ms later.
    const after = deriveTimer(log, T0 + 10 * MIN + 400).view.remainingMs;
    expect(before - after).toBeLessThanOrEqual(1000);
    expect(after).toBeGreaterThanOrEqual(15 * MIN - 1000);
  });

  it('ends a round at the right time after 20 minutes in a background tab', () => {
    const log = [started(T0, 'p1')];
    expect(deriveTimer(log, T0 + 20 * MIN).view.remainingMs).toBe(5 * MIN);
    expect(deriveTimer(log, T0 + 25 * MIN).view.phase).toBe('short-break');
  });
});

describe('deriveTimer: abort (FR-106)', () => {
  it('an aborted round returns to idle and does not count towards the set', () => {
    const log = [
      started(T0, 'p1'),
      ev(T0 + 12 * MIN, 'pomodoro.aborted', {
        pomodoroId: 'p1',
        interruption: 'internal',
        workedMinutes: 12,
      }),
    ];
    const { view } = deriveTimer(log, T0 + 13 * MIN);
    expect(view.phase).toBe('idle');
    expect(view.completedInSet).toBe(0);
  });
});

describe('deriveTimer: flexible mode pause (FR-107)', () => {
  const log = (extra: DomainEvent[]) => [
    started(T0, 'p1', 'flexible'),
    ...extra,
  ];

  it('freezes the remaining time while paused', () => {
    const l = log([ev(T0 + 10 * MIN, 'pomodoro.paused', { pomodoroId: 'p1' })]);
    const { view } = deriveTimer(l, T0 + 40 * MIN);
    expect(view.phase).toBe('paused');
    expect(view.remainingMs).toBe(15 * MIN);
  });

  it('moves the end by the paused time after resume', () => {
    const l = log([
      ev(T0 + 10 * MIN, 'pomodoro.paused', { pomodoroId: 'p1' }),
      ev(T0 + 20 * MIN, 'pomodoro.resumed', { pomodoroId: 'p1' }),
    ]);
    expect(deriveTimer(l, T0 + 30 * MIN).view.remainingMs).toBe(5 * MIN);
    const done = deriveTimer(l, T0 + 35 * MIN);
    expect(done.view.phase).toBe('short-break');
    expect(done.due[0]?.at).toBe(T0 + 35 * MIN);
  });
});

describe('deriveTimer: skipping a break', () => {
  it('goes idle after break.skipped', () => {
    const log = [
      started(T0, 'p1'),
      completed(T0 + 25 * MIN, 'p1'),
      ev(T0 + 26 * MIN, 'break.skipped', {}),
    ];
    expect(deriveTimer(log, T0 + 27 * MIN).view.phase).toBe('idle');
  });
});
