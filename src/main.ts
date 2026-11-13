import './ui/tokens.css';
import './ui/components/components.css';
import './timer/timer.css';
import './tasks/tasks.css';
import './tagesweg/tagesweg.css';
import './horizon/horizon.css';
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
import { createShop } from './rewards/shop';
import { mountRewards } from './rewards/view';
import { createInventory } from './tasks/inventory';
import { mountTasks } from './tasks/view';
import { createTimer } from './timer/controller';
import { startTicker } from './timer/ticker';
import { mountTimer } from './timer/view';
import { mountTagesweg } from './tagesweg/view';
import { mountDayClose } from './dayclose/view';
import { mountWeek } from './week/view';
import { mountHorizon } from './horizon/view';
import { createTheme } from './ui/theme';
import { registerServiceWorker } from './pwa/register';
import { DATA_CHANGED } from './tasks/events';

// Offline and installable (NFR-04); the worker only exists in the production build.
if (import.meta.env.PROD) void registerServiceWorker();

// Stored light/dark choice applies before the first render (FR-601).
const theme = createTheme();
const i18n = createI18n();
const store = openStore();
const root = document.getElementById('app');
if (root)
  mountApp(root, i18n, {
    theme,
    digitsAlways: {
      get: async () => !!(await (await store).state()).settings.digitsAlways,
      set: async (digitsAlways) => {
        await (
          await store
        ).append(newEvent('settings.changed', { changes: { digitsAlways } }));
        document.dispatchEvent(new Event(DATA_CHANGED));
      },
    },
  });

const timerRoot = document.getElementById('timer');
const tageswegRoot = document.getElementById('tagesweg');
if (timerRoot || tageswegRoot)
  void store.then((s) => {
    const timer = createTimer({ log: s });
    if (tageswegRoot)
      mountTagesweg(tageswegRoot, i18n, timer, createShop({ log: s }), {
        state: () => s.state(),
        tickBullet: (id, bullet, done) =>
          createInventory({ log: s }).tickBullet(id, bullet, done),
      });
    if (timerRoot)
      mountTimer(timerRoot, i18n, timer, {
        tasks: async () =>
          Object.values((await s.state()).tasks).filter((x) => !x.done),
        getMode: async () => (await s.state()).settings.mode,
        digitsAlways: async () => !!(await s.state()).settings.digitsAlways,
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

const horizonRoot = document.getElementById('horizon');
if (horizonRoot)
  void store.then((s) =>
    mountHorizon(horizonRoot, i18n, {
      state: () => s.state(),
      setTarget: (project, date) =>
        createInventory({ log: s }).setProjectTarget(project, date),
    }),
  );

const dayCloseRoot = document.getElementById('dayclose');
if (dayCloseRoot)
  void store.then((s) =>
    mountDayClose(dayCloseRoot, i18n, createInventory({ log: s }), {
      state: () => s.state(),
    }),
  );

const weekRoot = document.getElementById('week');
if (weekRoot)
  void store.then((s) => mountWeek(weekRoot, i18n, { state: () => s.state() }));

const rewardsRoot = document.getElementById('rewards');
if (rewardsRoot)
  void store.then(async (s) => {
    const shop = createShop({ log: s });
    // First start: seed the localized template rewards once (FR-408).
    await shop.ensureSeeded(i18n.locale);
    mountRewards(rewardsRoot, i18n, shop, { state: () => s.state() });
  });

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
