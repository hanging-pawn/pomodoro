import { describe, expect, it } from 'vitest';
import type { DomainEvent } from '../domain/events';
import { BonusError, createBonus } from './bonus';

function setup(random: () => number) {
  const events: DomainEvent[] = [];
  const bonus = createBonus({
    log: { append: async (...e) => void events.push(...e) },
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
