import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compareEvents, newEvent, type DomainEvent } from '../domain/events';
import { createRepoClient } from './github';
import { createFakeGitHub, type FakeGitHub } from './testing/fake-github';
import { createUploader, type Uploader } from './uploader';

const START = Date.UTC(2026, 10, 13, 9, 0, 0);
const MIN = 60_000;

let gh: FakeGitHub;
let log: DomainEvent[];
let uploader: Uploader;
let online: EventTarget;

function setup() {
  gh = createFakeGitHub();
  log = [];
  online = new EventTarget();
  uploader = createUploader({
    client: createRepoClient({
      repo: 'hanging-pawn/pomodoro-beta-data',
      token: 'test-token',
      fetch: gh.fetch,
    }),
    testerId: 'anna',
    events: async () => [...log],
    onlineSignal: online,
  });
}

/** A completed pomodoro as the app records it: started, completed, coins earned. */
function pomodoro(n: number) {
  const at = Date.now();
  const id = `p${n}`;
  return [
    newEvent(
      'pomodoro.started',
      { pomodoroId: id, taskId: 't1', mode: 'strict', focusMinutes: 25 },
      at,
    ),
    newEvent('pomodoro.completed', { pomodoroId: id }, at + 1),
    newEvent(
      'coins.earned',
      { amount: 10, reason: 'pomodoro', pomodoroId: id },
      at + 2,
    ),
  ];
}

function record(...events: DomainEvent[]) {
  log.push(...events);
  uploader.changed();
}

function uploadedIds(day = '2026-11-13') {
  const file = gh.file(`testers/anna/events/${day}.jsonl`) ?? '';
  return file
    .split('\n')
    .filter(Boolean)
    .map((l) => (JSON.parse(l) as DomainEvent).id);
}

/** Ids of the local log in log order (time, then id). */
const logIds = () => [...log].sort(compareEvents).map((e) => e.id);

beforeEach(() => {
  vi.useFakeTimers({ now: START });
  setup();
});
afterEach(() => {
  uploader.stop();
  vi.useRealTimers();
});

describe('createUploader', () => {
  it('uploads new events to the tester folder with a snapshot', async () => {
    const created = newEvent(
      'task.created',
      { taskId: 't1', title: 'Write', estimate: 2 },
      Date.now(),
    );
    record(created, ...pomodoro(1));
    await vi.advanceTimersByTimeAsync(MIN + 1_000);

    expect(gh.commits()).toHaveLength(1);
    expect(uploadedIds()).toEqual(logIds());
    const snapshot = JSON.parse(gh.file('testers/anna/snapshot.json')!);
    expect(snapshot).toMatchObject({
      testerId: 'anna',
      state: { coins: 10, pomodoros: { completed: 1 } },
    });
  });

  it('delivers 2 offline pomodoros within 2 minutes after reconnect', async () => {
    gh.offline = true;
    record(...pomodoro(1));
    await vi.advanceTimersByTimeAsync(25 * MIN);
    record(...pomodoro(2));
    await vi.advanceTimersByTimeAsync(25 * MIN);
    expect(gh.commits()).toHaveLength(0);

    gh.offline = false;
    online.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(2 * MIN);

    expect(uploadedIds()).toEqual(logIds());
    expect(log.filter((e) => e.type === 'pomodoro.completed')).toHaveLength(2);
  });

  it('catches up within 2 minutes even without an online signal', async () => {
    gh.offline = true;
    record(...pomodoro(1), ...pomodoro(2));
    await vi.advanceTimersByTimeAsync(60 * MIN);

    gh.offline = false;
    await vi.advanceTimersByTimeAsync(2 * MIN);

    expect(uploadedIds()).toEqual(logIds());
  });

  it('bundles 10 pomodoros and 30 actions in 15 minutes into at most 15 commits', async () => {
    // 10 pomodoros (3 events each) and 30 single actions, spread over 15 minutes.
    for (let i = 0; i < 40; i++) {
      if (i % 4 === 0) record(...pomodoro(i));
      else
        record(
          newEvent(
            'task.changed',
            { taskId: 't1', changes: { title: `T${i}` } },
            Date.now(),
          ),
        );
      await vi.advanceTimersByTimeAsync((15 * MIN) / 40);
    }
    await vi.advanceTimersByTimeAsync(2 * MIN);

    expect(log).toHaveLength(60);
    expect(gh.commits().length).toBeLessThanOrEqual(15);
    expect(new Set(gh.requests.map((u) => new URL(u).host))).toEqual(
      new Set(['api.github.com']),
    );
    expect(uploadedIds().sort()).toEqual(log.map((e) => e.id).sort());
  });

  it('never commits twice within a minute', async () => {
    for (let i = 0; i < 300; i++) {
      record(...pomodoro(i));
      await vi.advanceTimersByTimeAsync(1_000);
    }
    await vi.advanceTimersByTimeAsync(2 * MIN);

    const times = gh.commits().map((c) => c.at);
    expect(times.length).toBeGreaterThan(1);
    for (let i = 1; i < times.length; i++)
      expect(times[i]! - times[i - 1]!).toBeGreaterThanOrEqual(MIN);
  });

  it('keeps events another device uploaded for the same day (merge by event id)', async () => {
    const foreign = newEvent(
      'task.created',
      { taskId: 'x', title: 'Phone', estimate: 1 },
      START - 1,
    );
    gh.pushFromElsewhere(
      'testers/anna/events/2026-11-13.jsonl',
      JSON.stringify(foreign) + '\n',
    );
    const [first] = pomodoro(1);
    record(first!);
    await vi.advanceTimersByTimeAsync(MIN + 1_000);
    record(first!); // same event again (e.g. re-imported): no duplicate line
    await vi.advanceTimersByTimeAsync(2 * MIN);

    expect(uploadedIds()).toEqual([foreign.id, first!.id]);
  });

  it('writes each event into the file of its day', async () => {
    record(...pomodoro(1));
    await vi.advanceTimersByTimeAsync(24 * 60 * MIN);
    record(...pomodoro(2));
    await vi.advanceTimersByTimeAsync(2 * MIN);

    expect(uploadedIds('2026-11-13')).toHaveLength(3);
    expect(uploadedIds('2026-11-14')).toHaveLength(3);
  });

  it('makes no commit when nothing new was recorded', async () => {
    record(...pomodoro(1));
    await vi.advanceTimersByTimeAsync(2 * MIN);
    uploader.changed();
    online.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(10 * MIN);

    expect(gh.commits()).toHaveLength(1);
  });

  it('refuses a tester id that is not a plain folder name', () => {
    for (const testerId of ['../admin', 'a/b', '', 'Anna'])
      expect(() =>
        createUploader({
          client: { commit: async () => 'unchanged' },
          testerId,
          events: async () => [],
        }),
      ).toThrow();
  });
});
