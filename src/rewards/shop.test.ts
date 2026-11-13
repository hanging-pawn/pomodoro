import { describe, expect, it } from 'vitest';
import { newEvent, type DomainEvent } from '../domain/events';
import { deriveState } from '../domain/state';
import { createShop } from './shop';

const MIN = 60_000;
let clock = 1000;
const at = () => (clock += 1);

const round = (id: string, mode: 'strict' | 'flexible') =>
  newEvent(
    'pomodoro.started',
    { pomodoroId: id, taskId: 't', mode, focusMinutes: 25 },
    at(),
  );
const done = (id: string) =>
  newEvent('pomodoro.completed', { pomodoroId: id }, at());

function completedStrict(n: number): DomainEvent[] {
  return Array.from({ length: n }, (_, i) => [
    round(`p${i}`, 'strict'),
    done(`p${i}`),
  ]).flat();
}

function setup(initial: DomainEvent[] = []) {
  const events = [...initial];
  const log = {
    events: async () => [...events],
    append: async (...e: DomainEvent[]) => void events.push(...e),
  };
  return { events, shop: createShop({ log, now: at }) };
}

describe('coin ledger (FR-401, FR-403)', () => {
  it('4 strict pomodoros in a row → 50 coins (4 × 10 + set bonus 10)', () => {
    expect(deriveState(completedStrict(4)).coins).toBe(50);
  });

  it('the set bonus and the per-round coins are configurable', () => {
    const log = [
      newEvent(
        'settings.changed',
        {
          changes: { coinsPerPomodoro: 5, setBonus: 20, setSize: 2 },
        },
        1,
      ),
      ...completedStrict(2),
    ];
    expect(deriveState(log).coins).toBe(30);
  });

  it('strict abort credits nothing', () => {
    const log = [
      round('a', 'strict'),
      newEvent(
        'pomodoro.aborted',
        { pomodoroId: 'a', interruption: 'internal', workedMinutes: 12 },
        at(),
      ),
    ];
    expect(deriveState(log).coins).toBe(0);
  });

  it('flexible abort at minute 12 of 25 → +4, flexible completion has no set bonus', () => {
    const abort = [
      round('a', 'flexible'),
      newEvent(
        'pomodoro.aborted',
        { pomodoroId: 'a', interruption: 'external', workedMinutes: 12 },
        at(),
      ),
    ];
    expect(deriveState(abort).coins).toBe(4);
    const flexSet = Array.from({ length: 4 }, (_, i) => [
      round(`f${i}`, 'flexible'),
      done(`f${i}`),
    ]).flat();
    expect(deriveState(flexSet).coins).toBe(40);
    void MIN;
  });
});

describe('shop (FR-402, FR-408)', () => {
  it('redeems 40 at balance 50 → 10, logs it; blocked at 30', async () => {
    const { shop, events } = setup(completedStrict(4));
    const id = await shop.save({ title: 'Coffee', price: 40 });
    await shop.redeem(id);
    const s = deriveState(events);
    expect(s.coins).toBe(10);
    expect(s.redemptions).toHaveLength(1);
    expect(s.redemptions[0]).toMatchObject({ title: 'Coffee', price: 40 });
    await expect(shop.redeem(id)).rejects.toMatchObject({
      code: 'insufficient',
    });
    expect(deriveState(events).redemptions).toHaveLength(1);
  });

  it('seeds at least 5 localized templates once; edits and deletes persist', async () => {
    const { shop, events } = setup();
    expect(await shop.ensureSeeded('de')).toBe(true);
    expect(await shop.ensureSeeded('de')).toBe(false);
    let s = deriveState(events);
    const rewards = Object.values(s.rewards);
    expect(rewards.length).toBeGreaterThanOrEqual(5);
    expect(rewards.some((r) => r.title === 'Kaffeepause')).toBe(true);
    await shop.save({ id: rewards[0]!.id, title: 'Tee', price: 15 });
    await shop.remove(rewards[1]!.id);
    await shop.ensureSeeded('de');
    s = deriveState(events);
    expect(s.rewards[rewards[0]!.id]).toMatchObject({
      title: 'Tee',
      price: 15,
    });
    expect(s.rewards[rewards[1]!.id]).toBeUndefined();
    expect(Object.keys(s.rewards)).toHaveLength(rewards.length - 1);
  });

  it('rejects an empty title and a non-positive price', async () => {
    const { shop } = setup();
    await expect(shop.save({ title: ' ', price: 5 })).rejects.toMatchObject({
      code: 'empty-title',
    });
    await expect(shop.save({ title: 'x', price: 0 })).rejects.toMatchObject({
      code: 'invalid-price',
    });
  });

  it('stores the gamification level in settings', async () => {
    const { shop, events } = setup();
    await shop.setLevel('off');
    expect(deriveState(events).settings.gamification).toBe('off');
  });
});
