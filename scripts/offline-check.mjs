/* global console, process */
// NFR-04 check in the real browser: the app is installable (no installability errors reported by
// Chrome, the criteria Lighthouse «installable» uses) and, with the network switched off, loads
// from the service worker and the timer runs. Needs `npm run build` first.
// Usage: node scripts/offline-check.mjs
import { defaultSeed, launch, seedScript, sleep } from './cdp.mjs';

const { send, evaluate, url, stop } = await launch({
  port: 9335,
  appPort: 4175,
});
try {
  await send('Page.enable');
  await send('Page.navigate', { url });
  await sleep(1500);
  await evaluate(seedScript(defaultSeed()));

  let controlled = false;
  for (let i = 0; i < 50 && !controlled; i++) {
    controlled = await evaluate(
      `navigator.serviceWorker.ready.then(() => !!navigator.serviceWorker.controller)`,
    );
    if (!controlled) await sleep(200);
  }
  const cached = await evaluate(
    `caches.keys().then(async (k) => (await Promise.all(k.map(async (n) => (await (await caches.open(n)).keys()).length))).reduce((a, b) => a + b, 0))`,
  );
  const install = await send('Page.getInstallabilityErrors');
  const errors = install.result?.installabilityErrors ?? [];

  await send('Network.enable');
  await send('Network.emulateNetworkConditions', {
    offline: true,
    latency: 0,
    downloadThroughput: 0,
    uploadThroughput: 0,
  });
  await send('Page.reload');
  await sleep(2000);
  const box = await evaluate(`(() => {
    const b = document.querySelector('[data-action="start"]');
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, online: navigator.onLine };
  })()`);
  let running = false;
  let remainingBefore = '';
  if (box) {
    for (const type of ['mousePressed', 'mouseReleased'])
      await send('Input.dispatchMouseEvent', {
        type,
        x: box.x,
        y: box.y,
        button: 'left',
        clickCount: 1,
      });
    await sleep(500);
    running = await evaluate(
      `!!document.querySelector('[data-action="abort"]')`,
    );
    remainingBefore = await evaluate(`document.title`);
    await sleep(2500);
  }
  const titleAfter = await evaluate(`document.title`);
  const ticking = running && titleAfter !== remainingBefore;

  console.log(
    JSON.stringify({
      controlled,
      cachedFiles: cached,
      installabilityErrors: errors,
      offlineLoaded: !!box,
      navigatorOnLine: box?.online,
      running,
      titleBefore: remainingBefore,
      titleAfter,
    }),
  );
  const ok =
    controlled &&
    cached > 0 &&
    errors.length === 0 &&
    !!box &&
    running &&
    ticking;
  console.log(
    `NFR-04: installable errors ${errors.length}, offline load ${!!box}, timer running ${running}, counting ${ticking}: ${ok ? 'OK' : 'FAIL'}`,
  );
  stop();
  process.exit(ok ? 0 : 1);
} catch (e) {
  console.error(e);
  stop();
  process.exit(1);
}
