/* global console, process */
// FR-104 check in Safari: the app tab goes to the background (another tab in front), a round
// runs out, and the delay from the computed end to `new Notification(...)` is measured.
// Drives Safari over AppleScript «do JavaScript»; needs Safari > Develop > «Allow JavaScript from
// Apple Events» and notification permission for the page (one real click on «Runde starten»).
// Serve the build first: npx vite preview --host 127.0.0.1 --port 4191
// Usage: node scripts/safari-check.mjs check | node scripts/safari-check.mjs 1,1,7
import { execFileSync } from 'node:child_process';
import { dayKey, seedScript, sleep } from './cdp.mjs';

const URL = process.env.APP_URL ?? 'http://127.0.0.1:4191/';
const LIMIT_MS = 3000;
const TAIL = Number(process.env.TAIL ?? 45000);

const osa = (script, ...args) =>
  execFileSync('osascript', ['-e', script, ...args.map(String)], {
    encoding: 'utf8',
  }).trim();

const RUN_JS = `on run argv
  tell application "Safari" to return do JavaScript (item 1 of argv) in tab (item 3 of argv as integer) of window id (item 2 of argv as integer)
end run`;

let win;
const js = (code, tab = 1) => osa(RUN_JS, code, win, tab);
const jsJson = (expr, tab = 1) => {
  const out = js(`JSON.stringify(${expr})`, tab);
  return out ? JSON.parse(out) : undefined;
};
async function jsAsync(promiseExpr, tab = 1) {
  js(
    `window.__r = undefined; Promise.resolve(${promiseExpr}).then((v) => (window.__r = JSON.stringify(v === undefined ? null : v)), (e) => (window.__r = JSON.stringify({ error: String(e) })));`,
    tab,
  );
  for (let i = 0; i < 100; i++) {
    const r = js('window.__r === undefined ? "" : window.__r', tab);
    if (r) return JSON.parse(r);
    await sleep(100);
  }
  throw new Error('async JavaScript in Safari did not finish');
}

const WRAP = `(() => {
  const N = window.Notification;
  if (!N || window.__wrapped) return;
  window.__wrapped = true;
  window.__notes = [];
  function Probe(title, options) {
    window.__notes.push({ title, at: Date.now(), hidden: document.visibilityState });
    return new N(title, options);
  }
  Object.defineProperty(Probe, 'permission', { get: () => N.permission });
  Probe.requestPermission = (...a) => N.requestPermission(...a);
  window.Notification = Probe;
})()`;

function closeTestWindows() {
  return osa(`tell application "Safari"
    set n to 0
    repeat with w in (every window)
      try
        set u to URL of current tab of w
        if u starts with "${URL}" or u is missing value or u is "" or u is "about:blank" then
          close w
          set n to n + 1
        end if
      end try
    end repeat
    return n
  end tell`);
}

async function openWindow() {
  console.log('closed test windows:', closeTestWindows());
  osa(`tell application "Safari" to make new document`);
  await sleep(1000);
  win = Number(osa('tell application "Safari" to return id of front window'));
  osa(
    `tell application "Safari" to set URL of tab 1 of window id ${win} to "${URL}"`,
  );
  for (let i = 0; i < 50; i++) {
    await sleep(300);
    try {
      if (
        js('location.href').startsWith(URL) &&
        js('document.readyState') === 'complete'
      )
        break;
    } catch {
      /* page not ready */
    }
  }
  await sleep(1500);
  if (!js('location.href').startsWith(URL))
    throw new Error('Safari did not load the app page');
}

async function check() {
  await openWindow();
  const info = jsJson(
    '({ ok: true, permission: window.Notification ? Notification.permission : "none", title: document.title })',
  );
  console.log(JSON.stringify(info));
  osa(`tell application "Safari" to close window id ${win}`);
}

