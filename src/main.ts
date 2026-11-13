import './ui/tokens.css';
import './ui/components/components.css';
import './timer/timer.css';
import './tasks/tasks.css';
import { mountApp } from './app';
import { mountBetaPanel } from './beta/panel';
import { createBetaSession } from './beta/session';
import { createUsageLog } from './beta/usage';
import { APP_VERSION } from './config';
import { newEvent } from './domain/events';
import { createI18n } from './i18n/i18n';
import { openStore } from './storage/store';
import { mountSyncPanel } from './sync/panel';
import { createSync } from './sync/sync';
import { mountPrivacyLink } from './privacy/notice';
import { createInventory } from './tasks/inventory';
import { mountTasks } from './tasks/view';
import { createTimer } from './timer/controller';
import { startTicker } from './timer/ticker';
import { mountTimer } from './timer/view';
import { createTheme } from './ui/theme';

// Stored light/dark choice applies before the first render (FR-601).
createTheme();
const i18n = createI18n();
const root = document.getElementById('app');
if (root) mountApp(root, i18n);

const store = openStore();

const timerRoot = document.getElementById('timer');
if (timerRoot)
  void store.then((s) => {
    const timer = createTimer({ log: s });
    mountTimer(timerRoot, i18n, timer, {
      tasks: async () =>
        Object.values((await s.state()).tasks).filter((x) => !x.done),
      getMode: async () => (await s.state()).settings.mode,
      setMode: (mode) =>
        s.append(newEvent('settings.changed', { changes: { mode } })),
    });
    // Worker-driven tick keeps the end of a phase on time in background tabs (FR-104).
    startTicker(() => void timer.refresh());
    document.addEventListener('visibilitychange', () => void timer.refresh());
  });

const tasksRoot = document.getElementById('tasks');
if (tasksRoot)
  void store.then((s) =>
    mountTasks(tasksRoot, i18n, createInventory({ log: s }), {
      state: () => s.state(),
    }),
  );

const privacyRoot = document.getElementById('privacy');
if (privacyRoot) mountPrivacyLink(privacyRoot, i18n);

// Optional personal sync (NFR-10): no request until the user connects a repo.
const syncRoot = document.getElementById('sync');
if (syncRoot)
  void store.then((s) => {
    const sync = createSync({ store: s });
    mountSyncPanel(syncRoot, i18n, sync);
    void sync.sync();
  });

const beta = document.getElementById('beta');
if (beta) {
  const session = createBetaSession({
    events: async () => (await store).events(),
    lang: () => i18n.locale,
    appVersion: APP_VERSION,
  });
  mountBetaPanel(beta, i18n, session);
  // Beta mode only (FR-505); views and features call `usage` once they exist.
  const usage = createUsageLog({
    isBeta: () => session.state === 'signed-in',
    append: async (e) => (await store).append(e),
    changed: () => session.changed(),
  });
  // A failing write must not raise another error event (no loop).
  const recordError = (error: unknown) => usage.error(error).catch(() => {});
  globalThis.addEventListener('error', (e) => void recordError(e.error));
  globalThis.addEventListener(
    'unhandledrejection',
    (e) => void recordError(e.reason),
  );
}
