import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

type Handler = (event: {
  waitUntil(p: Promise<unknown>): void;
  respondWith(p: Promise<Response>): void;
  request?: Request;
}) => void;

/** Runs src/pwa/sw.js against an in-memory Cache Storage shared with another app on the origin. */
function loadWorker(cacheNames: string[]) {
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
  new Function('self', 'caches', 'fetch', source)(
    self,
    caches,
    async () => new Response('network'),
  );
  const dispatch = async (type: string, request?: Request) => {
    let done: Promise<unknown> = Promise.resolve();
    let response: Promise<Response> | undefined;
    handlers[type]!({
      request,
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
});
