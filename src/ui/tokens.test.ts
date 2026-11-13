// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');

/** Custom properties declared in the first block that follows `selector`. */
function block(selector: string): Record<string, string> {
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`no block ${selector}`);
  const open = css.indexOf('{', start);
  const body = css.slice(open + 1, css.indexOf('}', open));
  return Object.fromEntries(
    [...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [
      m[1],
      m[2]!.trim(),
    ]),
  );
}

const light = block(':root {');
const dark = block(":root[data-theme='dark'] {");
const systemDark = block(":root:not([data-theme='light']) {");

function luminance(hex: string): number {
  const v = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(v.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (hi + 0.05) / (lo + 0.05);
}

const SURFACES = ['--bg-base', '--bg-card', '--bg-card-alt', '--bg-highlight'];
const TEXT = [
  '--text-primary',
  '--text-secondary',
  '--text-muted',
  '--text-accent',
  '--positive',
  '--negative',
];
/** WCAG 1.4.11 non-text contrast: path, stations, progress fill, focus ring. */
const GRAPHICS = ['--accent-mid', '--text-muted', '--focus-ring'];

describe.each([
  ['light', light],
  ['dark', { ...light, ...dark }],
])('tokens (%s) pass WCAG AA', (_mode, t) => {
  it.each(TEXT.flatMap((fg) => SURFACES.map((bg) => [fg, bg])))(
    'text %s on %s ≥ 4.5',
    (fg, bg) => {
      expect(contrast(t[fg]!, t[bg]!)).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each([
    ['--on-accent', '--accent'],
    ['--on-cta', '--accent-cta'],
  ])('text %s on %s ≥ 4.5', (fg, bg) => {
    expect(contrast(t[fg]!, t[bg]!)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(
    GRAPHICS.flatMap((fg) => ['--bg-base', '--bg-card'].map((bg) => [fg, bg])),
  )('graphic %s on %s ≥ 3', (fg, bg) => {
    expect(contrast(t[fg]!, t[bg]!)).toBeGreaterThanOrEqual(3);
  });
});

describe('tokens structure', () => {
  it('system dark and explicit dark are identical', () => {
    expect(systemDark).toEqual(dark);
  });

  it('dark overrides every light colour token', () => {
    const colours = Object.keys(light).filter((k) =>
      /^#[0-9a-f]{6}$/i.test(light[k]!),
    );
    expect(colours.filter((k) => !(k in dark))).toEqual([]);
  });

  it('has type, spacing, radius, motion and the 44 px touch target', () => {
    for (const k of [
      '--font',
      '--font-size-body',
      '--space-4',
      '--radius-card',
      '--motion-base',
    ])
      expect(light[k]).toBeTruthy();
    expect(light['--touch-target']).toBe('44px');
  });

  it('contrast helper matches the WCAG reference (black on white = 21)', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
  });
});
