/* global fetch, WebSocket, setTimeout, process */
// Shared helper for the real-browser checks: starts `vite preview` and the system Chrome
// (headless) and exposes a small DevTools-protocol client. Build first (`npm run build`).
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME =
  process.env.CHROME_BIN ??
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Local day key YYYY-MM-DD of a timestamp. */
export const dayKey = (ms) => {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/** Browser-side script that stores the given events in the app's IndexedDB. */
export const seedScript = (events) => `(async () => {
  const events = ${JSON.stringify(events)};
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
})()`;

/** Seed events: 3 tasks, a plan for today, two rewards, some coins. */
export function defaultSeed(now = Date.now()) {
  let n = 0;
  const ev = (type, payload, at) => ({ id: 'seed-' + n++, at, type, payload });
  return [
    ev(
      'task.created',
      { taskId: 'a', title: 'Write report', estimate: 3 },
      now - 9000,
    ),
    ev(
      'task.created',
      { taskId: 'b', title: 'Answer mail', estimate: 1 },
      now - 8000,
    ),
    ev(
      'task.created',
      { taskId: 'c', title: 'Prepare Thursday', estimate: 2 },
      now - 7000,
    ),
    ev(
      'plan.changed',
      { day: dayKey(now), taskIds: ['a', 'b', 'c'] },
      now - 6000,
    ),
    ev(
      'reward.saved',
      { rewardId: 'r1', title: 'Walk', price: 20 },
      now - 5000,
    ),
    ev(
      'reward.saved',
      { rewardId: 'r2', title: 'Coffee break', price: 60 },
      now - 4000,
    ),
    ev('rewards.seeded', { locale: 'en' }, now - 3000),
    ev('coins.earned', { amount: 25, reason: 'set-bonus' }, now - 2000),
  ];
}

/** Starts preview + headless Chrome; `lang` sets the browser language (navigator.languages). */
export const openApp = ({
  lang = 'en-US',
  port = 9340,
  appPort = 4180,
  ...rest
} = {}) => launch({ port, appPort, lang, ...rest });

export async function launch({
  port,
  appPort,
  width = 1000,
  height = 800,
  lang,
  headless = true,
}) {
  const preview = spawn(
    'npx',
    [
      'vite',
      'preview',
      '--host',
      '127.0.0.1',
      '--port',
      String(appPort),
      '--strictPort',
    ],
    { stdio: 'ignore' },
  );
  const chrome = spawn(
    CHROME,
    [
      ...(headless ? ['--headless=new'] : []),
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${mkdtempSync(join(tmpdir(), 'cdp-'))}`,
      '--no-first-run',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
  const stop = () => {
    preview.kill();
    chrome.kill();
  };
  let wsUrl;
  for (let i = 0; i < 50 && !wsUrl; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      wsUrl = list.find((t) => t.type === 'page')?.webSocketDebuggerUrl;
    } catch {
      /* not up yet */
    }
    if (!wsUrl) await sleep(200);
  }
  if (!wsUrl) throw new Error('Chrome did not start');
  const ws = new WebSocket(wsUrl);
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
  if (lang)
    await send('Emulation.setUserAgentOverride', {
      userAgent: await evaluate('navigator.userAgent'),
      acceptLanguage: lang,
    });
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });
  const url = `http://127.0.0.1:${appPort}/`;
  for (let i = 0; i < 25; i++) {
    try {
      await fetch(url);
      break;
    } catch {
      await sleep(200);
    }
  }
  return { send, evaluate, url, stop };
}
