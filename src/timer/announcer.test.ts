import { describe, expect, it } from 'vitest';
import type { DomainEvent } from '../domain/events';
import { createI18n } from '../i18n/i18n';
import { createAlerts } from './alerts';
import { mountAnnouncer } from './announcer';
import { createTimer } from './controller';

const MIN = 60_000;
const T0 = Date.UTC(2026, 10, 13, 9, 0, 0);

describe('mountAnnouncer', () => {
  it('shows mm:ss · task in the tab title (FR-108) and sounds at the end (FR-104)', async () => {
    const events: DomainEvent[] = [];
    let now = T0;
    const timer = createTimer({
      log: {
        events: async () => [...events],
        append: async (...e) => void events.push(...e),
      },
      now: () => now,
    });
    const sounds: number[] = [];
    mountAnnouncer(
      timer,
      createI18n({
        languages: ['en'],
        storage: undefined as unknown as Storage,
      }),
      {
        alerts: createAlerts({ playSound: () => sounds.push(1) }),
        taskTitle: (id) => (id === 't1' ? 'Write report' : ''),
      },
    );
    await timer.start('t1');
    now = T0 + 10 * MIN;
    await timer.refresh();
    expect(document.title).toBe('15:00 · Write report');
    expect(document.documentElement.dataset.timerPhase).toBe('focus');
    now = T0 + 25 * MIN + 100;
    await timer.refresh();
    expect(sounds).toHaveLength(1);
    expect(document.documentElement.dataset.timerPhase).toBe('short-break');
  });
});
