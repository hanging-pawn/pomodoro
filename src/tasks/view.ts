import type { AppState, Task } from '../domain/state';
import type { I18n, MessageKey } from '../i18n/i18n';
import { button } from '../ui/components/button';
import { card } from '../ui/components/card';
import { openDialog } from '../ui/components/dialog';
import { listRow } from '../ui/components/list-row';
import { progressBar } from '../ui/components/progress-bar';
import {
  budgetStatus,
  InventoryError,
  parseLines,
  SPLIT_HINT_FROM,
  todayView,
  type Inventory,
  type TaskInput,
} from './inventory';

import { DATA_CHANGED } from './events';

export interface TasksViewDeps {
  state(): Promise<AppState>;
  now?: () => number;
}

/** Mounts Today (plan + budget) and the task inventory. Returns an unmount function. */
export function mountTasks(
  root: HTMLElement,
  i18n: I18n,
  inventory: Inventory,
  deps: TasksViewDeps,
): () => void {
  const now = deps.now ?? Date.now;
  const t = (key: string, vars: Record<string, string | number> = {}) =>
    Object.entries(vars).reduce(
      (s, [k, v]) => s.replaceAll(`{${k}}`, String(v)),
      i18n.t(key as MessageKey),
    );
  let error = '';
  let draft: { title: string; project: string; estimate: string } = {
    title: '',
    project: '',
    estimate: '1',
  };
  let focusTitle = false;
  let unplannedDraft = '';

  const changed = () => document.dispatchEvent(new Event(DATA_CHANGED));
  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      error = '';
    } catch (e) {
      // `needs-confirmation` here means the user chose «Back»: nothing saved, nothing to report.
      if (e instanceof InventoryError)
        error =
          e.code === 'needs-confirmation' ? '' : t(`tasks.error.${e.code}`);
      else throw e;
    }
    changed();
    await render();
  };

  /** Asks for one subtask title per line; empty when the user cancels. */
  async function askSubtasks(): Promise<string[]> {
    const form = document.createElement('div');
    const label = document.createElement('label');
    label.textContent = t('tasks.split.label');
    const area = document.createElement('textarea');
    area.rows = 5;
    area.name = 'subtasks';
    label.append(area);
    form.append(label);
    const choice = await openDialog({
      title: t('tasks.split.title'),
      body: form,
      actions: [
        { label: t('tasks.split.create'), value: 'create' },
        { label: t('tasks.cancel'), value: 'cancel', variant: 'quiet' },
      ],
    });
    return choice === 'create' ? parseLines(area.value) : [];
  }

  async function addSubtask(parent: Task) {
    const form = document.createElement('div');
    const field = (label: string, value: string, type: string) => {
      const l = document.createElement('label');
      l.textContent = label;
      const i = document.createElement('input');
      i.type = type;
      i.value = value;
      if (type === 'number') {
        i.min = '1';
        i.step = '1';
      }
      l.append(i);
      form.append(l);
      return i;
    };
    const title = field(t('tasks.add.title'), '', 'text');
    const estimate = field(t('tasks.add.estimate'), '1', 'number');
    const choice = await openDialog({
      title: t('tasks.subtask.title', { parent: parent.title }),
      body: form,
      actions: [
        { label: t('tasks.save'), value: 'save' },
        { label: t('tasks.cancel'), value: 'cancel', variant: 'quiet' },
      ],
    });
    if (choice === 'save')
      await run(() =>
        inventory.createSubtask(parent.id, {
          title: title.value,
          estimate: Number(estimate.value),
        }),
      );
  }

  /**
   * Runs `fn`; on `needs-confirmation` asks once (FR-202): save anyway, split into subtasks
   * (when `split` is given) or back.
   */
  async function withSplitConfirm(
    estimate: number,
    fn: (opts: { confirmed?: boolean }) => Promise<unknown>,
    split?: (titles: string[]) => Promise<unknown>,
  ) {
    try {
      await fn({});
    } catch (e) {
      if (!(e instanceof InventoryError) || e.code !== 'needs-confirmation')
        throw e;
      const body = document.createElement('p');
      body.textContent = t('tasks.confirm.body', { n: estimate });
      const choice = await openDialog({
        title: t('tasks.confirm.title'),
        body,
        actions: [
          { label: t('tasks.confirm.save'), value: 'save' },
          ...(split
            ? [{ label: t('tasks.confirm.split'), value: 'split' }]
            : []),
          { label: t('tasks.confirm.back'), value: 'back', variant: 'quiet' },
        ],
      });
      if (choice === 'save') await fn({ confirmed: true });
      else if (choice === 'split' && split) {
        const titles = await askSubtasks();
        if (titles.length) await split(titles);
        else throw new InventoryError('needs-confirmation');
      } else throw new InventoryError('needs-confirmation');
    }
  }

  async function edit(task: Task) {
    const form = document.createElement('div');
    const field = (label: string, value: string, type = 'text') => {
      const l = document.createElement('label');
      l.textContent = label;
      const i = document.createElement('input');
      i.type = type;
      i.value = value;
      if (type === 'number') {
        i.min = '1';
        i.step = '1';
      }
      l.append(i);
      form.append(l);
      return i;
    };
    const title = field(t('tasks.add.title'), task.title);
    const project = field(t('tasks.add.project'), task.project ?? '');
    const estimate = field(
      t('tasks.add.estimate'),
      String(task.estimate),
      'number',
    );
    const choice = await openDialog({
      title: t('tasks.edit.title'),
      body: form,
      actions: [
        { label: t('tasks.save'), value: 'save' },
        { label: t('tasks.cancel'), value: 'cancel', variant: 'quiet' },
      ],
    });
    if (choice !== 'save') return;
    const n = Number(estimate.value);
    await run(() =>
      withSplitConfirm(n, (opts) =>
        inventory.update(
          task.id,
          { title: title.value, project: project.value, estimate: n },
          opts,
        ),
      ),
    );
  }

  const small = (label: string, action: string, onClick: () => void) =>
    button({ label, action, variant: 'quiet', onClick });

  async function render() {
    const state = await deps.state();
    const today = todayView(state, now());
    const status = budgetStatus(today.planned, state.settings.dailyBudget);
    const plannedIds = new Set(today.tasks.map((x) => x.id));

    // Today
    const bar = progressBar({
      label: t('today.budgetBar'),
      value: status.planned,
      max: status.budget,
      valueText: status.over
        ? t('today.over', { n: status.over })
        : t('today.summary', status),
    });
    const summary = document.createElement('p');
    summary.className = 'today__summary';
    summary.dataset.role = 'budget';
    summary.textContent = status.over
      ? t('today.over', { n: status.over })
      : t('today.summary', status);
    const budgetLabel = document.createElement('label');
    budgetLabel.textContent = t('today.budget');
    const budget = document.createElement('input');
    budget.type = 'number';
    budget.min = '1';
    budget.step = '1';
    budget.value = String(state.settings.dailyBudget);
    budget.dataset.role = 'budget-input';
    budget.addEventListener(
      'change',
      () => void run(() => inventory.setBudget(Number(budget.value))),
    );
    budgetLabel.append(budget);

    const todayList = document.createElement('ul');
    todayList.className = 'ui-list';
    todayList.dataset.role = 'today-list';
    today.tasks.forEach((task, i) => {
      const actions = document.createElement('span');
      actions.className = 'tasks__actions';
      actions.append(
        small(
          t('tasks.done'),
          'check-off',
          () => void run(() => inventory.checkOff(task.id)),
        ),
      );
      if (i > 0)
        actions.append(
          small(
            t('today.moveUp'),
            'move-up',
            () => void run(() => inventory.moveInToday(task.id, -1)),
          ),
        );
      if (i < today.tasks.length - 1)
        actions.append(
          small(
            t('today.moveDown'),
            'move-down',
            () => void run(() => inventory.moveInToday(task.id, 1)),
          ),
        );
      actions.append(
        small(
          t('today.remove'),
          'remove-today',
          () => void run(() => inventory.removeFromToday(task.id)),
        ),
      );
      todayList.append(
        listRow({
          title: task.title,
          meta: t('tasks.rounds', { n: task.estimate }),
          trailing: actions,
        }),
      );
    });
    const todayChildren: Node[] = [summary, bar.element, budgetLabel];
    if (today.tasks.length) todayChildren.push(todayList);
    else {
      const empty = document.createElement('p');
      empty.textContent = t('today.empty');
      todayChildren.push(empty);
    }

    // Unplanned & urgent (FR-204): separate from the plan, outside the budget.
    const unplannedHead = document.createElement('h3');
    unplannedHead.textContent = t('unplanned.title');
    const unplannedList = document.createElement('ul');
    unplannedList.className = 'ui-list';
    unplannedList.dataset.role = 'unplanned-list';
    for (const task of today.unplanned) {
      const actions = document.createElement('span');
      actions.className = 'tasks__actions';
      actions.append(
        small(
          t('tasks.done'),
          'check-off',
          () => void run(() => inventory.checkOff(task.id)),
        ),
      );
      unplannedList.append(
        listRow({
          title: task.title,
          meta: t('unplanned.mark'),
          trailing: actions,
        }),
      );
    }
    const unplannedForm = document.createElement('form');
    unplannedForm.noValidate = true;
    const uLabel = document.createElement('label');
    uLabel.textContent = t('unplanned.add');
    const uInput = document.createElement('input');
    uInput.type = 'text';
    uInput.name = 'unplanned-title';
    uInput.value = unplannedDraft;
    uInput.addEventListener('input', () => (unplannedDraft = uInput.value));
    uLabel.append(uInput);
    unplannedForm.append(
      uLabel,
      button({
        label: t('unplanned.submit'),
        type: 'submit',
        action: 'add-unplanned',
      }),
    );
    unplannedForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const title = unplannedDraft;
      void run(async () => {
        await inventory.createUnplanned(title);
        unplannedDraft = '';
      });
    });
    todayChildren.push(unplannedHead, unplannedForm);
    if (today.unplanned.length) todayChildren.push(unplannedList);

    // Inventory form
    const form = document.createElement('form');
    form.noValidate = true;
    const input = (label: string, key: keyof typeof draft, type = 'text') => {
      const l = document.createElement('label');
      l.textContent = label;
      const i = document.createElement('input');
      i.type = type;
      i.name = key;
      i.value = draft[key];
      if (type === 'number') {
        i.min = '1';
        i.step = '1';
      }
      i.addEventListener('input', () => {
        draft[key] = i.value;
        if (key === 'estimate')
          hint.hidden = !(Number(i.value) >= SPLIT_HINT_FROM);
      });
      l.append(i);
      return { l, i };
    };
    const titleIn = input(t('tasks.add.title'), 'title');
    // Several pasted lines become one task each (FR-206).
    titleIn.i.addEventListener('paste', (e) => {
      const text = e.clipboardData?.getData('text') ?? '';
      if (parseLines(text).length < 2) return;
      e.preventDefault();
      void run(async () => {
        await inventory.createMany(text, {
          project: draft.project,
          estimate:
            Number(draft.estimate) < SPLIT_HINT_FROM
              ? Number(draft.estimate)
              : 1,
        });
        focusTitle = true;
      });
    });
    const projectIn = input(t('tasks.add.project'), 'project');
    const estIn = input(t('tasks.add.estimate'), 'estimate', 'number');
    const hint = document.createElement('p');
    hint.setAttribute('role', 'status');
    hint.dataset.role = 'split-hint';
    hint.textContent = t('tasks.estimate.hint');
    hint.hidden = !(Number(draft.estimate) >= SPLIT_HINT_FROM);
    const err = document.createElement('p');
    err.setAttribute('role', 'alert');
    err.dataset.role = 'error';
    err.textContent = error;
    err.hidden = !error;
    form.append(
      titleIn.l,
      projectIn.l,
      estIn.l,
      hint,
      err,
      button({
        label: t('tasks.add.submit'),
        variant: 'primary',
        type: 'submit',
        action: 'add',
      }),
    );
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const input: TaskInput = {
        title: draft.title,
        project: draft.project,
        estimate: Number(draft.estimate),
      };
      void run(async () => {
        await withSplitConfirm(
          input.estimate,
          (opts) => inventory.create(input, opts),
          (titles) => inventory.createSplit(input, titles),
        );
        draft = { title: '', project: draft.project, estimate: '1' };
        focusTitle = true;
      });
    });

    // Inventory list
    const open = Object.values(state.tasks)
      .filter((x) => !x.done && !x.parentId)
      .sort((a, b) => a.createdAt - b.createdAt);
    const subtasksOf = (id: string) =>
      Object.values(state.tasks)
        .filter((x) => x.parentId === id)
        .sort((a, b) => a.createdAt - b.createdAt);
    const list = document.createElement('ul');
    list.className = 'ui-list';
    list.dataset.role = 'inventory-list';
    const row = (task: Task, sub: boolean) => {
      const actions = document.createElement('span');
      actions.className = 'tasks__actions';
      if (!sub && !plannedIds.has(task.id))
        actions.append(
          small(
            t('tasks.addToday'),
            'add-today',
            () => void run(() => inventory.addToToday(task.id)),
          ),
        );
      if (!sub)
        actions.append(
          small(
            t('tasks.addSubtask'),
            'add-subtask',
            () => void addSubtask(task),
          ),
        );
      if (sub && !task.done)
        actions.append(
          small(
            t('tasks.done'),
            'check-off',
            () => void run(() => inventory.checkOff(task.id)),
          ),
        );
      actions.append(
        small(t('tasks.edit'), 'edit', () => void edit(task)),
        small(
          t('tasks.delete'),
          'delete',
          () => void run(() => inventory.remove(task.id)),
        ),
      );
      const li = listRow({
        title: [
          sub ? '↳' : '',
          task.unplanned ? t('unplanned.badge') : '',
          task.title,
        ]
          .filter(Boolean)
          .join(' '),
        tone: task.done ? 'done' : 'default',
        meta: [
          task.project,
          task.subtasks
            ? t('tasks.subtasks.progress', {
                done: task.subtasks.done,
                total: task.subtasks.total,
              })
            : undefined,
          t('tasks.rounds', { n: task.estimate }),
        ]
          .filter(Boolean)
          .join(' · '),
        trailing: actions,
      });
      if (sub) li.dataset.role = 'subtask';
      return li;
    };
    for (const task of open) {
      list.append(row(task, false));
      for (const sub of subtasksOf(task.id)) list.append(row(sub, true));
    }
    const inventoryChildren: Node[] = [form];
    if (open.length) inventoryChildren.push(list);
    else {
      const empty = document.createElement('p');
      empty.textContent = t('tasks.empty');
      inventoryChildren.push(empty);
    }

    const parkedList = document.createElement('ul');
    parkedList.className = 'ui-list';
    parkedList.dataset.role = 'parked-list';
    for (const note of [...state.parked].reverse())
      parkedList.append(
        listRow({
          title: note.text,
          meta: [
            t(`timer.park.${note.kind}`),
            state.tasks[note.taskId ?? '']?.title,
          ]
            .filter(Boolean)
            .join(' · '),
        }),
      );
    const cards = [
      card({ title: t('today.title'), children: todayChildren }),
      card({ title: t('tasks.title'), children: inventoryChildren }),
    ];
    if (state.parked.length)
      cards.push(card({ title: t('park.title'), children: [parkedList] }));
    root.replaceChildren(...cards);
    if (focusTitle) {
      focusTitle = false;
      root.querySelector<HTMLInputElement>('input[name="title"]')?.focus();
    }
  }

  void render();
  return i18n.onChange(() => void render());
}
