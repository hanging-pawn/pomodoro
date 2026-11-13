// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { coinAmount, withCoins } from './coin';

describe('coin amount (POMO-82)', () => {
  it('shows the number and a tomato, and names the amount for screen readers', () => {
    const el = coinAmount(40, '40 coins');
    expect(el.textContent).toBe('40');
    expect(el.getAttribute('role')).toBe('img');
    expect(el.getAttribute('aria-label')).toBe('40 coins');
    expect(el.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('puts the amount where the template says {c}', () => {
    const host = document.createElement('p');
    host.append(withCoins('Balance: {c} today', 7, '7 coins'));
    expect(host.textContent).toBe('Balance: 7 today');
    expect(host.querySelector('[aria-label="7 coins"]')).not.toBeNull();
  });

  it('no word «coins» is left in a visible amount template', async () => {
    const { catalogs } = await import('../../i18n/catalogs');
    for (const cat of Object.values(catalogs))
      for (const key of [
        'rewards.balance',
        'tagesweg.toGo',
        'tagesweg.ring',
        'tagesweg.ringNext',
        'tagesweg.ringBalance',
      ] as const) {
        expect(cat[key]).toContain('{c}');
        expect(cat[key]).not.toMatch(/coins|Münzen|monete/);
      }
  });
});
