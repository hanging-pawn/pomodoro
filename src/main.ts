import './ui/tokens.css';
import './ui/components/components.css';
import './ui/forms.css';
import './tasks/tasks.css';
import './tagesweg/tagesweg.css';
import './horizon/horizon.css';
import './onboarding/onboarding.css';
import './shell/shell.css';
import './settings/settings.css';
import './beta/beta.css';
import { mountSettings } from './settings/view';
import { mountShell, type Screen } from './shell/shell';
import { mountBetaPanel } from './beta/panel';
import { createBetaSession } from './beta/session';
import { createUsageLog } from './beta/usage';
import { APP_VERSION, OWN_REPO_SYNC } from './config';
import { maybeShowLogin, mountBetaReminder, openLogin } from './beta/login';
import { newEvent } from './domain/events';
import { createI18n } from './i18n/i18n';
import { openStore } from './storage/store';
import { mountDataPanel } from './data/panel';
import { mountSyncPanel } from './sync/panel';
import { createSync } from './sync/sync';
import { mountPrivacyLink } from './privacy/notice';
import { createShop } from './rewards/shop';
import { mountRewards } from './rewards/view';
import { createInventory } from './tasks/inventory';
import { mountTasks } from './tasks/view';
import { createTimer } from './timer/controller';
import { createAlerts } from './timer/alerts';
import { startTicker } from './timer/ticker';
import { mountAnnouncer } from './timer/announcer';
import { mountTagesweg } from './tagesweg/view';
import { mountDayClose } from './dayclose/view';
import { mountWeek } from './week/view';
import { mountHorizon } from './horizon/view';
import { createTheme } from './ui/theme';
import { showIntro } from './onboarding/intro';
import { mountIosHint } from './onboarding/ios-hint';
import { registerServiceWorker } from './pwa/register';
import { DATA_CHANGED } from './tasks/events';

// Offline and installable (NFR-04); the worker only exists in the production build.
if (import.meta.env.PROD) void registerServiceWorker();

// Stored light/dark choice applies before the first render (FR-601).
const theme = createTheme();
const i18n = createI18n();
const store = openStore();
// Dev server only: `?demo` loads a demo day for design checks (POMO-79).
if (import.meta.env.DEV)
  void import('./dev/demo').then((m) => m.maybeLoadDemo(store));

// App shell (FR-610): header, one screen at a time, bottom nav. Each view mounts into a slot.
const shell = mountShell(document.getElementById('shell')!, i18n);
const place: [Screen, string][] = [
  ['today', 'beta-reminder'],
  ['today', 'ios-hint'],
  ['today', 'tagesweg'],
  ['horizon', 'horizon'],
  ['tasks', 'tasks'],
  ['shop', 'rewards'],
  ['week', 'week'],
  ['week', 'dayclose'],
  ['settings', 'app'],
  ['settings', 'ios-hint-settings'],
  ['settings', 'data'],
  ...(OWN_REPO_SYNC ? [['settings', 'sync'] as [Screen, string]] : []),
  ['settings', 'beta'],
  ['settings', 'privacy'],
];
for (const [screen, id] of place) {
  const el = document.createElement('div');
  el.id = id;
  shell.slot(screen).append(el);
}

// Beta account = login (POMO-85): created early so every data change reaches it.
const betaSession = createBetaSession({
  events: async () => (await store).events(),
  importJson: async (json) => (await store).importJson(json),
  // Events from another device: let every view re-read the log.
  onImported: () => document.dispatchEvent(new Event(DATA_CHANGED)),
  lang: () => i18n.locale,
  appVersion: APP_VERSION,
});
document.addEventListener(DATA_CHANGED, () => betaSession.changed());
// Back in front: merge what the other devices did meanwhile.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void betaSession.pull();
});
setInterval(() => {
  if (document.visibilityState === 'visible') void betaSession.pull();
}, 5 * 60_000);

// Header coins and the Shop item follow the gamification level (FR-405).
const paintShell = () =>
  void store
    .then((s) => s.state())
    .then((st) => {
      const on = st.settings.gamification !== 'off';
      shell.setCoins(on ? st.coins : undefined);
      shell.setShop(on);
    })
    .catch(() => {});
document.addEventListener(DATA_CHANGED, paintShell);
paintShell();

