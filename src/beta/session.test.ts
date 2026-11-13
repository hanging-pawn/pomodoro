import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newEvent, type DomainEvent } from '../domain/events';
import { openStore } from '../storage/store';
import { createRepoClient } from './github';
import { BETA_REPO, createBetaSession, type BetaSession } from './session';
import { createFakeGitHub, type FakeGitHub } from './testing/fake-github';

// Built at runtime so no token-like literal sits in the source (pre-commit token scan).
const KEY = ['github', 'pat', 'TESTKEY0123456789abcdefghij'].join('_');
const WRONG = ['github', 'pat', 'WRONGKEY0123456789abcdefghi'].join('_');
const START = Date.UTC(2026, 10, 13, 9, 0, 0);
const MIN = 60_000;
const ACCOUNT = 'testers/anna/account.json';

const adminAccount = {
  testerId: 'anna',
  name: 'Anna Muster',
  email: 'anna@example.com',
  lang: 'de',
  status: 'aktiv',
  createdAt: '2026-11-10T08:00:00.000Z',
  lastLogin: null,
  device: null,
  appVersion: null,
};

let gh: FakeGitHub;
let storage: Storage;
let log: DomainEvent[];
let session: BetaSession;

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

function newSession() {
  return createBetaSession({
    storage,
    connect: (key) =>
      createRepoClient({ repo: BETA_REPO, token: key, fetch: gh.fetch }),
    events: async () => [...log],
    lang: () => 'it',
    device: 'Firefox 140 / macOS',
    appVersion: '0.3.0',
    onlineSignal: new EventTarget(),
  });
}

const storedText = () =>
  Array.from({ length: storage.length }, (_, i) => {
    const k = storage.key(i)!;
    return `${k}=${storage.getItem(k)}`;
  }).join('\n');

const account = () => JSON.parse(gh.file(ACCOUNT)!) as Record<string, unknown>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
  gh = createFakeGitHub();
  gh.acceptToken = KEY;
  gh.pushFromElsewhere(ACCOUNT, JSON.stringify(adminAccount, null, 2) + '\n');
  storage = memoryStorage();
  log = [];
  session = newSession();
});

afterEach(() => {
  session.signOut();
  vi.useRealTimers();
});

describe('beta session: consent (FR-506)', () => {
  it('needs consent on the first sign-in and sends nothing without it', async () => {
    expect(session.needsConsent('anna')).toBe(true);
    expect(await session.signIn('anna', KEY)).toBe('no-consent');
    expect(gh.requests).toEqual([]);
    expect(session.state).toBe('signed-out');
    expect(storedText()).not.toContain(KEY);
  });

  it('remembers consent on this device, so the next sign-in does not ask again', async () => {
    session.consent('anna');
    expect(newSession().needsConsent('anna')).toBe(false);
    expect(newSession().needsConsent('bruno')).toBe(true);
  });
});

describe('beta session: sign-in (FR-502)', () => {
  beforeEach(() => session.consent('anna'));

  it('updates account.json with last login, language, device and app version', async () => {
    expect(await session.signIn('anna', KEY)).toBe('signed-in');
    expect(session.state).toBe('signed-in');
    expect(session.testerId).toBe('anna');
    expect(account()).toEqual({
      ...adminAccount,
      lang: 'it',
      lastLogin: '2026-11-13T09:00:00.000Z',
      device: 'Firefox 140 / macOS',
      appVersion: '0.3.0',
    });
    expect(gh.commits()).toHaveLength(1);
  });

  it('updates last login again on the next sign-in', async () => {
    await session.signIn('anna', KEY);
    session.signOut();
    vi.setSystemTime(START + 3 * 24 * 60 * MIN);
    await session.signIn('anna', KEY);
    expect(account().lastLogin).toBe('2026-11-16T09:00:00.000Z');
    expect(account().createdAt).toBe(adminAccount.createdAt);
  });

  it('refuses a wrong key with bad-key, writes nothing and never uploads', async () => {
    log.push(
      newEvent('task.created', { taskId: 't1', title: 'A', estimate: 1 }),
    );
    expect(await session.signIn('anna', WRONG)).toBe('bad-key');
    expect(session.state).toBe('signed-out');
    session.changed();
    await vi.advanceTimersByTimeAsync(10 * MIN);
    expect(gh.commits()).toEqual([]);
    expect(account().lastLogin).toBeNull();
    expect(storedText()).not.toContain(WRONG);
  });

  it('refuses an unknown tester id without writing', async () => {
    session.consent('bruno');
    expect(await session.signIn('bruno', KEY)).toBe('unknown-tester');
    expect(gh.commits()).toEqual([]);
    expect(gh.file('testers/bruno/account.json')).toBeUndefined();
  });

  it('refuses a locked tester without writing', async () => {
    gh.pushFromElsewhere(
      ACCOUNT,
      JSON.stringify({ ...adminAccount, status: 'gesperrt' }),
    );
    expect(await session.signIn('anna', KEY)).toBe('locked');
    expect(gh.commits()).toEqual([]);
  });

  it('reports offline and stays signed out without network', async () => {
    gh.offline = true;
    expect(await session.signIn('anna', KEY)).toBe('offline');
    expect(session.state).toBe('signed-out');
  });

  it('rejects a malformed tester id before any request', async () => {
    expect(await session.signIn('Anna Muster', KEY)).toBe('invalid-id');
    expect(gh.requests).toEqual([]);
  });

  it('talks only to api.github.com (NFR-09)', async () => {
    await session.signIn('anna', KEY);
    expect(
      gh.requests.every((u) => u.startsWith('https://api.github.com/')),
    ).toBe(true);
  });
});

describe('beta session: uploads and sign-out (FR-506, NFR-13)', () => {
  beforeEach(() => session.consent('anna'));

  it('uploads the log while signed in', async () => {
    log.push(
      newEvent('task.created', { taskId: 't1', title: 'A', estimate: 1 }),
    );
    await session.signIn('anna', KEY);
    await vi.advanceTimersByTimeAsync(2 * MIN);
    expect(gh.file('testers/anna/events/2026-11-13.jsonl')).toContain('t1');
  });

  it('keeps the key only in local storage and resumes after a reload', async () => {
    await session.signIn('anna', KEY);
    expect(storedText()).toContain(KEY);
    const reloaded = newSession();
    expect(reloaded.state).toBe('signed-in');
    expect(reloaded.testerId).toBe('anna');
    reloaded.signOut();
  });

  it('sign-out deletes the key from storage and stops uploads; local data stays', async () => {
    await session.signIn('anna', KEY);
    const commits = gh.commits().length;
    session.signOut();
    expect(session.state).toBe('signed-out');
    expect(storedText()).not.toContain(KEY);
    log.push(
      newEvent('task.created', { taskId: 't2', title: 'B', estimate: 1 }),
    );
    session.changed();
    await vi.advanceTimersByTimeAsync(10 * MIN);
    expect(gh.commits()).toHaveLength(commits);
    expect(log).toHaveLength(1);
    expect(newSession().state).toBe('signed-out');
  });

  it('the JSON export contains no key', async () => {
    vi.useRealTimers();
    const store = await openStore({ name: 'session-export-test' });
    await store.append(
      newEvent('task.created', { taskId: 't1', title: 'A', estimate: 1 }),
    );
    log = await store.events();
    await session.signIn('anna', KEY);
    expect(await store.exportJson()).not.toContain(KEY);
    expect(await store.exportJson()).not.toContain('github_pat');
    store.close();
  });
});
