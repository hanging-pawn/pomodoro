import { describe, expect, it } from 'vitest';
import { newEvent, type DomainEvent } from '../domain/events';
import { deriveState } from '../domain/state';
import { dayKey } from '../tasks/inventory';
import { deriveWeek } from './model';

// Fri 2026-11-13; week Mon 2026-11-09 .. Sun 2026-11-15.
const FRI = new Date(2026, 10, 13, 12, 0, 0).getTime();
const at = (d: number, h = 10) => new Date(2026, 10, d, h, 0, 0).getTime();

function round(id: string, taskId: string, when: number): DomainEvent[] {
  return [
    newEvent(
      'pomodoro.started',
      { pomodoroId: id, taskId, mode: 'strict', focusMinutes: 25 },
      when,
    ),
    newEvent('pomodoro.completed', { pomodoroId: id }, when + 1),
  ];
}

// Fixture log: the sums below are counted by hand from these events.
const log: DomainEvent[] = [
  newEvent(
    'task.created',
    { taskId: 'a', title: 'A', project: 'Alpha', estimate: 4 },
    1,
  ),
  newEvent(
    'task.created',
    { taskId: 'b', title: 'B', project: 'Beta', estimate: 2 },
    2,
  ),
  newEvent('task.created', { taskId: 'c', title: 'C', estimate: 1 }, 3),
  newEvent('plan.changed', { day: '2026-11-09', taskIds: ['a'] }, 4),
  newEvent('plan.changed', { day: '2026-11-10', taskIds: ['b', 'c'] }, 5),
  // Mon: 2x Alpha
  ...round('p1', 'a', at(9)),
  ...round('p2', 'a', at(9, 11)),
  // Tue: 1x Beta, 1x without project
  ...round('p3', 'b', at(10)),
  ...round('p4', 'c', at(10, 11)),
  // Fri: 1x Alpha
  ...round('p5', 'a', at(13)),
  // Sunday before (outside the week): ignored
  ...round('p6', 'a', at(8, 23)),
  // Monday after (outside the week): ignored
  ...round('p7', 'a', at(16, 0)),
  // aborted round never counts
  newEvent(
    'pomodoro.started',
    { pomodoroId: 'p8', taskId: 'a', mode: 'strict', focusMinutes: 25 },
    at(11),
  ),
  newEvent(
    'pomodoro.aborted',
    { pomodoroId: 'p8', interruption: 'internal', workedMinutes: 5 },
    at(11) + 1,
  ),
];

describe('deriveWeek (FR-303)', () => {
  const week = deriveWeek(deriveState(log), FRI);

  it('spans Monday to Sunday of the week containing now', () => {
    expect(week.days.map((d) => d.day)).toEqual([
      '2026-11-09',
      '2026-11-10',
      '2026-11-11',
      '2026-11-12',
      '2026-11-13',
      '2026-11-14',
      '2026-11-15',
    ]);
  });

  it('counts completed pomodoros per day matching the event log', () => {
    expect(week.days.map((d) => d.completed)).toEqual([2, 2, 0, 0, 1, 0, 0]);
    expect(week.total).toBe(5);
  });

  it('counts per project, no project last', () => {
    expect(week.projects).toEqual([
      { project: 'Alpha', completed: 3 },
      { project: 'Beta', completed: 1 },
      { project: '', completed: 1 },
    ]);
    expect(week.days[1]!.projects).toEqual([
      { project: 'Beta', completed: 1 },
      { project: '', completed: 1 },
    ]);
  });

  it('computes plan fulfilment: completed rounds on planned tasks / planned estimate', () => {
    // planned: Mon a=4, Tue b=2 + c=1 -> 7; done on planned days of planned tasks: Mon 2 + Tue 2 = 4
    expect(week.planned).toBe(7);
    expect(week.fulfilled).toBe(4);
    expect(week.percent).toBe(57);
  });

  it('gives 0 percent when nothing is planned', () => {
    const empty = deriveWeek(deriveState([]), FRI);
    expect(empty.percent).toBe(0);
    expect(empty.total).toBe(0);
    expect(dayKey(FRI)).toBe('2026-11-13');
  });

  it('rolls subtasks into the parent project', () => {
    const w = deriveWeek(
      deriveState([
        newEvent(
          'task.created',
          { taskId: 'p', title: 'P', project: 'Alpha', estimate: 1 },
          1,
        ),
        newEvent(
          'task.created',
          { taskId: 's', title: 'S', parentId: 'p', estimate: 1 },
          2,
        ),
        ...round('r1', 's', at(10)),
      ]),
      FRI,
    );
    expect(w.projects).toEqual([{ project: 'Alpha', completed: 1 }]);
  });
});
