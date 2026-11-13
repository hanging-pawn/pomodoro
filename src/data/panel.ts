import type { I18n, MessageKey } from '../i18n/i18n';
import type { Store } from '../storage/store';
import { DATA_CHANGED } from '../tasks/events';
import { button } from '../ui/components/button';
import { card } from '../ui/components/card';
import { openDialog } from '../ui/components/dialog';

export interface Download {
  name: string;
  type: string;
  text: string;
}

export interface DataPanelDeps {
  /** Hands a file to the user; default: a Blob link click. */
  download?: (file: Download) => void;
  now?: () => number;
}

/** Saves a text file through a temporary object URL (the browser's download). */
function browserDownload({ name, type, text }: Download) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const day = (t: number) => {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/**
 * «Your data» (NFR-03): export all data as JSON, the protocol as CSV, import a JSON export
 * (merged by event id, so after «delete all» it restores everything) and delete all data after
 * a confirmation. Returns an unmount function.
 */
export function mountDataPanel(
  root: HTMLElement,
  i18n: I18n,
  store: Store,
  deps: DataPanelDeps = {},
): () => void {
  const download = deps.download ?? browserDownload;
  const now = deps.now ?? Date.now;
  let message: MessageKey | undefined;
  let busy = false;

  const run = async (work: () => Promise<MessageKey | undefined>) => {
    busy = true;
    render();
    try {
      message = await work();
    } catch {
      message = 'data.error.failed';
    }
    busy = false;
    render();
  };

  async function wipe() {
    const body = document.createElement('p');
    body.textContent = i18n.t('data.wipe.body');
    const choice = await openDialog({
      title: i18n.t('data.wipe.title'),
      body,
      actions: [
        { label: i18n.t('data.wipe.confirm'), value: 'wipe' },
        { label: i18n.t('data.cancel'), value: 'cancel', variant: 'quiet' },
      ],
    });
    if (choice !== 'wipe') return;
    await run(async () => {
      await store.wipe();
      document.dispatchEvent(new Event(DATA_CHANGED));
      return 'data.wiped';
    });
  }

  function render() {
    const intro = document.createElement('p');
    intro.textContent = i18n.t('data.intro');

    const file = document.createElement('input');
    file.type = 'file';
    file.accept = 'application/json,.json';
    file.id = 'data-import';
    file.disabled = busy;
    const label = document.createElement('label');
    label.htmlFor = file.id;
    label.textContent = i18n.t('data.import');
    file.addEventListener('change', () => {
      const chosen = file.files?.[0];
      if (!chosen) return;
      void run(async () => {
        const text = await chosen.text();
        try {
          await store.importJson(text);
        } catch {
          return 'data.error.invalid';
        }
        document.dispatchEvent(new Event(DATA_CHANGED));
        return 'data.imported';
      });
    });

    const status = document.createElement('p');
    status.setAttribute('role', 'status');
    status.textContent = message ? i18n.t(message) : '';

    const actions = document.createElement('div');
    actions.className = 'data__actions';
    actions.append(
      button({
        label: i18n.t('data.exportJson'),
        action: 'export-json',
        disabled: busy,
        onClick: () =>
          void run(async () => {
            download({
              name: `pomo-pomo-${day(now())}.json`,
              type: 'application/json',
              text: await store.exportJson(),
            });
            return undefined;
          }),
      }),
      button({
        label: i18n.t('data.exportCsv'),
        action: 'export-csv',
        disabled: busy,
        onClick: () =>
          void run(async () => {
            download({
              name: `pomo-pomo-protocol-${day(now())}.csv`,
              type: 'text/csv',
              text: await store.exportCsv(),
            });
            return undefined;
          }),
      }),
      button({
        label: i18n.t('data.wipe'),
        action: 'wipe',
        variant: 'quiet',
        disabled: busy,
        onClick: () => void wipe(),
      }),
    );
    root.replaceChildren(
      card({
        title: i18n.t('data.title'),
        children: [intro, actions, label, file, status],
      }),
    );
  }

  render();
  return i18n.onChange(render);
}
