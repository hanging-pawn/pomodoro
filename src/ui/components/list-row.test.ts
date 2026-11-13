import { describe, expect, it, vi } from 'vitest';
import { listRow } from './list-row';

describe('listRow', () => {
  it('shows title and meta as a static row', () => {
    const li = listRow({ title: 'Write report', meta: '1 of 3 rounds' });
    expect(li.tagName).toBe('LI');
    expect(li.querySelector('.ui-row__title')?.textContent).toBe(
      'Write report',
    );
    expect(li.querySelector('.ui-row__meta')?.textContent).toBe(
      '1 of 3 rounds',
    );
    expect(li.querySelector('button')).toBeNull();
  });

  it('becomes one selectable button when onSelect is given', () => {
    const onSelect = vi.fn();
    const li = listRow({ title: 'Read', onSelect });
    const b = li.querySelector('button')!;
    expect(b.type).toBe('button');
    expect(b.textContent).toBe('Read');
    b.click();
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it('places trailing content outside the select button and sets the tone', () => {
    const coins = document.createElement('strong');
    const li = listRow({
      title: 'Coffee outside',
      meta: 'about 10:50',
      tone: 'reward',
      trailing: coins,
      onSelect: () => {},
    });
    expect(li.className).toBe('ui-row ui-row--reward');
    expect(li.querySelector('.ui-row__trailing')?.firstChild).toBe(coins);
    expect(li.querySelector('button')?.contains(coins)).toBe(false);
  });
});
