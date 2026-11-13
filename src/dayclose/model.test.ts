import { describe, expect, it } from 'vitest';
import { newEvent, type DomainEvent } from '../domain/events';
import { deriveState } from '../domain/state';
import { dayKey } from '../tasks/inventory';
import { deriveDayClose } from './model';

const D = new Date(2026, 10, 13, 12, 0, 0).getTime();
const Y = D - 24 * 3600_000;

function round(id: string, taskId: string, at: number): DomainEvent[] {
  return [
    newEvent(
      'pomodoro.started',
      { pomodoroId: id, taskId, mode: 'strict', focusMinutes: 25 },
      at,
    ),
    newEvent('pomodoro.completed', { pomodoroId: id }, at + 1),
  ];
}

const fixture = (): DomainEvent[] => [
  newEvent('task.created', { taskId: 'a', title: 'Report', estimate: 2 }, 1),
  newEvent('task.created', { taskId: 'b', title: 'Mail', estimate: 3 }, 2),
  newEvent('plan.changed', { day: dayKey(D), taskIds: ['a', 'b'] }, 3),
  ...round('p1', 'a', D),
  ...round('p2', 'a', D + 10),
  ...round('p3', 'a', D + 20),
  ...round('old', 'b', Y), // yesterday: not part of today's actual
  newEvent(
    'interruption.parked',
    { text: 'x', kind: 'internal', taskId: 'a' },
    D + 30,
  ),
  newEvent('interruption.parked', { text: 'y', kind: 'internal' }, D + 31),
  newEvent(
    'interruption.parked',
    { text: 'z', kind: 'external', taskId: 'a' },
    D + 32,
  ),
  newEvent('interruption.parked', { text: 'old', kind: 'external' }, Y),
  newEvent(
    'pomodoro.started',
    { pomodoroId: 'ab', taskId: 'b', mode: 'strict', focusMinutes: 25 },
    D + 40,
  ),
  newEvent(
    'pomodoro.aborted',
    { pomodoroId: 'ab', interruption: 'external', workedMinutes: 3 },
    D + 41,
  ),
];

describe('deriveDayClose (FR-302)', () => {
  it('per task: estimate, actual of the day, difference', () => {
    const c = deriveDayClose(deriveState(fixture()), D);
    expect(
      c.rows.map((r) => [r.title, r.estimate, r.actual, r.difference]),
    ).toEqual([
      ['Report', 2, 3, 1],
      ['Mail', 3, 0, -3],
    ]);
  });

  it('sums interruptions of the day by type: parked notes and aborted rounds', () => {
    const c = deriveDayClose(deriveState(fixture()), D);
    expect(c.interruptions).toEqual({ internal: 2, external: 2 });
  });

  it('second estimate is separate and only offered when actual exceeds estimate (FR-304)', () => {
    const events = [
      ...fixture(),
      newEvent('task.reestimated', { taskId: 'a', estimate: 4 }, D + 50),
    ];
    const c = deriveDayClose(deriveState(events), D);
    const [a, b] = c.rows;
    expect(a).toMatchObject({
      estimate: 2,
      secondEstimate: 4,
      canReestimate: true,
    });
    expect(b).toMatchObject({
      secondEstimate: undefined,
      canReestimate: false,
    });
  });
});
