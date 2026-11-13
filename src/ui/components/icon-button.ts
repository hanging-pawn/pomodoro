import { icon, type IconName } from './icons';

export interface IconButtonOptions {
  icon: IconName;
  /** Accessible name, already translated; also shown as tooltip. */
  label: string;
  onClick?: (event: MouseEvent) => void;
  /** Toggle state (e.g. theme switch); omitted = plain button. */
  pressed?: boolean;
  /** Keyboard shortcut shown to assistive tech (e.g. `P` for park, NFR-06). */
  shortcut?: string;
  action?: string;
}

/** Square icon-only button, 44 × 44 px (NFR-05); the label is its accessible name. */
export function iconButton(options: IconButtonOptions): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'ui-icon-button';
  b.setAttribute('aria-label', options.label);
  b.title = options.label;
  if (options.shortcut) b.setAttribute('aria-keyshortcuts', options.shortcut);
  if (options.pressed !== undefined)
    b.setAttribute('aria-pressed', String(options.pressed));
  if (options.action) b.dataset.action = options.action;
  b.append(icon(options.icon));
  if (options.onClick) b.addEventListener('click', options.onClick);
  return b;
}
