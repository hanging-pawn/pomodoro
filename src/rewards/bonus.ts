import { newEvent, type DomainEvent } from '../domain/events';

export class BonusError extends Error {
  constructor(readonly code: 'empty-list') {
    super(code);
  }
}

export interface Bonus {
  /** Draws one entry of the user's own list, logs it as `bonus.drawn` and returns its title (FR-406). */
  draw(list: readonly string[]): Promise<string>;
}

export function createBonus(options: {
  log: { append(...events: DomainEvent[]): Promise<void> };
  random?: () => number;
  now?: () => number;
}): Bonus {
  const random = options.random ?? Math.random;
  const now = options.now ?? Date.now;
  return {
    async draw(list) {
      const entries = list.map((x) => x.trim()).filter(Boolean);
      if (entries.length === 0) throw new BonusError('empty-list');
      const title = entries[Math.floor(random() * entries.length)]!;
      await options.log.append(newEvent('bonus.drawn', { title }, now()));
      return title;
    },
  };
}
