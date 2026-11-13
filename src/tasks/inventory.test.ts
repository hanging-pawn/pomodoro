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
