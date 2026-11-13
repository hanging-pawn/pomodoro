/**
 * Coin symbol (POMO-82, FR-401): amounts show as «20 🍅» with a small red tomato instead of the
 * word «coins». The tomato is only the in-app currency symbol (Gianluca, 13.11.2026); app icon,
 * name and illustrations stay without tomato (POMO-33). Swap the symbol here and nowhere else.
 */
const SVG = 'http://www.w3.org/2000/svg';

const PARTS: readonly { d: string; cls: string }[] = [
  // Body
  {
    d: 'M12 6.6c-4.6 0-8.2 3-8.2 7.1S7.4 21 12 21s8.2-3.2 8.2-7.3-3.6-7.1-8.2-7.1z',
    cls: 'ui-coin__body',
  },
  // Shine
  { d: 'M7.4 12.2c.4-1.4 1.6-2.5 3.1-2.9', cls: 'ui-coin__shine' },
  // Calyx with stem
  {
    d: 'M12 3v3.2M12 6.2l-2.9-1.1 1.2 2.2-3 .6 2.7 1 2-1.5 2 1.5 2.7-1-3-.6 1.2-2.2z',
    cls: 'ui-coin__leaf',
  },
];

/** The tomato symbol alone, decorative (the amount carries the accessible name). */
export function coinIcon(): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'ui-coin__icon');
  for (const p of PARTS) {
    const path = document.createElementNS(SVG, 'path');
    path.setAttribute('d', p.d);
    path.setAttribute('class', p.cls);
    svg.append(path);
  }
  return svg;
}

/**
 * An amount of coins: the number and the tomato. Screen readers get `label` (e.g. «20 coins»),
 * so the meaning does not depend on the picture (NFR-08).
 */
export function coinAmount(n: number, label: string): HTMLSpanElement {
  const el = document.createElement('span');
  el.className = 'ui-coin';
  el.dataset.coins = String(n);
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', label);
  const num = document.createElement('span');
  num.className = 'ui-coin__n';
  num.setAttribute('aria-hidden', 'true');
  num.textContent = String(n);
  el.append(num, coinIcon());
  return el;
}

/**
 * Fills a translated template that marks the amount with `{c}` («Balance: {c}») with text and
 * the coin amount. Other placeholders must be filled before.
 */
export function withCoins(
  template: string,
  n: number,
  label: string,
): DocumentFragment {
  const frag = document.createDocumentFragment();
  const [before, ...rest] = template.split('{c}');
  if (before) frag.append(before);
  if (rest.length) {
    frag.append(coinAmount(n, label));
    const after = rest.join('{c}');
    if (after) frag.append(after);
  }
  return frag;
}
