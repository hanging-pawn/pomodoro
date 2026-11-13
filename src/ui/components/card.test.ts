import { describe, expect, it } from 'vitest';
import { card } from './card';

describe('card', () => {
  it('names the section by its heading', () => {
    const p = document.createElement('p');
    const c = card({ title: 'Today', children: [p] });
    const h = c.querySelector('h2')!;
    expect(h.textContent).toBe('Today');
    expect(c.getAttribute('aria-labelledby')).toBe(h.id);
    expect(c.lastChild).toBe(p);
  });

  it('works without title and supports the highlight tone', () => {
    const c = card({ tone: 'highlight' });
    expect(c.querySelector('h2')).toBeNull();
    expect(c.hasAttribute('aria-labelledby')).toBe(false);
    expect(c.className).toBe('ui-card ui-card--highlight');
  });

  it('gives each card a unique heading id', () => {
    const a = card({ title: 'A' }).querySelector('h2')!.id;
    const b = card({ title: 'B' }).querySelector('h2')!.id;
    expect(a).not.toBe(b);
  });
});
