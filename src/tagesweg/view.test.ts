import { afterEach, describe, expect, it } from 'vitest';
import { openDialog } from '../ui/components/dialog';
import { PICK_TASK } from '../tasks/events';
import { newEvent, type DomainEvent } from '../domain/events';
import { deriveState } from '../domain/state';
import { createI18n } from '../i18n/i18n';
import { dayKey } from '../tasks/inventory';
import { createTimer } from '../timer/controller';
import { createShop } from '../rewards/shop';
import { mountTagesweg } from './view';

const NOW = Date.UTC(2026, 10, 13, 9, 0, 0);
const flush = () => new Promise((r) => setTimeout(r, 0));
const mounted: (() => void)[] = [];
afterEach(() => {
  mounted.splice(0).forEach((off) => off());
  document.body.replaceChildren();
});

async function setup(extra: DomainEvent[] = []) {
  const events: DomainEvent[] = [
    newEvent('task.created', { taskId: 'a', title: 'Report', estimate: 2 }, 1),
    newEvent('plan.changed', { day: dayKey(NOW), taskIds: ['a'] }, 2),
    newEvent('reward.saved', { rewardId: 'r1', title: 'Walk', price: 20 }, 3),
    ...extra,
  ];
  const log = {
    events: async () => [...events],
    append: async (...e: DomainEvent[]) => void events.push(...e),
  };
  let now = NOW;
  const timer = createTimer({ log, now: () => now });
  const root = document.createElement('div');
  document.body.append(root);
  const i18n = createI18n({
    languages: ['en'],
    storage: undefined as unknown as Storage,
  });
  const prepared: number[] = [];
  const off = mountTagesweg(root, i18n, timer, createShop({ log }), {
    state: async () => deriveState(await log.events()),
    now: () => now,
    prepareAlerts: () => prepared.push(now),
  });
  mounted.push(off);
  await flush();
  await timer.refresh();
  await flush();
  return { root, timer, events, prepared, at: (t: number) => (now = t) };
}
const q = (root: HTMLElement, a: string) =>
  root.querySelector<HTMLElement>(`[data-action="${a}"]`);

