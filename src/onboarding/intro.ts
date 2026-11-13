import type { I18n, MessageKey } from '../i18n/i18n';
import { openDialog } from '../ui/components/dialog';

export const INTRO_KEY = 'pomo-pomo.intro';
const STEPS = 3;

type KeyValue = Pick<Storage, 'getItem' | 'setItem'>;

/**
 * First-start intro (NFR-15): the method and the app in 3 steps, skippable at any step
 * (button or Escape). Shown once per device; both skipping and finishing remember it.
 * Resolves when the intro is closed or was not due.
 */
export async function showIntro(
  i18n: I18n,
  storage: KeyValue | undefined = safeStorage(),
): Promise<void> {
  if (seen(storage)) return;
  const t = (key: string) => i18n.t(key as MessageKey);
  for (let step = 1; step <= STEPS; step++) {
    const body = document.createElement('p');
    body.textContent = t(`intro.${step}.body`);
    const last = step === STEPS;
    const choice = await openDialog({
      title: t(`intro.${step}.title`),
      body,
      actions: [
        last
          ? { label: t('intro.done'), value: 'done' }
          : { label: t('intro.next'), value: 'next' },
        { label: t('intro.skip'), value: 'skip', variant: 'quiet' },
      ],
    });
    if (choice !== 'next') break;
  }
  try {
    storage?.setItem(INTRO_KEY, '1');
  } catch {
    // Storage unavailable: the intro may show again on the next visit.
  }
}

function seen(storage: KeyValue | undefined): boolean {
  try {
    return !!storage && storage.getItem(INTRO_KEY) !== null;
  } catch {
    return false;
  }
}

function safeStorage(): KeyValue | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}
