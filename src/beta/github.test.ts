import { describe, expect, it } from 'vitest';
import { createRepoClient } from './github';
import { createFakeGitHub } from './testing/fake-github';

const REPO = 'hanging-pawn/pomodoro-beta-data';
const TOKEN = 'test-token';

describe('createRepoClient', () => {
  it('writes several files in one commit', async () => {
    const gh = createFakeGitHub();
    const client = createRepoClient({
      repo: REPO,
      token: TOKEN,
      fetch: gh.fetch,
    });

    const result = await client.commit('beta: upload', async () => ({
      'testers/anna/events/2026-11-13.jsonl': '{"id":"a"}\n',
      'testers/anna/snapshot.json': '{"coins":10}\n',
    }));

    expect(result).toBe('committed');
    expect(gh.commits()).toHaveLength(1);
    expect(gh.file('testers/anna/events/2026-11-13.jsonl')).toBe(
      '{"id":"a"}\n',
    );
    expect(gh.file('testers/anna/snapshot.json')).toBe('{"coins":10}\n');
    expect(gh.file('README.md')).toBe('# beta data\n');
  });

  it('lets the update merge with what is already in the repo', async () => {
    const gh = createFakeGitHub();
    gh.pushFromElsewhere('log.txt', 'a\n');
    const client = createRepoClient({
      repo: REPO,
      token: TOKEN,
      fetch: gh.fetch,
    });

    await client.commit('append', async (read) => ({
      'log.txt': ((await read('log.txt')) ?? '') + 'b\n',
    }));

    expect(gh.file('log.txt')).toBe('a\nb\n');
  });

  it('reads missing files as null and non-ASCII content intact', async () => {
    const gh = createFakeGitHub();
    gh.pushFromElsewhere('t.txt', 'Grüezi – ciao 🍅\n'.repeat(20));
    const client = createRepoClient({
      repo: REPO,
      token: TOKEN,
      fetch: gh.fetch,
    });
    const seen: (string | null)[] = [];

    await client.commit('read', async (read) => {
      seen.push(await read('t.txt'), await read('missing.txt'));
      return null;
    });

    expect(seen).toEqual(['Grüezi – ciao 🍅\n'.repeat(20), null]);
  });

  it('makes no commit when nothing would change', async () => {
    const gh = createFakeGitHub();
    gh.pushFromElsewhere('same.txt', 'x');
    const client = createRepoClient({
      repo: REPO,
      token: TOKEN,
      fetch: gh.fetch,
    });

    expect(await client.commit('noop', async () => null)).toBe('unchanged');
    expect(await client.commit('same', async () => ({ 'same.txt': 'x' }))).toBe(
      'unchanged',
    );
    expect(gh.commits()).toHaveLength(0);
  });

  it('merges again when another device pushed in between', async () => {
    const gh = createFakeGitHub();
    gh.pushFromElsewhere('log.txt', 'a\n');
    gh.beforeNextRefUpdate = () =>
      gh.pushFromElsewhere('log.txt', 'a\nother\n');
    const client = createRepoClient({
      repo: REPO,
      token: TOKEN,
      fetch: gh.fetch,
    });

    const result = await client.commit('append', async (read) => ({
      'log.txt': ((await read('log.txt')) ?? '') + 'b\n',
    }));

    expect(result).toBe('committed');
    expect(gh.file('log.txt')).toBe('a\nother\nb\n');
  });

  it('rejects when offline and writes nothing', async () => {
    const gh = createFakeGitHub();
    gh.offline = true;
    const client = createRepoClient({
      repo: REPO,
      token: TOKEN,
      fetch: gh.fetch,
    });

    await expect(
      client.commit('x', async () => ({ 'a.txt': 'a' })),
    ).rejects.toThrow();
    gh.offline = false;
    expect(gh.file('a.txt')).toBeUndefined();
  });

  it('rejects on API errors such as a bad token', async () => {
    const gh = createFakeGitHub();
    const client = createRepoClient({ repo: REPO, token: '', fetch: gh.fetch });

    await expect(
      client.commit('x', async () => ({ 'a.txt': 'a' })),
    ).rejects.toMatchObject({
      status: 401,
    });
  });

  it('only ever requests api.github.com', async () => {
    const gh = createFakeGitHub();
    const client = createRepoClient({
      repo: REPO,
      token: TOKEN,
      fetch: gh.fetch,
    });
    await client.commit('x', async (read) => ({
      'a.txt': (await read('a.txt')) ?? 'a',
    }));

    expect(gh.requests.length).toBeGreaterThan(0);
    expect(new Set(gh.requests.map((u) => new URL(u).host))).toEqual(
      new Set(['api.github.com']),
    );
  });

  it('refuses a repo name that could change the host or path', () => {
    for (const repo of [
      'evil.com/x/y',
      'a/b/../c',
      '//evil.com',
      'nope',
      'a/..',
    ])
      expect(() => createRepoClient({ repo, token: TOKEN })).toThrow();
  });
});
