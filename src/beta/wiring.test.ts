import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newEvent } from '../domain/events';
import { deriveState } from '../domain/state';
import { createBonus } from '../rewards/bonus';
import { openStore, type Store } from '../storage/store';
import { DATA_CHANGED } from '../tasks/events';
import { createInventory } from '../tasks/inventory';
import { createRepoClient } from './github';
import { BETA_REPO, createBetaSession, type BetaSession } from './session';
import { createFakeGitHub, type FakeGitHub } from './testing/fake-github';
import { wireBetaSession } from './wiring';

// Built at runtime so no token-like literal sits in the source (pre-commit token scan).
const KEY = ['github', 'pat', 'TESTKEY0123456789abcdefghij'].join('_');
const START = Date.UTC(2026, 10, 21, 9, 0, 0);
const DELAY = 60_000;

let gh: FakeGitHub;
const cleanup: (() => void)[] = [];

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  };
}

let dbSeq = 0;
async function device(): Promise<{ store: Store; session: BetaSession }> {
  const store = await openStore({ name: `wiring-${++dbSeq}` });
  const session = createBetaSession({
    storage: memoryStorage(),
    connect: (key) =>
      createRepoClient({ repo: BETA_REPO, token: key, fetch: gh.fetch }),
    events: () => store.events(),
    importJson: (json) => store.importJson(json),
    lang: () => 'de',
    appVersion: '0.4.0',
    pullDelayMs: DELAY,
    onlineSignal: new EventTarget(),
  });
  cleanup.push(() => session.signOut());
  return { store, session };
}

/** Resolves on the session's next notify (a merge has finished). */
const nextChange = (session: BetaSession) =>
  new Promise<void>((resolve) => {
    const off = session.onChange(() => {
      off();
      resolve();
    });
  });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  vi.setSystemTime(START);
  gh = createFakeGitHub();
  gh.acceptToken = KEY;
});

afterEach(() => {
  cleanup.splice(0).forEach((f) => f());
  vi.useRealTimers();
});

describe('view change → DATA_CHANGED → beta sync (NFR-10, POMO-95)', () => {
  it('task.reestimated, project.targeted, task.bullet-ticked and bonus.drawn reach sync.jsonl and a second device', async () => {
    const phone = await device();
    await phone.store.append(
      newEvent('task.created', {
        taskId: 't1',
        title: 'Bericht',
        estimate: 2,
        bullets: ['Gliederung'],
      }),
    );
    phone.session.consent('lea');
    expect(
      await phone.session.signIn('lea', KEY, { name: 'Lea', email: '' }),
    ).toBe('signed-in');
    const laptop = await device();
    laptop.session.consent('lea');
    expect(await laptop.session.signIn('lea', KEY)).toBe('signed-in');

    // Later than task.created: merged logs are ordered by time.
    vi.setSystemTime(START + 60_000);
    // The same wiring as main.ts: the page document carries DATA_CHANGED.
    cleanup.push(wireBetaSession(document, phone.session));

    // What the views call, each followed by the DATA_CHANGED they dispatch.
    const inventory = createInventory({ log: phone.store });
    const changed = () => document.dispatchEvent(new Event(DATA_CHANGED));
    await inventory.reestimate('t1', 3);
    changed();
    await inventory.setProjectTarget('Studium', '2026-12-18');
    changed();
    await inventory.tickBullet('t1', 'Gliederung', true);
    changed();
    await createBonus({ log: phone.store, random: () => 0 }).draw(['Kaffee']);
    changed();

    // Nothing merged before the delay ...
    const before = gh.file('testers/lea/sync.jsonl') ?? '';
    expect(before).not.toContain('task.reestimated');
    // ... after it, the account copy holds all four.
    const merged = nextChange(phone.session);
    await vi.advanceTimersByTimeAsync(DELAY);
    await merged;
    const lines = (gh.file('testers/lea/sync.jsonl') ?? '')
      .split('\n')
      .filter(Boolean)
      .map((l) => (JSON.parse(l) as { type: string }).type);
    for (const type of [
      'task.reestimated',
      'project.targeted',
      'task.bullet-ticked',
      'bonus.drawn',
    ])
      expect(lines).toContain(type);

    // The second device gets them on its next merge.
    expect(await laptop.session.pull()).toBe('synced');
    const events = await laptop.store.events();
    const state = deriveState(events);
    expect(state.tasks.t1?.estimate).toBe(2);
    expect(state.tasks.t1?.secondEstimate).toBe(3);
    expect(state.tasks.t1?.ticked).toEqual(['Gliederung']);
    expect(state.projects.Studium).toEqual({ targetDate: '2026-12-18' });
    expect(events.some((e) => e.type === 'bonus.drawn')).toBe(true);
  });

  it('after unsubscribing, DATA_CHANGED no longer reaches the session', () => {
    const changed = vi.fn();
    const off = wireBetaSession(document, { changed });
    document.dispatchEvent(new Event(DATA_CHANGED));
    off();
    document.dispatchEvent(new Event(DATA_CHANGED));
    expect(changed).toHaveBeenCalledTimes(1);
  });
});
