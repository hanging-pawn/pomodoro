import { describe, expect, it } from 'vitest';
import type { DomainEvent } from '../domain/events';
import { deriveState } from '../domain/state';
import {
  budgetStatus,
  createInventory,
  InventoryError,
  parseLines,
  SPLIT_HINT_FROM,
  todayView,
} from './inventory';

const T = Date.UTC(2026, 10, 13, 10, 0, 0);

function setup() {
  const events: DomainEvent[] = [];
  let clock = T;
  const inv = createInventory({
    log: {
      events: async () => [...events],
      append: async (...e) => void events.push(...e),
    },
    now: () => clock++,
  });
  const state = () => deriveState(events);
  return { inv, events, state };
}

const errorOf = async (p: Promise<unknown>) =>
  p.then(
    () => undefined,
    (e: unknown) => (e instanceof InventoryError ? e.code : 'other'),
  );

describe('inventory CRUD (FR-201)', () => {
  it('creates, changes and deletes a task', async () => {
    const { inv, state } = setup();
    const id = await inv.create({
      title: ' Write report ',
      project: 'Work',
      estimate: 3,
    });
    expect(state().tasks[id]).toMatchObject({
      title: 'Write report',
      project: 'Work',
      estimate: 3,
      done: false,
    });
    await inv.update(id, { title: 'Write the report', estimate: 4 });
    expect(state().tasks[id]).toMatchObject({
      title: 'Write the report',
      estimate: 4,
    });
    await inv.remove(id);
    expect(state().tasks[id]).toBeUndefined();
  });

  it.each([0, -1, 1.5, Number.NaN])('rejects estimate %s', async (estimate) => {
    const { inv, events } = setup();
    expect(await errorOf(inv.create({ title: 'x', estimate }))).toBe(
      'invalid-estimate',
    );
    expect(events).toHaveLength(0);
  });

  it('rejects an empty title', async () => {
    const { inv } = setup();
    expect(await errorOf(inv.create({ title: '  ', estimate: 1 }))).toBe(
      'empty-title',
    );
  });

  it('rejects an invalid estimate on update as well', async () => {
    const { inv } = setup();
    const id = await inv.create({ title: 'a', estimate: 2 });
    expect(await errorOf(inv.update(id, { estimate: 0 }))).toBe(
      'invalid-estimate',
    );
  });
});

describe('split hint (FR-202)', () => {
  it('starts at 8 rounds', () => expect(SPLIT_HINT_FROM).toBe(8));

  it('needs confirmation for estimate 8, and saves once confirmed', async () => {
    const { inv, state } = setup();
    expect(await errorOf(inv.create({ title: 'Big', estimate: 8 }))).toBe(
      'needs-confirmation',
    );
    expect(Object.keys(state().tasks)).toHaveLength(0);
    const id = await inv.create(
      { title: 'Big', estimate: 8 },
      { confirmed: true },
    );
    expect(state().tasks[id]?.estimate).toBe(8);
  });

  it('does not ask for 7', async () => {
    const { inv } = setup();
    await expect(inv.create({ title: 'Ok', estimate: 7 })).resolves.toBeTypeOf(
      'string',
    );
  });

  it('also guards an update raising the estimate to 8', async () => {
    const { inv } = setup();
    const id = await inv.create({ title: 'a', estimate: 2 });
    expect(await errorOf(inv.update(id, { estimate: 9 }))).toBe(
      'needs-confirmation',
    );
  });
});

