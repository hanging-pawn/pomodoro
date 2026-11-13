/* global console, process, fetch, WebSocket */
// FR-104 check in a real, visible Chrome: the app tab is put in the background (another tab in front),
// a round runs out, and the delay from the computed end to `new Notification(...)` is measured.
// Ends a round in the background and needs a screen (Chrome is not headless).
// Runs: list of focus lengths in minutes (default 1,1,7 — the 7-minute run stays hidden longer than
// Chrome's 5-minute intensive-throttling threshold). Build first. Usage: node scripts/notify-check.mjs [1,1,7]
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dayKey, seedScript, sleep } from './cdp.mjs';

const CHROME =
  process.env.CHROME_BIN ??
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9351;
const APP_PORT = 4191;
const RUNS = (process.argv[2] ?? '1,1,7').split(',').map(Number);
const LIMIT_MS = 3000;

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
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${mkdtempSync(join(tmpdir(), 'notify-'))}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=900,700',
    'about:blank',
  ],
  { stdio: 'ignore' },
);
const stop = () => {
  preview.kill();
  chrome.kill();
};

async function client(wsUrl) {
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
    if (r.result?.exceptionDetails)
      throw new Error(JSON.stringify(r.result.exceptionDetails));
    return r.result?.result?.value;
  };
  return { send, evaluate };
}

const WRAP = `(() => {
  const N = window.Notification;
  if (!N || window.__wrapped) return;
  window.__wrapped = true;
  window.__notes = [];
  class Probe extends N {
    constructor(title, options) {
      super(title, options);
      window.__notes.push({ title, at: Date.now(), hidden: document.visibilityState });
    }
  }
  Object.defineProperty(Probe, 'permission', { get: () => N.permission });
  Probe.requestPermission = (...a) => N.requestPermission(...a);
  window.Notification = Probe;
  window.__life = [];
  for (const ev of ['freeze', 'resume', 'visibilitychange', 'pagehide', 'pageshow'])
    document.addEventListener(ev, () => window.__life.push({ ev, at: Date.now(), v: document.visibilityState }));
  const W = window.Worker;
  window.__ticks = { n: 0, last: 0 };
  window.Worker = class extends W {
    constructor(...a) {
      super(...a);
      this.addEventListener('message', () => { window.__ticks.n++; window.__ticks.last = Date.now(); });
    }
  };
})()`;

try {
  let list;
  for (let i = 0; i < 50 && !list?.length; i++) {
    try {
      list = (
        await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
      ).filter((t) => t.type === 'page');
    } catch {
      /* not up */
    }
    if (!list?.length) await sleep(200);
  }
  const appTarget = list[0];
  const app = await client(appTarget.webSocketDebuggerUrl);
  const url = `http://127.0.0.1:${APP_PORT}/`;
  for (let i = 0; i < 25; i++) {
    try {
      await fetch(url);
      break;
    } catch {
      await sleep(200);
    }
  }
  const browser = await client(
    (await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json())
      .webSocketDebuggerUrl,
  );
  await browser.send('Browser.grantPermissions', {
    origin: `http://127.0.0.1:${APP_PORT}`,
    permissions: ['notifications'],
  });
  await app.send('Page.enable');
  await app.send('Page.addScriptToEvaluateOnNewDocument', { source: WRAP });

  const results = [];
  for (const [i, minutes] of RUNS.entries()) {
    await app.send('Page.navigate', { url });
    await sleep(1000);
    const now = Date.now();
    await app.evaluate(
      seedScript([
        {
          id: 'n-1',
          at: now - 5000,
          type: 'settings.changed',
          payload: { changes: { focusMinutes: minutes } },
        },
        {
          id: 'n-2',
          at: now - 4000,
          type: 'task.created',
          payload: { taskId: 'a', title: 'Write report', estimate: 4 },
        },
        {
          id: 'n-3',
          at: now - 3000,
          type: 'plan.changed',
          payload: { day: dayKey(now), taskIds: ['a'] },
        },
      ]),
    );
    await app.send('Page.reload');
    await sleep(1500);
    await app
      .send('Target.activateTarget', { targetId: appTarget.id })
      .catch(() => {});
    const clickAt = Date.now();
    await app.evaluate(
      `document.querySelector('.tagesweg [data-action="start"]').click()`,
    );
    await sleep(500);
    const startedAt = await app.evaluate(`new Promise((res) => {
      const r = indexedDB.open('pomo-pomo', 1);
      r.onsuccess = () => {
        const q = r.result.transaction('events').objectStore('events').getAll();
        q.onsuccess = () => res(Math.max(0, ...q.result.filter((e) => e.type === 'pomodoro.started').map((e) => e.at)));
      };
    })`);
    if (startedAt < clickAt - 1000)
      throw new Error(`run ${i + 1}: no round started by the click`);
    const end = startedAt + minutes * 60_000;
    // Bring another tab to the front: the app tab is hidden from here on.
    const other = await browser.send('Target.createTarget', {
      url: 'about:blank',
    });
    await sleep(1000);
    const hiddenAtStart = await app.evaluate('document.visibilityState');
    while (Date.now() < end + Number(process.env.TAIL ?? 6000))
      await sleep(1000);
    const evalAt = Date.now();
    const diag = await app.evaluate(
      '({ life: window.__life, ticks: window.__ticks, title: document.title })',
    );
    if (!(await app.evaluate('(window.__notes || []).length')))
      console.log(
        'diag',
        JSON.stringify({
          end,
          evalAt,
          ...diag,
          lastTickVsEnd: diag.ticks.last - end,
        }),
      );
    const notes = await app.evaluate('window.__notes');
    const note = notes.find((x) => x.at >= end - 1000);
    const delay = note ? note.at - end : null;
    results.push({
      run: i + 1,
      minutes,
      hiddenAtStart,
      hiddenAtNote: note?.hidden ?? null,
      delayMs: delay,
      ok:
        delay !== null &&
        delay >= 0 &&
        delay <= LIMIT_MS &&
        hiddenAtStart === 'hidden',
    });
    console.log(JSON.stringify(results.at(-1)));
    await browser.send('Target.closeTarget', {
      targetId: other.result.targetId,
    });
    await browser.send('Target.activateTarget', { targetId: appTarget.id });
  }
  const ok = results.every((r) => r.ok);
  console.log(
    `FR-104 Chrome: ${results.length} runs, delay ms ${results.map((r) => r.delayMs).join('/')}, app tab hidden: ${results.map((r) => r.hiddenAtNote).join('/')}: ${ok ? 'OK' : 'FAIL'}`,
  );
  stop();
  process.exit(ok ? 0 : 1);
} catch (e) {
  console.error(e);
  stop();
  process.exit(1);
}
