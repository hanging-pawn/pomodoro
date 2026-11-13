export interface CardOptions {
  /** Section heading, already translated; becomes the card's accessible name. */
  title?: string;
  children?: Node[];
  /** `highlight` = accent-tinted surface (reward rows, ring moment). */
  tone?: 'default' | 'highlight';
}

let nextId = 0;

/** Surface for one group of content: border, 16 px radius, no shadow. */
export function card(options: CardOptions = {}): HTMLElement {
  const section = document.createElement('section');
  section.className = `ui-card${options.tone === 'highlight' ? ' ui-card--highlight' : ''}`;
  if (options.title) {
    const h = document.createElement('h2');
    h.className = 'ui-card__title';
    h.id = `ui-card-${++nextId}`;
    h.textContent = options.title;
    section.setAttribute('aria-labelledby', h.id);
    section.append(h);
  }
  section.append(...(options.children ?? []));
  return section;
}
