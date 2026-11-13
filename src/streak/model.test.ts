import { describe, expect, it } from 'vitest';
import { newEvent, type DomainEvent } from '../domain/events';
import { deriveState } from '../domain/state';
import { deriveStreak } from './model';

// Fri 2026-11-13 is "today".
const NOW = new Date(2026, 10, 13, 18, 0, 0).getTime();
const at = (d: number, h = 10) => new Date(2026, 10, d, h, 0, 0).getTime();

let n = 0;
/** `count` completed rounds on November day `d`. */
function rounds(d: number, count: number): DomainEvent[] {
  return Array.from({ length: count }, () => {
    const id = `p${++n}`;
    return [
      newEvent(
        'pomodoro.started',
        { pomodoroId: id, taskId: 't', mode: 'strict', focusMinutes: 25 },
        at(d) + n,
      ),
      newEvent('pomodoro.completed', { pomodoroId: id }, at(d) + n + 1),
    ];
  }).flat();
}
const settings = (changes: Record<string, unknown>) =>
  newEvent('settings.changed', { changes }, 1);
const streak = (log: DomainEvent[], now = NOW) =>
  deriveStreak(deriveState([settings({ dailyGoal: 2 }), ...log]), now);

describe('deriveStreak (FR-404)', () => {
  it('counts consecutive days reaching the goal, today included', () => {
    const s = streak([...rounds(11, 2), ...rounds(12, 3), ...rounds(13, 2)]);
    expect(s).toMatchObject({ length: 3, restarted: false, visible: true });
  });

  it('today not yet at the goal does not break the streak', () => {
    const s = streak([...rounds(11, 2), ...rounds(12, 2), ...rounds(13, 1)]);
    expect(s.length).toBe(2);
  });

  it('grace 1, one day skipped: the streak continues', () => {
    const s = streak([
      settings({ streakGraceDays: 1 }),
      ...rounds(10, 2),
      ...rounds(12, 2), // 11 skipped
      ...rounds(13, 2),
    ]);
    expect(s).toMatchObject({ length: 3, restarted: false });
  });

  it('grace 0, one day skipped: the streak breaks and restarts at 1 («new streak: 1»)', () => {
    const s = streak([
      settings({ streakGraceDays: 0 }),
      ...rounds(10, 2),
      ...rounds(12, 2),
      ...rounds(13, 2),
    ]);
    expect(s).toMatchObject({ length: 2, restarted: false });
    const s1 = streak([
      settings({ streakGraceDays: 0 }),
      ...rounds(10, 2),
      ...rounds(13, 2),
    ]);
    expect(s1).toMatchObject({ length: 1, restarted: true });
  });

  it('grace 1, two days skipped: break, new streak 1', () => {
    const s = streak([
      settings({ streakGraceDays: 1 }),
      ...rounds(9, 2),
      ...rounds(13, 2), // 10, 11, 12 skipped
    ]);
    expect(s).toMatchObject({ length: 1, restarted: true });
  });

  it('a break with today still open gives length 0 and no message', () => {
    const s = streak([settings({ streakGraceDays: 1 }), ...rounds(8, 2)]);
    expect(s).toMatchObject({ length: 0, restarted: false });
  });

  it('is hidden when turned off or below level full', () => {
    expect(
      streak([settings({ streakEnabled: false }), ...rounds(13, 2)]).visible,
    ).toBe(false);
    expect(
      streak([settings({ gamification: 'subtle' }), ...rounds(13, 2)]).visible,
    ).toBe(false);
    expect(
      streak([settings({ gamification: 'off' }), ...rounds(13, 2)]).visible,
    ).toBe(false);
  });
});
