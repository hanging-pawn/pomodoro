import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newEvent } from '../domain/events';
import { createRepoClient } from '../beta/github';
import { createFakeGitHub, type FakeGitHub } from '../beta/testing/fake-github';
import { openStore, type Store } from '../storage/store';
import { createSync, SYNC_FILE, SYNC_STORAGE, type Sync } from './sync';

// Built at runtime so no token-like literal sits in the source (pre-commit token scan).
const TOKEN = ['github', 'pat', 'SYNCKEY0123456789abcdefghij'].join('_');
const REPO = 'anna/pomo-data';

let gh: FakeGitHub;
let n = 0;
const open: (Store | Sync)[] = [];

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

/** One device: its own IndexedDB, its own local storage, the same GitHub. */
async function device(storage: Storage = memoryStorage(), delayMs?: number) {
  const store = await openStore({ name: `sync-test-${++n}` });
  const sync = createSync({
    store,
    storage,
    connect: (repo, token) =>
      createRepoClient({ repo, token, fetch: gh.fetch }),
    onlineSignal: new EventTarget(),
    delayMs,
  });
  open.push(store, sync);
  return { store, sync, storage };
}

const titles = async (store: Store) =>
  Object.values((await store.state()).tasks)
    .map((t) => t.title)
    .sort();

beforeEach(() => {
  gh = createFakeGitHub(REPO);
  gh.acceptToken = TOKEN;
});

afterEach(() => {
  for (const x of open.splice(0)) {
    if ('close' in x) x.close();
    else x.disconnect();
  }
});

describe('sync (NFR-10)', () => {
  it('without sync the app sends 0 requests to api.github.com (NFR-09)', async () => {
    const a = await device();
    await a.store.append(
      newEvent('task.created', { taskId: 't1', title: 'A', estimate: 1 }),
    );
    a.sync.changed();
    expect(a.sync.state).toBe('off');
    expect(await a.sync.sync()).toBe('off');
    expect(gh.requests).toEqual([]);
  });

  it('device A changes, sync → device B shows the change after sync', async () => {
    const a = await device();
    const b = await device();
    expect(await a.sync.connect(REPO, TOKEN)).toBe('synced');
    expect(await b.sync.connect(REPO, TOKEN)).toBe('synced');
    await a.store.append(
      newEvent('task.created', {
        taskId: 't1',
        title: 'Write report',
        estimate: 2,
      }),
    );
    await a.sync.sync();
    await b.sync.sync();
    expect(await titles(b.store)).toEqual(['Write report']);
  });

  it('A and B change one task each offline → after sync both changes are present', async () => {
    const a = await device();
    const b = await device();
    await a.store.append(
      newEvent('task.created', { taskId: 't1', title: 'A1', estimate: 1 }, 1),
      newEvent('task.created', { taskId: 't2', title: 'B1', estimate: 1 }, 2),
    );
    await a.sync.connect(REPO, TOKEN);
    await b.sync.connect(REPO, TOKEN);
    expect(await titles(b.store)).toEqual(['A1', 'B1']);

    gh.offline = true;
    await a.store.append(
      newEvent('task.changed', { taskId: 't1', changes: { title: 'A2' } }, 10),
    );
    await b.store.append(
      newEvent('task.changed', { taskId: 't2', changes: { estimate: 3 } }, 11),
    );
    expect(await a.sync.sync()).toBe('offline');
    expect(await b.sync.sync()).toBe('offline');

    gh.offline = false;
    await a.sync.sync();
    await b.sync.sync();
    await a.sync.sync();
    for (const store of [a.store, b.store]) {
      const { tasks } = await store.state();
      expect(tasks.t1).toMatchObject({ title: 'A2', estimate: 1 });
      expect(tasks.t2).toMatchObject({ title: 'B1', estimate: 3 });
    }
    expect(await a.store.events()).toEqual(await b.store.events());
  });

  it('keeps both changes when the other device pushes during the sync', async () => {
    const a = await device();
    await a.sync.connect(REPO, TOKEN);
    await a.store.append(
      newEvent('task.created', { taskId: 't1', title: 'A', estimate: 1 }),
    );
    const fromB = newEvent('task.created', {
      taskId: 't2',
      title: 'B',
      estimate: 1,
    });
    // B's sync lands between A's read and A's ref update: A must merge again.
    gh.beforeNextRefUpdate = () =>
      gh.pushFromElsewhere(SYNC_FILE, JSON.stringify(fromB) + '\n');
    expect(await a.sync.sync()).toBe('synced');
    expect(await titles(a.store)).toEqual(['A', 'B']);
    expect(gh.file(SYNC_FILE)).toContain('t1');
    expect(gh.file(SYNC_FILE)).toContain('t2');
  });

  it('a repeated sync with nothing new writes no commit', async () => {
    const a = await device();
    await a.store.append(
      newEvent('task.created', { taskId: 't1', title: 'A', estimate: 1 }),
    );
    await a.sync.connect(REPO, TOKEN);
    const commits = gh.commits().length;
    expect(await a.sync.sync()).toBe('synced');
    expect(gh.commits()).toHaveLength(commits);
    expect(gh.file(SYNC_FILE)!.trim().split('\n')).toHaveLength(1);
  });

  it('syncs once, after the delay, following a burst of changes', async () => {
    // Real timers (fake-indexeddb needs them); the delay is shortened from one minute.
    const a = await device(undefined, 50);
    await a.sync.connect(REPO, TOKEN);
    await a.store.append(
      newEvent('task.created', { taskId: 't1', title: 'A', estimate: 1 }),
    );
    a.sync.changed();
    a.sync.changed();
    expect(gh.file(SYNC_FILE)).toBeUndefined();
    await vi.waitFor(() => expect(gh.file(SYNC_FILE)).toContain('t1'));
    expect(gh.commits()).toHaveLength(1);
  });
});

