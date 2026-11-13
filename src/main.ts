import { mountApp } from './app';
import { mountBetaPanel } from './beta/panel';
import { createBetaSession } from './beta/session';
import { createUsageLog } from './beta/usage';
import { APP_VERSION } from './config';
import { createI18n } from './i18n/i18n';
import { openStore } from './storage/store';

const i18n = createI18n();
const root = document.getElementById('app');
if (root) mountApp(root, i18n);

const beta = document.getElementById('beta');
if (beta) {
  const store = openStore();
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
