import { afterEach, describe, expect, it } from 'vitest';
import { createI18n } from '../i18n/i18n';
import { INTRO_KEY, showIntro } from './intro';
import { isIosNotInstalled, mountIosHint } from './ios-hint';

const flush = () => new Promise((r) => setTimeout(r, 0));
afterEach(() => document.body.replaceChildren());

const memory = () => {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
};
const i18nFor = (lang: string) =>
  createI18n({ languages: [lang], storage: undefined as unknown as Storage });
const dialog = () => document.querySelector('[role="dialog"]');
const click = (action: string) =>
  document.querySelector<HTMLElement>(`[data-action="${action}"]`)!.click();

describe('first-start intro (NFR-15)', () => {
  it('shows on a fresh install, with the method explained', async () => {
    void showIntro(i18nFor('en'), memory());
    await flush();
    expect(dialog()).not.toBeNull();
    expect(dialog()!.textContent).toContain('focus rounds');
  });

  it('Skip closes it at once and it does not come back', async () => {
    const storage = memory();
    const done = showIntro(i18nFor('en'), storage);
    await flush();
    click('skip');
    await done;
    expect(dialog()).toBeNull();
    expect(storage.getItem(INTRO_KEY)).not.toBeNull();
    void showIntro(i18nFor('en'), storage);
    await flush();
    expect(dialog()).toBeNull();
  });

  it('takes at most 3 steps: two Next, then the last step ends it', async () => {
    const storage = memory();
    const done = showIntro(i18nFor('en'), storage);
    const titles: string[] = [];
    for (const action of ['next', 'next', 'done']) {
      await flush();
      titles.push(dialog()!.querySelector('h2')!.textContent!);
      click(action);
    }
    await done;
    expect(new Set(titles).size).toBe(3);
    expect(dialog()).toBeNull();
    expect(storage.getItem(INTRO_KEY)).not.toBeNull();
  });

  it('Escape counts as skipping', async () => {
    const storage = memory();
    const done = showIntro(i18nFor('en'), storage);
    await flush();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await done;
    expect(storage.getItem(INTRO_KEY)).not.toBeNull();
  });

  it('still shows when storage is unavailable', async () => {
    const broken = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    };
    const done = showIntro(i18nFor('de'), broken);
    await flush();
    expect(dialog()).not.toBeNull();
    click('skip');
    await done;
  });
});

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IPAD_DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';

describe('iOS notification hint (NFR-12)', () => {
  it('detects iOS Safari that is not installed', () => {
    expect(isIosNotInstalled({ userAgent: IPHONE })).toBe(true);
    expect(isIosNotInstalled({ userAgent: IPHONE, standalone: false })).toBe(
      true,
    );
    expect(
      isIosNotInstalled({ userAgent: IPAD_DESKTOP_UA, maxTouchPoints: 5 }),
    ).toBe(true);
  });

  it('is off for installed iOS, other systems and desktop Safari', () => {
    expect(isIosNotInstalled({ userAgent: IPHONE, standalone: true })).toBe(
      false,
    );
    expect(
      isIosNotInstalled({ userAgent: IPHONE, displayModeStandalone: true }),
    ).toBe(false);
    expect(isIosNotInstalled({ userAgent: ANDROID })).toBe(false);
    expect(
      isIosNotInstalled({ userAgent: IPAD_DESKTOP_UA, maxTouchPoints: 0 }),
    ).toBe(false);
  });

  it('shows the hint with instructions on iOS Safari, not installed', () => {
    const root = document.createElement('div');
    document.body.append(root);
    mountIosHint(root, i18nFor('en'), { userAgent: IPHONE });
    expect(root.textContent).toContain('Add to Home Screen');
    expect(root.textContent).toContain('notifications');
  });

  it('renders nothing elsewhere', () => {
    const root = document.createElement('div');
    mountIosHint(root, i18nFor('en'), { userAgent: ANDROID });
    expect(root.childElementCount).toBe(0);
  });

  it('follows the language', () => {
    const root = document.createElement('div');
    const i18n = i18nFor('en');
    mountIosHint(root, i18n, { userAgent: IPHONE });
    i18n.setLocale('de');
    expect(root.textContent).toContain('Zum Home-Bildschirm');
  });

  it('can be closed on Today and stays closed on this device (NFR-18)', () => {
    const m = new Map<string, string>();
    const storage = {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
    };
    const root = document.createElement('div');
    mountIosHint(
      root,
      i18nFor('en'),
      { userAgent: IPHONE },
      {
        dismissible: true,
        storage,
      },
    );
    root
      .querySelector<HTMLButtonElement>('[data-action="dismiss-ios-hint"]')!
      .click();
    expect(root.childElementCount).toBe(0);
    const again = document.createElement('div');
    mountIosHint(
      again,
      i18nFor('en'),
      { userAgent: IPHONE },
      {
        dismissible: true,
        storage,
      },
    );
    expect(again.childElementCount).toBe(0);
    // Settings keeps showing it (not dismissible there).
    const settings = document.createElement('div');
    mountIosHint(settings, i18nFor('en'), { userAgent: IPHONE }, { storage });
    expect(settings.querySelector('.ios-hint')).not.toBeNull();
  });
});
