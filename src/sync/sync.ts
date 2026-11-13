import { compareEvents, type DomainEvent } from '../domain/events';
import { createRepoClient, GitHubError, type RepoClient } from '../beta/github';
import { EXPORT_FORMAT, EXPORT_VERSION, type Store } from '../storage/store';

/**
 * Optional personal sync (NFR-10) through the user's own private GitHub repo, with a fine-grained
 * token limited to that repo (NFR-13). Off by default: until `connect` succeeds, nothing is sent
 * (NFR-09).
 *
 * The repo holds the whole log as `pomo-pomo/events.jsonl` (one event per line, ordered by time
 * and id). A sync is one merge by event id in both directions: remote events go into the local
 * log, local events into the file, in at most one commit. Since events are never edited, two
 * devices that changed different things offline both keep their changes (ADR 0002). If the
 * branch moves during a sync, the merge runs again on the new head.
 *
 * The token is kept only in local storage (never in the log, so never in an export) and deleted
 * by `disconnect`. Local data stays.
 */
export type ConnectResult =
  | 'synced'
  | 'invalid-repo'
  | 'bad-token'
  | 'no-access'
  | 'empty-repo'
  | 'offline';
export type SyncResult = 'synced' | 'off' | Exclude<ConnectResult, 'synced'>;

export interface Sync {
  readonly state: 'off' | 'on';
  /** `owner/name` of the connected repo. */
  readonly repo: string | null;
  /** Time of the last successful sync on this page, or null. */
  readonly lastSync: Date | null;
  /** Checks repo and token with a first sync; only on success is the connection kept. */
  connect(repo: string, token: string): Promise<ConnectResult>;
  /** Deletes the token and stops syncing; local data stays. */
  disconnect(): void;
  /** Syncs now; 'off' without a connection (no request). */
  sync(): Promise<SyncResult>;
  /** Tell sync the log changed; while connected it syncs within a minute. */
  changed(): void;
  /** Returns an unsubscribe function. */
  onChange(listener: () => void): () => void;
}

export interface SyncOptions {
  store: Pick<Store, 'events' | 'importJson'>;
  /** Defaults to `localStorage`. */
  storage?: Storage;
  /** Client for a repo with a token; defaults to the real one on GitHub. */
  connect?: (repo: string, token: string) => RepoClient;
  /** Source of the browser `online` event. Defaults to `globalThis` where it is an EventTarget. */
  onlineSignal?: EventTarget;
  /** Wait after a change before syncing. Defaults to 60 s. */
  delayMs?: number;
}

export const SYNC_FILE = 'pomo-pomo/events.jsonl';
export const SYNC_STORAGE = 'pomo-pomo.sync';
const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

interface Saved {
  repo: string;
  token: string;
}

export function createSync(options: SyncOptions): Sync {
  const { store, delayMs = 60_000 } = options;
  const storage = options.storage ?? safeLocalStorage();
  const client =
    options.connect ?? ((repo, token) => createRepoClient({ repo, token }));
  const signal =
    options.onlineSignal ??
    (typeof globalThis.addEventListener === 'function'
      ? (globalThis as unknown as EventTarget)
      : undefined);
  const listeners = new Set<() => void>();
  let saved = readSaved(storage);
  let lastSync: Date | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending = false;
  /** The sync that is running, so callers never run two at once. */
  let running: Promise<SyncResult> | null = null;

  const notify = () => listeners.forEach((l) => l());

  async function run(target: Saved): Promise<Exclude<SyncResult, 'off'>> {
    let remote: DomainEvent[] = [];
    try {
      await client(target.repo, target.token).commit(
        'sync: merge events',
        async (read) => {
          const text = (await read(SYNC_FILE)) ?? '';
          remote = parseLines(text);
          const byId = new Map<string, DomainEvent>();
          for (const e of [...remote, ...(await store.events())])
            if (!byId.has(e.id)) byId.set(e.id, e);
          const next = [...byId.values()]
            .sort(compareEvents)
            .map((e) => JSON.stringify(e) + '\n')
            .join('');
          return next === text ? null : { [SYNC_FILE]: next };
        },
      );
    } catch (e) {
      if (e instanceof GitHubError) {
        if (e.status === 401) return 'bad-token';
        if (e.status === 403 || e.status === 404) return 'no-access';
        if (e.status === 409) return 'empty-repo';
      }
      return 'offline';
    }
    // Validates every event; merging by id makes a repeated import harmless.
    if (remote.length)
      await store.importJson(
        JSON.stringify({
          format: EXPORT_FORMAT,
          version: EXPORT_VERSION,
          events: remote,
        }),
      );
    lastSync = new Date();
    return 'synced';
  }

  function sync(): Promise<SyncResult> {
    if (!saved) return Promise.resolve('off');
    if (running) {
      pending = true;
      return running;
    }
    const target = saved;
    pending = false;
    running = run(target).finally(() => {
      running = null;
      if (pending) schedule(0);
    });
    void running.then(notify);
    return running;
  }

  function schedule(delay: number) {
    if (!saved || timer !== undefined) return;
    timer = setTimeout(() => {
      timer = undefined;
      void sync();
    }, delay);
  }

  const onOnline = () => {
    if (saved) schedule(0);
  };
  signal?.addEventListener('online', onOnline);

  return {
    get state() {
      return saved ? 'on' : 'off';
    },
    get repo() {
      return saved?.repo ?? null;
    },
    get lastSync() {
      return lastSync;
    },
    async connect(repo, token) {
      repo = repo.trim();
      token = token.trim();
      if (!REPO.test(repo) || repo.split('/').some((p) => /^\.+$/.test(p)))
        return 'invalid-repo';
      if (!token) return 'bad-token';
      const result = await run({ repo, token });
      if (result !== 'synced') return result;
      saved = { repo, token };
      set(storage, SYNC_STORAGE, JSON.stringify(saved));
      notify();
      return 'synced';
    },
    disconnect() {
      saved = null;
      lastSync = null;
      pending = false;
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      remove(storage, SYNC_STORAGE);
      notify();
    },
    sync,
    changed() {
      schedule(delayMs);
    },
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function parseLines(text: string): DomainEvent[] {
  return text
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as DomainEvent);
}

function readSaved(storage: Storage | undefined): Saved | null {
  try {
    const text = storage?.getItem(SYNC_STORAGE);
    if (!text) return null;
    const v = JSON.parse(text) as Partial<Saved>;
    return typeof v.repo === 'string' && typeof v.token === 'string'
      ? { repo: v.repo, token: v.token }
      : null;
  } catch {
    return null;
  }
}

function set(storage: Storage | undefined, key: string, value: string) {
  try {
    storage?.setItem(key, value);
  } catch {
    // Storage unavailable (private mode): sync works for this visit only.
  }
}

function remove(storage: Storage | undefined, key: string) {
  try {
    storage?.removeItem(key);
  } catch {
    // Nothing stored.
  }
}

function safeLocalStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}
