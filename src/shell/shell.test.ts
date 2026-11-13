import { afterEach, describe, expect, it } from 'vitest';
import { createI18n } from '../i18n/i18n';
import { mountShell, parseRoute, type Shell } from './shell';

const memory = (): Storage => {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
    key: () => null,
    length: 0,
  };
};
const i18nFor = (lang: string) =>
  createI18n({ languages: [lang], storage: memory() });

let shell: Shell | undefined;
afterEach(() => {
  shell?.destroy();
  shell = undefined;
  location.hash = '';
});

const visible = (root: HTMLElement) =>
  [...root.querySelectorAll<HTMLElement>('.app-screen')]
    .filter((s) => !s.hidden)
    .map((s) => s.dataset.screen);

describe('parseRoute', () => {
  it('maps hashes to screens and falls back to today', () => {
    expect(parseRoute('#/tasks')).toBe('tasks');
    expect(parseRoute('#/settings')).toBe('settings');
    expect(parseRoute('')).toBe('today');
    expect(parseRoute('#/nope')).toBe('today');
  });
});

describe('mountShell (FR-610)', () => {
  it('shows header, one screen and a bottom nav with four items', () => {
    const root = document.createElement('div');
    shell = mountShell(root, i18nFor('de'));
    expect(root.querySelector('.app-brand')?.textContent).toBe('pomo.pomo');
    expect(visible(root)).toEqual(['today']);
    const items = [...root.querySelectorAll('.app-nav__item')].map(
      (a) => a.textContent,
    );
    expect(items).toEqual(['Heute', 'Aufgaben', 'Laden', 'Woche']);
    expect(
      root.querySelector('[data-action="horizon"]')?.getAttribute('aria-label'),
    ).toBe('Horizont');
    expect(
      root
        .querySelector('[data-action="settings"]')
        ?.getAttribute('aria-label'),
    ).toBe('Einstellungen');
  });

  it('reaches every screen in one step and keeps it in the hash', () => {
    const root = document.createElement('div');
    shell = mountShell(root, i18nFor('en'));
    for (const s of ['tasks', 'shop', 'week', 'horizon', 'settings'] as const) {
      shell.go(s);
      window.dispatchEvent(new HashChangeEvent('hashchange'));
      expect(location.hash).toBe(`#/${s}`);
      expect(visible(root)).toEqual([s]);
    }
  });

  it('opens on the screen from the hash after a reload', () => {
    location.hash = '#/week';
    const root = document.createElement('div');
    shell = mountShell(root, i18nFor('en'));
    expect(visible(root)).toEqual(['week']);
    expect(
      root.querySelector('[aria-current="page"]')?.getAttribute('href'),
    ).toBe('#/week');
  });

  it('keeps the slot element when the language changes', () => {
    const i18n = i18nFor('en');
    const root = document.createElement('div');
    shell = mountShell(root, i18n);
    const slot = shell.slot('tasks');
    i18n.setLocale('it');
    expect(shell.slot('tasks')).toBe(slot);
    expect(root.querySelector('.app-nav__item')?.textContent).toBe('Oggi');
  });

  it('hides coins and the shop item when gamification is off (FR-405)', () => {
    const root = document.createElement('div');
    shell = mountShell(root, i18nFor('en'));
    shell.setCoins(30);
    const coins = root.querySelector<HTMLElement>(
      '[data-role="header-coins"]',
    )!;
    expect(coins.hidden).toBe(false);
    // Number + tomato on screen, «30 coins» for screen readers (POMO-82).
    expect(coins.textContent).toBe('30');
    expect(
      coins.querySelector('[role="img"]')?.getAttribute('aria-label'),
    ).toBe('30 coins');
    expect(coins.querySelector('svg.ui-coin__icon')).not.toBeNull();
    shell.setCoins(undefined);
    shell.setShop(false);
    expect(coins.hidden).toBe(true);
    expect(
      root.querySelector<HTMLElement>('.app-nav__item[data-screen="shop"]')!
        .hidden,
    ).toBe(true);
  });

  it('shows only Today and hides header and nav during a round, then stays on Today (FR-604)', () => {
    location.hash = '#/tasks';
    const root = document.createElement('div');
    shell = mountShell(root, i18nFor('en'));
    shell.setFocus(true);
    expect(visible(root)).toEqual(['today']);
    expect(root.querySelector<HTMLElement>('.app')!.dataset.focus).toBe('on');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    shell.setFocus(false);
    expect(visible(root)).toEqual(['today']);
    expect(location.hash).toBe('#/today');
  });

  it('explains each screen on the first visit, then behind the info button', () => {
    const m = new Map<string, string>();
    const storage = {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
    };
    const root = document.createElement('div');
    shell = mountShell(root, i18nFor('de'), { storage });
    const info = root.querySelector<HTMLElement>('#info-today')!;
    expect(info.hidden).toBe(false);
    expect(info.textContent).toContain('Fokusrunde');
    info.querySelector<HTMLElement>('[data-action="info-close"]')!.click();
    expect(info.hidden).toBe(true);
    shell.destroy();
    const again = document.createElement('div');
    shell = mountShell(again, i18nFor('de'), { storage });
    const info2 = again.querySelector<HTMLElement>('#info-today')!;
    expect(info2.hidden).toBe(true);
    const btn = again.querySelector<HTMLElement>(
      '.app-screen--today [data-action="info"]',
    )!;
    expect(btn.getAttribute('aria-label')).toBe('Was ist das?');
    btn.click();
    expect(info2.hidden).toBe(false);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
  });
});
