import { describe, expect, it } from 'vitest';
import { newEvent, type DomainEvent } from '../domain/events';
import { deriveState } from '../domain/state';
import { createI18n } from '../i18n/i18n';
import { createShop } from './shop';
import { DATA_CHANGED } from '../tasks/events';
import { mountRewards } from './view';

const flush = () => new Promise((r) => setTimeout(r, 0));

async function setup(coinsFrom = 0) {
  const events: DomainEvent[] = [];
  for (let i = 0; i < coinsFrom; i++)
    events.push(
      newEvent('coins.earned', { amount: 1, reason: 'partial' }, i + 1),
    );
  const log = {
    events: async () => [...events],
    append: async (...e: DomainEvent[]) => void events.push(...e),
  };
  const shop = createShop({ log });
  await shop.ensureSeeded('en');
  const root = document.createElement('div');
  document.body.append(root);
  const i18n = createI18n({
    languages: ['en'],
    storage: undefined as unknown as Storage,
  });
  mountRewards(root, i18n, shop, { state: async () => deriveState(events) });
  await flush();
  return { root, events };
}

describe('mountRewards', () => {
  it('fresh install lists at least 5 template rewards with the balance', async () => {
    const { root } = await setup();
    expect(
      root.querySelectorAll('[data-role="shop-list"] li').length,
    ).toBeGreaterThanOrEqual(5);
    expect(root.querySelector('[data-role="coins"]')?.textContent).toContain(
      '0',
    );
  });

  it('disables redeem when the balance is too low', async () => {
    const { root } = await setup(10);
    const buttons = [
      ...root.querySelectorAll<HTMLButtonElement>('[data-action="redeem"]'),
    ];
    expect(buttons.every((b) => b.disabled)).toBe(true);
  });

  it('level «off» hides coins and shop (FR-405)', async () => {
    const { root, events } = await setup();
    events.push(
      newEvent('settings.changed', { changes: { gamification: 'off' } }, 99),
    );
    document.dispatchEvent(new Event(DATA_CHANGED));
    await flush();
    expect(root.querySelector('[data-role="coins"]')).toBeNull();
    expect(root.querySelector('[data-role="shop-list"]')).toBeNull();
  });
});
