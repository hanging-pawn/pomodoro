import { newEvent, type DomainEvent } from '../domain/events';
import { deriveState } from '../domain/state';

export class BonusError extends Error {
  constructor(readonly code: 'empty-list' | 'empty-title') {
    super(code);
  }
}

export interface Bonus {
  /** The user's own bonus list as stored in the log (FR-406). */
  list(): Promise<string[]>;
  /** Adds an entry (trimmed); an entry already on the list is kept once. */
  add(title: string): Promise<void>;
  remove(title: string): Promise<void>;
  /**
   * Draws one entry of `list` (default: the stored list), logs it as `bonus.drawn` and returns
   * its title (FR-406).
   */
  draw(list?: readonly string[]): Promise<string>;
}

/**
 * Random bonus (FR-406). The list lives in `settings.changed` (`bonusList`), so it syncs and
 * exports like every other setting and older app versions accept the events.
 */
export function createBonus(options: {
  log: {
    events(): Promise<DomainEvent[]>;
    append(...events: DomainEvent[]): Promise<void>;
  };
  random?: () => number;
  now?: () => number;
}): Bonus {
  const random = options.random ?? Math.random;
  const now = options.now ?? Date.now;
  // The latest list change wins; it must sort after every earlier one, even in the same ms.
  let lastAt = 0;
  const list = async () => {
    const events = await options.log.events();
    for (const e of events)
      if (e.type === 'settings.changed') lastAt = Math.max(lastAt, e.at);
    return deriveState(events).settings.bonusList;
  };
  const save = (bonusList: string[]) => {
    lastAt = Math.max(now(), lastAt + 1);
    return options.log.append(
      newEvent('settings.changed', { changes: { bonusList } }, lastAt),
    );
  };
  return {
    list,
    async add(title) {
      const entry = title.trim();
      if (!entry) throw new BonusError('empty-title');
      const current = await list();
      if (!current.includes(entry)) await save([...current, entry]);
    },
    async remove(title) {
      const current = await list();
      if (current.includes(title))
        await save(current.filter((x) => x !== title));
    },
    async draw(given) {
      const entries = (given ?? (await list()))
        .map((x) => x.trim())
        .filter(Boolean);
      if (entries.length === 0) throw new BonusError('empty-list');
      const title = entries[Math.floor(random() * entries.length)]!;
      await options.log.append(newEvent('bonus.drawn', { title }, now()));
      return title;
    },
  };
}
