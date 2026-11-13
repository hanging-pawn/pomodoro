import { APP_NAME } from '../config';
import type { I18n, MessageKey } from '../i18n/i18n';
import { tabTitle, type Alerts } from './alerts';
import type { Timer } from './controller';

/**
 * Headless part of the timer (FR-104, FR-108): announces the end of a phase with sound and
 * notification, keeps the tab title «mm:ss · task» and flags the phase on <html>. The Today
 * screen draws the round; this runs regardless of which screen is visible.
 */
export function mountAnnouncer(
  timer: Timer,
  i18n: I18n,
  deps: { alerts: Alerts; taskTitle(id: string | undefined): string },
): () => void {
  const t = (key: string) => i18n.t(key as MessageKey);
  return timer.onChange((view, end) => {
    if (end)
      deps.alerts.announce(
        t(`timer.notify.${end}.title`),
        t(`timer.notify.${end}.body`),
      );
    document.title = tabTitle(view, deps.taskTitle(view.taskId), APP_NAME);
    document.documentElement.dataset.timerPhase = view.phase;
  });
}
