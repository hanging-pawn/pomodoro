import { describe, expect, it, vi } from 'vitest';
import { button } from './button';

describe('button', () => {
  it('renders the given label as a non-submitting button, secondary by default', () => {
    const b = button({ label: 'Start' });
    expect(b.textContent).toBe('Start');
    expect(b.type).toBe('button');
    expect(b.className).toBe('ui-button ui-button--secondary');
  });

  it('applies variant, action hook and click handler', () => {
    const onClick = vi.fn();
    const b = button({
      label: 'Go',
      variant: 'primary',
      action: 'start',
      onClick,
    });
    b.click();
    expect(onClick).toHaveBeenCalledOnce();
    expect(b.classList).toContain('ui-button--primary');
    expect(b.dataset.action).toBe('start');
  });

  it('does not fire when disabled', () => {
    const onClick = vi.fn();
    const b = button({ label: 'Go', disabled: true, onClick });
    b.click();
    expect(onClick).not.toHaveBeenCalled();
  });

  it('can be a submit button', () => {
    expect(button({ label: 'Save', type: 'submit' }).type).toBe('submit');
  });
});
