import { catalogs, LOCALES, type Locale, type MessageKey } from './catalogs';

export type { Locale, MessageKey } from './catalogs';
export { LOCALES } from './catalogs';

export const LOCALE_STORAGE_KEY = 'pomo-pomo.locale';
const FALLBACK: Locale = 'en';

export interface I18n {
  readonly locale: Locale;
  t(key: MessageKey): string;
  /** Switches language without reload, remembers the choice and notifies listeners. */
  setLocale(locale: Locale): void;
  /** Returns an unsubscribe function. */
  onChange(listener: (locale: Locale) => void): () => void;
}

export interface I18nOptions {
  /** Browser preferences, defaults to `navigator.languages`. */
  languages?: readonly string[];
  /** Where the choice is remembered, defaults to `localStorage`. */
  storage?: Storage;
}

export function createI18n(options: I18nOptions = {}): I18n {
  const storage = options.storage ?? safeLocalStorage();
  const languages = options.languages ?? globalThis.navigator?.languages ?? [];
  const listeners = new Set<(locale: Locale) => void>();
  let locale = pick(readStored(storage), languages);

  return {
    get locale() {
      return locale;
    },
    t: (key) => catalogs[locale][key],
    setLocale(next) {
      if (next === locale) return;
      locale = next;
      try {
        storage?.setItem(LOCALE_STORAGE_KEY, next);
      } catch {
        // Storage unavailable (private mode): the switch still works for this visit.
      }
      listeners.forEach((l) => l(next));
    },
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function pick(stored: string | null, languages: readonly string[]): Locale {
  if (isLocale(stored)) return stored;
  for (const tag of languages) {
    const primary = tag.toLowerCase().split('-')[0];
    if (isLocale(primary)) return primary;
  }
  return FALLBACK;
}

function isLocale(v: unknown): v is Locale {
  return (LOCALES as readonly unknown[]).includes(v);
}

function readStored(storage: Storage | undefined): string | null {
  try {
    return storage?.getItem(LOCALE_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

function safeLocalStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}
