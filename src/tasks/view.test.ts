import { describe, expect, it } from 'vitest';
import type { DomainEvent } from '../domain/events';
import { deriveState } from '../domain/state';
import { createI18n } from '../i18n/i18n';
import { createInventory } from './inventory';
import { mountTasks } from './view';

const T = Date.UTC(2026, 10, 13, 10, 0, 0);
const flush = () => new Promise((r) => setTimeout(r, 0));

async function setup() {
  const events: DomainEvent[] = [];
  let clock = T;
  const now = () => clock++;
  const inventory = createInventory({
    log: {
      events: async () => [...events],
      append: async (...e) => void events.push(...e),
    },
    now,
  });
  const root = document.createElement('div');
  document.body.replaceChildren(root);
  mountTasks(
    root,
    createI18n({ languages: ['en'], storage: undefined as unknown as Storage }),
    inventory,
    { state: async () => deriveState(events), now: () => T },
  );
  await flush();
  const state = () => deriveState(events);
  const type = async (name: string, value: string) => {
    const i = root.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
    i.value = value;
    i.dispatchEvent(new Event('input'));
  };
  const submit = async () => {
    root
      .querySelector('input[name="title"]')!
      .closest('form')!
      .dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
  };
  // Document-wide: row actions live in the view, rarer ones in the «…» sheet (a dialog on body).
  const click = async (a: string, nth = 0) => {
    document
      .querySelectorAll<HTMLElement>(`[data-action="${a}"]`)
      [nth]!.click();
    await flush();
  };
  const add = async (title: string, estimate: string) => {
    await type('title', title);
    await type('estimate', estimate);
    await submit();
  };
  return { root, state, type, submit, click, add };
}

describe('mountTasks', () => {
  it('adds a task from the form and lists it', async () => {
    const { root, add, state } = await setup();
    await add('Write report', '3');
    expect(Object.values(state().tasks)[0]).toMatchObject({
      title: 'Write report',
      estimate: 3,
    });
    expect(
      root.querySelector('[data-role="inventory-list"]')?.textContent,
    ).toContain('Write report');
  });

  it('shows an error for an invalid estimate and saves nothing', async () => {
    const { root, add, state } = await setup();
    await add('x', '0');
    expect(Object.keys(state().tasks)).toHaveLength(0);
    expect(root.querySelector<HTMLElement>('[data-role="error"]')?.hidden).toBe(
      false,
    );
  });

  it('shows the split hint when the estimate is 8 and saves only after confirmation', async () => {
    const { root, type, submit, state } = await setup();
    await type('title', 'Big');
    await type('estimate', '8');
    expect(
      root.querySelector<HTMLElement>('[data-role="split-hint"]')?.hidden,
    ).toBe(false);
    await submit();
    expect(Object.keys(state().tasks)).toHaveLength(0);
    document.querySelector<HTMLElement>('[data-action="back"]')!.click();
    await flush();
    expect(Object.keys(state().tasks)).toHaveLength(0);
    await submit();
    document.querySelector<HTMLElement>('[data-action="save"]')!.click();
    await flush();
    expect(Object.values(state().tasks)[0]?.estimate).toBe(8);
  });

  it('budget 8 with 10 planned shows «2 over budget»', async () => {
    const { root, add, click } = await setup();
    await add('a', '5');
    await add('b', '5');
    await click('add-today');
    await click('add-today');
    expect(root.querySelector('[data-role="budget"]')?.textContent).toBe(
      '2 over budget',
    );
  });

  it('checking off removes the task from Today and marks it done', async () => {
    const { root, add, click, state } = await setup();
    await add('a', '2');
    await click('add-today');
    await click('check-off');
    expect(Object.values(state().tasks)[0]?.done).toBe(true);
    expect(root.querySelector('[data-role="today-list"]')).toBeNull();
  });

  it('deletes a task', async () => {
    const { add, click, state } = await setup();
    await add('a', '2');
    await click('more');
    await click('delete');
    await flush();
    expect(Object.keys(state().tasks)).toHaveLength(0);
  });

  it('reorders Today', async () => {
    const { root, add, click } = await setup();
    await add('a', '1');
    await add('b', '1');
    await click('add-today');
    await click('add-today');
    await click('more'); // the first «…» belongs to the first row of Today
    await click('move-down');
    await flush();
    const titles = [
      ...root.querySelectorAll('[data-role="today-list"] .ui-row__title'),
    ].map((x) => x.textContent);
    expect(titles).toEqual(['b', 'a']);
  });
});

