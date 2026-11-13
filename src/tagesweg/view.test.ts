import { describe, expect, it } from 'vitest';
import { newEvent, type DomainEvent } from '../domain/events';
import { deriveState } from '../domain/state';
import { createI18n } from '../i18n/i18n';
import { dayKey } from '../tasks/inventory';
import { createTimer } from '../timer/controller';
import { createShop } from '../rewards/shop';
import { mountTagesweg } from './view';

const NOW = Date.UTC(2026, 10, 13, 9, 0, 0);
const flush = () => new Promise((r) => setTimeout(r, 0));

async function setup(extra: DomainEvent[] = []) {
  const events: DomainEvent[] = [
    newEvent('task.created', { taskId: 'a', title: 'Report', estimate: 2 }, 1),
    newEvent('plan.changed', { day: dayKey(NOW), taskIds: ['a'] }, 2),
    newEvent('reward.saved', { rewardId: 'r1', title: 'Walk', price: 20 }, 3),
    ...extra,
  ];
  const log = {
    events: async () => [...events],
    append: async (...e: DomainEvent[]) => void events.push(...e),
  };
  let now = NOW;
  const timer = createTimer({ log, now: () => now });
  const root = document.createElement('div');
  document.body.append(root);
  const i18n = createI18n({
    languages: ['en'],
    storage: undefined as unknown as Storage,
  });
  mountTagesweg(root, i18n, timer, createShop({ log }), {
    state: async () => deriveState(await log.events()),
    now: () => now,
  });
  await flush();
  await timer.refresh();
  await flush();
  return { root, timer, events, at: (t: number) => (now = t) };
}
const q = (root: HTMLElement, a: string) =>
  root.querySelector<HTMLElement>(`[data-action="${a}"]`);

describe('mountTagesweg', () => {
  it('shows task rows with stations, a reward row, coins and Start', async () => {
    const { root } = await setup();
    expect(root.querySelectorAll('[data-role="task-row"]')).toHaveLength(1);
    expect(root.querySelectorAll('.tw-station')).toHaveLength(2);
    expect(root.querySelectorAll('[data-role="reward-row"]')).toHaveLength(1);
    expect(root.querySelector('[data-role="coins"]')?.textContent).toBe(
      '0 coins',
    );
    expect(q(root, 'start')).not.toBeNull();
  });

  it('starts a round and zooms to the current path piece with park and abort (FR-604)', async () => {
    const { root, timer } = await setup();
    q(root, 'start')!.click();
    await flush();
    expect(timer.view.phase).toBe('focus');
    expect(root.querySelector('[data-role="piece"]')).not.toBeNull();
    expect(q(root, 'park')).not.toBeNull();
    expect(q(root, 'abort')).not.toBeNull();
    expect(root.querySelector('[data-role="reward-row"]')).toBeNull();
    expect(root.textContent).not.toMatch(/\d\d:\d\d/);
  });

  it('shows digits on tap (FR-606)', async () => {
    const { root } = await setup();
    q(root, 'start')!.click();
    await flush();
    q(root, 'digits')!.click();
    expect(root.textContent).toMatch(/\d\d:\d\d/);
  });

  it('ring moment after a finished round: +coins and next reward', async () => {
    const { root, timer, at } = await setup();
    q(root, 'start')!.click();
    await flush();
    at(NOW + 26 * 60_000);
    await timer.refresh();
    await flush();
    const ring = root.querySelector('[data-role="ring"]');
    expect(ring?.textContent).toContain('+10 coins');
    expect(ring?.textContent).toContain('10 coins to the next reward');
    expect(root.querySelector('[data-role="coins"]')?.textContent).toBe(
      '10 coins',
    );
  });

  it('redeems a reached reward from its row', async () => {
    const { root, events } = await setup([
      newEvent('coins.earned', { amount: 25, reason: 'set-bonus' }, 4),
    ]);
    q(root, 'redeem')!.click();
    await flush();
    expect(events.some((e) => e.type === 'reward.redeemed')).toBe(true);
  });

  it('level off: no coins, no reward rows (FR-405)', async () => {
    const { root } = await setup([
      newEvent('settings.changed', { changes: { gamification: 'off' } }, 4),
    ]);
    expect(root.querySelector('[data-role="coins"]')).toBeNull();
    expect(root.querySelector('[data-role="reward-row"]')).toBeNull();
  });
});
