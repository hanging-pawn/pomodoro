import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { aggregate } from './aggregate';
import { loadTesters } from './load';
import { writeReport } from './write';

const DEFAULT_REPO = 'hanging-pawn/pomodoro-beta-data';
const VAULT_OUT = join(
  homedir(),
  'Library/Mobile Documents/iCloud~md~obsidian/Documents/Projekte/Pomodoro/06_Auswertung',
);

try {
  const { values } = parseArgs({
    options: {
      dir: { type: 'string' },
      repo: { type: 'string', default: DEFAULT_REPO },
      out: { type: 'string', default: VAULT_OUT },
      date: { type: 'string', default: new Date().toISOString().slice(0, 10) },
    },
  });
  let dir = values.dir;
  if (!dir) {
    dir = mkdtempSync(join(tmpdir(), 'pomo-beta-data-'));
    execFileSync(
      'gh',
      ['repo', 'clone', values.repo!, dir, '--', '--depth', '1'],
      {
        stdio: 'inherit',
      },
    );
  }
  const report = aggregate(loadTesters(dir));
  for (const file of writeReport(report, values.out!, values.date!))
    console.log(file);
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
}
