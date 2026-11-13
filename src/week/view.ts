import type { AppState } from '../domain/state';
import type { I18n, MessageKey } from '../i18n/i18n';
import { DATA_CHANGED } from '../tasks/events';
import { card } from '../ui/components/card';
import { progressBar } from '../ui/components/progress-bar';
import { deriveWeek } from './model';

export interface WeekDeps {
  state(): Promise<AppState>;
  now?: () => number;
}

/**
 * Week overview (FR-303): pomodoros per day and per project for the current week
 * and the plan fulfilment in percent. Returns an unmount function.
 */
export function mountWeek(
  root: HTMLElement,
  i18n: I18n,
  deps: WeekDeps,
): () => void {
  const now = deps.now ?? Date.now;
  const t = (key: string, vars: Record<string, string | number> = {}) =>
    Object.entries(vars).reduce(
      (s, [k, v]) => s.replaceAll(`{${k}}`, String(v)),
      i18n.t(key as MessageKey),
    );

  async function render() {
    const week = deriveWeek(await deps.state(), now());
    const projectName = (p: string) => p || t('week.noProject');

    const fulfilment = document.createElement('p');
    fulfilment.dataset.role = 'fulfilment';
    fulfilment.textContent = t('week.fulfilment', {
      percent: week.percent,
      done: week.fulfilled,
      planned: week.planned,
    });
    const bar = progressBar({
      label: t('week.fulfilment.label'),
      value: week.fulfilled,
      max: week.planned,
      valueText: `${week.percent} %`,
    });

    const days = document.createElement('table');
    days.className = 'week__days';
    const head = days.createTHead().insertRow();
    for (const key of ['day', 'count'])
      head.append(
        Object.assign(document.createElement('th'), {
          textContent: t(`week.col.${key}`),
          scope: 'col',
        }),
      );
    const body = days.createTBody();
    for (const d of week.days) {
      const tr = body.insertRow();
      tr.dataset.day = d.day;
      const [y, m, day] = d.day.split('-').map(Number);
      tr.insertCell().textContent = new Date(
        y!,
        m! - 1,
        day!,
      ).toLocaleDateString(i18n.locale, {
        weekday: 'short',
        day: 'numeric',
        month: 'numeric',
      });
      const count = tr.insertCell();
      count.textContent = String(d.completed);
      if (d.projects.length)
        count.title = d.projects
          .map((p) => `${projectName(p.project)}: ${p.completed}`)
          .join(', ');
    }

    const projects = document.createElement('table');
    projects.className = 'week__projects';
    const phead = projects.createTHead().insertRow();
    for (const key of ['project', 'count'])
      phead.append(
        Object.assign(document.createElement('th'), {
          textContent: t(`week.col.${key}`),
          scope: 'col',
        }),
      );
    const pbody = projects.createTBody();
    for (const p of week.projects) {
      const tr = pbody.insertRow();
      tr.insertCell().textContent = projectName(p.project);
      tr.insertCell().textContent = String(p.completed);
    }

    const total = document.createElement('p');
    total.dataset.role = 'total';
    total.textContent = t('week.total', { n: week.total });

    root.replaceChildren(
      card({
        title: t('week.title'),
        children: [
          total,
          days,
          week.projects.length
            ? projects
            : Object.assign(document.createElement('p'), {
                textContent: t('week.empty'),
              }),
          fulfilment,
          bar.element,
        ],
      }),
    );
  }

  const onData = () => void render().catch(() => {});
  document.addEventListener(DATA_CHANGED, onData);
  void render();
  const off = i18n.onChange(() => void render());
  return () => {
    off();
    document.removeEventListener(DATA_CHANGED, onData);
  };
}
