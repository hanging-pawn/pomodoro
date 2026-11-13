/** Theme choice (FR-601): follow the system, or force light or dark. */
export type ThemeChoice = 'system' | 'light' | 'dark';

export interface Theme {
  /** Current choice; `system` follows `prefers-color-scheme`. */
  readonly choice: ThemeChoice;
  /** Applies at once (no reload) and remembers the choice on this device. */
  set(choice: ThemeChoice): void;
}

const KEY = 'pomo-pomo.theme';
const CHOICES: readonly ThemeChoice[] = ['system', 'light', 'dark'];

/**
 * Applies the stored theme choice to `root` (normally <html>) through `data-theme`, which
 * src/ui/tokens.css reads. `system` removes the attribute so the media query decides.
 */
export function createTheme(
  root: HTMLElement = document.documentElement,
  storage: Pick<Storage, 'getItem' | 'setItem'> = globalThis.localStorage,
): Theme {
  const read = (): ThemeChoice => {
    try {
      const v = storage.getItem(KEY) as ThemeChoice | null;
      return v && CHOICES.includes(v) ? v : 'system';
    } catch {
      return 'system';
    }
  };
  let choice = read();
  const apply = () => {
    if (choice === 'system') delete root.dataset.theme;
    else root.dataset.theme = choice;
  };
  apply();
  return {
    get choice() {
      return choice;
    },
    set(next) {
      choice = next;
      apply();
      try {
        storage.setItem(KEY, next);
      } catch {
        // Storage blocked: the choice still applies for this visit.
      }
    },
  };
}
