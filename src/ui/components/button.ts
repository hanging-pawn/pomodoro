export type ButtonVariant = 'primary' | 'secondary' | 'quiet';

export interface ButtonOptions {
  /** Visible text, already translated (t()). */
  label: string;
  onClick?: (event: MouseEvent) => void;
  /** primary = dark CTA (one per screen), secondary = outlined, quiet = text only. */
  variant?: ButtonVariant;
  type?: 'button' | 'submit';
  disabled?: boolean;
  /** Stable hook for tests and delegation (`data-action`). */
  action?: string;
}

/** Text button with at least a 44 × 44 px target (NFR-05) and visible focus. */
export function button(options: ButtonOptions): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = options.type ?? 'button';
  b.className = `ui-button ui-button--${options.variant ?? 'secondary'}`;
  b.textContent = options.label;
  b.disabled = options.disabled ?? false;
  if (options.action) b.dataset.action = options.action;
  if (options.onClick) b.addEventListener('click', options.onClick);
  return b;
}
