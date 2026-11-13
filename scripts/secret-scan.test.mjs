// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { scanRepo, scanText } from './secret-scan.mjs';

// Built at run time so this test file holds no token-shaped literal itself.
const fakePat = () => 'github' + '_pat_' + 'A1b2C3d4E5'.repeat(4);

function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'scan-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  writeFileSync(join(dir, '.gitignore'), 'ignored.txt\n');
  return dir;
}

describe('scanText', () => {
  it('flags a fine-grained token and names the line, never the value', () => {
    const hits = scanText('a.txt', `ok\nconst t = "${fakePat()}";\n`);
    expect(hits).toEqual([
      { file: 'a.txt', line: 2, rule: 'GitHub fine-grained token' },
    ]);
    expect(JSON.stringify(hits)).not.toContain('A1b2C3');
  });

  it('flags classic tokens and private keys', () => {
    expect(scanText('a', 'x ' + 'ghp' + '_' + 'a'.repeat(36))).toHaveLength(1);
    expect(scanText('a', '-----BEGIN ' + 'PRIVATE KEY-----')).toHaveLength(1);
  });

  it('ignores prose that merely names the prefix', () => {
    expect(scanText('a', 'tokens look like github_pat_… or ghp_…')).toEqual([]);
  });

  it('skips a line marked as fixture', () => {
    expect(scanText('a', `${fakePat()} // secret-scan:allow`)).toEqual([]);
  });
});

describe('scanRepo', () => {
  it('finds a planted token in an untracked repo file', () => {
    const dir = repo();
    writeFileSync(join(dir, 'config.ts'), `export const k = '${fakePat()}';\n`);
    expect(scanRepo(dir).map((h) => h.rule)).toEqual([
      'GitHub fine-grained token',
    ]);
  });

  it('finds a planted token in dist/ even though dist is ignored', () => {
    const dir = repo();
    writeFileSync(join(dir, '.gitignore'), 'dist\n');
    mkdirSync(join(dir, 'dist/assets'), { recursive: true });
    writeFileSync(join(dir, 'dist/assets/app.js'), `var k="${fakePat()}"`);
    expect(scanRepo(dir)).toHaveLength(1);
  });

  it('does not scan ignored files outside dist, and passes a clean repo', () => {
    const dir = repo();
    writeFileSync(join(dir, 'ignored.txt'), fakePat());
    writeFileSync(join(dir, 'ok.ts'), 'export {};\n');
    expect(scanRepo(dir)).toEqual([]);
  });
});
