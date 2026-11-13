import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createToaster } from './toast';

describe('createToaster', () => {
  let root: HTMLElement;
  beforeEach(() => {
    vi.useFakeTimers();
    root = document.createElement('div');
  });
  afterEach(() => vi.useRealTimers());

  const region = () => root.querySelector<HTMLElement>('.ui-toast-region')!;

  it('announces in a polite live region and hides after the duration', () => {
    const toaster = createToaster(root, 1000);
    expect(region().getAttribute('role')).toBe('status');
    expect(region().getAttribute('aria-live')).toBe('polite');
    toaster.show('Thought parked');
    expect(region().textContent).toBe('Thought parked');
    vi.advanceTimersByTime(1000);
    expect(region().textContent).toBe('');
  });

  it('shows one toast at a time, in order', () => {
    const toaster = createToaster(root, 1000);
    toaster.show('first');
    toaster.show('second');
    expect(region().textContent).toBe('first');
    vi.advanceTimersByTime(1000);
    expect(region().textContent).toBe('second');
  });

  it('runs the action and closes', () => {
    const run = vi.fn();
    const toaster = createToaster(root);
    toaster.show('Task deleted', { action: { label: 'Undo', run } });
    const b = region().querySelector('button')!;
    expect(b.textContent).toBe('Undo');
    b.click();
    expect(run).toHaveBeenCalledOnce();
    expect(region().textContent).toBe('');
  });

  it('clear drops the visible toast and the queue', () => {
    const toaster = createToaster(root, 1000);
    toaster.show('a');
    toaster.show('b');
    toaster.clear();
    vi.advanceTimersByTime(5000);
    expect(region().textContent).toBe('');
    toaster.show('c');
    expect(region().textContent).toBe('c');
  });
});
