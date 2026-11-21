import { describe, expect, it } from 'vitest';
import { newEvent, type DomainEvent } from '../domain/events';
import { deriveState } from '../domain/state';
import { createI18n } from '../i18n/i18n';
import { createBonus } from './bonus';
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

describe('template rewards follow the UI language', () => {
  it('shows the templates seeded in English in German after a switch, edited titles stay', async () => {
    const events: DomainEvent[] = [];
    const log = {
      events: async () => [...events],
      append: async (...e: DomainEvent[]) => void events.push(...e),
    };
    let clock = 1; // distinct instants: same-instant events have no defined order
    const shop = createShop({ log, now: () => clock++ });
    await shop.ensureSeeded('en');
    const own = Object.values(deriveState(events).rewards).find(
      (r) => r.title === 'Walk outside',
    )!;
    await shop.save({ id: own.id, title: 'My own walk', price: own.price });
    const root = document.createElement('div');
    const i18n = createI18n({
      languages: ['en'],
      storage: undefined as unknown as Storage,
    });
    mountRewards(root, i18n, shop, { state: async () => deriveState(events) });
    await flush();
    i18n.setLocale('de');
    await flush();
    const titles = [
      ...root.querySelectorAll('[data-role="shop-list"] .ui-row__title'),
    ].map((x) => x.textContent);
    expect(titles).toContain('Kaffeepause');
    expect(titles).not.toContain('Coffee break');
    expect(titles).toContain('My own walk');
  });
});

describe('random bonus after a full set (FR-406, POMO-96)', () => {
  async function setupBonus(level: 'full' | 'subtle' | 'off' = 'full') {
    const events: DomainEvent[] = [
      newEvent('settings.changed', { changes: { gamification: level } }, 1),
    ];
    const log = {
      events: async () => [...events],
      append: async (...e: DomainEvent[]) => void events.push(...e),
    };
    const shop = createShop({ log });
    const bonus = createBonus({ log, random: () => 0.5 });
    const root = document.createElement('div');
    document.body.append(root);
    const i18n = createI18n({
      languages: ['en'],
      storage: undefined as unknown as Storage,
    });
    mountRewards(root, i18n, shop, {
      state: async () => deriveState(events),
      bonus,
    });
    await flush();
    const add = async (title: string) => {
      const input = root.querySelector<HTMLInputElement>(
        'input[name="bonus-title"]',
      )!;
      input.value = title;
      input.dispatchEvent(new Event('input'));
      input.form!.requestSubmit();
      await flush();
      await flush();
    };
    const fullSet = async () => {
      for (let n = 1; n <= 4; n++)
        events.push(
          newEvent(
            'pomodoro.started',
            {
              pomodoroId: `p${n}`,
              taskId: 't',
              mode: 'strict',
              focusMinutes: 25,
            },
            100 + n * 10,
          ),
          newEvent('pomodoro.completed', { pomodoroId: `p${n}` }, 105 + n * 10),
        );
      document.dispatchEvent(new Event(DATA_CHANGED));
      await flush();
    };
    return { root, events, add, fullSet };
  }
  const offer = (root: HTMLElement) =>
    root.querySelector('[data-role="bonus-offer"]');
  const entries = (root: HTMLElement) =>
    [...root.querySelectorAll('[data-role="bonus-list"] .ui-row__title')].map(
      (x) => x.textContent,
    );

  it('list with 3 entries → after a full set the offer appears → draw shows one and logs bonus.drawn', async () => {
    const { root, events, add, fullSet } = await setupBonus();
    for (const x of ['Ice cream', 'Walk', 'Movie']) await add(x);
    expect(entries(root)).toEqual(['Ice cream', 'Walk', 'Movie']);
    expect(deriveState(events).settings.bonusList).toHaveLength(3);
    expect(offer(root)).toBeNull();

    await fullSet();
    expect(offer(root)).not.toBeNull();
    offer(root)!
      .querySelector<HTMLButtonElement>('[data-action="draw-bonus"]')!
      .click();
    await flush();
    await flush();
    const drawn = events.filter((e) => e.type === 'bonus.drawn');
    expect(drawn).toHaveLength(1);
    expect(['Ice cream', 'Walk', 'Movie']).toContain(
      drawn[0]!.type === 'bonus.drawn' ? drawn[0]!.payload.title : '',
    );
    expect(
      root.querySelector('[data-role="bonus-result"]')?.textContent,
    ).toContain('Walk');
    // One draw per set: the offer is gone until the next full set.
    expect(offer(root)).toBeNull();
  });

  it('no offer before a full set', async () => {
    const { root, add } = await setupBonus();
    await add('Walk');
    expect(offer(root)).toBeNull();
  });

  it('removes an entry from the list', async () => {
    const { root, events, add } = await setupBonus();
    await add('Walk');
    await add('Movie');
    root
      .querySelector<HTMLButtonElement>(
        '[data-role="bonus-list"] [data-action="remove-bonus"]',
      )!
      .click();
    await flush();
    await flush();
    expect(entries(root)).toEqual(['Movie']);
    expect(deriveState(events).settings.bonusList).toEqual(['Movie']);
  });

  it('level «off» hides the bonus list and the offer (FR-405)', async () => {
    const { root, events, fullSet } = await setupBonus('off');
    events.push(
      newEvent('settings.changed', { changes: { bonusList: ['Walk'] } }, 50),
    );
    await fullSet();
    expect(root.querySelector('[data-role="bonus-list"]')).toBeNull();
    expect(root.querySelector('input[name="bonus-title"]')).toBeNull();
    expect(offer(root)).toBeNull();
  });

  it('an empty entry shows an error in the bonus form and stores nothing', async () => {
    const { root, events, add } = await setupBonus();
    await add('   ');
    const err = root.querySelector<HTMLElement>('[data-role="bonus-error"]');
    expect(err?.hidden).toBe(false);
    expect(err?.textContent).toBeTruthy();
    expect(deriveState(events).settings.bonusList).toEqual([]);
  });
});
