import { newEvent, type DomainEvent } from '../domain/events';
import type { Store } from '../storage/store';
import { dayKey } from '../tasks/inventory';

/**
 * Demo day for design checks (POMO-79): German tasks, a plan, two finished rounds, rewards.
 * Dev server only (`?demo` in the URL); never part of the production build.
 */
export function demoEvents(now = Date.now()): DomainEvent[] {
  const at = (minAgo: number) => now - minAgo * 60_000;
  const day = dayKey(now);
  const task = (
    taskId: string,
    title: string,
    estimate: number,
    minAgo: number,
    extra: Record<string, unknown> = {},
  ) =>
    newEvent('task.created', { taskId, title, estimate, ...extra }, at(minAgo));
  return [
    newEvent('rewards.seeded', { locale: 'de' }, at(300)),
    newEvent(
      'reward.saved',
      { rewardId: 'r1', title: 'Kaffee draussen', price: 40 },
      at(299),
    ),
    newEvent(
      'reward.saved',
      { rewardId: 'r2', title: 'Eine Folge schauen', price: 80 },
      at(298),
    ),
    newEvent(
      'reward.saved',
      { rewardId: 'r3', title: 'Spaziergang', price: 30 },
      at(297),
    ),
    task('a', 'Projektbericht schreiben', 2, 290, {
      project: 'Lima',
      bullets: ['Zahlen Q3 prüfen', 'Fazit kürzen', 'An Team senden'],
    }),
    task('b', 'Prüfung Statistik lernen', 2, 289, { project: 'Studium' }),
    task('c', 'Mails beantworten', 1, 288),
    task('d', 'Folien Donnerstag', 1, 287, { project: 'Lima' }),
    task('e', 'Steuererklärung', 3, 286, { due: day }),
    newEvent('plan.changed', { day, taskIds: ['a', 'b', 'c', 'd'] }, at(280)),
    newEvent(
      'pomodoro.started',
      { pomodoroId: 'p1', taskId: 'a', mode: 'strict', focusMinutes: 25 },
      at(120),
    ),
    newEvent('pomodoro.completed', { pomodoroId: 'p1' }, at(95)),
    newEvent(
      'pomodoro.started',
      { pomodoroId: 'p2', taskId: 'a', mode: 'strict', focusMinutes: 25 },
      at(90),
    ),
    newEvent('pomodoro.completed', { pomodoroId: 'p2' }, at(65)),
  ];
}

/** `?demo` on the dev server replaces the local data with the demo day once, then drops the flag. */
export async function maybeLoadDemo(store: Promise<Store>): Promise<void> {
  const url = new URL(location.href);
  if (!url.searchParams.has('demo')) return;
  const s = await store;
  await s.wipe();
  await s.append(...demoEvents());
  url.searchParams.delete('demo');
  history.replaceState(null, '', url);
  location.reload();
}
