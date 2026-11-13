import { compareEvents, type DomainEvent } from '../domain/events';
import { deriveState } from '../domain/state';
import type { RepoClient } from './github';

/**
 * Beta upload queue (FR-501, NFR-17). Copies the local event log into the beta data repo under
 * `testers/<tester-id>/`:
 *
 * - `events/<yyyy-mm-dd>.jsonl`: one event per line, day in UTC, ordered by (time, id);
 * - `snapshot.json`: the state derived from this device's log.
 *
 * Uploads are batched: a change waits up to one minute for more, and there is at most one commit
 * per minute. Failed uploads (offline, API error) are
 * retried, at the latest every 2 minutes and at once when the browser comes back online.
 * Every upload merges with the repo by event id, so repeated or concurrent uploads never lose or
 * duplicate an event.
 */
export interface Uploader {
  /** Tell the queue the log has new events; it uploads them in the next batch. */
  changed(): void;
  /** Stops all timers and listeners. */
  stop(): void;
}

export interface UploaderOptions {
  client: RepoClient;
  testerId: string;
  /** The whole local log (e.g. `store.events`). */
  events: () => Promise<DomainEvent[]>;
  /** Source of the browser `online` event. Defaults to `globalThis` where it is an EventTarget. */
  onlineSignal?: EventTarget;
  /** Minimum time between two upload attempts. Defaults to 60 s (NFR-17). */
  minIntervalMs?: number;
  /** Longest wait before retrying a failed upload. Defaults to 2 min (FR-501). */
  maxRetryMs?: number;
}

const TESTER_ID = /^[a-z0-9][a-z0-9-]{1,31}$/;

export function createUploader(options: UploaderOptions): Uploader {
  const {
    client,
    testerId,
    events,
    minIntervalMs = 60_000,
    maxRetryMs = 120_000,
  } = options;
  if (!TESTER_ID.test(testerId))
    throw new Error(`Invalid tester id ${testerId}`);
  const signal =
    options.onlineSignal ??
    (typeof globalThis.addEventListener === 'function'
      ? (globalThis as unknown as EventTarget)
      : undefined);
  const folder = `testers/${testerId}`;

  /** Ids known to be in the repo. Lost on reload: the merge makes a full re-upload harmless. */
  const uploaded = new Set<string>();
  let lastAttempt = -Infinity;
  let failures = 0;
  let pending = false;
  let running = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  function schedule(delay: number) {
    if (stopped || timer !== undefined) return;
    timer = setTimeout(() => {
      timer = undefined;
      void run();
    }, delay);
  }

  /** Earliest attempt that keeps one minute between attempts. */
  const nextSlot = () => Math.max(0, lastAttempt + minIntervalMs - Date.now());

  async function run() {
    if (running) return;
    running = true;
    pending = false;
    lastAttempt = Date.now();
    try {
      const log = await events();
      const fresh = log.filter((e) => !uploaded.has(e.id));
      if (fresh.length) {
        await client.commit(
          `beta: ${fresh.length} events from ${testerId}`,
          (read) => merge(read, log, fresh),
        );
        fresh.forEach((e) => uploaded.add(e.id));
      }
      failures = 0;
    } catch {
      failures++;
      pending = true;
    } finally {
      running = false;
    }
    if (pending)
      schedule(
        failures
          ? Math.max(
              nextSlot(),
              Math.min(minIntervalMs * 2 ** (failures - 1), maxRetryMs),
            )
          : nextSlot(),
      );
  }

  async function merge(
    read: (path: string) => Promise<string | null>,
    log: DomainEvent[],
    fresh: DomainEvent[],
  ) {
    const files: Record<string, string> = {};
    let changed = false;
    const days = new Set(fresh.map((e) => day(e.at)));
    for (const d of days) {
      const path = `${folder}/events/${d}.jsonl`;
      const byId = new Map<string, DomainEvent>();
      const current = (await read(path)) ?? '';
      for (const line of current.split('\n'))
        if (line.trim()) {
          const e = JSON.parse(line) as DomainEvent;
          byId.set(e.id, e);
        }
      for (const e of log)
        if (day(e.at) === d && !byId.has(e.id)) byId.set(e.id, e);
      files[path] = [...byId.values()]
        .sort(compareEvents)
        .map((e) => JSON.stringify(e) + '\n')
        .join('');
      if (files[path] !== current) changed = true;
    }
    // Only the snapshot would change (e.g. after a reload): no commit.
    if (!changed) return null;
    files[`${folder}/snapshot.json`] =
      JSON.stringify(
        {
          testerId,
          updatedAt: new Date().toISOString(),
          state: deriveState(log),
        },
        null,
        2,
      ) + '\n';
    return files;
  }

  const onOnline = () => {
    if (!pending || running) return;
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    schedule(nextSlot());
  };
  signal?.addEventListener('online', onOnline);

  return {
    changed() {
      pending = true;
      // The first change opens a one-minute batch; later changes join it (NFR-17).
      if (!running) schedule(Math.max(nextSlot(), minIntervalMs));
    },
    stop() {
      stopped = true;
      if (timer !== undefined) clearTimeout(timer);
      signal?.removeEventListener('online', onOnline);
    },
  };
}

const day = (at: number) => new Date(at).toISOString().slice(0, 10);
