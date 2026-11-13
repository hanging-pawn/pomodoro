import { APP_NAME } from '../config';
import type { I18n, MessageKey } from '../i18n/i18n';
import type { BetaSession, SignInResult } from './session';

/**
 * Beta sign-in panel (FR-502, FR-506, NFR-13): form → consent notice on the first sign-in of a
 * tester on this device → signed-in view with sign-out. Declining sends nothing.
 * Returns an unmount function.
 */
export function mountBetaPanel(
  root: HTMLElement,
  i18n: I18n,
  session: BetaSession,
): () => void {
  type View =
    | { kind: 'form'; message?: MessageKey; testerId?: string }
    | { kind: 'consent'; testerId: string; key: string }
    | { kind: 'busy' };
  let view: View = { kind: 'form' };

  const text = (key: MessageKey) => i18n.t(key).replaceAll('{app}', APP_NAME);
  const el = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    key?: MessageKey,
  ) => {
    const node = document.createElement(tag);
    if (key) node.textContent = text(key);
    return node;
  };
  const button = (action: string, key: MessageKey, type = 'button') => {
    const b = el('button', key);
    b.type = type as HTMLButtonElement['type'];
    b.dataset.action = action;
    return b;
  };
  const alert = (key: MessageKey) => {
    const p = el('p', key);
    p.setAttribute('role', 'alert');
    return p;
  };

  async function signIn(testerId: string, key: string) {
    view = { kind: 'busy' };
    render();
    const result: SignInResult = await session.signIn(testerId, key);
    view =
      result === 'signed-in'
        ? { kind: 'form' }
        : {
            kind: 'form',
            message: `beta.error.${result}` as MessageKey,
            testerId,
          };
    render();
  }

  function formView(v: Extract<View, { kind: 'form' }>) {
    const form = el('form');
    const id = input('testerId', 'text', 'beta.testerId', v.testerId);
    const key = input('key', 'password', 'beta.key');
    key.input.autocomplete = 'off';
    const hint = el('p', 'beta.keyHint');
    hint.id = 'beta-key-hint';
    key.input.setAttribute('aria-describedby', hint.id);
    form.append(
      el('p', 'beta.intro'),
      id.label,
      id.input,
      key.label,
      key.input,
      hint,
      button('sign-in', 'beta.signIn', 'submit'),
    );
    if (v.message) form.append(alert(v.message));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const testerId = id.input.value.trim();
      const k = key.input.value.trim();
      if (session.needsConsent(testerId)) {
        view = { kind: 'consent', testerId, key: k };
        render();
      } else void signIn(testerId, k);
    });
    return [form];
  }

  function consentView(v: Extract<View, { kind: 'consent' }>) {
    const accept = button('accept', 'beta.consent.accept');
    const decline = button('decline', 'beta.consent.decline');
    accept.addEventListener('click', () => {
      session.consent(v.testerId);
      void signIn(v.testerId, v.key);
    });
    decline.addEventListener('click', () => {
      view = { kind: 'form', message: 'beta.declined', testerId: v.testerId };
      render();
    });
    return [
      el('h3', 'beta.consent.title'),
      el('p', 'beta.consent.stored'),
      el('p', 'beta.consent.evaluated'),
      el('p', 'beta.consent.signOut'),
      accept,
      decline,
    ];
  }

  function signedInView() {
    const p = el('p');
    p.textContent = text('beta.signedInAs') + ' ';
    const id = el('strong');
    id.textContent = session.testerId;
    p.append(id);
    const out = button('sign-out', 'beta.signOut');
    out.addEventListener('click', () => {
      session.signOut();
      view = { kind: 'form', message: 'beta.signedOut' };
      render();
    });
    return [p, out];
  }

  function input(name: string, type: string, key: MessageKey, value?: string) {
    const field = el('input');
    field.name = name;
    field.type = type;
    field.id = `beta-${name}`;
    if (value) field.value = value;
    const label = el('label', key);
    label.htmlFor = field.id;
    return { label, input: field };
  }

  function render() {
    const section = el('section');
    section.setAttribute('aria-labelledby', 'beta-title');
    const h2 = el('h2', 'beta.title');
    h2.id = 'beta-title';
    const body =
      session.state === 'signed-in' && view.kind !== 'busy'
        ? signedInView()
        : view.kind === 'consent'
          ? consentView(view)
          : view.kind === 'busy'
            ? [el('p', 'beta.busy')]
            : formView(view);
    section.append(h2, ...body);
    root.replaceChildren(section);
  }

  render();
  const offLocale = i18n.onChange(render);
  const offSession = session.onChange(render);
  return () => {
    offLocale();
    offSession();
  };
}
