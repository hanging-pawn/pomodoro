import { APP_NAME } from './config';
import { LOCALES, type I18n, type Locale } from './i18n/i18n';

/** Mounts the start page; re-renders in place when the language changes. Returns an unmount function. */
export function mountApp(root: HTMLElement, i18n: I18n): () => void {
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
    root.replaceChildren(main);
  };

  render();
  return i18n.onChange(render);
}
