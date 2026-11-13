// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { run } from './cli';
import { findTokens, openDataRepo } from './testers';

// Fake token shapes, assembled at runtime so no token-like literal sits in the source.
const FAKE_PAT = [
  'github',
  'pat',
  '11ABCDEFG0123456789',
  'abcdefghijklmnop',
].join('_');
const FAKE_CLASSIC = ['ghp', 'abcdefghijklmnopqrstuvwxyz0123456789'].join('_');
const NOW = new Date('2026-11-13T10:00:00Z');
const tmp = () => mkdtempSync(join(tmpdir(), 'beta-admin-'));
const readJson = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
const anna = {
  id: 'anna',
  name: 'Anna Muster',
  email: 'anna@example.com',
  lang: 'de',
  tokenExpiry: '2027-02-13',
};

describe('openDataRepo', () => {
  it('initialises an empty data repo with README, admin list and testers folder', () => {
    const dir = tmp();
    openDataRepo(dir, () => NOW).init();
    expect(existsSync(join(dir, 'README.md'))).toBe(true);
    expect(readJson(join(dir, 'admin/testers.json'))).toEqual([]);
    expect(existsSync(join(dir, 'testers'))).toBe(true);
  });

  it('add writes account.json and a line in admin/testers.json; list shows the tester', () => {
    const dir = tmp();
    const repo = openDataRepo(dir, () => NOW);
    repo.add(anna);

    expect(readJson(join(dir, 'testers/anna/account.json'))).toEqual({
      testerId: 'anna',
      name: 'Anna Muster',
      email: 'anna@example.com',
      lang: 'de',
      status: 'aktiv',
      createdAt: '2026-11-13T10:00:00.000Z',
      lastLogin: null,
      device: null,
      appVersion: null,
    });
    expect(readJson(join(dir, 'admin/testers.json'))).toEqual([
      {
        testerId: 'anna',
        name: 'Anna Muster',
        email: 'anna@example.com',
        tokenExpiry: '2027-02-13',
        status: 'aktiv',
        createdAt: '2026-11-13T10:00:00.000Z',
      },
    ]);
    expect(repo.list().map((t) => t.testerId)).toEqual(['anna']);
  });

  it('refuses a duplicate id and invalid input', () => {
    const repo = openDataRepo(tmp(), () => NOW);
    repo.add(anna);
    expect(() => repo.add(anna)).toThrow(/existiert/);
    expect(() => repo.add({ ...anna, id: 'Bad Id' })).toThrow(/ID/);
    expect(() => repo.add({ ...anna, id: 'ben', email: 'nope' })).toThrow(
      /E-Mail/,
    );
    expect(() => repo.add({ ...anna, id: 'ben', lang: 'fr' })).toThrow(
      /Sprache/,
    );
    expect(() =>
      repo.add({ ...anna, id: 'ben', tokenExpiry: '13.2.2027' }),
    ).toThrow(/Ablauf/);
  });

  it('refuses any input that looks like a token, so no token is ever written', () => {
    const dir = tmp();
    const repo = openDataRepo(dir, () => NOW);
    expect(() =>
      repo.add({
        ...anna,
        name: FAKE_PAT,
      }),
    ).toThrow(/Token/);
    expect(findTokens(dir)).toEqual([]);
  });

  it('lock marks the tester gesperrt in both files', () => {
    const dir = tmp();
    const repo = openDataRepo(dir, () => NOW);
    repo.add(anna);
    repo.lock('anna');
    expect(readJson(join(dir, 'testers/anna/account.json')).status).toBe(
      'gesperrt',
    );
    expect(repo.list()[0]?.status).toBe('gesperrt');
    expect(() => repo.lock('nobody')).toThrow(/unbekannt/);
  });
});

describe('findTokens', () => {
  it('finds token-like strings in any file of the repo', () => {
    const dir = tmp();
    openDataRepo(dir, () => NOW).init();
    writeFileSync(join(dir, 'leak.txt'), `x ${FAKE_CLASSIC} y`);
    expect(findTokens(dir)).toEqual(['leak.txt']);
  });
});

describe('cli', () => {
  function gitRepoWithRemote() {
    const remote = tmp();
    execFileSync('git', ['init', '--bare', '-q', '-b', 'main', remote]);
    const dir = tmp();
    execFileSync('git', ['clone', '-q', remote, dir]);
    execFileSync('git', [
      '-C',
      dir,
      'config',
      'user.email',
      'test@example.com',
    ]);
    execFileSync('git', ['-C', dir, 'config', 'user.name', 'Test']);
    return { remote, dir };
  }

  it('tester add commits and pushes both files; tester list shows the tester; no token in the repo', () => {
    const { remote, dir } = gitRepoWithRemote();
    const out: string[] = [];
    const log = (s: string) => out.push(s);

    run(
      [
        'tester',
        'add',
        '--dir',
        dir,
        '--id',
        'anna',
        '--name',
        'Anna Muster',
        '--email',
        'anna@example.com',
        '--lang',
        'de',
        '--token-expiry',
        '2027-02-13',
      ],
      { log, now: () => NOW },
    );
    run(['tester', 'list', '--dir', dir], { log, now: () => NOW });

    const files = execFileSync(
      'git',
      ['--git-dir', remote, 'ls-tree', '-r', '--name-only', 'main'],
      {
        encoding: 'utf8',
      },
    );
    expect(files.split('\n')).toEqual(
      expect.arrayContaining([
        'README.md',
        'admin/testers.json',
        'testers/anna/account.json',
      ]),
    );
    expect(out.join('\n')).toMatch(
      /anna\s+Anna Muster\s+anna@example.com\s+2027-02-13\s+aktiv/,
    );
    expect(findTokens(dir)).toEqual([]);
  });

  it('tester lock prints the hint to revoke the token', () => {
    const { dir } = gitRepoWithRemote();
    const out: string[] = [];
    const ctx = { log: (s: string) => out.push(s), now: () => NOW };
    run(
      [
        'tester',
        'add',
        '--dir',
        dir,
        '--id',
        'anna',
        '--name',
        'A',
        '--email',
        'a@b.ch',
        '--lang',
        'it',
        '--token-expiry',
        '2027-01-01',
      ],
      ctx,
    );
    run(['tester', 'lock', '--dir', dir, '--id', 'anna'], ctx);
    expect(out.join('\n')).toMatch(/Token .*widerrufen/);
  });
});
