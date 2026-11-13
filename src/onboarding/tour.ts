import type { I18n, MessageKey } from '../i18n/i18n';
import { APP_NAME } from '../config';

/**
 * Guided tour of one screen (POMO-86, NFR-15): a spotlight on one element at a time with a short
 * explanation, Back / Next / Skip, Escape closes, arrow keys step. Steps whose element is missing
 * or hidden (empty list, gamification off) are left out; a step without target is shown centred.
 */
export interface TourStep {
  /** CSS selector or a function finding the element; none = centred step. */
  target?: string | (() => Element | null | undefined);
  title: MessageKey;
  body: MessageKey;
}

export interface TourOptions {
  /** Where the overlay is attached; default document.body. */
  parent?: HTMLElement;
}

let nextId = 0;

// jsdom (tests) has no layout: there an attached, not hidden element counts as visible.
const NO_LAYOUT = /jsdom/i.test(globalThis.navigator?.userAgent ?? '');

const visible = (el: Element | null | undefined): el is HTMLElement =>
  !!el &&
  el instanceof HTMLElement &&
  el.isConnected &&
  !el.closest('[hidden]') &&
  (NO_LAYOUT || el.getClientRects().length > 0);

function find(step: TourStep): HTMLElement | undefined {
  if (!step.target) return undefined;
  const el =
    typeof step.target === 'string'
      ? document.querySelector(step.target)
      : step.target();
  return visible(el) ? el : undefined;
}

/** Runs the tour; resolves 'done' after the last step, 'skipped' on Skip or Escape. */
export function runTour(
  steps: readonly TourStep[],
  i18n: I18n,
  options: TourOptions = {},
): Promise<'done' | 'skipped'> {
  const parent = options.parent ?? document.body;
  const text = (key: MessageKey) => i18n.t(key).replaceAll('{app}', APP_NAME);
  // Only steps that can be shown now; a centred step always can.
  const plan = steps.filter((s) => !s.target || find(s));
  if (!plan.length) return Promise.resolve('done');
  const before = document.activeElement as HTMLElement | null;

  const overlay = document.createElement('div');
  overlay.className = 'tour';
  overlay.dataset.role = 'tour';
  const spot = document.createElement('div');
  spot.className = 'tour__spot';
  const bubble = document.createElement('div');
  bubble.className = 'tour__bubble';
  bubble.setAttribute('role', 'dialog');
  bubble.setAttribute('aria-modal', 'true');
  const title = document.createElement('h2');
  title.className = 'tour__title';
  title.id = `tour-title-${++nextId}`;
  bubble.setAttribute('aria-labelledby', title.id);
  const body = document.createElement('p');
  body.className = 'tour__body';
  body.id = `tour-body-${nextId}`;
  bubble.setAttribute('aria-describedby', body.id);
  const count = document.createElement('span');
  count.className = 'tour__count';
  const nav = document.createElement('div');
  nav.className = 'tour__nav';
  const mk = (action: string, cls: string) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.action = action;
    b.className = `ui-button ui-button--${cls}`;
    return b;
  };
  const skip = mk('tour-skip', 'quiet');
  const back = mk('tour-back', 'secondary');
  const next = mk('tour-next', 'primary');
  nav.append(skip, back, next);
  bubble.append(count, title, body, nav);
  overlay.append(spot, bubble);

  let index = 0;
  let current: HTMLElement | undefined;

  function place() {
    const vw = document.documentElement.clientWidth || 360;
    const vh = globalThis.innerHeight || 640;
    if (!current) {
      spot.hidden = true;
      overlay.classList.add('tour--centred');
      bubble.style.left = '';
      bubble.style.top = '';
      return;
    }
    overlay.classList.remove('tour--centred');
    spot.hidden = false;
    const r = current.getBoundingClientRect();
    const pad = 6;
    Object.assign(spot.style, {
      left: `${r.left - pad}px`,
      top: `${r.top - pad}px`,
      width: `${r.width + 2 * pad}px`,
      height: `${r.height + 2 * pad}px`,
    });
    const bw = Math.min(340, vw - 32);
    const bh = bubble.offsetHeight || 180;
    const below = vh - r.bottom;
    const top =
      below >= bh + 24 || below >= r.top
        ? Math.min(r.bottom + 14, vh - bh - 16)
        : Math.max(16, r.top - bh - 14);
    const left = Math.min(
      Math.max(16, r.left + r.width / 2 - bw / 2),
      vw - bw - 16,
    );
    bubble.style.left = `${left}px`;
    bubble.style.top = `${Math.max(16, top)}px`;
  }

  function show() {
    const step = plan[index]!;
    current = find(step);
    current?.scrollIntoView?.({ block: 'center' });
    title.textContent = text(step.title);
    body.textContent = text(step.body);
    count.textContent = i18n
      .t('tour.count')
      .replace('{n}', String(index + 1))
      .replace('{m}', String(plan.length));
    skip.textContent = i18n.t('tour.skip');
    back.textContent = i18n.t('tour.back');
    back.hidden = index === 0;
    const last = index === plan.length - 1;
    next.textContent = i18n.t(last ? 'tour.done' : 'tour.next');
    skip.hidden = last;
    place();
    next.focus();
  }

  return new Promise((resolve) => {
    const close = (result: 'done' | 'skipped') => {
      document.removeEventListener('keydown', onKey, true);
      globalThis.removeEventListener('resize', place);
      globalThis.removeEventListener('scroll', place, true);
      overlay.remove();
      before?.focus?.();
      resolve(result);
    };
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        close('skipped');
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        next.click();
      } else if (e.key === 'ArrowLeft' && index > 0) {
        e.preventDefault();
        back.click();
      } else if (e.key === 'Tab') {
        // Focus stays in the bubble.
        const items = [skip, back, next].filter((b) => !b.hidden);
        const i = items.indexOf(document.activeElement as HTMLButtonElement);
        e.preventDefault();
        const step = e.shiftKey ? -1 : 1;
        items[(i + step + items.length) % items.length]!.focus();
      }
    }
    next.addEventListener('click', () => {
      if (index === plan.length - 1) close('done');
      else {
        index++;
        show();
      }
    });
    back.addEventListener('click', () => {
      if (index > 0) index--;
      show();
    });
    skip.addEventListener('click', () => close('skipped'));
    // A tap outside the bubble goes on, like most app tours.
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target === spot) next.click();
    });
    document.addEventListener('keydown', onKey, true);
    globalThis.addEventListener('resize', place);
    globalThis.addEventListener('scroll', place, true);
    parent.append(overlay);
    show();
  });
}
