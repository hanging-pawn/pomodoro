import { describe, expect, it, vi } from 'vitest';
import { iconButton } from './icon-button';
import { ICONS } from './icons';

describe('iconButton', () => {
  it('uses the label as accessible name and hides the icon from assistive tech', () => {
    const b = iconButton({ icon: 'park', label: 'Park a thought' });
    expect(b.getAttribute('aria-label')).toBe('Park a thought');
    expect(b.title).toBe('Park a thought');
    const svg = b.querySelector('svg');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.querySelector('path')?.getAttribute('d')).toBe(ICONS.park);
    expect(b.textContent).toBe('');
  });

  it('exposes shortcut, toggle state and click', () => {
    const onClick = vi.fn();
    const b = iconButton({
      icon: 'theme',
      label: 'Dark mode',
      pressed: false,
      shortcut: 'P',
      onClick,
    });
    b.click();
    expect(onClick).toHaveBeenCalledOnce();
    expect(b.getAttribute('aria-pressed')).toBe('false');
    expect(b.getAttribute('aria-keyshortcuts')).toBe('P');
  });

  it('is a plain button without pressed', () => {
    expect(
      iconButton({ icon: 'close', label: 'Close' }).hasAttribute(
        'aria-pressed',
      ),
    ).toBe(false);
  });
});
