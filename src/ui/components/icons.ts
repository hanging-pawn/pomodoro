/** Outline, monochrome icons (24 × 24, stroke = currentColor). No tomato imagery (POMO-33). */
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
