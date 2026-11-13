import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { newEvent } from '../domain/events';
import { openStore } from './store';

/** One task with two completed pomodoros, one aborted, coins earned and one redemption. */
function sampleLog() {
  const at = Date.UTC(2026, 10, 13, 9);
  return [
    newEvent(
      'task.created',
      { taskId: 't1', title: 'Write, "draft"', estimate: 3 },
      at,
    ),
    newEvent(
      'task.created',
      { taskId: 't2', title: 'Review', project: 'X', estimate: 1 },
      at + 1,
    ),
    newEvent(
      'pomodoro.started',
      { pomodoroId: 'p1', taskId: 't1', mode: 'strict', focusMinutes: 25 },
      at + 2,
    ),
    newEvent('pomodoro.completed', { pomodoroId: 'p1' }, at + 3),
    newEvent(
      'coins.earned',
      { amount: 10, reason: 'pomodoro', pomodoroId: 'p1' },
      at + 4,
    ),
    newEvent(
      'pomodoro.started',
      { pomodoroId: 'p2', taskId: 't1', mode: 'strict', focusMinutes: 25 },
      at + 5,
    ),
    newEvent('pomodoro.completed', { pomodoroId: 'p2' }, at + 6),
    newEvent(
      'coins.earned',
      { amount: 10, reason: 'pomodoro', pomodoroId: 'p2' },
      at + 7,
    ),
    newEvent(
      'pomodoro.started',
      { pomodoroId: 'p3', taskId: 't2', mode: 'strict', focusMinutes: 25 },
      at + 8,
    ),
    newEvent(
      'pomodoro.aborted',
      { pomodoroId: 'p3', interruption: 'internal', workedMinutes: 7 },
      at + 9,
    ),
    newEvent(
      'reward.redeemed',
      { rewardId: 'r1', title: 'Coffee', price: 5 },
      at + 10,
    ),
    newEvent('settings.changed', { changes: { mode: 'flexible' } }, at + 11),
  ];
}

describe('openStore', () => {
  it('keeps tasks, protocol and balance across a browser restart', async () => {
    const indexedDB = new IDBFactory();
    const first = await openStore({ indexedDB });
    await first.append(...sampleLog());
    const before = await first.state();
    first.close();

    const second = await openStore({ indexedDB });
    const after = await second.state();

    expect(Object.keys(after.tasks)).toHaveLength(2);
    expect(after.pomodoros.completed).toBe(2);
    expect(after.coins).toBe(15);
    expect(await second.events()).toHaveLength(12);
    expect(after).toEqual(before);
    second.close();
  });

  it('appending an event with a known id changes nothing', async () => {
    const store = await openStore({ indexedDB: new IDBFactory() });
    const e = newEvent('coins.earned', { amount: 10, reason: 'pomodoro' });
    await store.append(e);
    await store.append(e);
    expect(await store.events()).toHaveLength(1);
    expect((await store.state()).coins).toBe(10);
    store.close();
  });

  it('export → wipe → import yields identical task, pomodoro and coin counts', async () => {
    const store = await openStore({ indexedDB: new IDBFactory() });
    await store.append(...sampleLog());
    const before = await store.state();
    const json = await store.exportJson();

    await store.wipe();
    expect(await store.events()).toHaveLength(0);
    expect((await store.state()).coins).toBe(0);

    await store.importJson(json);
    const after = await store.state();
    expect(Object.keys(after.tasks)).toHaveLength(
      Object.keys(before.tasks).length,
    );
    expect(after.pomodoros).toEqual(before.pomodoros);
    expect(after.coins).toBe(before.coins);
    expect(after).toEqual(before);
    store.close();
  });

  it('import merges by event id and is idempotent', async () => {
    const log = sampleLog();
    const a = await openStore({ indexedDB: new IDBFactory() });
    await a.append(...log.slice(0, 8));
    const b = await openStore({ indexedDB: new IDBFactory() });
    await b.append(...log.slice(4));

    await a.importJson(await b.exportJson());
    await a.importJson(await b.exportJson());

    expect(await a.events()).toHaveLength(12);
    expect((await a.state()).coins).toBe(15);
    a.close();
    b.close();
  });

  it('rejects an import that is not a pomo.pomo export and leaves data untouched', async () => {
    const store = await openStore({ indexedDB: new IDBFactory() });
    await store.append(...sampleLog());
    await expect(store.importJson('{"hello":1}')).rejects.toThrow(/export/);
    await expect(
      store.importJson(
        JSON.stringify({
          format: 'pomo-pomo-export',
          version: 1,
          events: [{ id: 'x' }],
        }),
      ),
    ).rejects.toThrow(/event/);
    expect(await store.events()).toHaveLength(12);
    store.close();
  });

  it('exports the protocol as CSV, one row per event in log order', async () => {
    const store = await openStore({ indexedDB: new IDBFactory() });
    await store.append(...sampleLog());
    const lines = (await store.exportCsv()).trimEnd().split('\r\n');
    expect(lines[0]).toBe('id,time,type,task,pomodoro,coins,details');
    expect(lines).toHaveLength(13);
    expect(lines[1]).toMatch(
      /^[0-9a-f-]{36},2026-11-13T09:00:00\.000Z,task\.created,t1,,,"\{""title"":""Write, \\""draft\\""""/,
    );
    expect(lines[5]).toMatch(/,coins\.earned,,p1,10,/);
    expect(lines[11]).toMatch(/,reward\.redeemed,,,-5,/);
    store.close();
  });
});
