import { compareEvents, EVENT_TYPES, type DomainEvent } from '../domain/events';
import { deriveState, type AppState } from '../domain/state';

/**
 * The only module that touches IndexedDB (ADR 0002). It stores the event log and nothing else;
 * state, export and import are all derived from or merged into that log.
 */
export interface Store {
  /** Adds events to the log; events whose id is already stored are ignored. */
  append(...events: DomainEvent[]): Promise<void>;
  /** The whole log in deterministic order (time, then id). */
  events(): Promise<DomainEvent[]>;
  state(): Promise<AppState>;
  /** All data as a JSON document that `importJson` reads back. */
  exportJson(): Promise<string>;
  /** The protocol: one CSV row per event (RFC 4180, CRLF line ends). */
  exportCsv(): Promise<string>;
  /**
   * Merges an export into the log by event id (idempotent). After `wipe` this restores everything.
   * Throws without changing anything if the document is not a valid export.
   */
  importJson(json: string): Promise<void>;
  /** Deletes all data. */
  wipe(): Promise<void>;
  close(): void;
}

export interface StoreOptions {
  /** Defaults to the browser's `indexedDB`. */
  indexedDB?: IDBFactory;
  /** Defaults to `pomo-pomo`. */
  name?: string;
}

export const EXPORT_FORMAT = 'pomo-pomo-export';
export const EXPORT_VERSION = 1;
const EVENTS = 'events';

export async function openStore(options: StoreOptions = {}): Promise<Store> {
  const factory = options.indexedDB ?? globalThis.indexedDB;
  const db = await request(
    (() => {
      const req = factory.open(options.name ?? 'pomo-pomo', 1);
      req.onupgradeneeded = () =>
        req.result.createObjectStore(EVENTS, { keyPath: 'id' });
      return req;
    })(),
  );

  const events = async () => {
    const all = await request<DomainEvent[]>(
      db.transaction(EVENTS).objectStore(EVENTS).getAll(),
    );
    return all.sort(compareEvents);
  };

  const write = (fn: (store: IDBObjectStore) => void) =>
    new Promise<void>((resolve, reject) => {
      const tx = db.transaction(EVENTS, 'readwrite');
      fn(tx.objectStore(EVENTS));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });

  // `put` keyed by id: re-adding a known event overwrites it with identical content.
  const append = (...list: DomainEvent[]) =>
    write((s) => list.forEach((e) => s.put(e)));

  return {
    append,
    events,
    state: async () => deriveState(await events()),
    exportJson: async () =>
      JSON.stringify({
        format: EXPORT_FORMAT,
        version: EXPORT_VERSION,
        exportedAt: new Date().toISOString(),
        events: await events(),
      }),
    exportCsv: async () => toCsv(await events()),
    importJson: async (json) => append(...parseExport(json)),
    wipe: () => write((s) => s.clear()),
    close: () => db.close(),
  };
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function parseExport(json: string): DomainEvent[] {
  const doc: unknown = JSON.parse(json);
  if (
    !isRecord(doc) ||
    doc.format !== EXPORT_FORMAT ||
    !Array.isArray(doc.events)
  ) {
    throw new Error('Not a pomo.pomo export');
  }
  if (typeof doc.version !== 'number' || doc.version > EXPORT_VERSION) {
    throw new Error(`Unsupported export version ${String(doc.version)}`);
  }
  return doc.events.map((e: unknown, i: number) => {
    if (
      !isRecord(e) ||
      typeof e.id !== 'string' ||
      typeof e.at !== 'number' ||
      !EVENT_TYPES.includes(e.type as DomainEvent['type']) ||
      !isRecord(e.payload)
    ) {
      throw new Error(`Invalid event at position ${i}`);
    }
    return e as unknown as DomainEvent;
  });
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const CSV_HEADER = [
  'id',
  'time',
  'type',
  'task',
  'pomodoro',
  'coins',
  'details',
];

function toCsv(events: DomainEvent[]): string {
  const rows = events.map((e) => {
    const { taskId, pomodoroId, amount, price, ...details } =
      e.payload as Record<string, unknown>;
    const coins =
      e.type === 'coins.earned'
        ? amount
        : e.type === 'reward.redeemed'
          ? -Number(price)
          : '';
    if (e.type !== 'coins.earned' && amount !== undefined)
      details.amount = amount;
    if (e.type !== 'reward.redeemed' && price !== undefined)
      details.price = price;
    return [
      e.id,
      new Date(e.at).toISOString(),
      e.type,
      taskId ?? '',
      pomodoroId ?? '',
      coins ?? '',
      Object.keys(details).length ? JSON.stringify(details) : '',
    ];
  });
  return (
    [CSV_HEADER, ...rows].map((r) => r.map(csvField).join(',')).join('\r\n') +
    '\r\n'
  );
}

function csvField(v: unknown): string {
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
