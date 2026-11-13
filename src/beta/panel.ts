import { APP_NAME } from '../config';
import type { I18n, MessageKey } from '../i18n/i18n';
import type { BetaSession, Profile, SignInResult } from './session';

/**
 * Beta sign-in panel (FR-502, FR-506, NFR-13): form → consent notice on the first sign-in of a
 * tester on this device → signed-in view with sign-out. Declining sends nothing.
 * The beta account is the app login (POMO-85): «New account» creates it, the signed-in view
 * syncs the devices and takes feedback.
 * Returns an unmount function.
 */
export function mountBetaPanel(
  root: HTMLElement,
  i18n: I18n,
  session: BetaSession,
): () => void {
  type View =
    | { kind: 'form'; message?: MessageKey; testerId?: string }
    | { kind: 'consent'; testerId: string; key: string; profile?: Profile }
    | { kind: 'busy' };
  let view: View = { kind: 'form' };
  let mode: 'sign-in' | 'create' = 'sign-in';
  let note: MessageKey | undefined;
  let feedbackDraft = '';

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

  async function signIn(testerId: string, key: string, profile?: Profile) {
    view = { kind: 'busy' };
    render();
    const result: SignInResult = await session.signIn(testerId, key, profile);
    // No account yet: offer to create it with the same id.
    if (result === 'unknown-tester') mode = 'create';
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

  function modeSwitch() {
    const box = el('div');
    box.className = 'beta-mode';
    box.setAttribute('role', 'group');
    for (const [m, key] of [
      ['sign-in', 'beta.mode.signIn'],
      ['create', 'beta.mode.create'],
    ] as const) {
      const b = button(`mode-${m}`, key);
      b.setAttribute('aria-pressed', String(mode === m));
      b.addEventListener('click', () => {
        mode = m;
        view = { kind: 'form' };
        render();
      });
      box.append(b);
    }
    return box;
  }

  function formView(v: Extract<View, { kind: 'form' }>) {
    const form = el('form');
    const create = mode === 'create';
    const name = input('name', 'text', 'beta.name');
    name.input.autocomplete = 'name';
    const email = input('email', 'email', 'beta.email');
    email.input.autocomplete = 'email';
    const id = input('testerId', 'text', 'beta.testerId', v.testerId);
    id.input.autocapitalize = 'none';
    id.input.setAttribute('autocorrect', 'off');
    const idHint = el('p', 'beta.idHint');
    idHint.id = 'beta-id-hint';
    id.input.setAttribute('aria-describedby', idHint.id);
    const key = input('key', 'password', 'beta.key');
    key.input.autocomplete = 'off';
    const hint = el('p', 'beta.keyHint');
    hint.id = 'beta-key-hint';
    key.input.setAttribute('aria-describedby', hint.id);
    form.append(el('p', 'beta.intro'), modeSwitch());
    if (create) form.append(name.label, name.input, email.label, email.input);
    form.append(
      id.label,
      id.input,
      idHint,
      key.label,
      key.input,
      hint,
      create
        ? button('create', 'beta.create', 'submit')
        : button('sign-in', 'beta.signIn', 'submit'),
    );
    if (v.message) form.append(alert(v.message));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const testerId = id.input.value.trim().toLowerCase();
      const k = key.input.value.trim();
      const profile = create
        ? { name: name.input.value, email: email.input.value }
        : undefined;
      if (session.needsConsent(testerId)) {
        view = { kind: 'consent', testerId, key: k, profile };
        render();
      } else void signIn(testerId, k, profile);
    });
    return [form];
  }

  function consentView(v: Extract<View, { kind: 'consent' }>) {
    const accept = button('accept', 'beta.consent.accept');
    const decline = button('decline', 'beta.consent.decline');
    accept.addEventListener('click', () => {
      session.consent(v.testerId);
      void signIn(v.testerId, v.key, v.profile);
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
      note = undefined;
      view = { kind: 'form', message: 'beta.signedOut' };
      render();
    });

    // Devices (POMO-85): same data wherever this tester id signs in.
    const devices = el('p', 'beta.devices');
    const last = el('p');
    last.dataset.role = 'last-pull';
    if (session.lastPull)
      last.textContent = text('beta.lastPull').replace(
        '{time}',
        session.lastPull.toLocaleTimeString(i18n.locale, {
          hour: '2-digit',
          minute: '2-digit',
        }),
      );
    const now = button('sync-now', 'beta.syncNow');
    now.addEventListener('click', () => {
      now.disabled = true;
      void session.pull().then((r) => {
        note = r === 'offline' ? 'beta.syncOffline' : undefined;
        render();
      });
    });

    // Feedback straight into the tester folder.
    const fb = el('form');
    fb.className = 'beta-feedback';
    const area = el('textarea');
    area.name = 'feedback';
    area.id = 'beta-feedback';
    area.rows = 4;
    area.placeholder = text('beta.feedback.placeholder');
    area.value = feedbackDraft;
    area.addEventListener('input', () => (feedbackDraft = area.value));
    const label = el('label', 'beta.feedback.label');
    label.htmlFor = area.id;
    const send = button('send-feedback', 'beta.feedback.send', 'submit');
    fb.append(label, area, send);
    fb.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!area.value.trim()) return;
      send.disabled = true;
      void session.sendFeedback(area.value).then((r) => {
        if (r === 'sent') feedbackDraft = '';
        note = r === 'sent' ? 'beta.feedback.sent' : 'beta.feedback.failed';
        render();
      });
    });

    const parts: Node[] = [p, devices, last, now, fb];
    if (note) {
      const msg = el('p', note);
      msg.setAttribute('role', 'status');
      parts.push(msg);
    }
    parts.push(out);
    return parts;
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
