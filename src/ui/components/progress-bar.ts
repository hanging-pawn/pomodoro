export interface ProgressBarOptions {
  /** Accessible name, already translated (e.g. «Today's budget»). */
  label: string;
  value: number;
  max: number;
  /** Spoken value, e.g. «6 of 8 rounds» or «2 over budget». */
  valueText?: string;
}

export interface ProgressBar {
  readonly element: HTMLElement;
  /** Updates fill and ARIA values; value above max marks the bar as over (budget bar, FR-203). */
  set(value: number, max: number, valueText?: string): void;
}

/** Thin bar (6 px, track accent-light, fill accent-mid) with role progressbar. */
export function progressBar(options: ProgressBarOptions): ProgressBar {
  const element = document.createElement('div');
  element.className = 'ui-progress';
  element.setAttribute('role', 'progressbar');
  element.setAttribute('aria-label', options.label);
  element.setAttribute('aria-valuemin', '0');
  const fill = document.createElement('div');
  fill.className = 'ui-progress__fill';
  element.append(fill);

  const set = (value: number, max: number, valueText?: string) => {
    const safeMax = Math.max(0, max);
    const now = Math.min(Math.max(0, value), safeMax);
    element.setAttribute('aria-valuemax', String(safeMax));
    element.setAttribute('aria-valuenow', String(now));
    if (valueText) element.setAttribute('aria-valuetext', valueText);
    else element.removeAttribute('aria-valuetext');
    element.toggleAttribute('data-over', value > safeMax);
    fill.style.width = `${safeMax === 0 ? 0 : (now / safeMax) * 100}%`;
  };
  set(options.value, options.max, options.valueText);
  return { element, set };
}
