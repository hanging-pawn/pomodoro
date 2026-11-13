import { describe, expect, it } from 'vitest';
import { dayKey } from '../tasks/inventory';
import { newEvent, type DomainEvent } from '../domain/events';
import { deriveState } from '../domain/state';
import { createI18n } from '../i18n/i18n';
import { createShop } from '../rewards/shop';
import { createInventory } from '../tasks/inventory';
import { createTimer } from '../timer/controller';
import { mountTagesweg } from './view';

const NOW = Date.UTC(2026, 10, 13, 9, 0, 0);
const flush = () => new Promise((r) => setTimeout(r, 0));
const BULLETS = ['Outline', 'Numbers', 'Summary'];

function mount(events: DomainEvent[]) {
  const log = {
    events: async () => [...events],
    append: async (...e: DomainEvent[]) => void events.push(...e),
  };
  const timer = createTimer({ log, now: () => NOW });
  const inventory = createInventory({ log, now: () => NOW });
  const root = document.createElement('div');
  document.body.replaceChildren(root);
  mountTagesweg(
    root,
    createI18n({ languages: ['en'], storage: undefined as unknown as Storage }),
    timer,
    createShop({ log }),
    {
      state: async () => deriveState(await log.events()),
      tickBullet: (id, b, done) => inventory.tickBullet(id, b, done),
      now: () => NOW,
    },
  );
  return { root, timer, inventory };
}

const seed = (): DomainEvent[] => [
  newEvent(
    'task.created',
    { taskId: 'a', title: 'Report', estimate: 2, bullets: BULLETS },
    1,
  ),
  newEvent('plan.changed', { day: dayKey(NOW), taskIds: ['a'] }, 2),
];

const boxes = (root: HTMLElement) => [
  ...root.querySelectorAll<HTMLInputElement>('[data-role="bullets"] input'),
];

describe('bullet points in the round (FR-609)', () => {
  it('shows the 3 bullets of the task while the round runs', async () => {
    const { root, timer } = mount(seed());
    await flush();
    await timer.refresh();
    root.querySelector<HTMLElement>('[data-action="start"]')!.click();
    await flush();
    expect(timer.view.phase).toBe('focus');
    expect(boxes(root)).toHaveLength(3);
    expect(root.querySelector('[data-role="bullets"]')?.textContent).toContain(
      'Numbers',
    );
  });

  it('ticking one keeps the timer running and the tick survives a reload', async () => {
    const events = seed();
    const { root, timer } = mount(events);
    await flush();
    await timer.refresh();
    root.querySelector<HTMLElement>('[data-action="start"]')!.click();
    await flush();
    const startedAt = timer.view.remainingMs;
    boxes(root)[1]!.click();
    await flush();
    expect(timer.view.phase).toBe('focus');
    expect(timer.view.remainingMs).toBe(startedAt);
    expect(events.filter((e) => e.type === 'pomodoro.aborted')).toHaveLength(0);

    // Reload: a fresh mount over the same log.
    const again = mount(events);
    await flush();
    await again.timer.refresh();
    await flush();
    expect(again.timer.view.phase).toBe('focus');
    expect(boxes(again.root).map((b) => b.checked)).toEqual([
      false,
      true,
      false,
    ]);
  });
});
