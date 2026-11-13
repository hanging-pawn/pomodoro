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
  /** Account created by the tester in the app (POMO-85); no token expiry is known. */
  selfRegistered?: boolean;
}

/** A tester as `list` shows it: from the admin list, or only from its account folder (POMO-87). */
export type ListedTester = TesterListEntry & { origin: 'admin' | 'app' };

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
  /** Admin list plus accounts created in the app (`testers/<id>/account.json` only). */
  list(): ListedTester[];
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

  const adminList = (): TesterListEntry[] =>
    existsSync(listPath)
      ? (JSON.parse(readFileSync(listPath, 'utf8')) as TesterListEntry[])
      : [];

  const readAccount = (id: string): Account | null => {
    try {
      return JSON.parse(readFileSync(accountPath(id), 'utf8')) as Account;
    } catch {
      return null;
    }
  };

  /** Testers that exist only as an account folder: created in the app (POMO-85). */
  const appOnly = (known: Set<string>): TesterListEntry[] => {
    const root = join(dir, 'testers');
    if (!existsSync(root)) return [];
    return readdirSync(root)
      .filter((id) => ID.test(id) && !known.has(id))
      .sort()
      .flatMap((id) => {
        const a = readAccount(id);
        if (!a) return [];
        return [
          {
            testerId: id,
            name: a.name ?? '',
            email: a.email ?? '',
            tokenExpiry: '',
            status: a.status ?? 'aktiv',
            createdAt: a.createdAt ?? '',
            ...(a.lockedAt ? { lockedAt: a.lockedAt } : {}),
          },
        ];
      });
  };

  const list = (): ListedTester[] => {
    const admin = adminList();
    const known = new Set(admin.map((t) => t.testerId));
    return [
      ...admin.map((t) => ({ ...t, origin: 'admin' as const })),
      ...appOnly(known).map((t) => ({ ...t, origin: 'app' as const })),
    ];
  };

  return {
    init,
    list,
    add(t) {
      validate(t);
      init();
      const testers = adminList();
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
      const testers = adminList();
      let entry = testers.find((x) => x.testerId === id);
      if (!entry) {
        // Self-registered: it joins the admin list so the lock is recorded there too.
        const found = appOnly(new Set()).find((x) => x.testerId === id);
        if (!found) throw new Error(`Tester ${id} unbekannt`);
        entry = { ...found, selfRegistered: true };
        testers.push(entry);
      }
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
