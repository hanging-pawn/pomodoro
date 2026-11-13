import {
  newEvent,
  type DomainEvent,
  type GamificationLevel,
} from '../domain/events';
import { deriveState } from '../domain/state';
import { templatesFor } from './templates';

export type ShopErrorCode =
  'empty-title' | 'invalid-price' | 'unknown-reward' | 'insufficient';

export class ShopError extends Error {
  constructor(readonly code: ShopErrorCode) {
    super(code);
  }
}

export interface ShopLog {
  events(): Promise<DomainEvent[]>;
  append(...events: DomainEvent[]): Promise<void>;
}

export interface Shop {
  /** First start only: writes the localized templates once; returns whether it did. */
  ensureSeeded(locale: string): Promise<boolean>;
  /** Creates (no id) or edits a reward; returns its id. */
  save(input: { id?: string; title: string; price: number }): Promise<string>;
  remove(id: string): Promise<void>;
  /** Spends the price; `insufficient` when the balance is too low (FR-402). */
  redeem(id: string): Promise<void>;
  setLevel(level: GamificationLevel): Promise<void>;
}

export function createShop(options: {
  log: ShopLog;
  now?: () => number;
}): Shop {
  const now = options.now ?? Date.now;
  const { log } = options;
  const state = async () => deriveState(await log.events());
  const check = (title: string, price: number) => {
    const t = title.trim();
    if (!t) throw new ShopError('empty-title');
    if (!Number.isInteger(price) || price < 1)
      throw new ShopError('invalid-price');
    return t;
  };

  return {
    async ensureSeeded(locale) {
      if ((await state()).rewardsSeeded) return false;
      const at = now();
      await log.append(
        ...templatesFor(locale).map((r) =>
          newEvent('reward.saved', { rewardId: crypto.randomUUID(), ...r }, at),
        ),
        newEvent('rewards.seeded', { locale }, at),
      );
      return true;
    },
    async save({ id, title, price }) {
      const clean = check(title, price);
      const rewardId = id ?? crypto.randomUUID();
      if (id && !(await state()).rewards[id])
        throw new ShopError('unknown-reward');
      await log.append(
        newEvent('reward.saved', { rewardId, title: clean, price }, now()),
      );
      return rewardId;
    },
    async remove(id) {
      await log.append(newEvent('reward.deleted', { rewardId: id }, now()));
    },
    async redeem(id) {
      const s = await state();
      const reward = s.rewards[id];
      if (!reward) throw new ShopError('unknown-reward');
      if (s.coins < reward.price) throw new ShopError('insufficient');
      await log.append(
        newEvent(
          'reward.redeemed',
          { rewardId: id, title: reward.title, price: reward.price },
          now(),
        ),
      );
    },
    async setLevel(level) {
      await log.append(
        newEvent(
          'settings.changed',
          { changes: { gamification: level } },
          now(),
        ),
      );
    },
  };
}
