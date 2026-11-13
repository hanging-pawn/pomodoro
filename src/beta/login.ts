import { APP_NAME } from '../config';
import type { I18n, MessageKey } from '../i18n/i18n';
import { button } from '../ui/components/button';
import { openDialog } from '../ui/components/dialog';
import { mountBetaPanel } from './panel';
import type { BetaSession } from './session';

/**
 * The beta account is the login of the app (POMO-85, feedback 13.11.2026): Gianluca needs
 * feedback and data, so the sign-in is offered at start and reminded on Today until it is done.
 * «Later» snoozes the start dialog until the next day; the Today reminder stays.
 */
export const LOGIN_LATER = 'pomo-pomo.beta.later';

type KeyValue = Pick<Storage, 'getItem' | 'setItem'>;

const dayKey = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

/** Opens the sign-in dialog; resolves when it is closed (signed in or «Later»). */
export async function openLogin(
  i18n: I18n,
  session: BetaSession,
  options: { storage?: KeyValue; now?: () => number } = {},
): Promise<void> {
  const storage = options.storage ?? safeStorage();
  const now = options.now ?? Date.now;
  const text = (key: MessageKey) => i18n.t(key).replaceAll('{app}', APP_NAME);
  const body = document.createElement('div');
  body.className = 'beta-login';
  const why = document.createElement('p');
  why.className = 'beta-login__why';
  why.textContent = text('beta.login.why');
  const panel = document.createElement('div');
  body.append(why, panel);
  const unmount = mountBetaPanel(panel, i18n, session);
  let offSession = () => {};
  const choice = await openDialog({
    title: text('beta.login.title'),
    body,
    actions: [
      { label: text('beta.login.later'), value: 'later', variant: 'quiet' },
    ],
    onOpen: (close) => {
      offSession = session.onChange(() => {
        if (session.state === 'signed-in') close('signed-in');
      });
    },
  });
  offSession();
  unmount();
  if (choice !== 'signed-in')
    try {
      storage?.setItem(LOGIN_LATER, dayKey(now()));
    } catch {
      // Private mode: asks again on the next start.
    }
}

/** At start: the sign-in dialog, unless signed in or «Later» was chosen today. */
export async function maybeShowLogin(
  i18n: I18n,
  session: BetaSession,
  options: { storage?: KeyValue; now?: () => number } = {},
): Promise<boolean> {
  const storage = options.storage ?? safeStorage();
  const now = options.now ?? Date.now;
  if (session.state === 'signed-in') return false;
  let later: string | null;
  try {
    later = storage?.getItem(LOGIN_LATER) ?? null;
  } catch {
    later = null;
  }
  if (later === dayKey(now())) return false;
  await openLogin(i18n, session, { storage, now });
  return true;
}

/** Reminder card on Today while signed out; its button opens the sign-in dialog. */
export function mountBetaReminder(
  root: HTMLElement,
  i18n: I18n,
  session: BetaSession,
  open: () => void,
): () => void {
  const text = (key: MessageKey) => i18n.t(key).replaceAll('{app}', APP_NAME);
  function render() {
    if (session.state === 'signed-in') {
      root.replaceChildren();
      return;
    }
    const card = document.createElement('section');
    card.className = 'ui-card beta-reminder';
    card.dataset.role = 'beta-reminder';
    const h = document.createElement('h2');
    h.className = 'beta-reminder__title';
    h.textContent = text('beta.reminder.title');
    const p = document.createElement('p');
    p.textContent = text('beta.reminder.body');
    card.append(
      h,
      p,
      button({
        label: text('beta.reminder.action'),
        action: 'beta-login',
        variant: 'secondary',
        onClick: open,
      }),
    );
    root.replaceChildren(card);
  }
  render();
  const offLocale = i18n.onChange(render);
  const offSession = session.onChange(render);
  return () => {
    offLocale();
    offSession();
  };
}

function safeStorage(): KeyValue | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}
