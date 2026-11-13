// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const manifest = JSON.parse(
  readFileSync('public/manifest.webmanifest', 'utf8'),
) as {
  name: string;
  start_url: string;
  display: string;
  icons: { src: string; sizes: string; purpose?: string }[];
};

describe('web app manifest (NFR-04)', () => {
  it('has the installability basics', () => {
    expect(manifest.name).toBe('pomo.pomo');
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBeTruthy();
    const sizes = manifest.icons.map((i) => i.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
    expect(manifest.icons.some((i) => i.purpose === 'maskable')).toBe(true);
  });

  it('points at icon files that exist', () => {
    for (const icon of manifest.icons)
      expect(existsSync(`public/${icon.src}`)).toBe(true);
  });

  it('never says Pomodoro (trademark rule)', () => {
    expect(JSON.stringify(manifest)).not.toMatch(/pomodoro/i);
  });
});

describe('service worker (NFR-04)', () => {
  it('only handles same-origin GET requests', () => {
    const sw = readFileSync('src/pwa/sw.js', 'utf8');
    expect(sw).toContain("request.method !== 'GET'");
    expect(sw).toContain('self.location.origin');
  });
});