async function measure(runs) {
  await openWindow();
  const results = [];
  for (const [i, minutes] of runs.entries()) {
    await jsAsync(
      `new Promise((res, rej) => { const r = indexedDB.open('pomo-pomo', 1); r.onsuccess = () => { const tx = r.result.transaction('events', 'readwrite'); tx.objectStore('events').clear(); tx.oncomplete = () => res(true); tx.onerror = () => rej(tx.error); }; })`,
    );
    const now = Date.now();
    await jsAsync(
      seedScript([
        {
          id: 's-1',
          at: now - 5000,
          type: 'settings.changed',
          payload: { changes: { focusMinutes: minutes } },
        },
        {
          id: 's-2',
          at: now - 4000,
          type: 'task.created',
          payload: { taskId: 'a', title: 'Write report', estimate: 4 },
        },
        {
          id: 's-3',
          at: now - 3000,
          type: 'plan.changed',
          payload: { day: dayKey(now), taskIds: ['a'] },
        },
      ]),
    );
    const left = await jsAsync(
      `new Promise((res) => { const r = indexedDB.open('pomo-pomo', 1); r.onsuccess = () => { const q = r.result.transaction('events').objectStore('events').getAll(); q.onsuccess = () => res(q.result.filter((e) => !String(e.id).startsWith('s-')).length); }; })`,
    );
    if (left)
      throw new Error(`run ${i + 1}: ${left} events survived the reset`);
    js('location.reload()');
    await sleep(1000);
    for (let r = 0; r < 30 && js('document.readyState') !== 'complete'; r++)
      await sleep(300);
    await sleep(1200);
    js(WRAP);
    const permission = jsJson('Notification.permission');
    if (permission !== 'granted')
      throw new Error(
        `notification permission in Safari is «${permission}», not granted`,
      );
    const clickAt = Date.now();
    js(`document.querySelector('.tagesweg [data-action="start"]').click()`);
    await sleep(800);
    const startedAt = await jsAsync(`new Promise((res) => {
      const r = indexedDB.open('pomo-pomo', 1);
      r.onsuccess = () => {
        const q = r.result.transaction('events').objectStore('events').getAll();
        q.onsuccess = () => res(Math.max(0, ...q.result.filter((e) => e.type === 'pomodoro.started').map((e) => e.at)));
      };
    })`);
    if (startedAt < clickAt - 1000) {
      console.log(
        'diag',
        JSON.stringify(
          jsJson(`({
        start: [...document.querySelectorAll('[data-action="start"]')].map((b) => ({ in: b.closest('[id]')?.id, disabled: b.disabled, text: b.textContent, inert: !!b.closest('[inert]') })),
        dialogs: [...document.querySelectorAll('[role="dialog"]')].map((d) => d.textContent.slice(0, 80)),
        phase: document.documentElement.dataset.timerPhase,
        rows: document.querySelectorAll('[data-role="task-row"]').length,
        title: document.title,
      })`),
        ),
      );
      console.log(
        'events',
        JSON.stringify(
          await jsAsync(
            `new Promise((res) => { const r = indexedDB.open('pomo-pomo', 1); r.onsuccess = () => { const q = r.result.transaction('events').objectStore('events').getAll(); q.onsuccess = () => res(q.result.map((e) => e.type + '@' + (e.at - ${clickAt}))); }; })`,
          ),
        ),
      );
      throw new Error(`run ${i + 1}: no round started`);
    }
    const end = startedAt + minutes * 60_000;
    // Another tab in front: the app tab is hidden until the end has passed.
    osa(
      `tell application "Safari" to tell window id ${win} to set current tab to (make new tab with properties {URL:"about:blank"})`,
    );
    await sleep(1500);
    const hiddenAtStart = jsJson('document.visibilityState');
    while (Date.now() < end + TAIL) await sleep(1000);
    const notes = jsJson('window.__notes || []');
    const title = jsJson('document.title');
    const note = notes.find((x) => x.at >= end - 1000);
    const delay = note ? note.at - end : null;
    results.push({
      run: i + 1,
      minutes,
      hiddenAtStart,
      hiddenAtNote: note?.hidden ?? null,
      delayMs: delay,
      titleAfter: title,
      ok:
        delay !== null &&
        delay >= 0 &&
        delay <= LIMIT_MS &&
        hiddenAtStart === 'hidden',
    });
    console.log(JSON.stringify(results.at(-1)));
    osa(`tell application "Safari" to tell window id ${win}
      close (current tab)
      set current tab to tab 1
    end tell`);
    await sleep(1000);
  }
  osa(`tell application "Safari" to close window id ${win}`);
  const ok = results.every((r) => r.ok);
  console.log(
    `FR-104 Safari: ${results.length} runs, delay ms ${results.map((r) => r.delayMs).join('/')}, app tab hidden: ${results.map((r) => r.hiddenAtNote).join('/')}: ${ok ? 'OK' : 'FAIL'}`,
  );
  return ok;
}

try {
  if (process.argv[2] === 'clean') console.log('closed', closeTestWindows());
  else if (process.argv[2] === 'check') await check();
  else
    process.exit(
      (await measure((process.argv[2] ?? '1,1,7').split(',').map(Number)))
        ? 0
        : 1,
    );
} catch (e) {
  console.error(String(e.stderr || e.message || e));
  try {
    closeTestWindows();
  } catch {
    /* Safari gone */
  }
  process.exit(1);
}
