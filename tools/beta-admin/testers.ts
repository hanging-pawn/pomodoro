import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative } from 'node:path';

/**
 * Tester administration on a working copy of the beta data repo (FR-503).
 * Layout: README.md, admin/testers.json (the list), testers/<id>/account.json (FR-502).
 * Never stores a token: inputs that look like one are refused.
 */

export type TesterStatus = 'aktiv' | 'gesperrt';
export const LANGS = ['de', 'en', 'it'] as const;

export interface NewTester {
  id: string;
  name: string;
  email: string;
  lang: string;
  /** Expiry date of the tester's fine-grained token, YYYY-MM-DD. The token itself is never given. */
  tokenExpiry: string;
}

export interface TesterListEntry {
  testerId: string;
  name: string;
  email: string;
  tokenExpiry: string;
  status: TesterStatus;
  createdAt: string;
  lockedAt?: string;
}

export interface Account {
  testerId: string;
  name: string;
  email: string;
  lang: string;
  status: TesterStatus;
  createdAt: string;
  lastLogin: string | null;
  device: string | null;
  appVersion: string | null;
  lockedAt?: string;
}

export interface DataRepo {
  /** Creates README, admin list and testers folder where missing; keeps existing files. */
  init(): void;
  add(tester: NewTester): Account;
  list(): TesterListEntry[];
  lock(id: string): TesterListEntry;
}

/** GitHub token prefixes (fine-grained, classic, OAuth, app, refresh). */
const TOKEN = /(github_pat_|gh[pousr]_)[A-Za-z0-9_]{20,}/;
const ID = /^[a-z0-9][a-z0-9-]{1,31}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const README = `# pomo.pomo beta data

Private data of the pomo.pomo beta (FR-501 to FR-504). Managed with \`tools/beta-admin\` in the app repo.

- \`admin/testers.json\`: list of testers (id, name, e-mail, token expiry, status). Never a token.
- \`testers/<tester-id>/account.json\`: account of one tester; the app writes the tester's data next to it.

Tokens are never stored here. Locking a tester sets the status \`gesperrt\`; revoke the token on GitHub as well.
`;

export function openDataRepo(
  dir: string,
  now: () => Date = () => new Date(),
): DataRepo {
  const listPath = join(dir, 'admin/testers.json');
  const accountPath = (id: string) => join(dir, 'testers', id, 'account.json');

  const init = () => {
    if (!existsSync(join(dir, 'README.md')))
      write(join(dir, 'README.md'), README);
    if (!existsSync(listPath)) writeJson(listPath, []);
    mkdirSync(join(dir, 'testers'), { recursive: true });
    if (!existsSync(join(dir, 'testers/.gitkeep')))
      write(join(dir, 'testers/.gitkeep'), '');
  };

  const list = (): TesterListEntry[] =>
    existsSync(listPath)
      ? (JSON.parse(readFileSync(listPath, 'utf8')) as TesterListEntry[])
      : [];

  return {
    init,
    list,
    add(t) {
      validate(t);
      init();
      const testers = list();
      if (
        testers.some((x) => x.testerId === t.id) ||
        existsSync(accountPath(t.id))
      ) {
        throw new Error(`Tester ${t.id} existiert bereits`);
      }
      const createdAt = now().toISOString();
      const account: Account = {
        testerId: t.id,
        name: t.name,
        email: t.email,
        lang: t.lang,
        status: 'aktiv',
        createdAt,
        lastLogin: null,
        device: null,
        appVersion: null,
      };
      writeJson(accountPath(t.id), account);
      testers.push({
        testerId: t.id,
        name: t.name,
        email: t.email,
        tokenExpiry: t.tokenExpiry,
        status: 'aktiv',
        createdAt,
      });
      writeJson(listPath, testers);
      return account;
    },
    lock(id) {
      const testers = list();
      const entry = testers.find((x) => x.testerId === id);
      if (!entry) throw new Error(`Tester ${id} unbekannt`);
      const lockedAt = now().toISOString();
      Object.assign(entry, { status: 'gesperrt', lockedAt });
      writeJson(listPath, testers);
      if (existsSync(accountPath(id))) {
        const account = JSON.parse(
          readFileSync(accountPath(id), 'utf8'),
        ) as Account;
        writeJson(accountPath(id), {
          ...account,
          status: 'gesperrt',
          lockedAt,
        });
      }
      return entry;
    },
  };
}

function validate(t: NewTester): void {
  if (Object.values(t).some((v) => TOKEN.test(String(v)))) {
    throw new Error(
      'Eingabe sieht aus wie ein Token; Tokens werden nie gespeichert',
    );
  }
  if (!ID.test(t.id))
    throw new Error(`Ungültige ID «${t.id}» (a-z, 0-9, -, 2–32 Zeichen)`);
  if (!t.name.trim()) throw new Error('Name fehlt');
  if (!EMAIL.test(t.email)) throw new Error(`Ungültige E-Mail «${t.email}»`);
  if (!(LANGS as readonly string[]).includes(t.lang)) {
    throw new Error(
      `Sprache «${t.lang}» nicht unterstützt (${LANGS.join(', ')})`,
    );
  }
  if (!DATE.test(t.tokenExpiry) || Number.isNaN(Date.parse(t.tokenExpiry))) {
    throw new Error(`Ungültiges Ablaufdatum «${t.tokenExpiry}» (JJJJ-MM-TT)`);
  }
}

/** Relative paths of files under `dir` (outside .git) that contain a token-like string. */
export function findTokens(dir: string): string[] {
  const hits: string[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      if (name === '.git') continue;
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (TOKEN.test(readFileSync(p, 'utf8'))) hits.push(relative(dir, p));
    }
  };
  walk(dir);
  return hits.sort();
}

function write(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function writeJson(path: string, value: unknown): void {
  write(path, JSON.stringify(value, null, 2) + '\n');
}
