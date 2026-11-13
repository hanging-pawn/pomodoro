import { describe, expect, it } from 'vitest';
import { newEvent, type DomainEvent } from '../domain/events';
import { deriveState } from '../domain/state';
import { createI18n } from '../i18n/i18n';
import { createInventory, dayKey } from '../tasks/inventory';
import { mountDayClose } from './view';

const D = new Date(2026, 10, 13, 12, 0, 0).getTime();
const flush = () => new Promise((r) => setTimeout(r, 0));

async function setup() {
  const events: DomainEvent[] = [
    newEvent('task.created', { taskId: 'a', title: 'Report', estimate: 2 }, 1),
    newEvent('task.created', { taskId: 'b', title: 'Mail', estimate: 3 }, 2),
    newEvent('plan.changed', { day: dayKey(D), taskIds: ['a', 'b'] }, 3),
    ...['p1', 'p2', 'p3'].flatMap((id, i) => [
      newEvent(
        'pomodoro.started',
        { pomodoroId: id, taskId: 'a', mode: 'strict', focusMinutes: 25 },
        D + i * 10,
      ),
      newEvent('pomodoro.completed', { pomodoroId: id }, D + i * 10 + 1),
    ]),
    newEvent('interruption.parked', { text: 'x', kind: 'internal' }, D + 50),
    newEvent('interruption.parked', { text: 'y', kind: 'external' }, D + 51),
    newEvent('interruption.parked', { text: 'z', kind: 'external' }, D + 52),
  ];
  const inventory = createInventory({
    log: {
      events: async () => [...events],
      append: async (...e) => void events.push(...e),
    },
    now: () => D + 100,
  });
  const root = document.createElement('div');
  document.body.replaceChildren(root);
  mountDayClose(
    root,
    createI18n({ languages: ['en'], storage: undefined as unknown as Storage }),
    inventory,
    { state: async () => deriveState(events), now: () => D + 100 },
  );
  await flush();
  return { root, events };
}

describe('mountDayClose', () => {
  it('shows the columns estimate, actual, difference per task (FR-302)', async () => {
    const { root } = await setup();
    const heads = [...root.querySelectorAll('th')].map((h) => h.textContent);
    expect(heads).toEqual(['Task', 'Estimate', 'Actual', 'Difference']);
    const cells = [...root.querySelectorAll('tbody tr')].map((tr) =>
      [...tr.querySelectorAll('td')].slice(0, 4).map((c) => c.textContent),
    );
    expect(cells[0]).toEqual(['Report', '2', '3', '+1']);
    expect(cells[1]).toEqual(['Mail', '3', '0', '-3']);
  });

  it('shows interruption sums by type', async () => {
    const { root } = await setup();
    expect(root.querySelector('[data-role="internal"]')?.textContent).toContain(
      '1',
    );
    expect(root.querySelector('[data-role="external"]')?.textContent).toContain(
      '2',
    );
  });

  it('offers a second estimate only where actual exceeds estimate and logs it separately (FR-304)', async () => {
    const { root, events } = await setup();
    const inputs = root.querySelectorAll('input[name="second-estimate"]');
    expect(inputs).toHaveLength(1);
    (inputs[0] as HTMLInputElement).value = '4';
    root.querySelector<HTMLElement>('[data-action="second-estimate"]')!.click();
    await flush();
    expect(events.find((e) => e.type === 'task.reestimated')?.payload).toEqual({
      taskId: 'a',
      estimate: 4,
    });
    expect(
      root.querySelector('[data-role="second-estimate"]')?.textContent,
    ).toContain('4');
  });
});