describe('mountTagesweg', () => {
  it('shows task rows with stations, a reward row, coins and Start', async () => {
    const { root } = await setup();
    expect(root.querySelectorAll('[data-role="task-row"]')).toHaveLength(1);
    expect(root.querySelectorAll('.tw-station')).toHaveLength(2);
    expect(root.querySelectorAll('[data-role="reward-row"]')).toHaveLength(1);
    // One main action: the next-round card names the task (FR-610); coins live in the header.
    expect(root.querySelector('[data-role="next"]')?.textContent).toContain(
      'Report',
    );
    expect(root.querySelectorAll('[data-action="start"]')).toHaveLength(1);
  });

  it('starts a round and zooms to the current path piece with park and abort (FR-604)', async () => {
    const { root, timer } = await setup();
    q(root, 'start')!.click();
    await flush();
    expect(timer.view.phase).toBe('focus');
    expect(root.querySelector('[data-role="piece"]')).not.toBeNull();
    expect(q(root, 'park')).not.toBeNull();
    expect(q(root, 'abort')).not.toBeNull();
    expect(root.querySelector('[data-role="reward-row"]')).toBeNull();
    expect(root.textContent).not.toMatch(/\d\d:\d\d/);
  });

  it('shows digits on tap (FR-606)', async () => {
    const { root } = await setup();
    q(root, 'start')!.click();
    await flush();
    q(root, 'digits')!.click();
    expect(root.textContent).toMatch(/\d\d:\d\d/);
  });

  it('ring moment after a finished round: +coins and next reward', async () => {
    const { root, timer, at } = await setup();
    q(root, 'start')!.click();
    await flush();
    at(NOW + 26 * 60_000);
    await timer.refresh();
    await flush();
    const ring = root.querySelector('[data-role="ring"]');
    expect(ring?.textContent).toContain('+10 coins');
    expect(ring?.textContent).toContain('10 coins to the next reward');
    expect(ring?.textContent).toContain('Balance: 10 coins');
  });

  it('ring moment shows +coins, balance and the day bar done of planned (FR-407)', async () => {
    const { root, timer, at } = await setup();
    q(root, 'start')!.click();
    await flush();
    at(NOW + 26 * 60_000);
    await timer.refresh();
    await flush();
    const ring = root.querySelector('[data-role="ring"]')!;
    expect(ring.textContent).toContain('+10 coins');
    expect(ring.querySelector('[data-role="ring-balance"]')?.textContent).toBe(
      'Balance: 10 coins',
    );
    const bar = ring.querySelector('[role="progressbar"]')!;
    expect(bar.getAttribute('aria-valuenow')).toBe('1');
    expect(bar.getAttribute('aria-valuemax')).toBe('2');
    expect(ring.querySelector('[data-role="ring-day"]')?.textContent).toBe(
      '1 of 2 rounds today',
    );
  });

  it('ring moment names the streak at level full, never a loss (FR-404)', async () => {
    const { root, timer, at } = await setup([
      newEvent('settings.changed', { changes: { dailyGoal: 1 } }, 4),
      // A round five days ago: the chain broke since, so today starts over.
      newEvent(
        'pomodoro.started',
        { pomodoroId: 'old', taskId: 'a', mode: 'strict', focusMinutes: 25 },
        NOW - 5 * 86_400_000,
      ),
      newEvent(
        'pomodoro.completed',
        { pomodoroId: 'old' },
        NOW - 5 * 86_400_000 + 1,
      ),
    ]);
    q(root, 'start')!.click();
    await flush();
    at(NOW + 26 * 60_000);
    await timer.refresh();
    await flush();
    expect(root.querySelector('[data-role="ring-streak"]')?.textContent).toBe(
      'New streak: 1',
    );
  });

  it('ring moment hides coins, balance and streak at level off but keeps the day bar', async () => {
    const { root, timer, at } = await setup([
      newEvent(
        'settings.changed',
        { changes: { gamification: 'off', dailyGoal: 1 } },
        4,
      ),
    ]);
    q(root, 'start')!.click();
    await flush();
    at(NOW + 26 * 60_000);
    await timer.refresh();
    await flush();
    const ring = root.querySelector('[data-role="ring"]')!;
    expect(ring.textContent).not.toContain('coins');
    expect(ring.querySelector('[data-role="ring-streak"]')).toBeNull();
    expect(ring.querySelector('[role="progressbar"]')).not.toBeNull();
  });

  it('redeems a reached reward from its row', async () => {
    const { root, events } = await setup([
      newEvent('coins.earned', { amount: 25, reason: 'set-bonus' }, 4),
    ]);
    q(root, 'redeem')!.click();
    await flush();
    expect(events.some((e) => e.type === 'reward.redeemed')).toBe(true);
  });

  it('level off: no coins, no reward rows (FR-405)', async () => {
    const { root } = await setup([
      newEvent('settings.changed', { changes: { gamification: 'off' } }, 4),
    ]);
    expect(root.querySelector('[data-role="coins"]')).toBeNull();
    expect(root.querySelector('[data-role="reward-row"]')).toBeNull();
  });
  it('reward row shows its approximate time (FR-603)', async () => {
    const { root } = await setup([
      newEvent('plan.changed', { day: dayKey(NOW), taskIds: ['a'] }, NOW),
    ]);
    const time = new Intl.DateTimeFormat('en', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(NOW + 60 * 60_000);
    const row = root.querySelector('[data-role="reward-row"]')!;
    expect(row.querySelector('[data-role="eta"]')?.textContent).toBe(
      `about ${time}`,
    );
  });

  it('shows digits all the time with the setting digits always (FR-606)', async () => {
    const { root } = await setup([
      newEvent('settings.changed', { changes: { digitsAlways: true } }, 4),
    ]);
    q(root, 'start')!.click();
    await flush();
    expect(q(root, 'digits')?.textContent).toMatch(/^\d\d:\d\d$/);
  });
  it('asks for notification permission and unlocks sound inside the Start click (FR-104)', async () => {
    const { root, prepared } = await setup();
    expect(prepared).toHaveLength(0);
    q(root, 'start')!.click();
    // synchronous: browsers grant the permission prompt and audio only inside the user gesture
    expect(prepared).toHaveLength(1);
  });
});

const press = (key: string, target: EventTarget = document.body) => {
  const e = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(e);
  return e;
};
const twoTasks = [
  newEvent('task.created', { taskId: 'b', title: 'Slides', estimate: 1 }, 5),
  newEvent('plan.changed', { day: dayKey(NOW), taskIds: ['a', 'b'] }, 6),
];

describe('Today screen (FR-610, FR-604)', () => {
  it('without a plan shows one calm empty state with «Plan the day»', async () => {
    const { root } = await setup([
      newEvent('plan.changed', { day: dayKey(NOW), taskIds: [] }, 5),
    ]);
    expect(root.querySelector('[data-role="empty"]')).not.toBeNull();
    expect(q(root, 'start')).toBeNull();
    q(root, 'plan')!.click();
    expect(location.hash).toBe('#/tasks');
    location.hash = '';
  });

  it('a tapped task row becomes the next round', async () => {
    const { root, timer } = await setup(twoTasks);
    const picks = root.querySelectorAll<HTMLElement>('[data-action="pick"]');
    expect(picks).toHaveLength(2);
    picks[1]!.click();
    expect(root.querySelector('[data-role="next"]')?.textContent).toContain(
      'Slides',
    );
    q(root, 'start')!.click();
    await flush();
    expect(timer.view.taskId).toBe('b');
  });

  it('the task picked in the Horizon is used for the next round (FR-607)', async () => {
    const { root, timer } = await setup(twoTasks);
    document.dispatchEvent(new CustomEvent(PICK_TASK, { detail: 'b' }));
    q(root, 'start')!.click();
    await flush();
    expect(timer.view.taskId).toBe('b');
  });

  it('flexible mode offers Pause in the round, strict only Abort (FR-107)', async () => {
    const strict = await setup();
    q(strict.root, 'start')!.click();
    await flush();
    expect(q(strict.root, 'pause')).toBeNull();
    const flex = await setup([
      newEvent('settings.changed', { changes: { mode: 'flexible' } }, 5),
    ]);
    q(flex.root, 'start')!.click();
    for (let i = 0; i < 20 && !q(flex.root, 'pause'); i++) await flush();
    flex.at(NOW + 60_000); // events at the same instant have no defined order
    q(flex.root, 'pause')!.click();
    for (let i = 0; i < 20 && flex.timer.view.phase !== 'paused'; i++)
      await flush();
    expect(flex.timer.view.phase).toBe('paused');
    expect(q(flex.root, 'resume')).not.toBeNull();
  });
});

describe('break bar (pause-360, FR-604)', () => {
  it('shows a break bar with minutes left that moves in place', async () => {
    const { root, timer, at } = await setup();
    q(root, 'start')!.click();
    await flush();
    at(NOW + 25 * 60_000 + 1000);
    await timer.refresh();
    await flush();
    expect(timer.view.phase).toBe('short-break');
    const bar = root.querySelector('[data-role="break-bar"]')!;
    expect(root.querySelector('[data-role="break-left"]')?.textContent).toBe(
      '5 min left, then the next round',
    );
    const before = bar.getAttribute('aria-valuenow');
    at(NOW + 28 * 60_000);
    await timer.refresh();
    await flush();
    expect(root.querySelector('[data-role="break-bar"]')).toBe(bar);
    expect(bar.getAttribute('aria-valuenow')).not.toBe(before);
    expect(root.querySelector('[data-role="break-left"]')?.textContent).toBe(
      '2 min left, then the next round',
    );
  });
});

describe('ticks (NFR-18)', () => {
  it('a tick moves the piece but keeps the buttons, so a tap on the iPhone is not lost', async () => {
    const { root, timer, at } = await setup();
    q(root, 'start')!.click();
    await flush();
    const abort = q(root, 'abort');
    const piece = root.querySelector('[data-role="piece"]')!;
    const before = piece.getAttribute('aria-valuenow');
    at(NOW + 5 * 60_000);
    await timer.refresh();
    await flush();
    expect(q(root, 'abort')).toBe(abort);
    expect(piece.getAttribute('aria-valuenow')).not.toBe(before);
  });
});

describe('keyboard (NFR-06)', () => {
  it('Space starts a round without a mouse click', async () => {
    const { timer } = await setup();
    const e = press(' ');
    await flush();
    expect(timer.view.phase).toBe('focus');
    expect(e.defaultPrevented).toBe(true);
  });

  it('Space does not start while typing in a text field or on a focused button', async () => {
    const { root, timer } = await setup();
    const input = document.createElement('input');
    document.body.append(input);
    press(' ', input);
    press(' ', q(root, 'start')!);
    await flush();
    expect(timer.view.phase).toBe('idle');
  });

  it('Space does nothing while a dialog such as the intro is open', async () => {
    const { timer } = await setup();
    const closed = openDialog({
      title: 'Intro',
      actions: [{ label: 'Skip', value: 'skip' }],
    });
    (document.activeElement as HTMLElement | null)?.blur();
    const e = press(' ');
    await flush();
    expect(timer.view.phase).toBe('idle');
    expect(e.defaultPrevented).toBe(false);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await closed;
    press(' ');
    await flush();
    expect(timer.view.phase).toBe('focus');
  });

  it('Space does nothing while Today is not the visible screen', async () => {
    const { root, timer } = await setup();
    const hidden = document.createElement('section');
    hidden.hidden = true;
    document.body.append(hidden);
    hidden.append(root);
    press(' ');
    await flush();
    expect(timer.view.phase).toBe('idle');
  });

  it('N picks the next open task, wrapping around, and Space then starts it', async () => {
    const { root, timer } = await setup(twoTasks);
    const next = () => root.querySelector('[data-role="next"]')?.textContent;
    expect(next()).toContain('Report');
    press('n');
    expect(next()).toContain('Slides');
    press('N');
    expect(next()).toContain('Report');
    press('n');
    press(' ');
    await flush();
    expect(timer.view.taskId).toBe('b');
  });

  it('P opens the park dialog, the round keeps running', async () => {
    const { timer } = await setup();
    press(' ');
    await flush();
    press('p');
    await flush();
    expect(document.querySelector('.ui-dialog')).not.toBeNull();
    expect(timer.view.phase).toBe('focus');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  });
});
