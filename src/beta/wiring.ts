import { DATA_CHANGED } from '../tasks/events';
import type { BetaSession } from './session';

/**
 * Every data change a view announces (`DATA_CHANGED` on `target`, usually `document`) reaches
 * the beta account (NFR-10): upload queue plus delayed merge with `testers/<id>/sync.jsonl`.
 * Returns an unsubscribe function.
 */
export function wireBetaSession(
  target: EventTarget,
  session: Pick<BetaSession, 'changed'>,
): () => void {
  const changed = () => session.changed();
  target.addEventListener(DATA_CHANGED, changed);
  return () => target.removeEventListener(DATA_CHANGED, changed);
}
