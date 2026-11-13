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
  const click = async (a: string, nth = 0) => {
    root.querySelectorAll<HTMLElement>(`[data-action="${a}"]`)[nth]!.click();
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
    await click('delete');
    expect(Object.keys(state().tasks)).toHaveLength(0);
  });

  it('reorders Today', async () => {
    const { root, add, click } = await setup();
    await add('a', '1');
    await add('b', '1');
    await click('add-today');
    await click('add-today');
    await click('move-down');
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
