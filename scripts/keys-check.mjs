/* global console, process */
// NFR-06 check in the real Chrome: with real key events (no mouse), N selects the next task,
// Space starts the round and P opens the park dialog with its field focused. Needs `npm run build` first.
// Usage: node scripts/keys-check.mjs
import { defaultSeed, launch, seedScript, sleep } from './cdp.mjs';

const { send, evaluate, url, stop } = await launch({
  port: 9342,
  appPort: 4182,
});
const key = async (k, code, text) => {
  for (const type of ['keyDown', 'keyUp'])
    await send('Input.dispatchKeyEvent', {
      type,
      key: k,
      code,
      text: type === 'keyDown' ? text : undefined,
    });
  await sleep(300);
};
try {
  await send('Page.navigate', { url });
  await sleep(2000);
  await evaluate(seedScript(defaultSeed()));
  await send('Page.navigate', { url });
  await sleep(2000);
  const next = `document.querySelector('[data-role="next"] .tw-next__title')?.textContent`;
  const first = await evaluate(next);
  await key('n', 'KeyN', 'n');
  const second = await evaluate(next);
  await key(' ', 'Space', ' ');
  const running = await evaluate(
    `!!document.querySelector('[data-action="abort"]') && !document.querySelector('[data-action="start"]')`,
  );
  await key('p', 'KeyP', 'p');
  const parkFocused = await evaluate(
    `document.activeElement?.getAttribute('name') === 'park'`,
  );
  const ok = first !== second && running && parkFocused;
  console.log(
    `NFR-06: N changed task ${first} -> ${second}, Space started ${running}, P focused park field ${parkFocused}: ${ok ? 'OK' : 'FAIL'}`,
  );
  stop();
  process.exit(ok ? 0 : 1);
} catch (e) {
  console.error(e);
  stop();
  process.exit(1);
}
