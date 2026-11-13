import {
  compareEvents,
  type DomainEvent,
  type Mode,
} from '../../src/domain/events';

export interface TesterData {
  testerId: string;
  events: DomainEvent[];
}

export interface ModeStats {
  completed: number;
  aborted: number;
  /** aborted / (completed + aborted); null without any finished or aborted round. */
  abortRate: number | null;
}

export interface TesterMetrics {
  testerId: string;
  /** Distinct UTC days with at least one event. */
  usageDays: number;
  /** Completed rounds. */
  pomodoros: number;
  aborted: number;
  modes: Record<Mode, ModeStats>;
  /** Tasks on a day plan (final plan of each day, counted per day). */
  planned: number;
  /** Planned tasks that are marked done. */
  plannedDone: number;
  planFulfilment: number | null;
  redemptions: number;
  coinsSpent: number;
  /** Feature name → times used (`usage.feature-used`). */
  features: Record<string, number>;
}

export interface Report {
  testers: TesterMetrics[];
  total: TesterMetrics;
}

const rate = (num: number, den: number) => (den === 0 ? null : num / den);
const modeStats = (completed: number, aborted: number): ModeStats => ({
  completed,
  aborted,
  abortRate: rate(aborted, completed + aborted),
});

export function metricsFor(data: TesterData): TesterMetrics {
  const seen = new Set<string>();
  const events = data.events
    .filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)))
    .sort(compareEvents);

  const days = new Set<string>();
  const roundMode = new Map<string, Mode>();
  const done = new Set<string>();
  const plans = new Map<string, string[]>();
  const counts = { strict: [0, 0], flexible: [0, 0] } as Record<
    Mode,
    [number, number]
  >;
  const features: Record<string, number> = {};
  let redemptions = 0;
  let coinsSpent = 0;

  for (const e of events) {
    days.add(new Date(e.at).toISOString().slice(0, 10));
    switch (e.type) {
      case 'pomodoro.started':
        roundMode.set(e.payload.pomodoroId, e.payload.mode);
        break;
      case 'pomodoro.completed': {
        const m = roundMode.get(e.payload.pomodoroId);
        if (m) counts[m][0] += 1;
        break;
      }
      case 'pomodoro.aborted': {
        const m = roundMode.get(e.payload.pomodoroId);
        if (m) counts[m][1] += 1;
        break;
      }
      case 'task.changed':
        if (e.payload.changes.done === true) done.add(e.payload.taskId);
        else if (e.payload.changes.done === false)
          done.delete(e.payload.taskId);
        break;
      case 'plan.changed':
        plans.set(e.payload.day, e.payload.taskIds);
        break;
      case 'reward.redeemed':
        redemptions += 1;
        coinsSpent += e.payload.price;
        break;
      case 'usage.feature-used':
        features[e.payload.feature] = (features[e.payload.feature] ?? 0) + 1;
        break;
    }
  }

  const planned = [...plans.values()].reduce((n, ids) => n + ids.length, 0);
  const plannedDone = [...plans.values()].reduce(
    (n, ids) => n + ids.filter((id) => done.has(id)).length,
    0,
  );
  return {
    testerId: data.testerId,
    usageDays: days.size,
    pomodoros: counts.strict[0] + counts.flexible[0],
    aborted: counts.strict[1] + counts.flexible[1],
    modes: {
      strict: modeStats(...counts.strict),
      flexible: modeStats(...counts.flexible),
    },
    planned,
    plannedDone,
    planFulfilment: rate(plannedDone, planned),
    redemptions,
    coinsSpent,
    features,
  };
}

/** Per-tester metrics (ordered by id) and totals; totals are sums of the counts, rates recomputed. */
export function aggregate(data: TesterData[]): Report {
  const testers = data
    .map(metricsFor)
    .sort((a, b) =>
      a.testerId < b.testerId ? -1 : a.testerId > b.testerId ? 1 : 0,
    );
  const sum = (f: (t: TesterMetrics) => number) =>
    testers.reduce((n, t) => n + f(t), 0);
  const features: Record<string, number> = {};
  for (const t of testers)
    for (const [k, v] of Object.entries(t.features))
      features[k] = (features[k] ?? 0) + v;
  const planned = sum((t) => t.planned);
  const plannedDone = sum((t) => t.plannedDone);
  const total: TesterMetrics = {
    testerId: 'TOTAL',
    usageDays: sum((t) => t.usageDays),
    pomodoros: sum((t) => t.pomodoros),
    aborted: sum((t) => t.aborted),
    modes: {
      strict: modeStats(
        sum((t) => t.modes.strict.completed),
        sum((t) => t.modes.strict.aborted),
      ),
      flexible: modeStats(
        sum((t) => t.modes.flexible.completed),
        sum((t) => t.modes.flexible.aborted),
      ),
    },
    planned,
    plannedDone,
    planFulfilment: rate(plannedDone, planned),
    redemptions: sum((t) => t.redemptions),
    coinsSpent: sum((t) => t.coinsSpent),
    features,
  };
  return { testers, total };
}
