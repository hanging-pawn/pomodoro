import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Report } from './aggregate';
import { toCsv, toMarkdown } from './render';

/** Writes `<date>_Auswertung_Beta.md` and `.csv` into `outDir` (created if missing); returns the paths. */
export function writeReport(
  report: Report,
  outDir: string,
  date: string,
): string[] {
  mkdirSync(outDir, { recursive: true });
  const base = join(outDir, `${date}_Auswertung_Beta`);
  writeFileSync(`${base}.md`, toMarkdown(report, date));
  writeFileSync(`${base}.csv`, toCsv(report));
  return [`${base}.md`, `${base}.csv`];
}
