import { describe, expect, it } from 'vitest';
import { isOverdue, nextDue } from './recurrence';

describe('nextDue (FR-207)', () => {
  it('weekly: same weekday one week later (Monday → next Monday)', () => {
    expect(nextDue('weekly', '2026-11-09', '2026-11-09')).toBe('2026-11-16');
  });
  it('daily: the day after', () => {
    expect(nextDue('daily', '2026-11-30', '2026-11-30')).toBe('2026-12-01');
  });
  it('weekdays: Friday → Monday', () => {
    expect(nextDue('weekdays', '2026-11-13', '2026-11-13')).toBe('2026-11-16');
  });
  it('weekdays: Monday → Tuesday', () => {
    expect(nextDue('weekdays', '2026-11-09', '2026-11-09')).toBe('2026-11-10');
  });
  it('done late: skips occurrences up to today', () => {
    // weekly Monday task, due 2026-11-02, done on Wednesday 2026-11-11 → Monday 2026-11-16
    expect(nextDue('weekly', '2026-11-02', '2026-11-11')).toBe('2026-11-16');
  });
  it('no due date: counts from today', () => {
    expect(nextDue('daily', undefined, '2026-11-13')).toBe('2026-11-14');
  });
});

describe('isOverdue (FR-208)', () => {
  it('due yesterday is overdue, due today is not', () => {
    expect(isOverdue('2026-11-12', '2026-11-13')).toBe(true);
    expect(isOverdue('2026-11-13', '2026-11-13')).toBe(false);
  });
  it('no due date is never overdue', () => {
    expect(isOverdue(undefined, '2026-11-13')).toBe(false);
    expect(isOverdue('', '2026-11-13')).toBe(false);
  });
});
