/* global console, process, fetch, URL */
// FR-104 check in the real, visible Chrome: with the app tab in the background (a second tab
// in front, document.visibilityState === 'hidden'), the end-of-round notification is raised at
// most 3 s after the computed end, in 3 runs. The round is shortened to 15 s through a
// settings.changed event. The page's Notification constructor is wrapped to record the moment
// the app raises the notification. Needs `npm run build` first and a screen (Chrome is not headless).
// Usage: node scripts/notification-check.mjs
import { defaultSeed, launch, seedScript, sleep } from './cdp.mjs';

const RUNS = 3;
const LIMIT_MS = 3000;
const { send, evaluate, url, stop } = await launch({
  port: 9341,
  appPort: 4181,
  headless: false,
});
const port = 9341;
try {
  await send('Page.enable');
  await send('Browser.grantPermissions', {
    origin: new URL(url).origin,
    permissions: ['notifications'],
  }).catch(() => {});
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => {
      const Real = window.Notification;
      window.__notified = [];
      function Wrapped(title, opts) {
        window.__notified.push(Date.now());
        return new Real(title, opts);
      }
      Wrapped.prototype = Real.prototype;
      Object.defineProperty(Wrapped, 'permission', { get: () => Real.permission });
      Wrapped.requestPermission = (...a) => Real.requestPermission(...a);
      window.Notification = Wrapped;
    })()`,
  });
  await send('Page.navigate', { url });
  await sleep(2000);
  const seed = defaultSeed();
  seed.push({
    id: 'seed-short',
    at: Date.now() - 1000,
    type: 'settings.changed',
    payload: { changes: { focusMinutes: 0.25 } },
  });
  await evaluate(seedScript(seed));

  const results = [];
  for (let run = 1; run <= RUNS; run++) {
    await evaluate(`(async () => {
      await new Promise((res) => {
        const r = indexedDB.open('pomo-pomo', 1);
        r.onsuccess = () => {
          const tx = r.result.transaction('events', 'readwrite');
          const st = tx.objectStore('events');
          st.getAll().onsuccess = (e) => {
            for (const x of e.target.result) if (!String(x.id).startsWith('seed-')) st.delete(x.id);
          };
          tx.oncomplete = res;
        };
      });
    })()`);
    await send('Page.navigate', { url });
    await sleep(2000);
    const box = await evaluate(`(() => {
      const b = document.querySelector('[data-action="start"]');
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`);
    if (!box) throw new Error('no Start button');
    for (const type of ['mousePressed', 'mouseReleased'])
      await send('Input.dispatchMouseEvent', {
        type,
        x: box.x,
        y: box.y,
        button: 'left',
        clickCount: 1,
      });
    await sleep(1000);
    // A second tab in front puts the app tab in the background.
    const other = await (
      await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, {
        method: 'PUT',
      })
    ).json();
    await sleep(1000);
    const hidden = await evaluate(`document.visibilityState === 'hidden'`);
    const started = await evaluate(`(async () => {
      const all = await new Promise((res) => {
        const r = indexedDB.open('pomo-pomo', 1);
        r.onsuccess = () => {
          const q = r.result.transaction('events').objectStore('events').getAll();
          q.onsuccess = () => res(q.result);
        };
      });
      const s = all.filter((e) => e.type === 'pomodoro.started').pop();
      return s ? s.at + s.payload.focusMinutes * 60000 : null;
    })()`);
    if (!started) throw new Error('round did not start');
    let at = null;
    for (let i = 0; i < 60 && at === null; i++) {
      await sleep(500);
      at = await evaluate(`window.__notified[0] ?? null`);
    }
    const delay = at === null ? null : at - started;
    results.push({ run, hidden, delayMs: delay });
    await fetch(`http://127.0.0.1:${port}/json/close/${other.id}`).catch(
      () => {},
    );
  }
  console.log(JSON.stringify(results));
  const ok = results.every(
    (r) => r.hidden && r.delayMs !== null && r.delayMs <= LIMIT_MS,
  );
  console.log(
    `FR-104 Chrome: ${RUNS} runs, tab hidden ${results.map((r) => r.hidden).join('/')}, notification delay ms ${results.map((r) => r.delayMs).join('/')}: ${ok ? 'OK' : 'FAIL'}`,
  );
  stop();
  process.exit(ok ? 0 : 1);
} catch (e) {
  console.error(e);
  stop();
  process.exit(1);
}
