import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

type Handler = (event: {
  waitUntil(p: Promise<unknown>): void;
  respondWith(p: Promise<Response>): void;
  request?: Request;
}) => void;

/** Runs src/pwa/sw.js against an in-memory Cache Storage shared with another app on the origin. */
function loadWorker(
  cacheNames: string[],
  network: (req: Request) => Promise<Response> = async () =>
    new Response('network'),
) {
  const stores = new Map<string, Map<string, Response>>(
    cacheNames.map((n) => [n, new Map()]),
  );
  const cacheFor = (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name)!;
    return {
      addAll: async () => {},
      put: async (req: Request, res: Response) => void store.set(req.url, res),
      match: async (req: Request) => store.get(req.url),
    };
  };
  const caches = {
    keys: async () => [...stores.keys()],
    delete: async (n: string) => stores.delete(n),
    open: async (n: string) => cacheFor(n),
    match: async (req: Request) => {
      for (const s of stores.values())
        if (s.has(req.url)) return s.get(req.url);
      return undefined;
    },
  };
  const handlers: Record<string, Handler> = {};
  const self = {
    location: { origin: 'https://hanging-pawn.github.io' },
    addEventListener: (type: string, fn: Handler) => (handlers[type] = fn),
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
  };
  const source = readFileSync('src/pwa/sw.js', 'utf8')
    .replace('__VERSION__', 'v2')
    .replace('__PRECACHE__', '[]');
  new Function('self', 'caches', 'fetch', source)(self, caches, network);
  const dispatch = async (
    type: string,
    request?: Request | { url: string; method: string; mode: string },
  ) => {
    let done: Promise<unknown> = Promise.resolve();
    let response: Promise<Response> | undefined;
    handlers[type]!({
      request: request as Request,
      waitUntil: (p) => (done = p),
      respondWith: (p) => (response = p),
    });
    await done;
    return response;
  };
  return { stores, dispatch };
}

describe('service worker (NFR-04)', () => {
  it('activate deletes only older pomo-pomo caches, not other apps on the shared origin', async () => {
    const { stores, dispatch } = loadWorker([
      'pomo-pomo-v1',
      'pomo-pomo-v2',
      'other-app-shell',
      'workbox-precache-v2',
    ]);
    await dispatch('activate');
    expect([...stores.keys()].sort()).toEqual([
      'other-app-shell',
      'pomo-pomo-v2',
      'workbox-precache-v2',
    ]);
  });

  it('answers only from its own cache, never from another app’s cache', async () => {
    const { stores, dispatch } = loadWorker([
      'pomo-pomo-v2',
      'other-app-shell',
    ]);
    const url = 'https://hanging-pawn.github.io/pomodoro/index.html';
    stores.get('other-app-shell')!.set(url, new Response('foreign'));
    const res = await dispatch('fetch', new Request(url));
    expect(await res!.text()).toBe('network');
  });
  const page = (url: string) => ({ url, method: 'GET', mode: 'navigate' });
  const INDEX = 'https://hanging-pawn.github.io/pomodoro/';
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it('opens the newest page when online and refreshes the cached copy', async () => {
    const { stores, dispatch } = loadWorker(['pomo-pomo-v2']);
    stores.get('pomo-pomo-v2')!.set(INDEX, new Response('old page'));
    const res = await dispatch('fetch', page(INDEX));
    expect(await res!.text()).toBe('network');
    await flush();
    expect(await stores.get('pomo-pomo-v2')!.get(INDEX)!.text()).toBe(
      'network',
    );
  });

  it('opens the cached page when offline', async () => {
    const { stores, dispatch } = loadWorker(['pomo-pomo-v2'], () =>
      Promise.reject(new TypeError('offline')),
    );
    stores.get('pomo-pomo-v2')!.set(INDEX, new Response('cached page'));
    const res = await dispatch('fetch', page(INDEX));
    expect(await res!.text()).toBe('cached page');
  });

  it('keeps hashed assets cache-first without a network request', async () => {
    let requests = 0;
    const { stores, dispatch } = loadWorker(['pomo-pomo-v2'], async () => {
      requests++;
      return new Response('network');
    });
    const asset =
      'https://hanging-pawn.github.io/pomodoro/assets/index-Czfhtuzv.js';
    stores.get('pomo-pomo-v2')!.set(asset, new Response('cached asset'));
    const res = await dispatch('fetch', new Request(asset));
    expect(await res!.text()).toBe('cached asset');
    expect(requests).toBe(0);
  });
});