describe('today plan and budget (FR-203, FR-305)', () => {
  it('budget 8 with 10 planned shows 2 over budget', async () => {
    const { inv, state } = setup();
    const a = await inv.create({ title: 'a', estimate: 5 });
    const b = await inv.create({ title: 'b', estimate: 5 });
    await inv.addToToday(a);
    await inv.addToToday(b);
    const s = state();
    const view = todayView(s, T);
    expect(view.tasks.map((x) => x.id)).toEqual([a, b]);
    expect(budgetStatus(view.planned, s.settings.dailyBudget)).toEqual({
      planned: 10,
      budget: 8,
      over: 2,
    });
  });

  it('adding twice keeps one entry; reorder moves a task', async () => {
    const { inv, state } = setup();
    const a = await inv.create({ title: 'a', estimate: 1 });
    const b = await inv.create({ title: 'b', estimate: 1 });
    await inv.addToToday(a);
    await inv.addToToday(a);
    await inv.addToToday(b);
    await inv.moveInToday(b, -1);
    expect(todayView(state(), T).tasks.map((x) => x.id)).toEqual([b, a]);
    await inv.moveInToday(b, -1); // already first: no-op
    expect(todayView(state(), T).tasks.map((x) => x.id)).toEqual([b, a]);
  });

  it('removing from today keeps the task in the inventory', async () => {
    const { inv, state } = setup();
    const a = await inv.create({ title: 'a', estimate: 1 });
    await inv.addToToday(a);
    await inv.removeFromToday(a);
    expect(todayView(state(), T).tasks).toEqual([]);
    expect(state().tasks[a]).toBeDefined();
  });

  it('checking off marks done and removes the task from today', async () => {
    const { inv, state } = setup();
    const a = await inv.create({ title: 'a', estimate: 2 });
    await inv.addToToday(a);
    await inv.checkOff(a);
    expect(state().tasks[a]?.done).toBe(true);
    expect(todayView(state(), T).tasks).toEqual([]);
  });

  it('a deleted task leaves the plan', async () => {
    const { inv, state } = setup();
    const a = await inv.create({ title: 'a', estimate: 2 });
    await inv.addToToday(a);
    await inv.remove(a);
    expect(todayView(state(), T).tasks).toEqual([]);
  });

  it('the budget can be changed and must be a whole number of at least 1', async () => {
    const { inv, state } = setup();
    await inv.setBudget(6);
    expect(state().settings.dailyBudget).toBe(6);
    expect(await errorOf(inv.setBudget(0))).toBe('invalid-budget');
  });
});

describe('parseLines (FR-206)', () => {
  it('drops blank lines and list markers', () => {
    expect(parseLines('a\r\n\n - b\n2) c\n  ')).toEqual(['a', 'b', 'c']);
  });
});

describe('subtasks (FR-209)', () => {
  it('2+2+3 → parent estimate 7; one done → progress 1/3', async () => {
    const events: DomainEvent[] = [];
    let clock = T;
    const inv = createInventory({
      log: {
        events: async () => [...events],
        append: async (...e) => void events.push(...e),
      },
      now: () => clock++,
    });
    const parent = await inv.create({ title: 'Release', estimate: 1 });
    const a = await inv.createSubtask(parent, { title: 'a', estimate: 2 });
    await inv.createSubtask(parent, { title: 'b', estimate: 2 });
    await inv.createSubtask(parent, { title: 'c', estimate: 3 });
    await inv.checkOff(a);
    const p = deriveState(events).tasks[parent]!;
    expect(p.estimate).toBe(7);
    expect(p.subtasks).toEqual({ done: 1, total: 3 });
  });

  it('refuses nested subtasks and an unknown parent', async () => {
    const events: DomainEvent[] = [];
    const inv = createInventory({
      log: {
        events: async () => [...events],
        append: async (...e) => void events.push(...e),
      },
    });
    const parent = await inv.create({ title: 'P', estimate: 1 });
    const sub = await inv.createSubtask(parent, { title: 's', estimate: 1 });
    await expect(
      inv.createSubtask(sub, { title: 'x', estimate: 1 }),
    ).rejects.toMatchObject({ code: 'nested-subtask' });
    await expect(
      inv.createSubtask('nope', { title: 'x', estimate: 1 }),
    ).rejects.toMatchObject({ code: 'unknown-task' });
  });

  it('createSplit spreads the estimate over the lines and keeps the total', async () => {
    const events: DomainEvent[] = [];
    const inv = createInventory({
      log: {
        events: async () => [...events],
        append: async (...e) => void events.push(...e),
      },
    });
    const { parentId } = await inv.createSplit({ title: 'Big', estimate: 8 }, [
      'a',
      'b',
      'c',
    ]);
    const s = deriveState(events);
    expect(s.tasks[parentId]!.estimate).toBe(8);
    const subs = Object.values(s.tasks).filter((t) => t.parentId === parentId);
    expect(subs.map((t) => t.estimate)).toEqual([3, 3, 2]);
  });
});

