import { button, type ButtonVariant } from './button';

export interface DialogAction {
  /** Button text, already translated. */
  label: string;
  /** Value the dialog resolves with when this action is chosen. */
  value: string;
  variant?: ButtonVariant;
}

export interface DialogOptions {
  title: string;
  body?: Node;
  actions: DialogAction[];
  /** Where the dialog is attached; default document.body. */
  parent?: HTMLElement;
}

let nextId = 0;

/**
 * Opens a modal dialog and resolves with the chosen action's value, or `undefined` on Escape
 * or a click on the backdrop. While open: focus moves to the first action, Tab stays inside,
 * the rest of the page is inert. On close: the dialog is removed and focus returns to where it was.
 */
export function openDialog(
  options: DialogOptions,
): Promise<string | undefined> {
  const parent = options.parent ?? document.body;
  const before = document.activeElement as HTMLElement | null;
  const siblings = [...parent.children].filter((c) => !c.hasAttribute('inert'));

  const backdrop = document.createElement('div');
  backdrop.className = 'ui-dialog-backdrop';
  const dialog = document.createElement('div');
  dialog.className = 'ui-dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  const title = document.createElement('h2');
  title.className = 'ui-dialog__title';
  title.id = `ui-dialog-${++nextId}`;
  title.textContent = options.title;
  dialog.setAttribute('aria-labelledby', title.id);
  dialog.append(title);
  if (options.body) dialog.append(options.body);

  return new Promise((resolve) => {
    const close = (value: string | undefined) => {
      document.removeEventListener('keydown', onKey, true);
      backdrop.remove();
      for (const s of siblings) s.removeAttribute('inert');
      before?.focus?.();
      resolve(value);
    };
    const actions = document.createElement('div');
    actions.className = 'ui-dialog__actions';
    for (const a of options.actions)
      actions.append(
        button({
          label: a.label,
          variant: a.variant,
          action: a.value,
          onClick: () => close(a.value),
        }),
      );
    dialog.append(actions);

    const focusables = () => [
      ...dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ),
    ];
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        close(undefined);
      } else if (e.key === 'Tab') {
        const items = focusables();
        const first = items[0];
        const last = items[items.length - 1];
        if (!first || !last) return;
        const active = document.activeElement;
        if (e.shiftKey && (active === first || !dialog.contains(active))) {
          e.preventDefault();
          last.focus();
        } else if (
          !e.shiftKey &&
          (active === last || !dialog.contains(active))
        ) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener('keydown', onKey, true);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close(undefined);
    });

    backdrop.append(dialog);
    for (const s of siblings) s.setAttribute('inert', '');
    parent.append(backdrop);
    (actions.querySelector('button') ?? dialog).focus();
  });
}