const settingsRoot = document.getElementById('app');
if (settingsRoot)
  void store.then((s) =>
    mountSettings(settingsRoot, i18n, {
      theme,
      state: () => s.state(),
      setMode: (mode) =>
        s.append(newEvent('settings.changed', { changes: { mode } })),
      setDigitsAlways: (digitsAlways) =>
        s.append(newEvent('settings.changed', { changes: { digitsAlways } })),
      shop: createShop({ log: s }),
    }),
  );

const iosHintRoot = document.getElementById('ios-hint');
if (iosHintRoot)
  mountIosHint(iosHintRoot, i18n, undefined, { dismissible: true });
const iosHintSettings = document.getElementById('ios-hint-settings');
if (iosHintSettings) mountIosHint(iosHintSettings, i18n);

const tageswegRoot = document.getElementById('tagesweg');
if (tageswegRoot)
  void store.then((s) => {
    const timer = createTimer({ log: s });
    // One alerts instance: the Start click prepares it, the announcer uses it (FR-104).
    const alerts = createAlerts();
    mountTagesweg(tageswegRoot, i18n, timer, createShop({ log: s }), {
      state: () => s.state(),
      prepareAlerts: () => alerts.prepare(),
      tickBullet: (id, bullet, done) =>
        createInventory({ log: s }).tickBullet(id, bullet, done),
    });
    // Tab title and end-of-phase alerts on every screen (FR-104, FR-108).
    let titles: Record<string, string> = {};
    const readTitles = () =>
      s
        .state()
        .then((st) => {
          titles = Object.fromEntries(
            Object.values(st.tasks).map((x) => [x.id, x.title]),
          );
        })
        .catch(() => {});
    document.addEventListener(DATA_CHANGED, () => void readTitles());
    void readTitles().then(() => timer.refresh());
    mountAnnouncer(timer, i18n, {
      alerts,
      taskTitle: (id) => (id ? (titles[id] ?? '') : ''),
    });
    // Round running → only the round on screen (FR-604); coins refresh after the ring.
    timer.onChange((view, end) => {
      shell.setFocus(view.phase === 'focus' || view.phase === 'paused');
      if (end) {
        paintShell();
        betaSession.changed();
      }
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
// One sync instance: the sync panel drives it, «delete all data» disconnects it (POMO-61).
const syncReady = store.then((s) => createSync({ store: s }));
const syncRoot = document.getElementById('sync');
if (syncRoot)
  void syncReady.then((sync) => {
    mountSyncPanel(syncRoot, i18n, sync);
    void sync.sync();
  });

// «Delete all data» signs out of the beta account first, or the next merge would bring every
// event back (same rule as the personal sync, POMO-61). The copy in the account stays.
const betaAsSync = {
  get state() {
    return betaSession.state === 'signed-in'
      ? ('on' as const)
      : ('off' as const);
  },
  get repo() {
    return betaSession.testerId;
  },
  disconnect: () => betaSession.signOut(),
};
const dataRoot = document.getElementById('data');
if (dataRoot)
  void Promise.all([store, syncReady]).then(([s, sync]) =>
    mountDataPanel(dataRoot, i18n, s, {
      sync: OWN_REPO_SYNC ? sync : betaAsSync,
    }),
  );

const beta = document.getElementById('beta');
if (beta) {
  const session = betaSession;
  mountBetaPanel(beta, i18n, session);
  const reminder = document.getElementById('beta-reminder');
  if (reminder)
    mountBetaReminder(
      reminder,
      i18n,
      session,
      () => void openLogin(i18n, session),
    );
  // Beta mode only (FR-505); views and features call `usage` once they exist.
  const usage = createUsageLog({
    isBeta: () => session.state === 'signed-in',
    append: async (e) => (await store).append(e),
    changed: () => session.changed(),
  });
  // A failing write must not raise another error event (no loop).
  shell.onShow((screen) => void usage.viewOpened(screen).catch(() => {}));
  const recordError = (error: unknown) => usage.error(error).catch(() => {});
  globalThis.addEventListener('error', (e) => void recordError(e.error));
  globalThis.addEventListener(
    'unhandledrejection',
    (e) => void recordError(e.reason),
  );
}

// First start only (NFR-15): after the views are mounted, so skipping lands on the timer.
// Then the beta sign-in, which is the app login (POMO-85); «Later» asks again tomorrow.
void showIntro(i18n).then(() => maybeShowLogin(i18n, betaSession));
// Signed in from before: get the other devices' data now.
void betaSession.pull();
