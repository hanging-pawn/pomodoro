import type { I18n } from '../i18n/i18n';
import type { Screen } from '../shell/shell';
import { runTour } from './tour';
import { TOURS } from './tour-steps';

export const TOUR_SEEN = 'pomo-pomo.tour.seen.';

type KeyValue = Pick<Storage, 'getItem' | 'setItem'>;

export interface Tours {
  /** Runs the tour of a screen now (info button). */
  start(screen: Screen): Promise<void>;
  /** From now on, a screen's tour starts by itself on its first visit (after intro and login). */
  enableAuto(current: Screen): void;
  /** Call with every screen that becomes visible. */
  shown(screen: Screen): void;
}

/**
 * First-use explanations (POMO-86): every screen has a tour; it starts once by itself on the
 * first visit and again from the info button at any time. Not during a round or over a dialog.
 */
export function createTours(
  i18n: I18n,
  options: {
    storage?: KeyValue;
    /** True while a round runs or a dialog is open: no automatic tour then. */
    busy?: () => boolean;
    /** Wait for the view to render before measuring. Defaults to 350 ms. */
    delayMs?: number;
  } = {},
): Tours {
  const storage = options.storage ?? safeStorage();
  const busy = options.busy ?? (() => false);
  const delay = options.delayMs ?? 350;
  let auto = false;
  let running = false;

  const seen = (s: Screen) => {
    try {
      return storage?.getItem(TOUR_SEEN + s) === '1';
    } catch {
      return false;
    }
  };
  const markSeen = (s: Screen) => {
    try {
      storage?.setItem(TOUR_SEEN + s, '1');
    } catch {
      // Private mode: the tour shows again next visit.
    }
  };

  async function start(screen: Screen) {
    if (running) return;
    running = true;
    try {
      await runTour(TOURS[screen], i18n);
      markSeen(screen);
    } finally {
      running = false;
    }
  }

  function shown(screen: Screen) {
    if (!auto || running || seen(screen)) return;
    setTimeout(() => {
      if (!running && !seen(screen) && !busy()) void start(screen);
    }, delay);
  }

  return {
    start,
    enableAuto(current) {
      auto = true;
      shown(current);
    },
    shown,
  };
}

function safeStorage(): KeyValue | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}
