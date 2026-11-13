/** Registers the service worker (NFR-04); a no-op where service workers are unavailable. */
export function registerServiceWorker(
  nav: Pick<Navigator, 'serviceWorker'> | undefined = globalThis.navigator,
  url = './sw.js',
): Promise<boolean> {
  if (!nav || !('serviceWorker' in nav) || !nav.serviceWorker)
    return Promise.resolve(false);
  return nav.serviceWorker.register(url).then(
    () => true,
    () => false,
  );
}
