import { describe, expect, it } from 'vitest';
import { newEvent, type DomainEvent } from '../domain/events';
import { deriveState } from '../domain/state';
import { BonusError, createBonus } from './bonus';

function setup(random: () => number) {
  const events: DomainEvent[] = [];
  const bonus = createBonus({
    log: {
      events: async () => [...events],
      append: async (...e) => void events.push(...e),
    },
    random,
    now: () => 1000,
  });
  return { bonus, events };
}

describe('random bonus (FR-406)', () => {
  const list = ['Ice cream', 'Walk', 'Movie'];

  it('draws one of the three list entries and logs it', async () => {
    const { bonus, events } = setup(() => 0.5);
    const drawn = await bonus.draw(list);
    expect(list).toContain(drawn);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'bonus.drawn',
      at: 1000,
      payload: { title: drawn },
    });
  });

  it('picks the entry the random source points at', async () => {
    expect(await setup(() => 0).bonus.draw(list)).toBe('Ice cream');
    expect(await setup(() => 0.99).bonus.draw(list)).toBe('Movie');
  });

  it('ignores blank entries and rejects an empty list without logging', async () => {
    const { bonus, events } = setup(() => 0);
    expect(await bonus.draw(['  ', 'Walk'])).toBe('Walk');
    await expect(bonus.draw([' '])).rejects.toBeInstanceOf(BonusError);
    expect(events).toHaveLength(1);
  });
});

describe('own bonus list (FR-406, POMO-96)', () => {
  it('stores added entries in the log, trimmed and without duplicates', async () => {
    const { bonus, events } = setup(() => 0);
    await bonus.add(' Ice cream ');
    await bonus.add('Walk');
    await bonus.add('Movie');
    await bonus.add('Walk');
    expect(await bonus.list()).toEqual(['Ice cream', 'Walk', 'Movie']);
    expect(deriveState(events).settings.bonusList).toEqual([
      'Ice cream',
      'Walk',
      'Movie',
    ]);
  });

  it('removes an entry and rejects an empty one', async () => {
    const { bonus } = setup(() => 0);
    await bonus.add('Walk');
    await bonus.add('Movie');
    await bonus.remove('Walk');
    expect(await bonus.list()).toEqual(['Movie']);
    await expect(bonus.add('  ')).rejects.toMatchObject({
      code: 'empty-title',
    });
  });

  it('draws from the stored list when called without one', async () => {
    const { bonus, events } = setup(() => 0.5);
    for (const x of ['Ice cream', 'Walk', 'Movie']) await bonus.add(x);
    expect(await bonus.draw()).toBe('Walk');
    expect(events.at(-1)).toMatchObject({
      type: 'bonus.drawn',
      payload: { title: 'Walk' },
    });
  });
});

describe('bonus offer after a full set (FR-406, POMO-96)', () => {
  const round = (n: number, mode: 'strict' | 'flexible' = 'strict') => [
    newEvent(
      'pomodoro.started',
      { pomodoroId: `p${n}`, taskId: 't', mode, focusMinutes: 25 },
      n * 10,
    ),
    newEvent('pomodoro.completed', { pomodoroId: `p${n}` }, n * 10 + 5),
  ];

  it('no offer before a full set, offer after it, gone after a draw', () => {
    const log: DomainEvent[] = [...round(1), ...round(2), ...round(3)];
    expect(deriveState(log).bonusOffer).toBe(false);
    log.push(...round(4));
    expect(deriveState(log).bonusOffer).toBe(true);
    log.push(newEvent('bonus.drawn', { title: 'Walk' }, 100));
    expect(deriveState(log).bonusOffer).toBe(false);
    log.push(...round(11), ...round(12), ...round(13), ...round(14));
    expect(deriveState(log).bonusOffer).toBe(true);
  });

  it('a flexible round completing the count is no full set', () => {
    const log = [
      ...round(1),
      ...round(2),
      ...round(3),
      ...round(4, 'flexible'),
    ];
    expect(deriveState(log).bonusOffer).toBe(false);
  });
});
