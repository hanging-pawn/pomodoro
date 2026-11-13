import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { findTokens, openDataRepo, type TesterListEntry } from './testers';

export const DEFAULT_REPO = 'hanging-pawn/pomodoro-beta-data';

export interface Context {
  log: (line: string) => void;
  now: () => Date;
}

const USAGE = `Verwendung:
  beta-admin tester add  --id <id> --name <name> --email <mail> --lang de|en|it --token-expiry JJJJ-MM-TT
  beta-admin tester list
  beta-admin tester lock --id <id>
Optionen: --dir <Arbeitskopie> (sonst Klon von ${DEFAULT_REPO} via gh), --repo <owner/name>, --no-push`;

export function run(argv: string[], ctx: Context): void {
  const { positionals, values } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      dir: { type: 'string' },
      repo: { type: 'string', default: DEFAULT_REPO },
      'no-push': { type: 'boolean', default: false },
      id: { type: 'string' },
      name: { type: 'string' },
      email: { type: 'string' },
      lang: { type: 'string' },
      'token-expiry': { type: 'string' },
    },
  });
  const [group, command] = positionals;
  if (
    group !== 'tester' ||
    !command ||
    !['add', 'list', 'lock'].includes(command)
  ) {
    throw new Error(USAGE);
  }

  const dir = values.dir ?? cloneWithGh(values.repo);
  syncFromRemote(dir);
  const repo = openDataRepo(dir, ctx.now);
  const required = (key: 'id' | 'name' | 'email' | 'lang' | 'token-expiry') => {
    const v = values[key];
    if (!v) throw new Error(`--${key} fehlt\n\n${USAGE}`);
    return v;
  };

  if (command === 'list') {
    printList(repo.list(), ctx.log);
    return;
  }
  if (command === 'add') {
    const id = required('id');
    repo.add({
      id,
      name: required('name'),
      email: required('email'),
      lang: required('lang'),
      tokenExpiry: required('token-expiry'),
    });
    commit(dir, `tester add ${id}`, !values['no-push']);
    ctx.log(
      `Tester ${id} angelegt: testers/${id}/account.json, admin/testers.json`,
    );
    return;
  }
  const id = required('id');
  repo.lock(id);
  commit(dir, `tester lock ${id}`, !values['no-push']);
  ctx.log(`Tester ${id} gesperrt.`);
  ctx.log(
    'Jetzt den Token des Testers auf GitHub widerrufen: https://github.com/settings/personal-access-tokens',
  );
}

function printList(
  testers: TesterListEntry[],
  log: (line: string) => void,
): void {
  const rows = [
    ['ID', 'Name', 'E-Mail', 'Token-Ablauf', 'Status'],
    ...testers.map((t) => [
      t.testerId,
      t.name,
      t.email,
      t.tokenExpiry,
      t.status,
    ]),
  ];
  const widths = rows[0]!.map((_, i) =>
    Math.max(...rows.map((r) => r[i]!.length)),
  );
  for (const r of rows)
    log(
      r
        .map((c, i) => c.padEnd(widths[i]!))
        .join('  ')
        .trimEnd(),
    );
  if (!testers.length) log('(keine Tester)');
}

function git(dir: string, ...args: string[]): string {
  return execFileSync('git', ['-C', dir, ...args], {
    encoding: 'utf8',
    stdio: 'pipe',
  });
}

function hasCommits(dir: string): boolean {
  try {
    git(dir, 'rev-parse', '--verify', 'HEAD');
    return true;
  } catch {
    return false;
  }
}

function hasRemote(dir: string): boolean {
  return git(dir, 'remote').trim().length > 0;
}

function cloneWithGh(repo: string): string {
  const dir = join(mkdtempSync(join(tmpdir(), 'beta-data-')), 'repo');
  execFileSync('gh', ['repo', 'clone', repo, dir, '--', '-q'], {
    stdio: 'pipe',
  });
  return dir;
}

function syncFromRemote(dir: string): void {
  if (hasRemote(dir) && hasCommits(dir)) git(dir, 'pull', '-q', '--ff-only');
}

function commit(dir: string, message: string, push: boolean): void {
  const leaks = findTokens(dir);
  if (leaks.length) {
    throw new Error(
      `Abbruch: Token-ähnlicher Text in ${leaks.join(', ')}; nichts committet`,
    );
  }
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', `beta-admin: ${message}`);
  if (push && hasRemote(dir)) git(dir, 'push', '-q', '-u', 'origin', 'HEAD');
}
