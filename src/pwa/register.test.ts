import { describe, expect, it } from 'vitest';
import { registerServiceWorker } from './register';

describe('registerServiceWorker (NFR-04)', () => {
  it('registers the worker file next to the page', async () => {
    const urls: string[] = [];
    const nav = {
      serviceWorker: { register: async (u: string) => void urls.push(u) },
    } as unknown as Navigator;
    expect(await registerServiceWorker(nav)).toBe(true);
    expect(urls).toEqual(['./sw.js']);
  });

  it('does nothing without service worker support', async () => {
    expect(await registerServiceWorker({} as Navigator)).toBe(false);
  });

  it('reports a failed registration instead of throwing', async () => {
    const nav = {
      serviceWorker: { register: () => Promise.reject(new Error('x')) },
    } as unknown as Navigator;
    expect(await registerServiceWorker(nav)).toBe(false);
  });
});
