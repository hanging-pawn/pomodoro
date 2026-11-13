/* global console, process */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Secret scan (NFR-16): fails when a token or key is found in the repo (tracked and untracked,
 * not ignored files) or in the build output `dist/`. Matches are never printed, only file, line
 * and rule. A line holding the marker `secret-scan:allow` is skipped (for fixtures).
 * Rules are assembled from parts so this file does not match itself.
 */
export const RULES = [
  {
    name: 'GitHub fine-grained token',
    re: new RegExp('github' + '_pat_[A-Za-z0-9_]{20,}'),
  },
  { name: 'GitHub token', re: new RegExp('gh[pousr]' + '_[A-Za-z0-9]{30,}') },
  {
    name: 'Private key',
    re: new RegExp('-----BEGIN (?:[A-Z]+ )?PRIVATE' + ' KEY-----'),
  },
  { name: 'AWS access key id', re: new RegExp('AK' + 'IA[0-9A-Z]{16}') },
];
const ALLOW = 'secret-scan:allow';

/** Returns `{ file, line, rule }` for every hit in `text`. */
export function scanText(file, text) {
  const hits = [];
  text.split('\n').forEach((content, i) => {
    if (content.includes(ALLOW)) return;
    for (const rule of RULES)
      if (rule.re.test(content))
        hits.push({ file, line: i + 1, rule: rule.name });
  });
  return hits;
}

const isText = (buf) => !buf.subarray(0, 8000).includes(0);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

/** Scans the repo files under `root` (via git) and the `dist` folder if present. */
export function scanRepo(root = '.') {
  const listed = execFileSync(
    'git',
    ['ls-files', '-co', '--exclude-standard', '-z'],
    {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    },
  )
    .split('\0')
    .filter(Boolean)
    .map((f) => join(root, f));
  let dist = [];
  try {
    dist = walk(join(root, 'dist'));
  } catch {
    // No build output: only the repo is scanned.
  }
  const hits = [];
  for (const file of new Set([...listed, ...dist])) {
    let buf;
    try {
      buf = readFileSync(file);
    } catch {
      continue; // deleted but still listed
    }
    if (isText(buf)) hits.push(...scanText(file, buf.toString('utf8')));
  }
  return hits;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const hits = scanRepo('.');
  for (const h of hits) console.error(`SECRET ${h.rule}: ${h.file}:${h.line}`);
  if (hits.length) {
    console.error(
      `Secret scan failed: ${hits.length} hit(s). Remove the value and rotate the key.`,
    );
    process.exit(1);
  }
  console.log('Secret scan: no secrets found in the repo and dist/.');
}
