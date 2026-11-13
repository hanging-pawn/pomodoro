import { APP_NAME } from '../config';
import type { I18n, MessageKey } from '../i18n/i18n';
import { iconButton } from '../ui/components/icon-button';

const DISMISSED = 'pomo.iosHint.dismissed';

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

export interface IosHintOptions {
  /** Shows a close button; once closed the hint stays away on this device (Today screen). */
  dismissible?: boolean;
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
}

const safeStorage = (): IosHintOptions['storage'] => {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
};

/**
 * Mounts the hint (with instructions) only where it applies; follows the language. Dismissible on
 * the Today screen, always present in Settings (NFR-12, NFR-18).
 */
export function mountIosHint(
  root: HTMLElement,
  i18n: I18n,
  env: IosEnv = currentIosEnv(),
  options: IosHintOptions = {},
): () => void {
  const storage = options.storage ?? safeStorage();
  const dismissed = () => {
    try {
      return storage?.getItem(DISMISSED) === '1';
    } catch {
      return false;
    }
  };
  const render = () => {
    if (!isIosNotInstalled(env) || (options.dismissible && dismissed()))
      return root.replaceChildren();
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
    if (options.dismissible) {
      const close = iconButton({
        icon: 'close',
        label: t('ios.dismiss'),
        action: 'dismiss-ios-hint',
        onClick: () => {
          try {
            storage?.setItem(DISMISSED, '1');
          } catch {
            /* private mode: hide for this visit only */
          }
          root.replaceChildren();
        },
      });
      close.classList.add('ios-hint__close');
      box.classList.add('ios-hint--dismissible');
      box.prepend(close);
    }
    root.replaceChildren(box);
  };
  render();
  return i18n.onChange(render);
}
