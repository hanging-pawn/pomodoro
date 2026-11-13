import { APP_NAME, APP_VERSION } from '../config';
import type { GamificationLevel, Mode } from '../domain/events';
import type { AppState } from '../domain/state';
import { LOCALES, type I18n, type Locale, type MessageKey } from '../i18n/i18n';
import type { Shop } from '../rewards/shop';
import { DATA_CHANGED } from '../tasks/events';
import type { Theme, ThemeChoice } from '../ui/theme';

export interface SettingsDeps {
  state(): Promise<AppState>;
  setMode(mode: Mode): Promise<void>;
  setDigitsAlways(on: boolean): Promise<void>;
  shop: Pick<Shop, 'setLevel' | 'setStreak'>;
  /** Light/dark switch (FR-601); omitted = no control. */
  theme?: Theme;
}

const THEMES: readonly ThemeChoice[] = ['system', 'light', 'dark'];
const MODES: readonly Mode[] = ['strict', 'flexible'];
const LEVELS: readonly GamificationLevel[] = ['off', 'subtle', 'full'];

/**
 * Settings screen (FR-610): preferences as grouped lists, the way iPhone settings look —
 * focus (mode, digits), rewards (level, streak), language and appearance. Setup panels (data,
 * sync, beta) mount below it in their own slots and may stay technical (NFR-18).
 */
export function mountSettings(
  root: HTMLElement,
  i18n: I18n,
  deps: SettingsDeps,
): () => void {
  const t = (key: string) => i18n.t(key as MessageKey);
  let state: AppState | undefined;
  const run = (p: Promise<unknown>) =>
    p
      .then(() => document.dispatchEvent(new Event(DATA_CHANGED)))
      .catch(() => {});

  const group = (titleKey: string, rows: Node[], hintKey?: string) => {
    const section = document.createElement('section');
    section.className = 'set-group';
    const h = document.createElement('h2');
    h.className = 'set-group__title';
    h.textContent = t(titleKey);
    const list = document.createElement('div');
    list.className = 'set-list';
    list.append(...rows);
    section.append(h, list);
    if (hintKey) {
      const p = document.createElement('p');
      p.className = 'set-group__hint';
      p.textContent = t(hintKey);
      section.append(p);
    }
    return section;
  };

  const row = (id: string, labelText: string, control: HTMLElement) => {
    const div = document.createElement('div');
    div.className = 'set-row';
    const label = document.createElement('label');
    label.htmlFor = control.id = id;
    label.textContent = labelText;
    div.append(label, control);
    return div;
  };

  const select = <T extends string>(
    name: string,
    options: readonly T[],
    labelOf: (v: T) => string,
    value: T,
    onChange: (v: T) => void,
  ) => {
    const s = document.createElement('select');
    s.name = name;
    s.className = 'set-select';
    for (const o of options) s.append(new Option(labelOf(o), o));
    s.value = value;
    s.addEventListener('change', () => onChange(s.value as T));
    return s;
  };

  const toggle = (
    name: string,
    on: boolean,
    onChange: (v: boolean) => void,
  ) => {
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.name = name;
    box.className = 'set-switch';
    box.setAttribute('role', 'switch');
    box.checked = on;
    box.addEventListener('change', () => onChange(box.checked));
    return box;
  };

  const number = (
    name: string,
    value: number,
    min: number,
    onChange: (n: number) => void,
  ) => {
    const i = document.createElement('input');
    i.type = 'number';
    i.inputMode = 'numeric';
    i.name = name;
    i.className = 'set-number';
    i.min = String(min);
    i.step = '1';
    i.value = String(value);
    i.addEventListener('change', () => {
      const n = Math.floor(Number(i.value));
      if (Number.isFinite(n) && n >= min) onChange(n);
    });
    return i;
  };

  function render() {
    document.title = document.title || APP_NAME;
    document.documentElement.lang = i18n.locale;
    if (!state) return;
    const s = state.settings;
    const sections: Node[] = [];

    sections.push(
      group(
        'settings.group.focus',
        [
          row(
            'set-mode',
            t('timer.mode'),
            select(
              'mode',
              MODES,
              (m) => t(`settings.mode.${m}`),
              s.mode,
              (m) => run(deps.setMode(m)),
            ),
          ),
          row(
            'set-digits',
            t('settings.digitsAlways'),
            toggle('digits-always', !!s.digitsAlways, (v) =>
              run(deps.setDigitsAlways(v)),
            ),
          ),
        ],
        `settings.mode.hint.${s.mode}`,
      ),
    );

    const rewardRows: Node[] = [
      row(
        'set-level',
        t('rewards.level'),
        select(
          'gamification',
          LEVELS,
          (l) => t(`rewards.level.${l}`),
          s.gamification,
          (l) => run(deps.shop.setLevel(l)),
        ),
      ),
    ];
    if (s.gamification === 'full') {
      const streak = toggle('streak-enabled', s.streakEnabled, (v) =>
        run(deps.shop.setStreak({ streakEnabled: v })),
      );
      rewardRows.push(row('set-streak', t('streak.enabled'), streak));
      if (s.streakEnabled)
        rewardRows.push(
          row(
            'set-goal',
            t('streak.goal'),
            number('streak-goal', s.dailyGoal, 1, (n) =>
              run(deps.shop.setStreak({ dailyGoal: n })),
            ),
          ),
          row(
            'set-grace',
            t('streak.grace'),
            number('streak-grace', s.streakGraceDays, 0, (n) =>
              run(deps.shop.setStreak({ streakGraceDays: n })),
            ),
          ),
        );
    }
    sections.push(
      group(
        'settings.group.rewards',
        rewardRows,
        `settings.level.hint.${s.gamification}`,
      ),
    );

    const lookRows: Node[] = [
      row(
        'language',
        t('language.label'),
        select(
          'language',
          LOCALES,
          (l) => t(`language.${l}`),
          i18n.locale,
          (l) => i18n.setLocale(l as Locale),
        ),
      ),
    ];
    const { theme } = deps;
    if (theme)
      lookRows.push(
        row(
          'theme',
          t('theme.label'),
          select(
            'theme',
            THEMES,
            (c) => t(`theme.${c}`),
            theme.choice,
            (c) => theme.set(c),
          ),
        ),
      );
    sections.push(group('settings.group.look', lookRows));

    const about = document.createElement('p');
    about.className = 'set-about';
    about.textContent = t('settings.about')
      .replaceAll('{app}', APP_NAME)
      .replaceAll('{tagline}', t('app.tagline'))
      .replaceAll('{version}', APP_VERSION);
    sections.push(about);
    // Setup panels (data, sync, beta) follow in their own slots under this heading.
    const setup = document.createElement('h2');
    setup.className = 'set-group__title set-group__title--setup';
    setup.textContent = t('settings.group.setup');
    sections.push(setup);

    root.replaceChildren(...sections);
  }

  const reload = () =>
    deps
      .state()
      .then((st) => {
        state = st;
        render();
      })
      .catch(() => {});
  document.addEventListener(DATA_CHANGED, reload);
  const offLocale = i18n.onChange(render);
  void reload();
  return () => {
    offLocale();
    document.removeEventListener(DATA_CHANGED, reload);
  };
}
