import { APP_NAME } from './config';
import { LOCALES, type I18n, type Locale } from './i18n/i18n';
import type { Theme, ThemeChoice } from './ui/theme';

export interface AppOptions {
  /** Light/dark switch (FR-601); omitted = no control. */
  theme?: Theme;
  /** Setting «digits always» (FR-606); omitted = no control. */
  digitsAlways?: {
    get(): Promise<boolean>;
    set(value: boolean): Promise<void>;
  };
}

const THEMES: readonly ThemeChoice[] = ['system', 'light', 'dark'];

/**
 * Mounts the start page with the device settings (language, appearance, digits); re-renders
 * in place when the language changes. Returns an unmount function.
 */
export function mountApp(
  root: HTMLElement,
  i18n: I18n,
  options: AppOptions = {},
): () => void {
  let digits = false;
  const render = () => {
    const { t, locale } = i18n;
    document.title = APP_NAME;
    document.documentElement.lang = locale;

    const main = document.createElement('main');
    const h1 = document.createElement('h1');
    h1.textContent = APP_NAME;
    const tagline = document.createElement('p');
    tagline.textContent = t('app.tagline');

    const label = document.createElement('label');
    label.htmlFor = 'language';
    label.textContent = t('language.label');
    const select = document.createElement('select');
    select.id = 'language';
    for (const l of LOCALES) {
      const option = document.createElement('option');
      option.value = l;
      option.textContent = t(`language.${l}`);
      select.append(option);
    }
    select.value = locale;
    select.addEventListener('change', () =>
      i18n.setLocale(select.value as Locale),
    );

    main.append(h1, tagline, label, select);

    const { theme, digitsAlways } = options;
    if (theme) {
      const themeLabel = document.createElement('label');
      themeLabel.htmlFor = 'theme';
      themeLabel.textContent = t('theme.label');
      const themeSelect = document.createElement('select');
      themeSelect.id = 'theme';
      for (const c of THEMES)
        themeSelect.append(new Option(t(`theme.${c}`), c));
      themeSelect.value = theme.choice;
      themeSelect.addEventListener('change', () =>
        theme.set(themeSelect.value as ThemeChoice),
      );
      main.append(themeLabel, themeSelect);
    }
    if (digitsAlways) {
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.id = 'digits-always';
      box.checked = digits;
      box.addEventListener('change', () => {
        digits = box.checked;
        void digitsAlways.set(digits).catch(() => {});
      });
      const boxLabel = document.createElement('label');
      boxLabel.htmlFor = box.id;
      boxLabel.textContent = t('settings.digitsAlways');
      main.append(box, boxLabel);
    }
    root.replaceChildren(main);
  };

  render();
  if (options.digitsAlways)
    void options.digitsAlways
      .get()
      .then((v) => {
        digits = v;
        render();
      })
      .catch(() => {});
  return i18n.onChange(render);
}
