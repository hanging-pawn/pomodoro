import { describe, expect, it, vi } from 'vitest';
import { createAlerts, formatClock, tabTitle } from './alerts';

describe('tabTitle (FR-108)', () => {
  it('shows mm:ss · task while a phase runs', () => {
    expect(
      tabTitle(
        { phase: 'focus', remainingMs: 754_000 },
        'Write report',
        'pomo.pomo',
      ),
    ).toBe('12:34 · Write report');
  });
  it('rounds partial seconds up so the title never shows 00:00 early', () => {
    expect(formatClock(1)).toBe('00:01');
    expect(formatClock(60_000)).toBe('01:00');
    expect(formatClock(0)).toBe('00:00');
  });
  it('falls back to the app name when idle', () => {
    expect(tabTitle({ phase: 'idle', remainingMs: 0 }, '', 'pomo.pomo')).toBe(
      'pomo.pomo',
    );
  });
});

describe('createAlerts (FR-104)', () => {
  const setup = (permission: NotificationPermission) => {
    const shown: { title: string; body?: string }[] = [];
    const sound = vi.fn();
    const alerts = createAlerts({
      playSound: sound,
      notification: {
        permission,
        requestPermission: async () => permission,
        show: (title, body) => shown.push({ title, body }),
      },
    });
    return { alerts, sound, shown };
  };

  it('plays the sound and shows a notification when permission is granted', () => {
    const { alerts, sound, shown } = setup('granted');
    alerts.announce('Done', 'Break');
    expect(sound).toHaveBeenCalledOnce();
    expect(shown).toEqual([{ title: 'Done', body: 'Break' }]);
  });

  it('plays the sound but shows no notification without permission', () => {
    const { alerts, sound, shown } = setup('denied');
    alerts.announce('Done', 'Break');
    expect(sound).toHaveBeenCalledOnce();
    expect(shown).toEqual([]);
  });
});
