import type { AppState } from '../domain/state';
import type { I18n, MessageKey } from '../i18n/i18n';
import { DATA_CHANGED } from '../tasks/events';
import { InventoryError, type Inventory } from '../tasks/inventory';
import { button } from '../ui/components/button';
import { card } from '../ui/components/card';
import { deriveDayClose } from './model';

export interface DayCloseDeps {
  state(): Promise<AppState>;
  now?: () => number;
}

/**
 * Day close (FR-302, FR-304): per task estimate, actual and difference of the day,
 * interruptions by type, and a second estimate where the actual exceeded the first.
 * Returns an unmount function.
 */
export function mountDayClose(
  root: HTMLElement,
  i18n: I18n,
  inventory: Inventory,
  deps: DayCloseDeps,
): () => void {
  const now = deps.now ?? Date.now;
  const t = (key: string, vars: Record<string, string | number> = {}) =>
    Object.entries(vars).reduce(
      (s, [k, v]) => s.replaceAll(`{${k}}`, String(v)),
      i18n.t(key as MessageKey),
    );
  let error = '';

  async function render() {
    const close = deriveDayClose(await deps.state(), now());
    const table = document.createElement('table');
    table.className = 'dayclose__table';
    const head = table.createTHead().insertRow();
    for (const key of ['task', 'estimate', 'actual', 'difference'])
      head.append(
        Object.assign(document.createElement('th'), {
          textContent: t(`dayclose.col.${key}`),
          scope: 'col',
        }),
      );
    const body = table.createTBody();
    for (const row of close.rows) {
      const tr = body.insertRow();
      const sign = row.difference > 0 ? '+' : '';
      for (const text of [
        row.title,
        String(row.estimate),
        String(row.actual),
        `${sign}${row.difference}`,
      ])
        tr.insertCell().textContent = text;
      const extra = tr.insertCell();
      if (row.secondEstimate !== undefined) {
        const s = document.createElement('span');
        s.dataset.role = 'second-estimate';
        s.textContent = t('dayclose.second.value', { n: row.secondEstimate });
        extra.append(s);
      }
      if (row.canReestimate) {
        const input = document.createElement('input');
        input.type = 'number';
        input.min = '1';
        input.step = '1';
        input.name = 'second-estimate';
        input.setAttribute('aria-label', t('dayclose.second.label'));
        extra.append(
          input,
          button({
            label: t('dayclose.second.save'),
            action: 'second-estimate',
            onClick: () => void save(row.taskId, Number(input.value)),
          }),
        );
      }
    }
    const sums = document.createElement('p');
    sums.dataset.role = 'interruptions';
    for (const kind of ['internal', 'external'] as const) {
      const span = document.createElement('span');
      span.dataset.role = kind;
      span.textContent = t(`dayclose.interruptions.${kind}`, {
        n: close.interruptions[kind],
      });
      span.style.display = 'block';
      sums.append(span);
    }
    const err = document.createElement('p');
    err.setAttribute('role', 'alert');
    err.textContent = error;
    err.hidden = !error;
    const children: Node[] = close.rows.length
      ? [table, sums, err]
      : [
          Object.assign(document.createElement('p'), {
            textContent: t('dayclose.empty'),
          }),
          sums,
        ];
    root.replaceChildren(card({ title: t('dayclose.title'), children }));
  }

  async function save(id: string, estimate: number) {
    try {
      await inventory.reestimate(id, estimate);
      error = '';
    } catch (e) {
      if (!(e instanceof InventoryError)) throw e;
      error = t(`tasks.error.${e.code}`);
    }
    document.dispatchEvent(new Event(DATA_CHANGED));
    await render();
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
