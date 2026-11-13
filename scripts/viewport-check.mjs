/* global console, process, fetch, WebSocket, setTimeout, Buffer */
// Viewport check for the Tagesweg main screen (NFR-05): at 360 px no horizontal scroll and
// at least 10 sampled controls of at least 44 x 44 px. Drives the system Chrome over the DevTools
// protocol against the built app (`npm run build` first). Usage: node scripts/viewport-check.mjs
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME =
  process.env.CHROME_BIN ??
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9333;
const APP_PORT = 4173;
const WIDTH = 360;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const preview = spawn(
  'npx',
  [
    'vite',
    'preview',
    '--host',
    '127.0.0.1',
    '--port',
    String(APP_PORT),
    '--strictPort',
  ],
  { stdio: 'ignore' },
);
const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${mkdtempSync(join(tmpdir(), 'vp-'))}`,
    '--no-first-run',
    'about:blank',
  ],
  { stdio: 'ignore' },
);
const stop = () => {
  preview.kill();
  chrome.kill();
};

async function connect() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      /* not up yet */
    }
    await sleep(200);
  }
  throw new Error('Chrome did not start');
}

try {
  const ws = new WebSocket(await connect());
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const pending = new Map();
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) pending.get(d.id)(d);
  };
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      pending.set(++id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.result.exceptionDetails)
      throw new Error(JSON.stringify(r.result.exceptionDetails));
    return r.result.result.value;
  };

  await send('Emulation.setDeviceMetricsOverride', {
    width: WIDTH,
    height: 740,
    deviceScaleFactor: 2,
    mobile: false,
  });
  const url = `http://127.0.0.1:${APP_PORT}/`;
  for (let i = 0; i < 25; i++) {
    try {
      await fetch(url);
      break;
    } catch {
      await sleep(200);
    }
  }
  await send('Page.navigate', { url });
  await sleep(2000);
  // Seed a day: 3 tasks (long title included), a plan, two rewards, some coins.
  await evaluate(`(async () => {
    const now = Date.now();
    const d = new Date(now);
    const p = (n) => String(n).padStart(2, '0');
    const day = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
    let n = 0;
    const ev = (type, payload, at) => ({ id: 'seed-' + n++, at, type, payload });
    const events = [
      ev('task.created', { taskId: 'a', title: 'Write the quarterly report for the whole steering committee', estimate: 3 }, now - 9000),
      ev('task.created', { taskId: 'b', title: 'Answer mail', estimate: 1 }, now - 8000),
      ev('task.created', { taskId: 'c', title: 'Prepare Thursday', estimate: 2 }, now - 7000),
      ev('plan.changed', { day, taskIds: ['a', 'b', 'c'] }, now - 6000),
      ev('reward.saved', { rewardId: 'r1', title: 'Walk', price: 20 }, now - 5000),
      ev('reward.saved', { rewardId: 'r2', title: 'Long coffee break with a friend', price: 60 }, now - 4000),
      ev('rewards.seeded', { locale: 'en' }, now - 3000),
      ev('coins.earned', { amount: 25, reason: 'set-bonus' }, now - 2000),
    ];
    await new Promise((res, rej) => {
      const r = indexedDB.open('pomo-pomo', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('events', { keyPath: 'id' });
      r.onsuccess = () => {
        const tx = r.result.transaction('events', 'readwrite');
        events.forEach((e) => tx.objectStore('events').put(e));
        tx.oncomplete = res;
        tx.onerror = () => rej(tx.error);
      };
    });
  })()`);
  await send('Page.reload');
  await sleep(1200);

  const result = await evaluate(`(() => {
    const root = document.body;
    const wide = [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 0.5).map((e) => e.tagName + '#' + e.id + '.' + e.className).slice(0, 8);
    const controls = [...root.querySelectorAll('button, a[href], input, select, textarea, [role="button"]')].filter((c) => c.offsetParent !== null);
    const sizes = controls.map((c) => {
      const r = c.getBoundingClientRect();
      return { name: c.getAttribute('aria-label') || c.textContent.trim() || c.tagName, w: Math.round(r.width), h: Math.round(r.height) };
    });
    return {
      innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      sizes,
      wide,
      rows: root.querySelectorAll('[data-role="task-row"]').length,
    };
  })()`);
  console.log(
    JSON.stringify(
      { ...result, sizes: result.sizes.filter((s) => s.w < 44 || s.h < 44) },
      null,
      1,
    ),
  );
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  const { writeFileSync } = await import('node:fs');
  if (process.env.SHOT)
    writeFileSync(process.env.SHOT, Buffer.from(shot.result.data, 'base64'));

  const small = result.sizes.filter((s) => s.w < 44 || s.h < 44);
  const noScroll =
    result.innerWidth === WIDTH &&
    result.scrollWidth <= WIDTH &&
    result.bodyScrollWidth <= WIDTH;
  const ok =
    noScroll &&
    result.sizes.length >= 10 &&
    small.length === 0 &&
    result.rows === 3;
  console.log(
    `no horizontal scroll at ${WIDTH}px: ${noScroll}; controls sampled: ${result.sizes.length}; under 44x44: ${small.length}`,
  );
  stop();
  process.exit(ok ? 0 : 1);
} catch (e) {
  console.error(e);
  stop();
  process.exit(1);
}
