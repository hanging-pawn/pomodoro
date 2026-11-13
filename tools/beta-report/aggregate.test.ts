import { describe, expect, it } from 'vitest';
import type { DomainEvent } from '../../src/domain/events';
import { aggregate, type TesterData } from './aggregate';

let n = 0;
const D = (day: string, hour = 9) =>
  Date.parse(`${day}T${String(hour).padStart(2, '0')}:00:00Z`);
const ev = (
  at: number,
  type: DomainEvent['type'],
  payload: object,
): DomainEvent => ({ id: `e${++n}`, at, type, payload }) as DomainEvent;
const started = (at: number, id: string, mode: 'strict' | 'flexible') =>
  ev(at, 'pomodoro.started', {
    pomodoroId: id,
    taskId: 't1',
    mode,
    focusMinutes: 25,
  });
const completed = (at: number, id: string) =>
  ev(at, 'pomodoro.completed', { pomodoroId: id });
const aborted = (at: number, id: string) =>
  ev(at, 'pomodoro.aborted', {
    pomodoroId: id,
    interruption: 'internal',
    workedMinutes: 5,
  });

// Three testers with hand-counted expectations (see the comments).
const anna: TesterData = {
  testerId: 'anna',
  events: [
    // Day 1 (2026-11-14): task t1 + t2 planned, t1 done.
    ev(D('2026-11-14'), 'task.created', {
      taskId: 't1',
      title: 'a',
      estimate: 2,
    }),
    ev(D('2026-11-14'), 'task.created', {
      taskId: 't2',
      title: 'b',
      estimate: 1,
    }),
    ev(D('2026-11-14'), 'plan.changed', {
      day: '2026-11-14',
      taskIds: ['t1', 't2'],
    }),
    started(D('2026-11-14', 10), 'p1', 'strict'),
    completed(D('2026-11-14', 10) + 25 * 60000, 'p1'),
    started(D('2026-11-14', 11), 'p2', 'strict'),
    aborted(D('2026-11-14', 11) + 600000, 'p2'),
    ev(D('2026-11-14', 12), 'task.changed', {
      taskId: 't1',
      changes: { done: true },
    }),
    // Day 2 (2026-11-16): flexible round completed, one redemption, features.
    started(D('2026-11-16'), 'p3', 'flexible'),
    completed(D('2026-11-16') + 25 * 60000, 'p3'),
    ev(D('2026-11-16', 12), 'reward.redeemed', {
      rewardId: 'r1',
      title: 'Coffee',
      price: 30,
    }),
    ev(D('2026-11-16', 13), 'usage.feature-used', { feature: 'park' }),
    ev(D('2026-11-16', 13), 'usage.feature-used', { feature: 'park' }),
    ev(D('2026-11-16', 14), 'usage.feature-used', { feature: 'export' }),
  ],
};
// anna: days 2, completed 2 (strict 1, flexible 1), aborted 1 (strict 1), planned 2 done 1,
// redemptions 1 (30 coins), features park 2 export 1.

const ben: TesterData = {
  testerId: 'ben',
  events: [
    ev(D('2026-11-15'), 'task.created', {
      taskId: 't1',
      title: 'a',
      estimate: 3,
    }),
    ev(D('2026-11-15'), 'plan.changed', { day: '2026-11-15', taskIds: ['t1'] }),
    started(D('2026-11-15', 10), 'q1', 'flexible'),
    aborted(D('2026-11-15', 10) + 60000, 'q1'),
    started(D('2026-11-15', 11), 'q2', 'flexible'),
    aborted(D('2026-11-15', 11) + 60000, 'q2'),
    started(D('2026-11-15', 12), 'q3', 'flexible'),
    completed(D('2026-11-15', 12) + 25 * 60000, 'q3'),
    ev(D('2026-11-15', 13), 'usage.feature-used', { feature: 'park' }),
  ],
};
// ben: days 1, completed 1 (flexible), aborted 2 (flexible), planned 1 done 0, redemptions 0, park 1.

const cara: TesterData = { testerId: 'cara', events: [] };
// cara: nothing yet; all zero, rates null.

describe('aggregate (FR-504)', () => {
  const report = aggregate([anna, ben, cara]);
  const by = (id: string) => report.testers.find((t) => t.testerId === id)!;

  it('counts usage days, pomodoros and aborts per tester', () => {
    expect(by('anna')).toMatchObject({
      usageDays: 2,
      pomodoros: 2,
      aborted: 1,
    });
    expect(by('ben')).toMatchObject({ usageDays: 1, pomodoros: 1, aborted: 2 });
    expect(by('cara')).toMatchObject({
      usageDays: 0,
      pomodoros: 0,
      aborted: 0,
    });
  });

  it('computes the abort rate per mode', () => {
    expect(by('anna').modes.strict).toEqual({
      completed: 1,
      aborted: 1,
      abortRate: 0.5,
    });
    expect(by('anna').modes.flexible).toEqual({
      completed: 1,
      aborted: 0,
      abortRate: 0,
    });
    expect(by('ben').modes.flexible.abortRate).toBeCloseTo(2 / 3);
    expect(by('ben').modes.strict.abortRate).toBeNull();
  });

  it('computes plan fulfilment', () => {
    expect(by('anna')).toMatchObject({
      planned: 2,
      plannedDone: 1,
      planFulfilment: 0.5,
    });
    expect(by('ben')).toMatchObject({
      planned: 1,
      plannedDone: 0,
      planFulfilment: 0,
    });
    expect(by('cara').planFulfilment).toBeNull();
  });

  it('counts redemptions with coins spent and features used', () => {
    expect(by('anna')).toMatchObject({ redemptions: 1, coinsSpent: 30 });
    expect(by('anna').features).toEqual({ park: 2, export: 1 });
    expect(by('ben').features).toEqual({ park: 1 });
  });

  it('totals match the raw data: sums of counts, rates recomputed from the sums', () => {
    expect(report.total).toMatchObject({
      testerId: 'TOTAL',
      usageDays: 3,
      pomodoros: 3,
      aborted: 3,
      planned: 3,
      plannedDone: 1,
      redemptions: 1,
      coinsSpent: 30,
    });
    expect(report.total.features).toEqual({ park: 3, export: 1 });
    expect(report.total.modes.strict).toEqual({
      completed: 1,
      aborted: 1,
      abortRate: 0.5,
    });
    expect(report.total.modes.flexible).toEqual({
      completed: 2,
      aborted: 2,
      abortRate: 0.5,
    });
    expect(report.total.planFulfilment).toBeCloseTo(1 / 3);
  });

  it('ignores duplicate event ids (two devices uploaded the same event)', () => {
    const dup: TesterData = {
      testerId: 'd',
      events: [...anna.events, ...anna.events],
    };
    expect(aggregate([dup]).testers[0]).toMatchObject({
      pomodoros: 2,
      aborted: 1,
    });
  });

  it('lists testers in a stable order by id', () => {
    expect(aggregate([cara, anna, ben]).testers.map((t) => t.testerId)).toEqual(
      ['anna', 'ben', 'cara'],
    );
  });
});
