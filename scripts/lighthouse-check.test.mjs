// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { evaluateReport } from './lighthouse-check.mjs';

const report = (a11y, fcp) => ({
  categories: { accessibility: { score: a11y } },
  audits: { 'first-contentful-paint': { numericValue: fcp } },
});

describe('evaluateReport (NFR-07, NFR-08)', () => {
  it('passes at accessibility 90 and FCP below 1.5 s', () => {
    const r = evaluateReport(report(0.9, 1499));
    expect(r.ok).toBe(true);
    expect(r.line).toContain('accessibility 90');
    expect(r.line).toContain('FCP 1.50 s');
  });

  it('fails below accessibility 90', () => {
    const r = evaluateReport(report(0.89, 800));
    expect(r.ok).toBe(false);
    expect(r.line).toContain('FAIL');
  });

  it('fails at FCP 1.5 s or more', () => {
    expect(evaluateReport(report(1, 1500)).ok).toBe(false);
  });

  it('fails when the report lacks the values', () => {
    expect(evaluateReport({}).ok).toBe(false);
  });
});
