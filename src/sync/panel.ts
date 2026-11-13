import type { I18n, MessageKey } from '../i18n/i18n';
import type { Sync } from './sync';

/**
 * Sync panel (NFR-10, NFR-13): guided setup of the user's own private repo and fine-grained token,
 * then the connected view with sync now and disconnect. Returns an unmount function.
 */
export function mountSyncPanel(
  root: HTMLElement,
  i18n: I18n,
  sync: Sync,
): () => void {
  let message: MessageKey | undefined;
  let busy = false;
  let repoDraft = '';

  const el = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    key?: MessageKey,
  ) => {
    const node = document.createElement(tag);
    if (key) node.textContent = i18n.t(key);
    return node;
  };
  const button = (action: string, key: MessageKey, type = 'button') => {
    const b = el('button', key);
    b.type = type as HTMLButtonElement['type'];
    b.dataset.action = action;
    b.disabled = busy;
    return b;
  };
  const input = (name: string, type: string, key: MessageKey) => {
    const field = el('input');
    field.name = name;
    field.type = type;
    field.id = `sync-${name}`;
    const label = el('label', key);
    label.htmlFor = field.id;
    return { label, field };
  };

  async function act(work: () => Promise<string>) {
    busy = true;
    message = undefined;
    render();
    const result = await work();
    busy = false;
    message =
      result === 'synced' || result === 'off'
        ? undefined
        : (`sync.error.${result}` as MessageKey);
    render();
  }

  function setupView() {
    const steps = el('ol');
    for (const key of ['sync.step1', 'sync.step2', 'sync.step3'] as const)
      steps.append(el('li', key));
    const form = el('form');
    const repo = input('repo', 'text', 'sync.repo');
    repo.field.value = repoDraft;
    const token = input('token', 'password', 'sync.token');
    token.field.autocomplete = 'off';
    form.append(
      repo.label,
      repo.field,
      token.label,
      token.field,
      button('connect', busy ? 'sync.busy' : 'sync.connect', 'submit'),
    );
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      repoDraft = repo.field.value;
      void act(() => sync.connect(repo.field.value, token.field.value));
    });
    return [el('p', 'sync.intro'), steps, form];
  }

  function connectedView() {
    const to = el('p');
    to.textContent = i18n.t('sync.connectedTo') + ' ';
    const repo = el('strong');
    repo.textContent = sync.repo;
    to.append(repo);
    const last = el('p');
    last.textContent =
      i18n.t('sync.lastSync') +
      ' ' +
      (sync.lastSync
        ? sync.lastSync.toLocaleString(i18n.locale)
        : i18n.t('sync.never'));
    const now = button('sync-now', busy ? 'sync.busy' : 'sync.now');
    now.addEventListener('click', () => void act(() => sync.sync()));
    const off = button('disconnect', 'sync.disconnect');
    off.addEventListener('click', () => {
      sync.disconnect();
      message = 'sync.disconnected';
      render();
    });
    return [to, last, now, off];
  }

  function render() {
    const section = el('section');
    section.setAttribute('aria-labelledby', 'sync-title');
    const h2 = el('h2', 'sync.title');
    h2.id = 'sync-title';
    section.append(
      h2,
      ...(sync.state === 'on' ? connectedView() : setupView()),
    );
    if (message) {
      const p = el('p', message);
      p.setAttribute(
        'role',
        message === 'sync.disconnected' ? 'status' : 'alert',
      );
      section.append(p);
    }
    root.replaceChildren(section);
  }

  render();
  const offLocale = i18n.onChange(render);
  const offSync = sync.onChange(render);
  return () => {
    offLocale();
    offSync();
  };
}
