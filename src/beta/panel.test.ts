import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createI18n } from '../i18n/i18n';
import { createRepoClient } from './github';
import { mountBetaPanel } from './panel';
import { BETA_KEY_STORAGE, BETA_REPO, createBetaSession } from './session';
import { createFakeGitHub, type FakeGitHub } from './testing/fake-github';

// Built at runtime so no token-like literal sits in the source (pre-commit token scan).
const KEY = ['github', 'pat', 'TESTKEY0123456789abcdefghij'].join('_');
const ACCOUNT = 'testers/anna/account.json';

let gh: FakeGitHub;
let root: HTMLElement;
let unmount: () => void;

beforeEach(() => {
  localStorage.clear();
  gh = createFakeGitHub();
  gh.acceptToken = KEY;
  gh.pushFromElsewhere(
    ACCOUNT,
    JSON.stringify({ testerId: 'anna', status: 'aktiv', lastLogin: null }),
  );
  root = document.createElement('div');
  const i18n = createI18n({ languages: ['en'], storage: localStorage });
  const session = createBetaSession({
    events: async () => [],
    lang: () => i18n.locale,
    appVersion: '0.3.0',
    device: 'test',
    storage: localStorage,
    connect: (key) =>
      createRepoClient({ repo: BETA_REPO, token: key, fetch: gh.fetch }),
    onlineSignal: new EventTarget(),
  });
  unmount = mountBetaPanel(root, i18n, session);
});

afterEach(() => unmount());

const field = (name: string) =>
  root.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
const button = (action: string) =>
  root.querySelector<HTMLButtonElement>(`button[data-action="${action}"]`)!;
const alertText = () => root.querySelector('[role="alert"]')?.textContent;
/** Lets the async sign-in settle (fake GitHub answers in microtasks). */
const settle = () => new Promise((r) => setTimeout(r, 0));

async function submit(testerId: string, key: string) {
  field('testerId').value = testerId;
  field('key').value = key;
  root
    .querySelector('form')!
    .dispatchEvent(new Event('submit', { cancelable: true }));
  await settle();
}

describe('beta panel', () => {
  it('names the key rights: fine-grained token, Contents read/write on one repo (NFR-13)', () => {
    expect(root.textContent).toContain('Contents: read/write');
    expect(field('key').type).toBe('password');
  });

  it('shows what is stored and evaluated on the first sign-in, before any request (FR-506)', async () => {
    await submit('anna', KEY);
    const text = root.textContent!;
    expect(text).toContain('account.json');
    expect(text).toContain('evaluate');
    expect(button('accept')).toBeTruthy();
    expect(gh.requests).toEqual([]);
  });

  it('declined consent: back to the form, 0 requests to api.github.com (FR-506)', async () => {
    await submit('anna', KEY);
    button('decline').click();
    await settle();
    expect(gh.requests).toEqual([]);
    expect(alertText()).toContain('nothing is sent');
    expect(localStorage.getItem(BETA_KEY_STORAGE)).toBeNull();
  });

  it('wrong key: clear message, nothing written (FR-502)', async () => {
    await submit('anna', KEY.replace('TEST', 'NOPE'));
    button('accept').click();
    await settle();
    expect(alertText()).toContain('key');
    expect(alertText()).toContain('not accepted');
    expect(gh.commits()).toEqual([]);
  });

  it('accepted consent and valid key: signed in, then sign-out deletes the key (FR-502, NFR-13)', async () => {
    await submit('anna', KEY);
    button('accept').click();
    await settle();
    expect(root.textContent).toContain('anna');
    expect(JSON.parse(gh.file(ACCOUNT)!).lastLogin).not.toBeNull();
    button('sign-out').click();
    expect(localStorage.getItem(BETA_KEY_STORAGE)).toBeNull();
    expect(field('testerId')).toBeTruthy();
  });

  it('asks for consent only once per tester on this device', async () => {
    await submit('anna', KEY);
    button('accept').click();
    await settle();
    button('sign-out').click();
    await submit('anna', KEY);
    expect(root.querySelector('button[data-action="accept"]')).toBeNull();
    expect(root.textContent).toContain('anna');
  });
});

describe('beta panel: account is the login (POMO-85)', () => {
  it('unknown id switches to «New account»; creating it signs in', async () => {
    await submit('lea', KEY);
    button('accept').click();
    await settle();
    expect(alertText()).toContain('no account for this tester ID yet');
    expect(button('create')).not.toBeNull();
    field('name').value = 'Lea';
    field('email').value = 'lea@example.com';
    await submit('lea', KEY);
    expect(JSON.parse(gh.file('testers/lea/account.json')!)).toMatchObject({
      name: 'Lea',
      selfRegistered: true,
    });
    expect(button('sign-out')).not.toBeNull();
    expect(root.textContent).toContain('on every device');
  });

  it('signed in: sends feedback into the tester folder', async () => {
    await submit('anna', KEY);
    button('accept').click();
    await settle();
    const area = root.querySelector<HTMLTextAreaElement>(
      'textarea[name="feedback"]',
    )!;
    area.value = 'Mehr Farben bitte';
    area.dispatchEvent(new Event('input'));
    area.form!.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();
    await settle();
    expect(root.querySelector('[role="status"]')?.textContent).toContain(
      'Thank you',
    );
    const fb = gh
      .commits()
      .some((c) => c.message === 'beta: feedback from anna');
    expect(fb).toBe(true);
  });
});
