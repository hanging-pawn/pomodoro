import { afterEach, describe, expect, it } from 'vitest';
import { newEvent, type DomainEvent } from '../domain/events';
import { deriveState } from '../domain/state';
import { createI18n } from '../i18n/i18n';
import { createShop } from '../rewards/shop';
import { createTheme } from '../ui/theme';
import { mountSettings } from './view';

const flush = () => new Promise((r) => setTimeout(r, 0));
const memory = (): Storage => {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
    key: () => null,
    length: 0,
  };
};
const offs: (() => void)[] = [];
afterEach(() => offs.splice(0).forEach((f) => f()));

async function setup(lang = 'en', extra: DomainEvent[] = []) {
  const events: DomainEvent[] = [...extra];
  const log = {
    events: async () => [...events],
    append: async (...e: DomainEvent[]) => void events.push(...e),
  };
  const html = document.createElement('div');
  const theme = createTheme(html, memory());
  const i18n = createI18n({ languages: [lang], storage: memory() });
  const root = document.createElement('div');
  offs.push(
    mountSettings(root, i18n, {
      theme,
      state: async () => deriveState(events),
      setMode: (mode) =>
        log.append(newEvent('settings.changed', { changes: { mode } })),
      setDigitsAlways: (digitsAlways) =>
        log.append(newEvent('settings.changed', { changes: { digitsAlways } })),
      shop: createShop({ log }),
    }),
  );
  await flush();
  const change = async (name: string, value: string | boolean) => {
    const el = root.querySelector<HTMLInputElement>(`[name="${name}"]`)!;
    if (typeof value === 'boolean') el.checked = value;
    else el.value = value;
    el.dispatchEvent(new Event('change'));
    await flush();
    await flush();
  };
  return { root, events, html, i18n, change };
}

const groups = (root: HTMLElement) =>
  [...root.querySelectorAll('.set-group__title')].map((h) => h.textContent);

describe('mountSettings (FR-610)', () => {
  it('groups focus, rewards, language and appearance, then the setup heading', async () => {
    const { root } = await setup('de');
    expect(groups(root)).toEqual([
      'Fokusrunden',
      'Belohnungen',
      'Sprache und Darstellung',
      'Daten und Geräte',
    ]);
    expect(root.querySelector('label[for="theme"]')?.textContent).toBe(
      'Darstellung',
    );
  });

  it('switches the language without reload', async () => {
    const { root } = await setup('it');
    await (async () => {
      const s = root.querySelector<HTMLSelectElement>(
        'select[name="language"]',
      )!;
      s.value = 'en';
      s.dispatchEvent(new Event('change'));
    })();
    expect(groups(root)[0]).toBe('Focus rounds');
    expect(document.documentElement.lang).toBe('en');
  });

  it('switches light and dark without reload (FR-601)', async () => {
    const { change, html } = await setup();
    await change('theme', 'dark');
    expect(html.dataset.theme).toBe('dark');
    await change('theme', 'system');
    expect(html.dataset.theme).toBeUndefined();
  });

  it('sets the mode strict or flexible (FR-107) and digits always (FR-606)', async () => {
    const { change, events, root } = await setup();
    await change('mode', 'flexible');
    expect(deriveState(events).settings.mode).toBe('flexible');
    expect(root.querySelector('.set-group__hint')?.textContent).toContain(
      'pause',
    );
    await change('digits-always', true);
    expect(deriveState(events).settings.digitsAlways).toBe(true);
  });

  it('streak settings at level full: off switch and grace days (FR-404)', async () => {
    const { change, events, root } = await setup('en', [
      newEvent('settings.changed', { changes: { gamification: 'full' } }, 1),
    ]);
    await change('streak-grace', '2');
    expect(deriveState(events).settings.streakGraceDays).toBe(2);
    await change('streak-enabled', false);
    expect(deriveState(events).settings.streakEnabled).toBe(false);
    expect(root.querySelector('[name="streak-grace"]')).toBeNull();
  });

  it('level off is chosen here and hides the streak rows (FR-405)', async () => {
    const { change, events, root } = await setup('en', [
      newEvent('settings.changed', { changes: { gamification: 'full' } }, 1),
    ]);
    await change('gamification', 'off');
    expect(deriveState(events).settings.gamification).toBe('off');
    expect(root.querySelector('[name="streak-enabled"]')).toBeNull();
  });
});
