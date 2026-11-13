import { describe, expect, it } from 'vitest';
import type { DomainEvent } from './events';
import { deriveState } from './state';

const ev = (
  id: string,
  at: number,
  rest: Omit<DomainEvent, 'id' | 'at'>,
): DomainEvent => ({ id, at, ...rest }) as DomainEvent;

describe('deriveState', () => {
  it('derives tasks, completed pomodoros per task and coin balance from the log', () => {
    const log: DomainEvent[] = [
      ev('e1', 1, {
        type: 'task.created',
        payload: { taskId: 't1', title: 'Write', estimate: 2 },
      }),
      ev('e2', 2, {
        type: 'pomodoro.started',
        payload: {
          pomodoroId: 'p1',
          taskId: 't1',
          mode: 'strict',
          focusMinutes: 25,
        },
      }),
      ev('e3', 3, {
        type: 'pomodoro.completed',
        payload: { pomodoroId: 'p1' },
      }),
      ev('e4', 4, {
        type: 'coins.earned',
        payload: { amount: 10, reason: 'pomodoro', pomodoroId: 'p1' },
      }),
      ev('e5', 5, {
        type: 'pomodoro.started',
        payload: {
          pomodoroId: 'p2',
          taskId: 't1',
          mode: 'strict',
          focusMinutes: 25,
        },
      }),
      ev('e6', 6, {
        type: 'pomodoro.aborted',
        payload: {
          pomodoroId: 'p2',
          interruption: 'external',
          workedMinutes: 12,
        },
      }),
      ev('e7', 7, {
        type: 'reward.redeemed',
        payload: { rewardId: 'r1', title: 'Coffee', price: 4 },
      }),
    ];

    const s = deriveState(log);

    expect(Object.keys(s.tasks)).toEqual(['t1']);
    expect(s.tasks.t1).toMatchObject({
      title: 'Write',
      estimate: 2,
      actual: 1,
      done: false,
    });
    expect(s.pomodoros.completed).toBe(1);
    expect(s.pomodoros.aborted).toBe(1);
    expect(s.coins).toBe(6);
    expect(s.redemptions).toHaveLength(1);
  });

  it('applies task changes and deletions, and settings over the defaults', () => {
    const s = deriveState([
      ev('a', 1, {
        type: 'task.created',
        payload: { taskId: 't1', title: 'A', estimate: 1 },
      }),
      ev('b', 2, {
        type: 'task.created',
        payload: { taskId: 't2', title: 'B', estimate: 1 },
      }),
      ev('c', 3, {
        type: 'task.changed',
        payload: { taskId: 't1', changes: { title: 'A2', done: true } },
      }),
      ev('d', 4, { type: 'task.deleted', payload: { taskId: 't2' } }),
      ev('e', 5, {
        type: 'settings.changed',
        payload: { changes: { mode: 'flexible' } },
      }),
    ]);
    expect(Object.keys(s.tasks)).toEqual(['t1']);
    expect(s.tasks.t1).toMatchObject({ title: 'A2', done: true });
    expect(s.settings.mode).toBe('flexible');
    expect(s.settings.focusMinutes).toBe(25);
  });

  it('is independent of input order and ignores duplicate event ids', () => {
    const created = ev('a', 1, {
      type: 'task.created',
      payload: { taskId: 't1', title: 'A', estimate: 1 },
    });
    const renamed = ev('b', 2, {
      type: 'task.changed',
      payload: { taskId: 't1', changes: { title: 'B' } },
    });
    const coins = ev('c', 3, {
      type: 'coins.earned',
      payload: { amount: 10, reason: 'pomodoro' },
    });
    const s = deriveState([coins, renamed, created, coins]);
    expect(s.tasks.t1?.title).toBe('B');
    expect(s.coins).toBe(10);
  });
});
