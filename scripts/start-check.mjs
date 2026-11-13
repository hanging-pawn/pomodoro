/* global console, process */
// FR-102 check in the real browser: from opening the app to a running timer takes at most
// 2 interactions and at most 5 s, in 5 runs. A real mouse click on Start is the only
// interaction (task preselected). Needs `npm run build` first. Usage: node scripts/start-check.mjs
import { defaultSeed, launch, seedScript, sleep } from './cdp.mjs';

const RUNS = 5;
const { send, evaluate, url, stop } = await launch({
  port: 9334,
  appPort: 4174,
});
try {
  await send('Page.navigate', { url });
  await sleep(2000);
  await evaluate(seedScript(defaultSeed()));

  const results = [];
  for (let run = 1; run <= RUNS; run++) {
    // A fresh «open the app»: clear the timer log of an earlier run, keep the seed.
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
    await evaluate('window.__old = 1');
    const t0 = Date.now();
    await send('Page.navigate', { url });
    // The old document must be gone before the new one counts.
    while (
      (await evaluate('window.__old === 1').catch(() => false)) &&
      Date.now() - t0 < 10000
    )
      await sleep(5);
    let box = null;
    while (!box && Date.now() - t0 < 10000) {
      box = await evaluate(`(() => {
        const b = document.querySelector('[data-action="start"]');
        if (!b || b.offsetParent === null) return null;
        const r = b.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      })()`);
      if (!box) await sleep(20);
    }
    if (!box) throw new Error('no Start button');
    let interactions = 0;
    for (const type of ['mousePressed', 'mouseReleased']) {
      await send('Input.dispatchMouseEvent', {
        type,
        x: box.x,
        y: box.y,
        button: 'left',
        clickCount: 1,
      });
      if (type === 'mouseReleased') interactions++;
    }
    let running = false;
    while (!running && Date.now() - t0 < 10000) {
      running = await evaluate(
        `!!document.querySelector('[data-action="abort"]') && !document.querySelector('[data-action="start"]')`,
      );
      if (!running) await sleep(20);
    }
    results.push({ run, interactions, ms: Date.now() - t0, running });
  }
  console.log(JSON.stringify(results));
  const ok = results.every(
    (r) => r.running && r.interactions <= 2 && r.ms <= 5000,
  );
  console.log(
    `FR-102: ${RUNS} runs, interactions ${results.map((r) => r.interactions).join('/')}, seconds to running timer ${results.map((r) => (r.ms / 1000).toFixed(2)).join('/')}: ${ok ? 'OK' : 'FAIL'}`,
  );
  stop();
  process.exit(ok ? 0 : 1);
} catch (e) {
  console.error(e);
  stop();
  process.exit(1);
}