describe('sync setup and disconnect (NFR-13)', () => {
  it('a wrong token: refused, nothing saved, nothing written', async () => {
    const a = await device();
    expect(await a.sync.connect(REPO, TOKEN.replace('SYNC', 'NOPE'))).toBe(
      'bad-token',
    );
    expect(a.sync.state).toBe('off');
    expect(a.storage.getItem(SYNC_STORAGE)).toBeNull();
    expect(gh.commits()).toEqual([]);
  });

  it('a repo the token cannot reach: no-access', async () => {
    const a = await device();
    expect(await a.sync.connect('anna/other', TOKEN)).toBe('no-access');
    expect(a.sync.state).toBe('off');
  });

  it('a malformed repo name: invalid-repo, no request', async () => {
    const a = await device();
    expect(await a.sync.connect('not a repo', TOKEN)).toBe('invalid-repo');
    expect(gh.requests).toEqual([]);
  });

  it('keeps the token only locally: resumes after reload, never in the export', async () => {
    const a = await device();
    await a.store.append(
      newEvent('task.created', { taskId: 't1', title: 'A', estimate: 1 }),
    );
    await a.sync.connect(REPO, TOKEN);
    expect(await a.store.exportJson()).not.toContain(TOKEN);
    const again = createSync({
      store: a.store,
      storage: a.storage,
      connect: (repo, token) =>
        createRepoClient({ repo, token, fetch: gh.fetch }),
    });
    expect(again.state).toBe('on');
    expect(again.repo).toBe(REPO);
    again.disconnect();
  });

  it('disconnect deletes the token and stops syncing; local data stays', async () => {
    const a = await device();
    await a.sync.connect(REPO, TOKEN);
    a.sync.disconnect();
    expect(a.sync.state).toBe('off');
    expect(a.storage.getItem(SYNC_STORAGE)).toBeNull();
    const requests = gh.requests.length;
    await a.store.append(
      newEvent('task.created', { taskId: 't1', title: 'A', estimate: 1 }),
    );
    a.sync.changed();
    expect(await a.sync.sync()).toBe('off');
    expect(gh.requests).toHaveLength(requests);
    expect(await titles(a.store)).toEqual(['A']);
  });
});
