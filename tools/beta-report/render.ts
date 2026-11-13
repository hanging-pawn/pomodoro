import type { Report, TesterMetrics } from './aggregate';

const pct = (r: number | null) =>
  r === null ? '–' : `${Math.round(r * 100)} %`;
const rows = (r: Report) => [...r.testers, r.total];
const featureList = (t: TesterMetrics) =>
  Object.entries(t.features)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${k}:${v}`)
    .join(';');

const CSV_HEADER = [
  'tester',
  'usage_days',
  'pomodoros',
  'aborted',
  'abort_rate_strict',
  'abort_rate_flexible',
  'planned',
  'planned_done',
  'plan_fulfilment',
  'redemptions',
  'coins_spent',
  'features',
];

const field = (v: unknown) => {
  const s = String(v ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const ratio = (r: number | null) => (r === null ? '' : r.toFixed(4));

/** One row per tester plus TOTAL (RFC 4180, CRLF); rates as fractions with 4 decimals. */
export function toCsv(report: Report): string {
  const lines = rows(report).map((t) =>
    [
      t.testerId,
      t.usageDays,
      t.pomodoros,
      t.aborted,
      ratio(t.modes.strict.abortRate),
      ratio(t.modes.flexible.abortRate),
      t.planned,
      t.plannedDone,
      ratio(t.planFulfilment),
      t.redemptions,
      t.coinsSpent,
      featureList(t),
    ]
      .map(field)
      .join(','),
  );
  return [CSV_HEADER.join(','), ...lines].join('\r\n') + '\r\n';
}

export function toMarkdown(report: Report, date: string): string {
  const head =
    '| Tester | Usage days | Pomodoros | Aborted | Abort rate strict | Abort rate flexible | Plan fulfilment | Redemptions | Coins spent |\n| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |';
  const body = rows(report).map((t) => {
    const name = t.testerId === 'TOTAL' ? '**TOTAL**' : t.testerId;
    return `| ${name} | ${t.usageDays} | ${t.pomodoros} | ${t.aborted} | ${pct(t.modes.strict.abortRate)} | ${pct(t.modes.flexible.abortRate)} | ${pct(t.planFulfilment)} (${t.plannedDone}/${t.planned}) | ${t.redemptions} | ${t.coinsSpent} |`;
  });
  const features = rows(report).map(
    (t) =>
      `- ${t.testerId === 'TOTAL' ? '**TOTAL**' : t.testerId}: ${Object.keys(t.features).length ? featureList(t).replaceAll(';', ', ') : '–'}`,
  );
  return `# Beta evaluation ${date}

Source: \`testers/<id>/events/*.jsonl\` of the beta data repo (FR-504). ${report.testers.length} testers.

- **Usage days**: distinct UTC days with at least one event; TOTAL is the sum over testers (tester-days).
- **Abort rate**: aborted / (completed + aborted) per mode.
- **Plan fulfilment**: planned tasks (final day plan, counted per day) that are marked done.
- TOTAL sums the counts; rates are recomputed from the sums.

${head}
${body.join('\n')}

## Features used

${features.join('\n')}
`;
}
