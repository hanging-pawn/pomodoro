import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createI18n } from '../i18n/i18n';
import { catalogs } from '../i18n/catalogs';
import { SCREENS } from '../shell/shell';
import { runTour } from './tour';
import { TOURS } from './tour-steps';
import { createTours, TOUR_SEEN } from './tours';

const i18n = () => createI18n({ languages: ['de'], storage: localStorage });
const q = (action: string) =>
  document.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)!;
const tour = () => document.querySelector('[data-role="tour"]');
const title = () => document.querySelector('.tour__title')?.textContent;

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = `
    <section class="app-screen app-screen--today">
      <ul><li data-role="task-row">A</li></ul>
      <section data-role="next">Next</section>
    </section>`;
});
afterEach(() => tour()?.remove());

describe('tour (POMO-86)', () => {
  it('has a tour for every screen, starting with what the screen is for', () => {
    for (const s of SCREENS) {
      expect(TOURS[s].length).toBeGreaterThanOrEqual(3);
      expect(TOURS[s][0]!.target).toBeUndefined();
    }
  });

  it('every tour text exists in DE, EN and IT', () => {
    for (const steps of Object.values(TOURS))
      for (const step of steps)
        for (const cat of Object.values(catalogs)) {
          expect(cat[step.title]).toBeTruthy();
          expect(cat[step.body]).toBeTruthy();
        }
  });

  it('walks forward and back, skips missing elements and ends with «Fertig»', async () => {
    const done = runTour(TOURS.today, i18n());
    expect(title()).toBe('Heute');
    expect(document.querySelector('.tour__count')?.textContent).toBe('1 von 3');
    q('tour-next').click();
    expect(title()).toBe('Deine Aufgaben auf dem Weg');
    q('tour-back').click();
    expect(title()).toBe('Heute');
    q('tour-next').click();
    q('tour-next').click();
    // No reward row, no header, no nav here: the next round is the last step.
    expect(title()).toBe('Die nächste Runde');
    expect(q('tour-next').textContent).toBe('Fertig');
    q('tour-next').click();
    expect(await done).toBe('done');
    expect(tour()).toBeNull();
  });

  it('Escape skips the tour', async () => {
    const done = runTour(TOURS.today, i18n());
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(await done).toBe('skipped');
    expect(tour()).toBeNull();
  });

  it('starts once by itself on the first visit, then only from the info button', async () => {
    const tours = createTours(i18n(), { delayMs: 0 });
    tours.shown('today'); // before intro and login: nothing yet
    await new Promise((r) => setTimeout(r, 5));
    expect(tour()).toBeNull();
    tours.enableAuto('today');
    await new Promise((r) => setTimeout(r, 5));
    expect(tour()).not.toBeNull();
    q('tour-skip').click();
    await new Promise((r) => setTimeout(r, 0));
    expect(localStorage.getItem(TOUR_SEEN + 'today')).toBe('1');
    tours.shown('today');
    await new Promise((r) => setTimeout(r, 5));
    expect(tour()).toBeNull();
    void tours.start('today');
    expect(tour()).not.toBeNull();
  });

  it('does not start by itself while busy (round running, dialog open)', async () => {
    const tours = createTours(i18n(), { delayMs: 0, busy: () => true });
    tours.enableAuto('today');
    await new Promise((r) => setTimeout(r, 5));
    expect(tour()).toBeNull();
  });
});