describe('due dates and recurrence (FR-207, FR-208)', () => {
  const MON = Date.UTC(2026, 10, 9, 10, 0, 0); // Monday 2026-11-09, local-time safe at noon-ish

  function at(clockStart: number) {
    const events: DomainEvent[] = [];
    let clock = clockStart;
    const inv = createInventory({
      log: {
        events: async () => [...events],
        append: async (...e) => void events.push(...e),
      },
      now: () => clock++,
    });
    return { inv, events, state: () => deriveState(events) };
  }

  it('stores an optional due date and clears it with an empty one', async () => {
    const { inv, state } = at(MON);
    const id = await inv.create({
      title: 'Tax',
      estimate: 1,
      due: '2026-11-12',
    });
    expect(state().tasks[id]?.due).toBe('2026-11-12');
    await inv.update(id, { due: '' });
    expect(state().tasks[id]?.due).toBeFalsy();
  });

  it('rejects a malformed due date', async () => {
    const { inv } = at(MON);
    expect(
      await errorOf(inv.create({ title: 'x', estimate: 1, due: '12.11.2026' })),
    ).toBe('invalid-due');
  });

  it('weekly Monday task done → new instance due next Monday', async () => {
    const { inv, state } = at(MON);
    const id = await inv.create({
      title: 'Weekly review',
      estimate: 2,
      due: '2026-11-09',
      recurrence: 'weekly',
    });
    await inv.checkOff(id);
    const tasks = Object.values(state().tasks);
    const next = tasks.find((x) => x.id !== id);
    expect(state().tasks[id]?.done).toBe(true);
    expect(next).toMatchObject({
      title: 'Weekly review',
      estimate: 2,
      due: '2026-11-16',
      recurrence: 'weekly',
      done: false,
    });
  });

  it('a second check-off of the same task does not spawn a second instance', async () => {
    const { inv, state } = at(MON);
    const id = await inv.create({
      title: 'Daily',
      estimate: 1,
      due: '2026-11-09',
      recurrence: 'daily',
    });
    await inv.checkOff(id);
    await inv.checkOff(id);
    expect(Object.keys(state().tasks)).toHaveLength(2);
  });

  it('a task without recurrence spawns nothing', async () => {
    const { inv, state } = at(MON);
    const id = await inv.create({ title: 'Once', estimate: 1 });
    await inv.checkOff(id);
    expect(Object.keys(state().tasks)).toHaveLength(1);
  });
});

describe('second estimate (FR-304)', () => {
  it('is logged as its own event and leaves the first estimate untouched', async () => {
    const { inv, events, state } = setup();
    const id = await inv.create({ title: 'Report', estimate: 2 });
    await inv.reestimate(id, 4);
    expect(events.filter((e) => e.type === 'task.reestimated')).toHaveLength(1);
    expect(state().tasks[id]).toMatchObject({ estimate: 2, secondEstimate: 4 });
  });

  it('rejects a non-positive second estimate', async () => {
    const { inv } = setup();
    const id = await inv.create({ title: 'Report', estimate: 2 });
    expect(await errorOf(inv.reestimate(id, 0))).toBe('invalid-estimate');
  });
});

describe('project target date (FR-608)', () => {
  it('stores, validates and clears a target date', async () => {
    const { inv, state } = setup();
    await inv.setProjectTarget(' Exam ', '2026-12-12');
    expect(state().projects).toEqual({ Exam: { targetDate: '2026-12-12' } });
    expect(await errorOf(inv.setProjectTarget('Exam', '12.12.'))).toBe(
      'invalid-due',
    );
    expect(await errorOf(inv.setProjectTarget(' ', '2026-12-12'))).toBe(
      'empty-title',
    );
    await inv.setProjectTarget('Exam', '');
    expect(state().projects).toEqual({});
  });
});
