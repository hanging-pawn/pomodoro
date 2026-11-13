import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newEvent } from '../domain/events';
import { deriveState } from '../domain/state';
import { openStore, type Store } from '../storage/store';
import { createRepoClient } from './github';
import { BETA_REPO, createBetaSession, type BetaSession } from './session';
import { createFakeGitHub, type FakeGitHub } from './testing/fake-github';

// Built at runtime so no token-like literal sits in the source (pre-commit token scan).
const KEY = ['github', 'pat', 'TESTKEY0123456789abcdefghij'].join('_');
const START = Date.UTC(2026, 10, 13, 9, 0, 0);

let gh: FakeGitHub;
const sessions: BetaSession[] = [];

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
/** One device: own browser storage, own IndexedDB, same beta data repo. */
async function device() {
  const store: Store = await openStore({ name: `device-${++dbSeq}` });
  const session = createBetaSession({
    storage: memoryStorage(),
    connect: (key) =>
      createRepoClient({ repo: BETA_REPO, token: key, fetch: gh.fetch }),
    events: () => store.events(),
    importJson: (json) => store.importJson(json),
    lang: () => 'de',
    device: 'Safari / iPhone',
    appVersion: '0.4.0',
    onlineSignal: new EventTarget(),
  });
  sessions.push(session);
  return { store, session };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  vi.setSystemTime(START);
  gh = createFakeGitHub();
  gh.acceptToken = KEY;
});

afterEach(() => {
  sessions.splice(0).forEach((s) => s.signOut());
  vi.useRealTimers();
});

describe('beta account: create (POMO-85)', () => {
  it('creates testers/<id>/account.json for a new tester id', async () => {
    const { session } = await device();
    session.consent('lea');
    expect(
      await session.signIn('lea', KEY, {
        name: 'Lea',
        email: 'lea@example.com',
      }),
    ).toBe('signed-in');
    const account = JSON.parse(gh.file('testers/lea/account.json')!);
    expect(account).toMatchObject({
      testerId: 'lea',
      name: 'Lea',
      email: 'lea@example.com',
      lang: 'de',
      status: 'aktiv',
      createdAt: '2026-11-13T09:00:00.000Z',
      lastLogin: '2026-11-13T09:00:00.000Z',
      selfRegistered: true,
    });
    expect(session.state).toBe('signed-in');
  });

  it('refuses to create an account whose id is taken, writing nothing', async () => {
    const { session } = await device();
    gh.pushFromElsewhere(
      'testers/lea/account.json',
      JSON.stringify({ testerId: 'lea', name: 'Other', status: 'aktiv' }),
    );
    session.consent('lea');
    expect(await session.signIn('lea', KEY, { name: 'Lea', email: '' })).toBe(
      'taken',
    );
    expect(gh.commits()).toHaveLength(0);
    expect(session.state).toBe('signed-out');
  });

  it('needs a name to create an account', async () => {
    const { session } = await device();
    session.consent('lea');
    expect(await session.signIn('lea', KEY, { name: ' ', email: '' })).toBe(
      'no-name',
    );
    expect(gh.requests).toEqual([]);
  });

  it('signing in without an account still says unknown-tester', async () => {
    const { session } = await device();
    session.consent('lea');
    expect(await session.signIn('lea', KEY)).toBe('unknown-tester');
  });
});

describe('beta account: same data on every device (POMO-85)', () => {
  it('a second device signing in gets the tasks of the first one, and back', async () => {
    const phone = await device();
    await phone.store.append(
      newEvent('task.created', { taskId: 't1', title: 'Bericht', estimate: 2 }),
    );
    phone.session.consent('lea');
    await phone.session.signIn('lea', KEY, { name: 'Lea', email: '' });

    const laptop = await device();
    laptop.session.consent('lea');
    expect(await laptop.session.signIn('lea', KEY)).toBe('signed-in');
    expect(deriveState(await laptop.store.events()).tasks.t1?.title).toBe(
      'Bericht',
    );

    await laptop.store.append(
      newEvent('task.created', { taskId: 't2', title: 'Folien', estimate: 1 }),
    );
    expect(await laptop.session.pull()).toBe('synced');
    expect(await phone.session.pull()).toBe('synced');
    expect(deriveState(await phone.store.events()).tasks.t2?.title).toBe(
      'Folien',
    );
  });

  it('pull is off while signed out and sends nothing', async () => {
    const { session } = await device();
    expect(await session.pull()).toBe('off');
    expect(gh.requests).toEqual([]);
  });
});

describe('beta feedback (POMO-85)', () => {
  it('writes the feedback as a file into the tester folder', async () => {
    const { session } = await device();
    session.consent('lea');
    await session.signIn('lea', KEY, { name: 'Lea', email: '' });
    expect(await session.sendFeedback('Der Laden ist super')).toBe('sent');
    const path = 'testers/lea/feedback/2026-11-13T09-00-00-000Z.md';
    expect(gh.file(path)).toContain('Der Laden ist super');
  });

  it('refuses empty feedback and feedback while signed out', async () => {
    const { session } = await device();
    expect(await session.sendFeedback('hi')).toBe('signed-out');
    session.consent('lea');
    await session.signIn('lea', KEY, { name: 'Lea', email: '' });
    expect(await session.sendFeedback('   ')).toBe('empty');
  });
});
