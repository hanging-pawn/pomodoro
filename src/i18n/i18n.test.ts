import { describe, expect, it } from 'vitest';
import { catalogs, missingKeys } from './catalogs';
import { createI18n, LOCALE_STORAGE_KEY } from './i18n';

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, v),
  };
}

describe('createI18n', () => {
  it('picks the browser language when it is supported', () => {
    const i18n = createI18n({
      languages: ['it-CH', 'de'],
      storage: memoryStorage(),
    });
    expect(i18n.locale).toBe('it');
    expect(i18n.t('language.label')).toBe('Lingua');
  });

  it('falls back to English for an unsupported browser language', () => {
    const i18n = createI18n({ languages: ['fr-FR'], storage: memoryStorage() });
    expect(i18n.locale).toBe('en');
  });

  it('switches language at runtime, notifies listeners and remembers the choice', () => {
    const storage = memoryStorage();
    const i18n = createI18n({ languages: ['it'], storage });
    const seen: string[] = [];
    i18n.onChange((l) => seen.push(l));

    i18n.setLocale('en');

    expect(i18n.t('language.label')).toBe('Language');
    expect(seen).toEqual(['en']);
    expect(storage.getItem(LOCALE_STORAGE_KEY)).toBe('en');
    expect(createI18n({ languages: ['it'], storage }).locale).toBe('en');
  });
});

describe('catalogs', () => {
  it('every language has exactly the keys of every other language', () => {
    expect(missingKeys(catalogs)).toEqual([]);
  });

  it('missingKeys reports a key that one language lacks', () => {
    expect(
      missingKeys({
        de: { a: 'A', b: 'B' },
        en: { a: 'A', b: 'B' },
        it: { a: 'A' },
      }),
    ).toEqual(['it: b']);
  });

  it('has no empty texts', () => {
    for (const [locale, messages] of Object.entries(catalogs)) {
      for (const [key, text] of Object.entries(messages)) {
        expect(text.trim(), `${locale}: ${key}`).not.toBe('');
      }
    }
  });
});
