// @vitest-environment node
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { APP_NAME } from '../config';
import { catalogs } from '../i18n/catalogs';

/** POMO-42: the UI concept files exist and keep the naming rules (FR-601, NFR-05). */
const ROOT = join(__dirname, '../..');
const DOCS = join(ROOT, 'docs/ui');
const WIRE = join(DOCS, 'wireframes');

const svg = (name: string) => readFileSync(join(WIRE, name), 'utf8');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

describe('UI concept (POMO-42)', () => {
  it('has the screen map and the required wireframes', () => {
    expect(existsSync(join(DOCS, 'screens.md'))).toBe(true);
    for (const f of [
      'main-360.svg',
      'main-desktop.svg',
      'inventory-360.svg',
      'shop-360.svg',
      'focus-360.svg',
      'ring-360.svg',
      'pause-360.svg',
      'horizon-360.svg',
    ])
      expect(existsSync(join(WIRE, f)), f).toBe(true);
  });

  it('draws the mobile wireframes 360 px wide', () => {
    for (const f of readdirSync(WIRE).filter((n) => n.endsWith('-360.svg')))
      expect(svg(f), f).toMatch(/<svg[^>]* width="360"/);
  });

  it('main screen at 360 px shows timer, current task, today list with budget bar, park key, coins', () => {
    const main = svg('main-360.svg');
    expect(main).toContain('Start round'); // timer start
    expect(main).toContain('Read chapter 3 · round 1 of 2'); // current task
    expect(main).toMatch(/2 of 6 rounds · budget 8/); // budget bar
    expect(main).toContain('park key (P)');
    expect(main).toContain('>coins<');
    expect(main).toContain(`>${APP_NAME}<`);
  });

  it('uses no tomato imagery and never the word Pomodoro in wireframes, UI code or catalogs', () => {
    const texts = [
      // Wireframes are UI drafts; screens.md is documentation and may cite vault paths.
      ...files(WIRE).filter((f) => f.endsWith('.svg')),
      ...files(join(ROOT, 'src/ui')).filter((f) => !f.endsWith('.test.ts')),
    ].map((f) => readFileSync(f, 'utf8'));
    texts.push(...Object.values(catalogs).flatMap((m) => Object.values(m)));
    for (const t of texts) {
      expect(t).not.toMatch(/pomodoro/i);
      expect(t).not.toMatch(/tomat|🍅/i);
    }
  });
});
