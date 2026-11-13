import type { AppState } from '../domain/state';
import { dayKey } from '../tasks/inventory';

export interface Streak {
  /** Days in the chain that reached the goal; 0 when there is none right now. */
  length: number;
  /** The chain broke earlier and the current one started over: the UI says «new streak: 1», no loss message. */
  restarted: boolean;
  /** Shown only at gamification level «full» and while the streak is turned on (FR-404, FR-405). */
  visible: boolean;
}

const HORIZON_DAYS = 366;

/**
 * Streak (FR-404): consecutive days on which at least `dailyGoal` rounds were completed.
 * Up to `streakGraceDays` missed days in a row do not break it; today does not count as missed
 * while it is still open. A break is never reported as a loss, only «new streak» once a day counts again.
 */
export function deriveStreak(state: AppState, now: number): Streak {
  const { dailyGoal, streakGraceDays, streakEnabled, gamification } =
    state.settings;
  const visible = streakEnabled && gamification === 'full';

  const perDay = new Map<string, number>();
  for (const r of state.rounds)
    if (r.kind === 'completed')
      perDay.set(dayKey(r.at), (perDay.get(dayKey(r.at)) ?? 0) + 1);
  const reached = (offset: number) => {
    const d = new Date(now);
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - offset);
    return (perDay.get(dayKey(d.getTime())) ?? 0) >= Math.max(1, dailyGoal);
  };

  const grace = Math.max(0, Math.floor(streakGraceDays));
  let offset = reached(0) ? 0 : 1;
  let length = 0;
  let gap = 0;
  for (; offset < HORIZON_DAYS; offset++) {
    if (reached(offset)) {
      length++;
      gap = 0;
    } else if (++gap > grace) break;
  }
  let restarted = false;
  if (length === 1)
    for (; offset < HORIZON_DAYS; offset++)
      if (reached(offset)) restarted = true;
  return { length, restarted, visible };
}
