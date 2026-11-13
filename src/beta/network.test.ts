import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * NFR-09: the app talks only to its own Pages origin (relative URLs) and, for sync or beta
 * upload, to api.github.com. Network calls at runtime are checked in github.test.ts and
 * uploader.test.ts (every request goes through the fake and is api.github.com); this test checks
 * the source: no other host is named and only the GitHub client opens connections.
 */
const ROOT = join(__dirname, '../..');
const ALLOWED_HOSTS = new Set(['api.github.com']);
const NETWORK_API =
  /\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts)/;

function appFiles(dir = join(ROOT, 'src')): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory())
      return name === 'testing' ? [] : appFiles(path);
    return /\.(ts|js|html|css)$/.test(name) && !/\.test\.ts$/.test(name)
      ? [path]
      : [];
  });
}

describe('network hosts (NFR-09)', () => {
  const files = [...appFiles(), join(ROOT, 'index.html')];

  it('names no host other than api.github.com in app code', () => {
    const hosts = new Set<string>();
    for (const file of files)
      for (const m of readFileSync(file, 'utf8').matchAll(
        /\b(?:https?|wss?):\/\/([^/\s'"`)]+)/g,
      ))
        hosts.add(m[1]!);
    expect([...hosts].filter((h) => !ALLOWED_HOSTS.has(h))).toEqual([]);
  });

  it('opens connections only in the GitHub client', () => {
    const callers = files
      .filter((f) => NETWORK_API.test(readFileSync(f, 'utf8')))
      .map((f) => relative(ROOT, f));
    expect(callers).toEqual(['src/beta/github.ts']);
  });
});
