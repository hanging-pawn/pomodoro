import { beforeEach, describe, expect, it } from 'vitest';
import { createTheme } from './theme';

function memory() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  };
}

describe('createTheme', () => {
  let root: HTMLElement;
  beforeEach(() => {
    root = document.createElement('html');
  });

  it('follows the system by default (no data-theme)', () => {
    const theme = createTheme(root, memory());
    expect(theme.choice).toBe('system');
    expect(root.dataset.theme).toBeUndefined();
  });

  it('switches without reload and back to system', () => {
    const theme = createTheme(root, memory());
    theme.set('dark');
    expect(root.dataset.theme).toBe('dark');
    theme.set('light');
    expect(root.dataset.theme).toBe('light');
    theme.set('system');
    expect(root.dataset.theme).toBeUndefined();
  });

  it('remembers the choice on the device', () => {
    const storage = memory();
    createTheme(root, storage).set('dark');
    const again = createTheme(document.createElement('html'), storage);
    expect(again.choice).toBe('dark');
  });

  it('ignores an unknown stored value and blocked storage', () => {
    const storage = memory();
    storage.setItem('pomo-pomo.theme', 'neon');
    expect(createTheme(root, storage).choice).toBe('system');
    const blocked = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    const theme = createTheme(root, blocked);
    theme.set('dark');
    expect(root.dataset.theme).toBe('dark');
  });
});
