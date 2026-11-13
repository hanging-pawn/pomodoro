// @vitest-environment node
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { aggregate } from './aggregate';
import { loadTesters } from './load';
import { toCsv, toMarkdown } from './render';
import { writeReport } from './write';

const line = (id: string, at: string, type: string, payload: object) =>
  JSON.stringify({ id, at: Date.parse(at), type, payload });

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'beta-report-'));
  const tester = (id: string, files: Record<string, string[]>) => {
    mkdirSync(join(dir, 'testers', id, 'events'), { recursive: true });
    writeFileSync(
      join(dir, 'testers', id, 'account.json'),
      JSON.stringify({ testerId: id }),
    );
    for (const [day, lines] of Object.entries(files))
      writeFileSync(
        join(dir, 'testers', id, 'events', `${day}.jsonl`),
        lines.join('\n') + '\n',
      );
  };
  const round = (
    p: string,
    day: string,
    mode: string,
    end: 'completed' | 'aborted',
  ) => [
    line(`${p}s`, `${day}T10:00:00Z`, 'pomodoro.started', {
      pomodoroId: p,
      taskId: 't',
      mode,
      focusMinutes: 25,
    }),
    end === 'completed'
      ? line(`${p}c`, `${day}T10:25:00Z`, 'pomodoro.completed', {
          pomodoroId: p,
        })
      : line(`${p}a`, `${day}T10:05:00Z`, 'pomodoro.aborted', {
          pomodoroId: p,
          interruption: 'internal',
          workedMinutes: 5,
        }),
  ];
  tester('anna', {
    '2026-11-14': round('a1', '2026-11-14', 'strict', 'completed'),
    '2026-11-15': round('a2', '2026-11-15', 'strict', 'aborted'),
  });
  tester('ben', {
    '2026-11-14': round('b1', '2026-11-14', 'flexible', 'completed'),
  });
  tester('cara', {
    '2026-11-16': [
      line('c1', '2026-11-16T09:00:00Z', 'usage.feature-used', {
        feature: 'park',
      }),
    ],
  });
  mkdirSync(join(dir, 'admin'), { recursive: true });
  return dir;
}

describe('loadTesters', () => {
  it('reads every tester folder, all day files', () => {
    const data = loadTesters(fixture());
    expect(data.map((d) => [d.testerId, d.events.length])).toEqual([
      ['anna', 4],
      ['ben', 2],
      ['cara', 1],
    ]);
  });

  it('names the file and line of a broken event line', () => {
    const dir = fixture();
    writeFileSync(join(dir, 'testers/ben/events/2026-11-20.jsonl'), '{oops\n');
    expect(() => loadTesters(dir)).toThrow(/ben.*2026-11-20\.jsonl.*line 1/);
  });
});

describe('report files', () => {
  const report = aggregate(loadTesters(fixture()));

  it('CSV has a header, one row per tester and a TOTAL row matching the raw data', () => {
    const rows = toCsv(report).trim().split('\r\n');
    expect(rows[0]).toContain('tester,usage_days,pomodoros');
    expect(rows).toHaveLength(1 + 3 + 1);
    const total = rows.at(-1)!.split(',');
    expect(total[0]).toBe('TOTAL');
    expect(total[2]).toBe('2'); // pomodoros: a1, b1
    expect(total[3]).toBe('1'); // aborted: a2
  });

  it('Markdown shows every metric per tester and in total', () => {
    const md = toMarkdown(report, '2026-11-17');
    for (const word of [
      'Usage days',
      'Pomodoros',
      'Abort rate',
      'Plan fulfilment',
      'Redemptions',
      'Features used',
      'anna',
      'ben',
      'cara',
      'TOTAL',
    ])
      expect(md).toContain(word);
    expect(md).toContain('park');
  });

  it('writeReport creates the output folder and both files', () => {
    const out = join(mkdtempSync(join(tmpdir(), 'out-')), '06_Auswertung');
    const files = writeReport(report, out, '2026-11-17');
    expect(readdirSync(out).sort()).toEqual([
      '2026-11-17_Auswertung_Beta.csv',
      '2026-11-17_Auswertung_Beta.md',
    ]);
    expect(files).toHaveLength(2);
    expect(
      readFileSync(join(out, '2026-11-17_Auswertung_Beta.csv'), 'utf8'),
    ).toContain('TOTAL');
  });
});
