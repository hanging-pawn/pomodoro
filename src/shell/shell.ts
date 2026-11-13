import { APP_NAME } from '../config';
import type { I18n, MessageKey } from '../i18n/i18n';
import { icon, type IconName } from '../ui/components/icons';
import { button } from '../ui/components/button';
import { iconButton } from '../ui/components/icon-button';
import { coinAmount } from '../ui/components/coin';

/** Screens of the app shell (docs/ui/screens.md, FR-610). */
export const SCREENS = [
  'today',
  'tasks',
  'shop',
  'week',
  'horizon',
  'settings',
] as const;
export type Screen = (typeof SCREENS)[number];

/** Screens in the bottom nav, in order; Horizon and Settings open from the header. */
export const NAV: readonly Screen[] = ['today', 'tasks', 'shop', 'week'];

const NAV_ICON: Record<string, IconName> = {
  today: 'today',
  tasks: 'tasks',
  shop: 'shop',
  week: 'week',
};

export interface Shell {
  /** Container a view mounts into; stays the same element across re-renders and locale changes. */
  slot(screen: Screen): HTMLElement;
  /** Shows a screen by updating the hash route (browser back works). */
  go(screen: Screen): void;
  readonly current: Screen;
  /** Coin balance in the header; `undefined` hides it (gamification off, FR-405). */
  setCoins(n: number | undefined): void;
  /** Hides the Shop nav item when gamification is off (FR-405). */
  setShop(visible: boolean): void;
  /** Round running (FR-604): header and nav hide, Today is shown. */
  setFocus(on: boolean): void;
  /** Called with every screen that becomes visible (beta usage, FR-505). */
  onShow(listener: (screen: Screen) => void): () => void;
  destroy(): void;
}

