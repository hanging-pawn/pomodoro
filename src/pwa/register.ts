export interface RegisterOptions {
  /** Source of `visibilitychange`; defaults to `document`. */
  doc?: Pick<Document, 'addEventListener' | 'visibilityState'>;
  /** Defaults to `location.reload()`. */
  reload?: () => void;
}

/**
 * Registers the service worker (NFR-04); a no-op where service workers are unavailable.
 *
 * Updates (POMO-84): an installed app on the iPhone often resumes instead of reloading, so it
 * kept running an old version (e.g. untranslated rewards). Each time the app comes to the front
 * it asks for a new worker; when a new worker takes over a page that already had one, the page
 * reloads once so the new code runs. All data lives in IndexedDB, so the reload loses nothing.
 */
export function registerServiceWorker(
  nav: Pick<Navigator, 'serviceWorker'> | undefined = globalThis.navigator,
  url = './sw.js',
  options: RegisterOptions = {},
): Promise<boolean> {
  if (!nav || !('serviceWorker' in nav) || !nav.serviceWorker)
    return Promise.resolve(false);
  const sw = nav.serviceWorker;
  const doc = options.doc ?? globalThis.document;
  const reload = options.reload ?? (() => globalThis.location.reload());
  // First install has no controller: taking control then must not reload.
  const hadController = !!sw.controller;
  let reloaded = false;
  sw.addEventListener?.('controllerchange', () => {
    if (!hadController || reloaded) return;
    reloaded = true;
    reload();
  });
  return sw.register(url).then(
    (reg) => {
      doc?.addEventListener('visibilitychange', () => {
        if (doc.visibilityState === 'visible')
          void reg?.update?.().catch(() => {});
      });
      return true;
    },
    () => false,
  );
}
