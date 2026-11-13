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

  it('reloads once when a new worker takes over a controlled page (POMO-84)', async () => {
    const sw = new EventTarget() as EventTarget & Record<string, unknown>;
    sw.controller = {};
    let updates = 0;
    sw.register = async () => ({ update: async () => void updates++ });
    const doc = new EventTarget() as EventTarget & { visibilityState: string };
    doc.visibilityState = 'visible';
    let reloads = 0;
    await registerServiceWorker(
      { serviceWorker: sw } as unknown as Navigator,
      './sw.js',
      { doc: doc as unknown as Document, reload: () => void reloads++ },
    );
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(updates).toBe(1);
    sw.dispatchEvent(new Event('controllerchange'));
    sw.dispatchEvent(new Event('controllerchange'));
    expect(reloads).toBe(1);
  });

  it('does not reload on the very first install', async () => {
    const sw = new EventTarget() as EventTarget & Record<string, unknown>;
    sw.controller = null;
    sw.register = async () => ({});
    let reloads = 0;
    await registerServiceWorker(
      { serviceWorker: sw } as unknown as Navigator,
      './sw.js',
      {
        doc: new EventTarget() as unknown as Document,
        reload: () => void reloads++,
      },
    );
    sw.dispatchEvent(new Event('controllerchange'));
    expect(reloads).toBe(0);
  });
});
