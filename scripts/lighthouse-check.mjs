/* global console, process */
// Reads a Lighthouse JSON report (mobile preset) and enforces the thresholds: accessibility
// at least 90 (NFR-08), first contentful paint under 1.5 s (NFR-07). Used by the CI job.
// Usage: node scripts/lighthouse-check.mjs <report.json>
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const MIN_A11Y = 90;
export const MAX_FCP_MS = 1500;

export function evaluateReport(report) {
  const a11y = report?.categories?.accessibility?.score;
  const fcp = report?.audits?.['first-contentful-paint']?.numericValue;
  if (typeof a11y !== 'number' || typeof fcp !== 'number')
    return { ok: false, line: 'Lighthouse: FAIL, report lacks the values' };
  const score = Math.round(a11y * 100);
  const ok = score >= MIN_A11Y && fcp < MAX_FCP_MS;
  return {
    ok,
    line: `Lighthouse mobile: accessibility ${score} (min ${MIN_A11Y}), FCP ${(fcp / 1000).toFixed(2)} s (max ${MAX_FCP_MS / 1000} s): ${ok ? 'OK' : 'FAIL'}`,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { ok, line } = evaluateReport(
    JSON.parse(readFileSync(process.argv[2], 'utf8')),
  );
  console.log(line);
  process.exit(ok ? 0 : 1);
}
