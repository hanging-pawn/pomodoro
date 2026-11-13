import { describe, expect, it } from 'vitest';
import { newEvent, type DomainEvent } from '../domain/events';
import { deriveState } from '../domain/state';
import { dayKey } from '../tasks/inventory';
import { deriveTagesweg, type TagesRow } from './model';

const task = (r?: TagesRow) => r as Extract<TagesRow, { kind: 'task' }>;
const reward = (r?: TagesRow) => r as Extract<TagesRow, { kind: 'reward' }>;

const NOW = Date.UTC(2026, 10, 13, 9, 0, 0);
const idle = {
  phase: 'idle',
  remainingMs: 0,
  totalMs: 0,
  completedInSet: 0,
} as const;

function log(extra: DomainEvent[] = []) {
  return deriveState([
    newEvent('task.created', { taskId: 'a', title: 'Report', estimate: 2 }, 1),
    newEvent('task.created', { taskId: 'b', title: 'Mail', estimate: 1 }, 2),
    newEvent('plan.changed', { day: dayKey(NOW), taskIds: ['a', 'b'] }, 3),
    newEvent('reward.saved', { rewardId: 'r1', title: 'Walk', price: 20 }, 4),
    ...extra,
  ]);
}

describe('deriveTagesweg', () => {
  it('one row per planned task with one station per round', () => {
    const w = deriveTagesweg(log(), idle, NOW);
    const tasks = w.rows.filter((r) => r.kind === 'task');
    expect(tasks.map((r) => r.kind === 'task' && r.stations.length)).toEqual([
      2, 1,
    ]);
  });

  it('Abnahme FR-602: 4 tasks (2/2/1/1 rounds), 2 done → 4 rows, 6 stations, 2 coloured, location at station 3', () => {
    const round = (id: string, task: string, at: number) => [
      newEvent(
        'pomodoro.started',
        { pomodoroId: id, taskId: task, mode: 'strict', focusMinutes: 25 },
        at,
      ),
      newEvent('pomodoro.completed', { pomodoroId: id }, at + 1),
    ];
    const w = deriveTagesweg(
      deriveState([
        newEvent('task.created', { taskId: 'a', title: 'A', estimate: 2 }, 1),
        newEvent('task.created', { taskId: 'b', title: 'B', estimate: 2 }, 2),
        newEvent('task.created', { taskId: 'c', title: 'C', estimate: 1 }, 3),
        newEvent('task.created', { taskId: 'd', title: 'D', estimate: 1 }, 4),
        newEvent(
          'plan.changed',
          { day: dayKey(NOW), taskIds: ['a', 'b', 'c', 'd'] },
          5,
        ),
        ...round('p1', 'a', 10),
        ...round('p2', 'a', 20),
      ]),
      idle,
      NOW,
    );
    const rows = w.rows.filter((r) => r.kind === 'task').map(task);
    expect(rows).toHaveLength(4);
    const stations = rows.flatMap((r) => r.stations);
    expect(stations).toHaveLength(6);
    expect(stations.filter((s) => s === 'done')).toHaveLength(2);
    // the location dot sits at the 3rd station: first open round of task b
    expect(stations.indexOf('current')).toBe(2);
    expect(w.currentTaskId).toBe('b');
  });

  it('when every estimate is reached the first task gets one more station, so a round can start', () => {
    const w = deriveTagesweg(
      deriveState([
        newEvent('task.created', { taskId: 'a', title: 'A', estimate: 1 }, 1),
        newEvent('plan.changed', { day: dayKey(NOW), taskIds: ['a'] }, 2),
        newEvent(
          'pomodoro.started',
          { pomodoroId: 'p', taskId: 'a', mode: 'strict', focusMinutes: 25 },
          3,
        ),
        newEvent('pomodoro.completed', { pomodoroId: 'p' }, 4),
      ]),
      idle,
      NOW,
    );
    expect(task(w.rows[0]).stations).toEqual(['done', 'current']);
    expect(w.currentTaskId).toBe('a');
  });

  it('marks stations done by actual rounds and the first open one as current', () => {
    const state = log([
      newEvent(
        'pomodoro.started',
        { pomodoroId: 'p', taskId: 'a', mode: 'strict', focusMinutes: 25 },
        5,
      ),
      newEvent('pomodoro.completed', { pomodoroId: 'p' }, 6),
    ]);
    const w = deriveTagesweg(state, idle, NOW);
    const a = w.rows[0];
    expect(task(a).stations).toEqual(['done', 'current']);
    expect(w.currentTaskId).toBe('a');
  });

  it('places a reward row where projected coins reach its price and marks reached ones', () => {
    const w = deriveTagesweg(log(), idle, NOW);
    // 0 coins, 10 per round: price 20 is reached after round 2, i.e. after task a
    expect(w.rows.map((r) => r.kind)).toEqual(['task', 'reward', 'task']);
    expect(reward(w.rows[1]).toGo).toBe(20);
    const rich = deriveTagesweg(
      log([newEvent('coins.earned', { amount: 25, reason: 'set-bonus' }, 7)]),
      idle,
      NOW,
    );
    const r = rich.rows.find((x) => x.kind === 'reward');
    expect(reward(r).reached).toBe(true);
  });

  it('hides coins and reward rows when gamification is off (FR-405)', () => {
    const w = deriveTagesweg(
      log([
        newEvent('settings.changed', { changes: { gamification: 'off' } }, 8),
      ]),
      idle,
      NOW,
    );
    expect(w.rows.every((r) => r.kind === 'task')).toBe(true);
    expect(w.showCoins).toBe(false);
  });

  it('zooms to the current task during a round (FR-604)', () => {
    const w = deriveTagesweg(
      log(),
      {
        ...idle,
        phase: 'focus',
        remainingMs: 5 * 60_000,
        totalMs: 25 * 60_000,
        taskId: 'b',
      },
      NOW,
    );
    expect(w.zoom).toEqual({ taskId: 'b', progress: 0.8 });
  });

  it('does not zoom in a break', () => {
    const w = deriveTagesweg(
      log(),
      { ...idle, phase: 'short-break', remainingMs: 1, totalMs: 2 },
      NOW,
    );
    expect(w.zoom).toBeUndefined();
  });
  describe('approximate time of a reward row (FR-603)', () => {
    const MIN = 60_000;
    // Stand 20, Preis 40, je Runde +10: reached after the 2nd open round.
    const base = (extra: DomainEvent[] = []) =>
      deriveState([
        newEvent(
          'task.created',
          { taskId: 'a', title: 'Report', estimate: 3 },
          1,
        ),
        newEvent('plan.changed', { day: dayKey(NOW), taskIds: ['a'] }, NOW),
        newEvent('coins.earned', { amount: 20, reason: 'set-bonus' }, 2),
        newEvent(
          'reward.saved',
          { rewardId: 'k', title: 'Coffee', price: 40 },
          3,
        ),
        ...extra,
      ]);
    const eta = (w: ReturnType<typeof deriveTagesweg>) =>
      reward(w.rows.find((r) => r.kind === 'reward')).etaAt;

    it('places the row after the task and estimates its time two rounds from the last plan change', () => {
      const w = deriveTagesweg(base(), idle, NOW);
      expect(w.rows.map((r) => r.kind)).toEqual(['task', 'reward']);
      expect(reward(w.rows[1]).toGo).toBe(20);
      // 2 rounds of 25 min focus + 5 min break after the plan change at NOW
      expect(eta(w)).toBe(NOW + 2 * 30 * MIN);
    });

    it('Abnahme case with one-round tasks: the row follows the 2nd open round', () => {
      const w = deriveTagesweg(
        deriveState([
          newEvent('task.created', { taskId: 'a', title: 'A', estimate: 1 }, 1),
          newEvent('task.created', { taskId: 'b', title: 'B', estimate: 1 }, 2),
          newEvent('task.created', { taskId: 'c', title: 'C', estimate: 1 }, 3),
          newEvent(
            'plan.changed',
            { day: dayKey(NOW), taskIds: ['a', 'b', 'c'] },
            NOW,
          ),
          newEvent('coins.earned', { amount: 20, reason: 'set-bonus' }, 4),
          newEvent(
            'reward.saved',
            { rewardId: 'k', title: 'Coffee', price: 40 },
            5,
          ),
        ]),
        idle,
        NOW,
      );
      // Stand 20, Preis 40, je Runde +10 → after round 2 (task b), before task c
      expect(
        w.rows.map((r) => (r.kind === 'task' ? r.taskId : 'reward')),
      ).toEqual(['a', 'b', 'reward', 'c']);
      expect(eta(w)).toBe(NOW + 2 * 30 * MIN);
    });

    it('keeps the time while the clock runs', () => {
      const later = deriveTagesweg(base(), idle, NOW + 17 * MIN);
      expect(eta(later)).toBe(NOW + 60 * MIN);
    });

    it('moves the time at a round end', () => {
      const end = NOW + 40 * MIN;
      const w = deriveTagesweg(
        base([
          newEvent(
            'pomodoro.started',
            { pomodoroId: 'p', taskId: 'a', mode: 'strict', focusMinutes: 25 },
            NOW + 15 * MIN,
          ),
          newEvent('pomodoro.completed', { pomodoroId: 'p' }, end),
        ]),
        idle,
        end + 3 * MIN,
      );
      // balance 30 now: one more round
      expect(eta(w)).toBe(end + 30 * MIN);
    });

    it('moves the time at a plan change', () => {
      const change = NOW + 20 * MIN;
      const w = deriveTagesweg(
        base([
          newEvent(
            'plan.changed',
            { day: dayKey(NOW), taskIds: ['a'] },
            change,
          ),
        ]),
        idle,
        change + MIN,
      );
      expect(eta(w)).toBe(change + 60 * MIN);
    });

    it('has no time for a reached reward or one out of reach of the plan', () => {
      const rich = deriveTagesweg(
        base([
          newEvent('coins.earned', { amount: 30, reason: 'set-bonus' }, 4),
        ]),
        idle,
        NOW,
      );
      expect(eta(rich)).toBeUndefined();
      const far = deriveTagesweg(
        base([
          newEvent(
            'reward.saved',
            { rewardId: 'k', title: 'Trip', price: 900 },
            5,
          ),
        ]),
        idle,
        NOW,
      );
      expect(eta(far)).toBeUndefined();
    });
  });
});
