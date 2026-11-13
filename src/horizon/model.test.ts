import { describe, expect, it } from 'vitest';
import { newEvent, type DomainEvent } from '../domain/events';
import { deriveState } from '../domain/state';
import { deriveHorizon } from './model';

const NOW = new Date(2026, 10, 13, 10, 0).getTime();
const at = (m: number, d: number) => new Date(2026, m - 1, d, 9).getTime();

const task = (taskId: string, project: string, created: number) =>
  newEvent(
    'task.created',
    { taskId, title: taskId, project, estimate: 1 },
    created,
  );
const target = (project: string, date: string) =>
  newEvent('project.targeted', { project, date }, NOW - 1000);

const horizon = (events: DomainEvent[]) =>
  deriveHorizon(deriveState(events), NOW);

describe('deriveHorizon (FR-607, FR-608)', () => {
  it('gives one line per project with a target date, nearest first', () => {
    const lines = horizon([
      task('a1', 'A', at(11, 1)),
      task('b1', 'B', at(11, 1)),
      task('c1', 'C', at(11, 1)),
      task('x1', 'NoDate', at(11, 1)),
      target('A', '2026-12-24'),
      target('B', '2026-12-12'),
      target('C', '2027-01-15'),
    ]);
    expect(lines.map((l) => l.project)).toEqual(['B', 'A', 'C']);
  });

  it('counts the days left and marks today between start and target', () => {
    const [line] = horizon([
      task('b1', 'B', at(11, 3)),
      target('B', '2026-11-23'),
    ]);
    expect(line).toMatchObject({ daysLeft: 10, today: 0.5 });
  });

  it('points at the next open task of the project, planned tasks first', () => {
    const [line] = horizon([
      task('old', 'B', at(11, 1)),
      task('planned', 'B', at(11, 2)),
      task('other', 'A', at(11, 1)),
      newEvent(
        'task.changed',
        { taskId: 'old', changes: { done: true } },
        NOW - 500,
      ),
      target('B', '2026-12-12'),
    ]);
    expect(line).toMatchObject({ nextTaskId: 'planned', done: 1, total: 2 });
  });

  it('clearing the date removes the line', () => {
    expect(
      horizon([
        task('a', 'A', at(11, 1)),
        target('A', '2026-12-12'),
        newEvent('project.targeted', { project: 'A', date: '' }, NOW - 10),
      ]),
    ).toEqual([]);
  });
});
