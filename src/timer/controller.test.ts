import { describe, expect, it } from 'vitest';
import { newEvent, type DomainEvent } from '../domain/events';
import { createTimer, type TimerLog } from './controller';

const MIN = 60_000;
const T0 = Date.UTC(2026, 10, 13, 9, 0, 0);

function setup(mode: 'strict' | 'flexible' = 'strict') {
  const events: DomainEvent[] = [];
  if (mode === 'flexible')
    events.push(newEvent('settings.changed', { changes: { mode } }, T0 - 1));
  const log: TimerLog = {
    events: async () => [...events],
    append: async (...e) => {
      for (const x of e) if (!events.some((y) => y.id === x.id)) events.push(x);
    },
  };
  let now = T0;
  const timer = createTimer({ log, now: () => now });
  return {
    timer,
    events,
    at: (t: number) => (now = t),
  };
}

describe('createTimer', () => {
  it('starts a strict round and writes one pomodoro.started event', async () => {
    const { timer, events } = setup();
    await timer.start('t1');
    expect(timer.view.phase).toBe('focus');
    expect(timer.view.mode).toBe('strict');
    expect(events.filter((e) => e.type === 'pomodoro.started')).toHaveLength(1);
  });

  it('refuses to pause in strict mode', async () => {
    const { timer, events } = setup();
    await timer.start('t1');
    await expect(timer.pause()).rejects.toThrow(/strict/);
    expect(events.some((e) => e.type === 'pomodoro.paused')).toBe(false);
  });

  it('pauses and resumes in flexible mode', async () => {
    const { timer, at } = setup('flexible');
    await timer.start('t1');
    at(T0 + 10 * MIN);
    await timer.pause();
    expect(timer.view.phase).toBe('paused');
    at(T0 + 20 * MIN);
    await timer.resume();
    at(T0 + 21 * MIN);
    await timer.refresh();
    expect(timer.view.remainingMs).toBe(14 * MIN);
  });

  it('aborts with a reason: writes aborted with worked minutes, no completion', async () => {
    const { timer, events, at } = setup();
    await timer.start('t1');
    at(T0 + 12 * MIN + 5000);
    await timer.abort('external');
    const aborted = events.find((e) => e.type === 'pomodoro.aborted');
    expect(aborted?.payload).toMatchObject({
      interruption: 'external',
      workedMinutes: 12,
    });
    expect(events.some((e) => e.type === 'pomodoro.completed')).toBe(false);
    expect(timer.view.phase).toBe('idle');
  });

  it('writes the completion once, at the end time, and announces the phase end', async () => {
    const { timer, events, at } = setup();
    const ended: string[] = [];
    timer.onChange((_v, end) => end && ended.push(end));
    await timer.start('t1');
    at(T0 + 25 * MIN + 500);
    await timer.refresh();
    await timer.refresh();
    const done = events.filter((e) => e.type === 'pomodoro.completed');
    expect(done).toHaveLength(1);
    expect(done[0]?.at).toBe(T0 + 25 * MIN);
    expect(ended).toEqual(['focus']);
    expect(timer.view.phase).toBe('short-break');
  });

  it('announces the end of a break', async () => {
    const { timer, at } = setup();
    const ended: string[] = [];
    timer.onChange((_v, end) => end && ended.push(end));
    await timer.start('t1');
    at(T0 + 26 * MIN);
    await timer.refresh();
    at(T0 + 31 * MIN);
    await timer.refresh();
    expect(ended).toEqual(['focus', 'break']);
  });

  it('a fresh timer on the same log after a reload shows the same remaining time', async () => {
    const s = setup();
    await s.timer.start('t1');
    s.at(T0 + 10 * MIN);
    const reloaded = createTimer({
      log: { events: async () => s.events, append: async () => {} },
      now: () => T0 + 10 * MIN + 300,
    });
    await reloaded.refresh();
    expect(reloaded.view.remainingMs).toBeGreaterThanOrEqual(15 * MIN - 1000);
    expect(reloaded.view.phase).toBe('focus');
  });

  it('skipBreak ends the break', async () => {
    const { timer, at } = setup();
    await timer.start('t1');
    at(T0 + 26 * MIN);
    await timer.refresh();
    await timer.skipBreak();
    expect(timer.view.phase).toBe('idle');
  });
});
