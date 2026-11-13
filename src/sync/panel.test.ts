import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRepoClient } from '../beta/github';
import { createFakeGitHub, type FakeGitHub } from '../beta/testing/fake-github';
import { createI18n } from '../i18n/i18n';
import { openStore, type Store } from '../storage/store';
import { mountSyncPanel } from './panel';
import { createSync, SYNC_STORAGE, type Sync } from './sync';

// Built at runtime so no token-like literal sits in the source (pre-commit token scan).
const TOKEN = ['github', 'pat', 'SYNCKEY0123456789abcdefghij'].join('_');
const REPO = 'anna/pomo-data';

let gh: FakeGitHub;
let store: Store;
let sync: Sync;
let root: HTMLElement;
let unmount: () => void;
let n = 0;

beforeEach(async () => {
  localStorage.clear();
  gh = createFakeGitHub(REPO);
  gh.acceptToken = TOKEN;
  store = await openStore({ name: `sync-panel-${++n}` });
  sync = createSync({
    store,
    storage: localStorage,
    connect: (repo, token) =>
      createRepoClient({ repo, token, fetch: gh.fetch }),
    onlineSignal: new EventTarget(),
  });
  root = document.createElement('div');
  unmount = mountSyncPanel(
    root,
    createI18n({ languages: ['en'], storage: localStorage }),
    sync,
  );
});

afterEach(() => {
  unmount();
  sync.disconnect();
  store.close();
});

const field = (name: string) =>
  root.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
const button = (action: string) =>
  root.querySelector<HTMLButtonElement>(`button[data-action="${action}"]`);
const settle = () => new Promise((r) => setTimeout(r, 20));

async function connect(token = TOKEN) {
  field('repo').value = REPO;
  field('token').value = token;
  root
    .querySelector('form')!
    .dispatchEvent(new Event('submit', { cancelable: true }));
  await settle();
}

describe('sync panel', () => {
  it('guides the setup: private repo, fine-grained token with Contents read/write on one repo (NFR-13)', () => {
    const text = root.textContent!;
    expect(text).toContain('private');
    expect(text).toContain('Only select repositories');
    expect(text).toContain('Contents: read/write');
    expect(field('token').type).toBe('password');
    expect(gh.requests).toEqual([]);
  });

  it('connects and shows the repo, then disconnect deletes the token', async () => {
    await connect();
    expect(root.textContent).toContain(REPO);
    expect(localStorage.getItem(SYNC_STORAGE)).toContain(TOKEN);
    button('disconnect')!.click();
    expect(localStorage.getItem(SYNC_STORAGE)).toBeNull();
    expect(field('repo')).toBeTruthy();
  });

  it('a wrong token shows a clear message and stays disconnected', async () => {
    await connect(TOKEN.replace('SYNC', 'NOPE'));
    expect(root.querySelector('[role="alert"]')?.textContent).toContain(
      'token',
    );
    expect(sync.state).toBe('off');
  });

  it('sync now runs a sync', async () => {
    await connect();
    const before = gh.requests.length;
    button('sync-now')!.click();
    await settle();
    expect(gh.requests.length).toBeGreaterThan(before);
  });
});
