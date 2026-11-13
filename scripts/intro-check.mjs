/* global console, process */
// NFR-15 / NFR-12 check in the real Chrome: a fresh install shows the intro, Skip leaves the
// timer usable, a reload does not show it again; with an iPhone user agent (not installed) the
// notification hint is visible. Needs `npm run build` first. Usage: node scripts/intro-check.mjs
import { launch, sleep } from './cdp.mjs';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const { send, evaluate, url, stop } = await launch({
  port: 9343,
  appPort: 4183,
});
const q = (sel) => `!!document.querySelector('${sel}')`;
try {
  await send('Page.navigate', { url });
  await sleep(2000);
  const shown = await evaluate(q('[role="dialog"]'));
  await evaluate(`document.querySelector('[data-action="skip"]').click()`);
  await sleep(300);
  const closed = await evaluate(`!document.querySelector('[role="dialog"]')`);
  const timer = await evaluate(q('#timer [data-action="start"]'));
  await send('Page.navigate', { url });
  await sleep(2000);
  const again = await evaluate(q('[role="dialog"]'));
  const hintDesktop = await evaluate(q('.ios-hint'));
  await send('Emulation.setUserAgentOverride', { userAgent: IPHONE });
  await send('Page.navigate', { url });
  await sleep(2000);
  const hintIos = await evaluate(
    `document.querySelector('.ios-hint')?.textContent ?? ''`,
  );
  const ok =
    shown && closed && timer && !again && !hintDesktop && hintIos.length > 20;
  console.log(
    `NFR-15: intro shown ${shown}, skip closes ${closed}, timer there ${timer}, shown again ${again}; NFR-12: hint on desktop ${hintDesktop}, hint on iPhone UA ${hintIos.length > 20}: ${ok ? 'OK' : 'FAIL'}`,
  );
  stop();
  process.exit(ok ? 0 : 1);
} catch (e) {
  console.error(e);
  stop();
  process.exit(1);
}