/** `#/tasks` → `tasks`; anything unknown → `today`. */
export function parseRoute(hash: string): Screen {
  const name = hash.replace(/^#\/?/, '');
  return (SCREENS as readonly string[]).includes(name)
    ? (name as Screen)
    : 'today';
}

/**
 * App shell (FR-610): header with product name, coins, Horizon and Settings; one visible screen;
 * bottom nav Today / Tasks / Shop / Week (top nav from 1024 px via CSS). Hash routing keeps the
 * screen on reload. The structure is built once; texts follow the locale.
 */
export interface ShellOptions {
  /** Remembers which screen explanations were read (default localStorage). */
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
}

const INFO_SEEN = 'pomo.info.seen.';

export function mountShell(
  root: HTMLElement,
  i18n: I18n,
  options: ShellOptions = {},
): Shell {
  const storage =
    options.storage ??
    (() => {
      try {
        return globalThis.localStorage;
      } catch {
        return undefined;
      }
    })();
  const infoSeen = (s: Screen) => {
    try {
      return storage?.getItem(INFO_SEEN + s) === '1';
    } catch {
      return false;
    }
  };
  const t = (key: string, vars: Record<string, string | number> = {}) =>
    Object.entries(vars).reduce(
      (s, [k, v]) => s.replaceAll(`{${k}}`, String(v)),
      i18n.t(key as MessageKey),
    );
  const listeners = new Set<(screen: Screen) => void>();
  let current: Screen = parseRoute(location.hash);
  let coins: number | undefined;
  let focus = false;

  const app = document.createElement('div');
  app.className = 'app';

  // Header
  const header = document.createElement('header');
  header.className = 'app-header';
  const back = iconButton({
    icon: 'back',
    label: '',
    action: 'back',
    onClick: () => go('today'),
  });
  back.classList.add('app-header__back');
  const brand = document.createElement('a');
  brand.className = 'app-brand';
  brand.href = '#/today';
  brand.textContent = APP_NAME;
  const coinEl = document.createElement('span');
  coinEl.className = 'app-coins';
  coinEl.dataset.role = 'header-coins';
  const horizon = iconButton({
    icon: 'horizon',
    label: '',
    action: 'horizon',
    onClick: () => go(current === 'horizon' ? 'today' : 'horizon'),
  });
  const settings = iconButton({
    icon: 'settings',
    label: '',
    action: 'settings',
    onClick: () => go(current === 'settings' ? 'today' : 'settings'),
  });
  const tools = document.createElement('div');
  tools.className = 'app-header__tools';
  tools.append(coinEl, horizon, settings);
  header.append(back, brand, tools);

  // Screens
  const main = document.createElement('main');
  main.className = 'app-main';
  main.id = 'main';
  const sections = new Map<Screen, HTMLElement>();
  const titles = new Map<Screen, HTMLElement>();
  const slots = new Map<Screen, HTMLElement>();
  const infos = new Map<
    Screen,
    {
      box: HTMLElement;
      text: HTMLElement;
      close: HTMLButtonElement;
      btn: HTMLButtonElement;
    }
  >();
  for (const s of SCREENS) {
    const section = document.createElement('section');
    section.className = `app-screen app-screen--${s}`;
    section.dataset.screen = s;
    const h1 = document.createElement('h1');
    h1.className = 'app-title';
    h1.id = `title-${s}`;
    section.setAttribute('aria-labelledby', h1.id);
    // Short explanation per screen (the menus are not self-explanatory): open on the first visit,
    // afterwards behind the info button next to the title.
    const head = document.createElement('div');
    head.className = 'app-titlebar';
    const info = document.createElement('section');
    info.className = 'app-info';
    info.id = `info-${s}`;
    info.dataset.role = 'info';
    info.setAttribute('role', 'note');
    const infoText = document.createElement('p');
    const infoClose = button({
      label: '',
      variant: 'quiet',
      action: 'info-close',
      onClick: () => setInfo(s, false, true),
    });
    info.append(infoText, infoClose);
    const infoBtn = iconButton({
      icon: 'info',
      label: '',
      action: 'info',
      onClick: () => {
        const opening = info.hidden === true;
        // Closing with the button counts as read; opening does not.
        setInfo(s, opening, !opening);
      },
    });
    infoBtn.setAttribute('aria-controls', info.id);
    head.append(h1, infoBtn);
    const slot = document.createElement('div');
    slot.className = 'app-slot';
    section.append(head, info, slot);
    main.append(section);
    sections.set(s, section);
    titles.set(s, h1);
    slots.set(s, slot);
    infos.set(s, { box: info, text: infoText, close: infoClose, btn: infoBtn });
    info.hidden = infoSeen(s);
    infoBtn.setAttribute('aria-expanded', String(!info.hidden));
  }

  function setInfo(s: Screen, open: boolean, read: boolean) {
    const parts = infos.get(s)!;
    parts.box.hidden = !open;
    parts.btn.setAttribute('aria-expanded', String(open));
    if (read)
      try {
        storage?.setItem(INFO_SEEN + s, '1');
      } catch {
        /* private mode: shows again next visit */
      }
  }

  // Bottom nav
  const nav = document.createElement('nav');
  nav.className = 'app-nav';
  const navLinks = new Map<Screen, HTMLAnchorElement>();
  const navLabels = new Map<Screen, HTMLElement>();
  for (const s of NAV) {
    const a = document.createElement('a');
    a.className = 'app-nav__item';
    a.href = `#/${s}`;
    a.dataset.screen = s;
    const label = document.createElement('span');
    label.className = 'app-nav__label';
    a.append(icon(NAV_ICON[s]!), label);
    nav.append(a);
    navLinks.set(s, a);
    navLabels.set(s, label);
  }

  app.append(header, main, nav);
  root.replaceChildren(app);

  function texts() {
    back.setAttribute('aria-label', t('header.back'));
    back.title = t('header.back');
    horizon.setAttribute('aria-label', t('header.horizon'));
    horizon.title = t('header.horizon');
    settings.setAttribute('aria-label', t('header.settings'));
    settings.title = t('header.settings');
    nav.setAttribute('aria-label', t('nav.label'));
    for (const s of SCREENS) {
      titles.get(s)!.textContent = t(`screen.${s}`);
      const parts = infos.get(s)!;
      parts.text.textContent = t(`info.${s}`);
      parts.close.textContent = t('info.close');
      parts.btn.setAttribute('aria-label', t('info.open'));
      parts.btn.title = t('info.open');
    }
    for (const s of NAV) navLabels.get(s)!.textContent = t(`screen.${s}`);
    // Number and tomato (POMO-82); the accessible name says «30 coins».
    coinEl.replaceChildren(
      ...(coins === undefined
        ? []
        : [coinAmount(coins, t('header.coins', { n: coins }))]),
    );
    coinEl.title = t('tagesweg.coinsLabel');
  }

  function paint() {
    const shown: Screen = focus ? 'today' : current;
    for (const [s, el] of sections) el.hidden = s !== shown;
    for (const [s, a] of navLinks)
      if (s === shown) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    horizon.setAttribute('aria-pressed', String(shown === 'horizon'));
    settings.setAttribute('aria-pressed', String(shown === 'settings'));
    app.dataset.screen = shown;
    app.dataset.sub = String(shown === 'horizon' || shown === 'settings');
    coinEl.hidden = coins === undefined;
    if (focus) app.dataset.focus = 'on';
    else delete app.dataset.focus;
  }

  function go(screen: Screen) {
    if (location.hash !== `#/${screen}`) location.hash = `#/${screen}`;
    else show(screen);
  }

  function show(screen: Screen) {
    const changed = screen !== current;
    current = screen;
    paint();
    if (changed) globalThis.scrollTo?.(0, 0);
    for (const l of listeners) l(screen);
  }

  const onHash = () => show(parseRoute(location.hash));
  globalThis.addEventListener('hashchange', onHash);
  const offLocale = i18n.onChange(texts);
  texts();
  paint();

  return {
    slot: (s) => slots.get(s)!,
    go,
    get current() {
      return current;
    },
    setCoins(n) {
      coins = n;
      texts();
      paint();
    },
    setShop(visible) {
      navLinks.get('shop')!.hidden = !visible;
      if (!visible && current === 'shop') go('today');
    },
    setFocus(on) {
      if (on === focus) return;
      focus = on;
      // A round always happens on Today; afterwards the user is still there (route and screen agree).
      if (on && current !== 'today') go('today');
      paint();
      if (on) globalThis.scrollTo?.(0, 0);
    },
    onShow(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    destroy() {
      globalThis.removeEventListener('hashchange', onHash);
      offLocale();
    },
  };
}
