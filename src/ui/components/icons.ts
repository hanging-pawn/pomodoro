/** Outline, monochrome icons (24 × 24, stroke = currentColor). No trademark imagery (POMO-33, CLAUDE.md). */
export const ICONS = {
  park: 'M5 4h14v16l-7-4-7 4z',
  close: 'M6 6l12 12M18 6L6 18',
  play: 'M8 5l11 7-11 7z',
  plus: 'M12 5v14M5 12h14',
  theme: 'M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9z',
  horizon: 'M3 17h18M3 12h12M3 7h7',
  back: 'M15 5l-7 7 7 7',
  shop: 'M5 8h14l-1 12H6zM9 8a3 3 0 0 1 6 0',
  settings: 'M4 7h10M18 7h2M4 17h2M10 17h10M14 5v4M6 15v4',
  today: 'M6 4v4M6 20v-4M6 12a2 2 0 1 0 0 .01M10 12h10M10 6h10M10 18h6',
  tasks: 'M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01',
  week: 'M5 20V12M10 20V6M15 20v-9M20 20V9',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 7.5h.01',
  check: 'M5 12.5l4.5 4.5L19 7',
} as const;

export type IconName = keyof typeof ICONS;

const SVG = 'http://www.w3.org/2000/svg';

/** Decorative icon element; the accessible name belongs on the surrounding control. */
export function icon(name: IconName): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'ui-icon');
  const path = document.createElementNS(SVG, 'path');
  path.setAttribute('d', ICONS[name]);
  svg.append(path);
  return svg;
}
