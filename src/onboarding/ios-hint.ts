import { APP_NAME } from '../config';
import type { I18n, MessageKey } from '../i18n/i18n';

export interface IosEnv {
  userAgent: string;
  maxTouchPoints?: number;
  /** `navigator.standalone`, set by iOS Safari when started from the home screen. */
  standalone?: boolean;
  /** `matchMedia('(display-mode: standalone)')`. */
  displayModeStandalone?: boolean;
}

/**
 * iOS Safari that is not installed (NFR-12): there, notifications only reach apps added to the
 * home screen. iPadOS reports a Mac user agent, told apart by its touch screen.
 */
export function isIosNotInstalled(env: IosEnv): boolean {
  const iphoneOrIpad = /iPhone|iPad|iPod/.test(env.userAgent);
  const ipadAsMac = /Macintosh/.test(env.userAgent) && !!env.maxTouchPoints;
  if (!iphoneOrIpad && !ipadAsMac) return false;
  return !env.standalone && !env.displayModeStandalone;
}

export function currentIosEnv(): IosEnv {
  const nav = globalThis.navigator as Navigator & { standalone?: boolean };
  return {
    userAgent: nav?.userAgent ?? '',
    maxTouchPoints: nav?.maxTouchPoints,
    standalone: nav?.standalone,
    displayModeStandalone:
      globalThis.matchMedia?.('(display-mode: standalone)').matches ?? false,
  };
}

/** Mounts the hint (with instructions) only where it applies; follows the language. */
export function mountIosHint(
  root: HTMLElement,
  i18n: I18n,
  env: IosEnv = currentIosEnv(),
): () => void {
  const render = () => {
    if (!isIosNotInstalled(env)) return root.replaceChildren();
    const t = (key: string) =>
      i18n.t(key as MessageKey).replaceAll('{app}', APP_NAME);
    const box = document.createElement('section');
    box.className = 'ios-hint';
    box.setAttribute('role', 'note');
    const h = document.createElement('h2');
    h.textContent = t('ios.title');
    const p = document.createElement('p');
    p.textContent = t('ios.body');
    box.append(h, p);
    root.replaceChildren(box);
  };
  render();
  return i18n.onChange(render);
}
