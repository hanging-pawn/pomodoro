import { describe, expect, it } from 'vitest';
import { progressBar } from './progress-bar';

describe('progressBar', () => {
  it('exposes progressbar semantics and fills proportionally', () => {
    const { element } = progressBar({
      label: "Today's budget",
      value: 6,
      max: 8,
      valueText: '6 of 8',
    });
    expect(element.getAttribute('role')).toBe('progressbar');
    expect(element.getAttribute('aria-label')).toBe("Today's budget");
    expect(element.getAttribute('aria-valuenow')).toBe('6');
    expect(element.getAttribute('aria-valuemax')).toBe('8');
    expect(element.getAttribute('aria-valuetext')).toBe('6 of 8');
    expect((element.firstChild as HTMLElement).style.width).toBe('75%');
    expect(element.hasAttribute('data-over')).toBe(false);
  });

  it('clamps and marks over budget (planned 10, budget 8)', () => {
    const bar = progressBar({ label: 'Budget', value: 10, max: 8 });
    expect(bar.element.getAttribute('aria-valuenow')).toBe('8');
    expect(bar.element.hasAttribute('data-over')).toBe(true);
    expect((bar.element.firstChild as HTMLElement).style.width).toBe('100%');
  });

  it('updates in place and handles an empty budget', () => {
    const bar = progressBar({
      label: 'Budget',
      value: 1,
      max: 4,
      valueText: 'x',
    });
    bar.set(0, 0);
    expect(bar.element.getAttribute('aria-valuenow')).toBe('0');
    expect(bar.element.hasAttribute('aria-valuetext')).toBe(false);
    expect((bar.element.firstChild as HTMLElement).style.width).toBe('0%');
    bar.set(-3, 4);
    expect(bar.element.getAttribute('aria-valuenow')).toBe('0');
  });
});
