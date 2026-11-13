import { describe, expect, it } from 'vitest';
import { newEvent, type DomainEvent } from '../domain/events';
import { createI18n } from '../i18n/i18n';
import { createAlerts } from './alerts';
import { createTimer } from './controller';
import { mountTimer } from './view';

const MIN = 60_000;
const T0 = Date.UTC(2026, 10, 13, 9, 0, 0);
const flush = () => new Promise((r) => setTimeout(r, 0));

async function setup(mode: 'strict' | 'flexible') {
  const events: DomainEvent[] = [];
  if (mode === 'flexible')
    events.push(newEvent('settings.changed', { changes: { mode } }, T0 - 1));
  let now = T0;
  const timer = createTimer({
    log: {
      events: async () => [...events],
      append: async (...e) => void events.push(...e),
    },
    now: () => now,
  });
  const root = document.createElement('div');
  document.body.append(root);
  const i18n = createI18n({
    languages: ['en'],
    storage: undefined as unknown as Storage,
  });
  const sounds: number[] = [];
  mountTimer(root, i18n, timer, {
    tasks: async () => [{ id: 't1', title: 'Write report' }],
    getMode: async () => mode,
    setMode: async (m) =>
      void events.push(
        newEvent('settings.changed', { changes: { mode: m } }, now),
      ),
    alerts: createAlerts({ playSound: () => sounds.push(1) }),
  });
  await flush();
  return { root, timer, events, sounds, at: (t: number) => (now = t) };
}

const action = (root: HTMLElement, a: string) =>
  root.querySelector<HTMLElement>(`[data-action="${a}"]`);

describe('mountTimer', () => {
  it('starts a round with one click on Start (FR-102)', async () => {
    const { root, timer } = await setup('strict');
    action(root, 'start')!.click();
    await flush();
    expect(timer.view.phase).toBe('focus');
    expect(timer.view.taskId).toBe('t1');
  });

  it('strict mode shows Abort but no Pause control (FR-107)', async () => {
    const { root } = await setup('strict');
    action(root, 'start')!.click();
    await flush();
    expect(action(root, 'abort')).not.toBeNull();
    expect(action(root, 'pause')).toBeNull();
  });

  it('flexible mode shows Pause', async () => {
    const { root } = await setup('flexible');
    action(root, 'start')!.click();
    await flush();
    expect(action(root, 'pause')).not.toBeNull();
  });

  it('shows mm:ss · task in the tab title (FR-108) and sounds at the end (FR-104)', async () => {
    const { root, timer, at, sounds } = await setup('strict');
    action(root, 'start')!.click();
    await flush();
    at(T0 + 10 * MIN);
    await timer.refresh();
    expect(document.title).toBe('15:00 · Write report');
    at(T0 + 25 * MIN + 100);
    await timer.refresh();
    expect(sounds).toHaveLength(1);
    expect(root.querySelector('.timer__phase')?.textContent).toBe(
      'Short break',
    );
  });
});

describe('park key (FR-205)', () => {
  it('P focuses the field, text + Enter parks a typed note, timer keeps running', async () => {
    const { root, timer, events } = await setup('strict');
    action(root, 'start')!.click();
    await flush();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'p' }));
    const field = root.querySelector<HTMLInputElement>('input[name="park"]')!;
    expect(document.activeElement).toBe(field);
    field.value = 'Call dentist';
    root
      .querySelector('form.timer__park')!
      .dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    expect(timer.view.phase).toBe('focus');
    const parked = events.filter((e) => e.type === 'interruption.parked');
    expect(parked).toHaveLength(1);
    expect(parked[0]!.payload).toMatchObject({
      text: 'Call dentist',
      kind: 'internal',
    });
  });
});
