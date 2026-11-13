import { describe, expect, it } from 'vitest';
import { mountApp } from './app';
import { APP_NAME } from './config';
import { createI18n } from './i18n/i18n';
import { createTheme } from './ui/theme';

const noStorage = undefined as unknown as Storage;
const i18nFor = (lang: string) =>
  createI18n({ languages: [lang], storage: noStorage });

describe('mountApp', () => {
  it('renders the start page with the product name as heading', () => {
    const root = document.createElement('div');
    mountApp(root, i18nFor('en'));
    expect(root.querySelector('h1')?.textContent).toBe('pomo.pomo');
  });

  it('sets the document title to the product name', () => {
    mountApp(document.createElement('div'), i18nFor('en'));
    expect(document.title).toBe(APP_NAME);
  });

  it('shows the Italian UI when the browser language is it', () => {
    const root = document.createElement('div');
    mountApp(root, i18nFor('it-IT'));
    expect(root.querySelector('p')?.textContent).toBe(
      'Sessioni di concentrazione per le tue attività.',
    );
    expect(root.querySelector('label')?.textContent).toBe('Lingua');
    expect(document.documentElement.lang).toBe('it');
  });

  it('switches to English without reload when the user picks EN', () => {
    const root = document.createElement('div');
    mountApp(root, i18nFor('it'));
    const select = root.querySelector('select')!;
    select.value = 'en';
    select.dispatchEvent(new Event('change'));

    expect(root.querySelector('p')?.textContent).toBe(
      'Focus rounds for your tasks.',
    );
    expect(root.querySelector('label')?.textContent).toBe('Language');
    expect(root.querySelector('select')?.value).toBe('en');
    expect(document.documentElement.lang).toBe('en');
  });
  it('switches light and dark without reload from a visible control (FR-601)', () => {
    localStorage.clear(); // an earlier test stored «en» as the language choice
    const html = document.createElement('div');
    const store = new Map<string, string>();
    const theme = createTheme(html, {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => void store.set(k, v),
    });
    const root = document.createElement('div');
    mountApp(root, i18nFor('de'), { theme });
    const select = root.querySelector<HTMLSelectElement>('select#theme')!;
    expect(root.querySelector('label[for="theme"]')?.textContent).toBe(
      'Darstellung',
    );
    expect([...select.options].map((o) => o.value)).toEqual([
      'system',
      'light',
      'dark',
    ]);
    select.value = 'dark';
    select.dispatchEvent(new Event('change'));
    expect(html.dataset.theme).toBe('dark');
    expect(store.get('pomo-pomo.theme')).toBe('dark');
    select.value = 'system';
    select.dispatchEvent(new Event('change'));
    expect(html.dataset.theme).toBeUndefined();
  });

  it('offers the setting digits always (FR-606)', async () => {
    let value = false;
    const root = document.createElement('div');
    mountApp(root, i18nFor('en'), {
      digitsAlways: {
        get: async () => value,
        set: async (v) => void (value = v),
      },
    });
    await new Promise((r) => setTimeout(r, 0));
    const box = root.querySelector<HTMLInputElement>('input#digits-always')!;
    expect(root.querySelector('label[for="digits-always"]')?.textContent).toBe(
      'Always show digits',
    );
    expect(box.checked).toBe(false);
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    await new Promise((r) => setTimeout(r, 0));
    expect(value).toBe(true);
  });
});
