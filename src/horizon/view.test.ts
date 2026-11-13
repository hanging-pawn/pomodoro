import { describe, expect, it } from 'vitest';
import { newEvent, type DomainEvent } from '../domain/events';
import { deriveState } from '../domain/state';
import { createI18n } from '../i18n/i18n';
import { createInventory } from '../tasks/inventory';
import { mountTasks } from '../tasks/view';
import { PICK_TASK } from '../tasks/events';
import { mountHorizon } from './view';

const NOW = new Date(2026, 10, 13, 10, 0).getTime();
const flush = () => new Promise((r) => setTimeout(r, 0));
const i18n = () =>
  createI18n({ languages: ['en'], storage: undefined as unknown as Storage });

const created = (taskId: string, project: string, n: number) =>
  newEvent(
    'task.created',
    { taskId, title: `Task ${taskId}`, project, estimate: 1 },
    NOW - 100000 + n,
  );
const target = (project: string, date: string) =>
  newEvent('project.targeted', { project, date }, NOW - 1000);

async function setup(events: DomainEvent[]) {
  const picked: string[] = [];
  const root = document.createElement('div');
  document.body.replaceChildren(root);
  mountHorizon(root, i18n(), {
    state: async () => deriveState(events),
    setTarget: async (project, date) =>
      void events.push(newEvent('project.targeted', { project, date }, NOW)),
    pick: (id) => picked.push(id),
    now: () => NOW,
  });
  await flush();
  return { root, picked, events };
}

describe('mountHorizon (FR-607, FR-608)', () => {
  const three = [
    created('a1', 'A', 1),
    created('b1', 'B', 2),
    created('b2', 'B', 3),
    created('c1', 'C', 4),
    target('A', '2026-12-24'),
    target('B', '2026-12-12'),
    target('C', '2027-01-15'),
  ];

  it('shows 3 projects with target dates as 3 lines, today marked on each', async () => {
    const { root } = await setup([...three]);
    expect(root.querySelectorAll('[data-role="line"]')).toHaveLength(3);
    expect(root.querySelectorAll('[data-role="today"]')).toHaveLength(3);
    expect(root.querySelector('li')?.dataset.project).toBe('B');
    expect(root.textContent).toContain('2026-12-12');
    expect(root.textContent).toContain('29 days left');
  });

  it('click on project B picks the next open task of B', async () => {
    const { root, picked } = await setup([...three]);
    root
      .querySelector<HTMLElement>(
        '[data-project="B"] [data-action="pick-project"]',
      )!
      .click();
    expect(picked).toEqual(['b1']);
  });

  it('by default the pick is announced on document for the timer views', async () => {
    const events = [...three];
    const root = document.createElement('div');
    mountHorizon(root, i18n(), {
      state: async () => deriveState(events),
      setTarget: async () => {},
      now: () => NOW,
    });
    await flush();
    const seen: string[] = [];
    document.addEventListener(PICK_TASK, (e) =>
      seen.push((e as CustomEvent<string>).detail),
    );
    root.querySelector<HTMLElement>('[data-project="A"] button')!.click();
    expect(seen).toEqual(['a1']);
  });

  it('sets a target date from the form', async () => {
    const { root, events } = await setup([created('a1', 'A', 1)]);
    const form = root.querySelector('form')!;
    form.querySelector<HTMLInputElement>('input[name="project"]')!.value = 'A';
    form.querySelector<HTMLInputElement>('input[name="date"]')!.value =
      '2026-12-12';
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    expect(deriveState(events).projects.A?.targetDate).toBe('2026-12-12');
  });
});

describe('inventory shows the days left of a project (FR-608)', () => {
  it('«n days left» next to a task of a project with a target date', async () => {
    const events: DomainEvent[] = [
      created('a1', 'Exam', 1),
      target('Exam', '2026-12-12'),
      created('x1', 'Other', 2),
    ];
    const inventory = createInventory({
      log: { events: async () => events, append: async () => {} },
      now: () => NOW,
    });
    const root = document.createElement('div');
    document.body.replaceChildren(root);
    mountTasks(root, i18n(), inventory, {
      state: async () => deriveState(events),
      now: () => NOW,
    });
    await flush();
    const rows = [...root.querySelectorAll('[data-role="inventory-list"] li')];
    const text = (n: string) =>
      rows.find((r) => r.textContent?.includes(n))!.textContent;
    expect(text('Task a1')).toContain('29 days left');
    expect(text('Task x1')).not.toContain('days left');
  });
});