describe('unplanned and paste (FR-204, FR-206)', () => {
  it('a task added in «Unplanned & urgent» shows separately and is marked U in the inventory', async () => {
    const { root, state } = await setup();
    const input = root.querySelector<HTMLInputElement>(
      'input[name="unplanned-title"]',
    )!;
    input.value = 'Fix prod bug';
    input.dispatchEvent(new Event('input'));
    root
      .querySelector('[data-action="add-unplanned"]')!
      .closest('form')!
      .dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    expect(Object.values(state().tasks)[0]).toMatchObject({
      title: 'Fix prod bug',
      unplanned: true,
    });
    expect(
      root.querySelector('[data-role="unplanned-list"]')?.textContent,
    ).toContain('Fix prod bug');
    expect(
      root.querySelector('[data-role="inventory-list"]')?.textContent,
    ).toContain('U Fix prod bug');
    expect(
      root.querySelector('[data-role="today-list"]')?.textContent ?? '',
    ).not.toContain('Fix prod bug');
  });

  it('pasting 5 lines creates 5 tasks', async () => {
    const { root, state } = await setup();
    const input = root.querySelector<HTMLInputElement>('input[name="title"]')!;
    const e = new Event('paste', {
      cancelable: true,
      bubbles: true,
    }) as Event & {
      clipboardData: { getData: () => string };
    };
    e.clipboardData = { getData: () => 'a\nb\n\n- c\n1. d\ne\n' };
    input.dispatchEvent(e);
    await flush();
    expect(Object.values(state().tasks).map((t) => t.title)).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
    ]);
  });
});

describe('subtasks and split offer (FR-209, FR-202)', () => {
  it('estimate 8 offers the split: one subtask per line, parent keeps the sum 8', async () => {
    const { root, type, submit, state } = await setup();
    await type('title', 'Big');
    await type('estimate', '8');
    await submit();
    document.querySelector<HTMLElement>('[data-action="split"]')!.click();
    await flush();
    const area = document.querySelector<HTMLTextAreaElement>(
      'textarea[name="subtasks"]',
    )!;
    area.value = 'one\ntwo\nthree';
    document.querySelector<HTMLElement>('[data-action="create"]')!.click();
    await flush();
    const tasks = Object.values(state().tasks);
    const parent = tasks.find((t) => t.title === 'Big')!;
    expect(parent.estimate).toBe(8);
    expect(parent.subtasks).toEqual({ done: 0, total: 3 });
    expect(tasks.filter((t) => t.parentId === parent.id)).toHaveLength(3);
    expect(root.querySelectorAll('[data-role="subtask"]')).toHaveLength(3);
  });
});

describe('due dates in the views (FR-208)', () => {
  it('adds a task with due date and recurrence from the form', async () => {
    const { root, type, submit, state } = await setup();
    await type('title', 'Weekly review');
    await type('due', '2026-11-16');
    const rec = root.querySelector<HTMLSelectElement>(
      'select[name="recurrence"]',
    )!;
    rec.value = 'weekly';
    rec.dispatchEvent(new Event('change'));
    await submit();
    expect(Object.values(state().tasks)[0]).toMatchObject({
      due: '2026-11-16',
      recurrence: 'weekly',
    });
  });

  it('marks a task due yesterday as overdue in the inventory and in Today', async () => {
    const { root, type, submit, click } = await setup();
    await type('title', 'Tax');
    await type('due', '2026-11-12');
    await submit();
    const inventory = root.querySelector('[data-role="inventory-list"]')!;
    expect(inventory.querySelector('[data-role="overdue"]')).not.toBeNull();
    expect(inventory.textContent).toContain('overdue');
    await click('add-today');
    const today = root.querySelector('[data-role="today-list"]')!;
    expect(today.querySelector('[data-role="overdue"]')).not.toBeNull();
  });

  it('a task due today is not overdue', async () => {
    const { root, type, submit } = await setup();
    await type('title', 'Call');
    await type('due', '2026-11-13');
    await submit();
    expect(root.querySelector('[data-role="overdue"]')).toBeNull();
  });
});
