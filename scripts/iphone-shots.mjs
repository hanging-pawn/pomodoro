/* global console, process, setTimeout */
// NFR-18 design acceptance (POMO-79): screenshots of every screen in the booted iPhone simulator
// (Safari), light and dark, from the dev server's demo day. Needs `npm run dev -- --port 5199`.
// Usage: node scripts/iphone-shots.mjs <out-dir> [base-url]
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const out = process.argv[2];
const base = process.argv[3] ?? 'http://localhost:5199/';
if (!out) {
  console.error('usage: node scripts/iphone-shots.mjs <out-dir> [base-url]');
  process.exit(2);
}
mkdirSync(out, { recursive: true });
const sim = (...args) =>
  execFileSync('xcrun', ['simctl', ...args], { stdio: 'pipe' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const open = async (url, wait = 2500) => {
  sim('openurl', 'booted', url);
  await sleep(wait);
};

const shots = [
  // [name, demo variant, route]
  ['01-heute', 'plain', 'today'],
  ['02-runde', 'focus', 'today'],
  ['03-pause', 'break', 'today'],
  ['04-aufgaben', 'plain', 'tasks'],
  ['05-laden', 'plain', 'shop'],
  ['06-woche', 'plain', 'week'],
  ['07-horizont', 'plain', 'horizon'],
  ['08-einstellungen', 'plain', 'settings'],
];

for (const theme of ['light', 'dark']) {
  sim('ui', 'booted', 'appearance', theme);
  let loaded = '';
  for (const [name, variant, route] of shots) {
    if (loaded !== variant) {
      await open(`${base}?demo=${variant}#/${route}`, 4000);
      loaded = variant;
    } else await open(`${base}#/${route}`);
    const file = join(out, `${name}-${theme}.png`);
    sim('io', 'booted', 'screenshot', file);
    console.log(file);
  }
}
sim('ui', 'booted', 'appearance', 'light');
