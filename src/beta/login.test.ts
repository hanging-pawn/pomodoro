import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createI18n } from '../i18n/i18n';
import { createRepoClient } from './github';
import { LOGIN_LATER, maybeShowLogin, mountBetaReminder } from './login';
import { BETA_REPO, createBetaSession, type BetaSession } from './session';
import { createFakeGitHub } from './testing/fake-github';

const KEY = ['github', 'pat', 'TESTKEY0123456789abcdefghij'].join('_');
const NOW = new Date(2026, 10, 13, 9).getTime();

let session: BetaSession;
const i18n = () => createI18n({ languages: ['de'], storage: localStorage });

beforeEach(() => {
  localStorage.clear();
  document.body.replaceChildren();
  const gh = createFakeGitHub();
  gh.acceptToken = KEY;
  session = createBetaSession({
    events: async () => [],
    lang: () => 'de',
    appVersion: '0.4.0',
    storage: localStorage,
    connect: (key) =>
      createRepoClient({ repo: BETA_REPO, token: key, fetch: gh.fetch }),
    onlineSignal: new EventTarget(),
  });
});

afterEach(() => session.signOut());

const dialog = () => document.querySelector('[role="dialog"]');
const settle = () => new Promise((r) => setTimeout(r, 0));

describe('beta login at start (POMO-85)', () => {
  it('asks to sign in and says why; «Später» closes and waits until tomorrow', async () => {
    const shown = maybeShowLogin(i18n(), session, { now: () => NOW });
    await settle();
    expect(dialog()?.textContent).toContain('Feedback');
    expect(dialog()?.querySelector('input[name="testerId"]')).not.toBeNull();
    document
      .querySelector<HTMLButtonElement>('button[data-action="later"]')!
      .click();
    expect(await shown).toBe(true);
    expect(dialog()).toBeNull();
    expect(localStorage.getItem(LOGIN_LATER)).not.toBeNull();
    // Same day: no dialog; next day: again.
    expect(
      await maybeShowLogin(i18n(), session, { now: () => NOW + 3600e3 }),
    ).toBe(false);
    const next = maybeShowLogin(i18n(), session, {
      now: () => NOW + 24 * 3600e3,
    });
    await settle();
    expect(dialog()).not.toBeNull();
    document
      .querySelector<HTMLButtonElement>('button[data-action="later"]')!
      .click();
    await next;
  });

  it('the Today reminder shows while signed out and opens the login', async () => {
    const root = document.createElement('div');
    let opened = 0;
    mountBetaReminder(root, i18n(), session, () => void opened++);
    expect(root.querySelector('[data-role="beta-reminder"]')).not.toBeNull();
    root
      .querySelector<HTMLButtonElement>('button[data-action="beta-login"]')!
      .click();
    expect(opened).toBe(1);
  });
});
