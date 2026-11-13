/* global console, process */
// NFR-11 live sample: browser language «it» gives the Italian UI; switching to EN and DE works without
// reload; in every sampled view state each visible text, option and accessible label is a text of the
// active language's catalog (or user data, numbers, the product name). Run `npm run build` first.
// Usage: node scripts/i18n-sample.mjs   (exit 0 = no foreign or hard-coded text found)
import { execFileSync } from 'node:child_process';
import { dayKey, openApp, seedScript, sleep } from './cdp.mjs';

const { catalogs, templates } = JSON.parse(
  execFileSync(
    'npx',
    [
      'tsx',
      '-e',
      "import {catalogs} from './src/i18n/catalogs/index.ts'; import {REWARD_TEMPLATES} from './src/rewards/templates.ts'; console.log(JSON.stringify({catalogs, templates: REWARD_TEMPLATES}))",
    ],
    { encoding: 'utf8' },
  ),
);

const DATA = [
  'Write the report',
  'Answer mail',
  'Walk',
  'Long coffee',
  'pomo.pomo',
  ...Object.values(templates).flatMap((l) => l.map((t) => t.title)),
];
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const patterns = (locale) =>
  Object.values(catalogs[locale]).map(
    (v) => new RegExp(`^${esc(v).replace(/\\\{\w+\\\}/g, '.+?')}$`, 's'),
  );
const neutral = (v) =>
  /^[\d\s:.,·+\-–—%/×()]+$/.test(v) || DATA.some((d) => v === d);

const now = Date.now();
const MIN = 60_000;
let n = 0;
const ev = (type, payload, at) => ({ id: `s-${n++}`, at, type, payload });
// A round finished a minute ago: the app opens in the short break.
const SEED = [
  ev('task.created', { taskId: 'a', title: 'Write the report', estimate: 3 }, now - 40 * MIN),
  ev('task.created', { taskId: 'b', title: 'Answer mail', estimate: 1 }, now - 39 * MIN),
  ev('plan.changed', { day: dayKey(now), taskIds: ['a', 'b'] }, now - 38 * MIN),
  ev('reward.saved', { rewardId: 'r1', title: 'Walk', price: 20 }, now - 37 * MIN),
  ev('reward.saved', { rewardId: 'r2', title: 'Long coffee', price: 60 }, now - 36 * MIN),
  ev('rewards.seeded', { locale: 'en' }, now - 35 * MIN),
  ev('interruption.parked', { text: 'Call back', kind: 'external' }, now - 34 * MIN),
  ev('pomodoro.started', { pomodoroId: 'p1', taskId: 'a', mode: 'strict', focusMinutes: 25 }, now - 26 * MIN),
  ev('pomodoro.completed', { pomodoroId: 'p1' }, now - MIN),
];
DATA.push('Call back');

const COLLECT = `(() => {
  const visible = (el) => !el.closest('[hidden]') && el.getClientRects().length > 0;
  const out = [];
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let t; (t = w.nextNode()); ) {
    const el = t.parentElement;
    const v = t.textContent.trim();
    if (!v || !el || el.closest('script,style')) continue;
    if (el.tagName !== 'OPTION' && !visible(el)) continue;
    out.push({ v, at: (el.closest('[id]')?.id || 'body') + ' ' + el.tagName.toLowerCase() });
  }
  for (const el of document.querySelectorAll('[aria-label],[placeholder],[title]'))
    for (const a of ['aria-label', 'placeholder', 'title']) {
      const v = el.getAttribute(a);
      if (v && v.trim() && visible(el)) out.push({ v: v.trim(), at: (el.closest('[id]')?.id || 'body') + ' @' + a });
    }
  return { lang: document.documentElement.lang, texts: out };
})()`;
const click = (sel) =>
  `(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false; el.click(); return true; })()`;
const clickText = (sel, text) =>
  `(() => { const el = [...document.querySelectorAll(${JSON.stringify(sel)})].find((b) => b.textContent.trim() === ${JSON.stringify(text)}); if (!el) return false; el.click(); return true; })()`;

const app = await openApp({ lang: 'it-IT' });
const report = [];
let failures = 0;
try {
  for (const locale of ['it', 'en', 'de']) {
    await app.send('Page.navigate', { url: app.url });
    await sleep(800);
    await app.evaluate(`localStorage.clear()`);
    await app.evaluate(seedScript(SEED));
    await app.send('Page.reload');
    await sleep(1500);
    const before = await app.evaluate(`document.documentElement.lang`);
    if (locale !== 'it')
      await app.evaluate(`(() => { const s = document.querySelector('select#language'); s.value = ${JSON.stringify(locale)}; s.dispatchEvent(new Event('change')); })()`);
    await sleep(300);
    const cat = catalogs[locale];
    const pats = patterns(locale);
    const states = [];
    const sample = async (state) => {
      const { lang, texts } = await app.evaluate(COLLECT);
      const foreign = texts.filter(
        ({ v }) => !neutral(v) && !pats.some((p) => p.test(v)),
      );
      failures += foreign.length + (lang === locale ? 0 : 1);
      states.push({ state, lang, texts: texts.length, foreign });
    };
    await sample('break');
    await app.evaluate(click('[data-action="skip-break"]'));
    await sleep(500);
    await sample('idle');
    await app.evaluate(click('.tagesweg [data-action="start"]'));
    await sleep(800);
    await sample('focus');
    await app.evaluate(click('.tagesweg [data-action="park"]'));
    await sleep(300);
    await sample('park-dialog');
    await app.evaluate(clickText('.ui-dialog button', cat['tagesweg.parkCancel']));
    await sleep(300);
    await app.evaluate(click('.tagesweg [data-action="abort"]'));
    await sleep(300);
    await sample('abort-dialog');
    await app.evaluate(clickText('.ui-dialog button', cat['timer.abort.keep']));
    await sleep(300);
    report.push({
      locale,
      via: locale === 'it' ? `browser language (lang=${before})` : `live switch from ${before}, no reload`,
      states,
    });
  }
} finally {
  app.stop();
}
for (const r of report) {
  console.log(`${r.locale} (${r.via})`);
  for (const s of r.states) {
    console.log(`  ${s.state.padEnd(12)} lang=${s.lang} texts=${s.texts} foreign=${s.foreign.length}`);
    for (const f of s.foreign) console.log(`    ✗ «${f.v}» at ${f.at}`);
  }
}
console.log(failures === 0 ? 'NFR-11 sample: OK' : `NFR-11 sample: ${failures} problem(s)`);
process.exit(failures === 0 ? 0 : 1);
