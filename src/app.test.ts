import { describe, expect, it } from 'vitest';
import { mountApp } from './app';
import { APP_NAME } from './config';
import { createI18n } from './i18n/i18n';

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
});
