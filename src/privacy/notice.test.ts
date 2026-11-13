import { afterEach, describe, expect, it } from 'vitest';
import { LOCALES } from '../i18n/catalogs';
import { createI18n } from '../i18n/i18n';
import { mountPrivacyLink } from './notice';

const flush = () => new Promise((r) => setTimeout(r, 0));
afterEach(() => document.body.replaceChildren());

function mount(lang: string) {
  const root = document.createElement('footer');
  document.body.append(root);
  const i18n = createI18n({
    languages: [lang],
    storage: undefined as unknown as Storage,
  });
  mountPrivacyLink(root, i18n);
  return { root, i18n };
}

describe('privacy notice (NFR-14)', () => {
  it('is reached in 2 interactions: the footer link (1) opens the notice (2 = reading it)', async () => {
    const { root } = mount('en');
    root.querySelector<HTMLElement>('[data-action="privacy"]')!.click();
    await flush();
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain('Privacy notice');
  });

  it('covers local storage, sync and the beta (data and account in the beta repo, evaluated)', async () => {
    const { root } = mount('en');
    root.querySelector<HTMLElement>('[data-action="privacy"]')!.click();
    await flush();
    const text = document.querySelector('[role="dialog"]')!.textContent!;
    expect(text).toContain('IndexedDB');
    expect(text).toContain('api.github.com');
    expect(text).toContain('beta data repo');
    expect(text).toContain('evaluated');
    expect(text).toContain('pomo.pomo');
  });

  it.each(LOCALES)('is available in %s', async (lang) => {
    const { root } = mount(lang);
    expect(
      root.querySelector('[data-action="privacy"]')?.textContent,
    ).toBeTruthy();
    root.querySelector<HTMLElement>('[data-action="privacy"]')!.click();
    await flush();
    expect(document.querySelectorAll('[role="dialog"] p')).toHaveLength(3);
  });

  it('closes with the close button', async () => {
    const { root } = mount('en');
    root.querySelector<HTMLElement>('[data-action="privacy"]')!.click();
    await flush();
    document.querySelector<HTMLElement>('[data-action="close"]')!.click();
    await flush();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
});
