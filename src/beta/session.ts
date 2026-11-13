import type { DomainEvent } from '../domain/events';
import { createRepoClient, GitHubError, type RepoClient } from './github';
import { createUploader, type Uploader } from './uploader';

/**
 * Beta account on this device (FR-502, FR-506, NFR-13): consent, sign-in with tester id and
 * personal key, sign-out. While signed in it runs the upload queue; signed out, nothing is sent.
 *
 * - Consent is remembered per tester id on this device; `signIn` without it sends nothing.
 * - Sign-in proves the key by writing `testers/<id>/account.json` (last login, language,
 *   device, app version) in one commit. A wrong key, unknown or locked tester writes nothing.
 * - The key lives only in local storage (never in the event log, so never in an export) and is
 *   deleted on sign-out. Local data stays.
 */
export type SignInResult =
  | 'signed-in'
  | 'no-consent'
  | 'invalid-id'
  | 'bad-key'
  | 'unknown-tester'
  | 'locked'
  | 'offline';

export interface BetaSession {
  readonly state: 'signed-out' | 'signed-in';
  readonly testerId: string | null;
  /** True until the tester has confirmed the consent notice on this device. */
  needsConsent(testerId: string): boolean;
  /** Records the tester's consent on this device. */
  consent(testerId: string): void;
  signIn(testerId: string, key: string): Promise<SignInResult>;
  /** Deletes the key and stops uploads. */
  signOut(): void;
  /** Tell the session the log has new events; uploaded only while signed in. */
  changed(): void;
  /** Returns an unsubscribe function. */
  onChange(listener: () => void): () => void;
}

export interface BetaSessionOptions {
  /** The whole local log (e.g. `store.events`). */
  events: () => Promise<DomainEvent[]>;
  /** Current UI language, written to account.json. */
  lang: () => string;
  appVersion: string;
  /** Browser/device, defaults to `navigator.userAgent`. */
  device?: string;
  /** Defaults to `localStorage`. */
  storage?: Storage;
  /** Client for the beta data repo with the given key; defaults to the real one on GitHub. */
  connect?: (key: string) => RepoClient;
  onlineSignal?: EventTarget;
}

export const BETA_REPO = 'hanging-pawn/pomodoro-beta-data';
export const BETA_KEY_STORAGE = 'pomo-pomo.beta.account';
const CONSENT_PREFIX = 'pomo-pomo.beta.consent.';
const TESTER_ID = /^[a-z0-9][a-z0-9-]{1,31}$/;

interface Saved {
  testerId: string;
  key: string;
}

export function createBetaSession(options: BetaSessionOptions): BetaSession {
  const storage = options.storage ?? safeLocalStorage();
  const device = options.device ?? globalThis.navigator?.userAgent ?? null;
  const listeners = new Set<() => void>();
  let current: { testerId: string; uploader: Uploader } | null = null;

  const client =
    options.connect ??
    ((key) => createRepoClient({ repo: BETA_REPO, token: key }));

  function start(saved: Saved) {
    current = {
      testerId: saved.testerId,
      uploader: createUploader({
        client: client(saved.key),
        testerId: saved.testerId,
        events: options.events,
        onlineSignal: options.onlineSignal,
      }),
    };
  }

  const notify = () => listeners.forEach((l) => l());

  const saved = readSaved(storage);
  if (saved && TESTER_ID.test(saved.testerId) && hasConsent(saved.testerId))
    start(saved);

  function hasConsent(testerId: string) {
    return get(storage, CONSENT_PREFIX + testerId) !== null;
  }

  return {
    get state() {
      return current ? 'signed-in' : 'signed-out';
    },
    get testerId() {
      return current?.testerId ?? null;
    },
    needsConsent: (testerId) => !hasConsent(testerId),
    consent(testerId) {
      set(storage, CONSENT_PREFIX + testerId, new Date().toISOString());
    },
    async signIn(testerId, key) {
      if (!TESTER_ID.test(testerId)) return 'invalid-id';
      if (!hasConsent(testerId)) return 'no-consent';
      if (!key.trim()) return 'bad-key';
      const path = `testers/${testerId}/account.json`;
      let outcome: SignInResult = 'signed-in';
      try {
        await client(key.trim()).commit(
          `beta: sign-in ${testerId}`,
          async (read) => {
            outcome = 'signed-in';
            const text = await read(path);
            if (text === null) {
              outcome = 'unknown-tester';
              return null;
            }
            const account = JSON.parse(text) as Record<string, unknown>;
            if (account.status === 'gesperrt') {
              outcome = 'locked';
              return null;
            }
            const next = {
              ...account,
              lang: options.lang(),
              lastLogin: new Date().toISOString(),
              device,
              appVersion: options.appVersion,
            };
            return { [path]: JSON.stringify(next, null, 2) + '\n' };
          },
        );
      } catch (e) {
        // 401 wrong key; 403/404 a key without access to the data repo.
        if (e instanceof GitHubError && [401, 403, 404].includes(e.status))
          return 'bad-key';
        // No network or GitHub unavailable: nothing was written, try again later.
        return 'offline';
      }
      if (outcome !== 'signed-in') return outcome;
      current?.uploader.stop();
      const next = { testerId, key: key.trim() };
      set(storage, BETA_KEY_STORAGE, JSON.stringify(next));
      start(next);
      current!.uploader.changed();
      notify();
      return 'signed-in';
    },
    signOut() {
      remove(storage, BETA_KEY_STORAGE);
      if (!current) return;
      current.uploader.stop();
      current = null;
      notify();
    },
    changed() {
      current?.uploader.changed();
    },
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function readSaved(storage: Storage | undefined): Saved | null {
  const text = get(storage, BETA_KEY_STORAGE);
  if (!text) return null;
  try {
    const v = JSON.parse(text) as Partial<Saved>;
    return typeof v.testerId === 'string' && typeof v.key === 'string'
      ? { testerId: v.testerId, key: v.key }
      : null;
  } catch {
    return null;
  }
}

function get(storage: Storage | undefined, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function set(storage: Storage | undefined, key: string, value: string) {
  try {
    storage?.setItem(key, value);
  } catch {
    // Storage unavailable (private mode): works for this visit only.
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
