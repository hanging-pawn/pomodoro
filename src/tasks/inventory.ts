import { newEvent, type DomainEvent } from '../domain/events';
import { deriveState, type AppState, type Task } from '../domain/state';
import { nextDue, type Recurrence } from './recurrence';

/** From this estimate on the UI suggests splitting the task and asks for confirmation (FR-202). */
export const SPLIT_HINT_FROM = 8;

export type InventoryErrorCode =
  | 'empty-title'
  | 'invalid-estimate'
  | 'needs-confirmation'
  | 'invalid-budget'
  | 'unknown-task'
  | 'nested-subtask'
  | 'invalid-due';

export class InventoryError extends Error {
  constructor(readonly code: InventoryErrorCode) {
    super(code);
  }
}

export interface InventoryLog {
  events(): Promise<DomainEvent[]>;
  append(...events: DomainEvent[]): Promise<void>;
}

export interface TaskInput {
  title: string;
  project?: string;
  estimate: number;
  /** `YYYY-MM-DD`; empty string clears (FR-208). */
  due?: string;
  recurrence?: Recurrence | '';
}

export interface Inventory {
  /** Returns the new task id. Estimate ≥ SPLIT_HINT_FROM throws `needs-confirmation` unless confirmed. */
  create(input: TaskInput, opts?: { confirmed?: boolean }): Promise<string>;
  /** An unplanned & urgent task for today (FR-204): estimate 1, marked U. Returns its id. */
  createUnplanned(title: string): Promise<string>;
  /** One task per non-blank line (FR-206); returns the new ids. Lines are cleaned of list markers. */
  createMany(
    text: string,
    opts?: { project?: string; estimate?: number; unplanned?: boolean },
  ): Promise<string[]>;
  /** Adds a subtask with its own estimate; the parent then shows the sum (FR-209). One level only. */
  createSubtask(
    parentId: string,
    input: { title: string; estimate: number },
  ): Promise<string>;
  /**
   * Split offer (FR-202): creates the task as a parent of one subtask per line; the estimate is
   * spread over the lines (each at least 1), so the parent keeps the entered total when it fits.
   */
  createSplit(
    input: TaskInput,
    subtaskTitles: string[],
  ): Promise<{ parentId: string; subtaskIds: string[] }>;
  update(
    id: string,
    changes: Partial<TaskInput>,
    opts?: { confirmed?: boolean },
  ): Promise<void>;
  remove(id: string): Promise<void>;
  /** Marks the task done; it leaves Today (FR-305). */
  checkOff(id: string): Promise<void>;
  /** Records a second estimate once the actual exceeded the first (FR-304); the first stays as it was. */
  reestimate(id: string, estimate: number): Promise<void>;
  addToToday(id: string): Promise<void>;
  removeFromToday(id: string): Promise<void>;
  /** Moves one place up (-1) or down (+1) in the Today plan. */
  moveInToday(id: string, direction: -1 | 1): Promise<void>;
  setBudget(pomodoros: number): Promise<void>;
}

export interface InventoryOptions {
  log: InventoryLog;
  now?: () => number;
}

/** Local calendar day as `YYYY-MM-DD`. */
export function dayKey(at: number): string {
  const d = new Date(at);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Splits pasted text into task titles: trims, drops blank lines and leading list markers («- », «* », «1. »). */
export function parseLines(text: string): string[] {
  return text
    .split(/\r\n|\r|\n/)
    .map((l) =>
      l
        .trim()
        .replace(/^(?:[-*•]|\d+[.)])\s+/, '')
        .trim(),
    )
    .filter(Boolean);
}

const isWhole = (n: number) => Number.isInteger(n) && n >= 1;

export interface TodayView {
  /** Planned, not yet done tasks in plan order. */
  tasks: Task[];
  /** Unplanned & urgent tasks created today, not yet done (FR-204); not part of the budget. */
  unplanned: Task[];
  /** Sum of the estimates of `tasks`. */
  planned: number;
}

export function todayView(state: AppState, now: number): TodayView {
  const tasks = (state.plans[dayKey(now)] ?? [])
    .map((id) => state.tasks[id])
    .filter((t): t is Task => !!t && !t.done && !t.unplanned);
  const unplanned = Object.values(state.tasks)
    .filter(
      (t) => t.unplanned && !t.done && dayKey(t.createdAt) === dayKey(now),
    )
    .sort((a, b) => a.createdAt - b.createdAt);
  const ids = new Set(tasks.map((t) => t.id));
  // A subtask already counted through its planned parent adds nothing (FR-209).
  const planned = tasks
    .filter((t) => !(t.parentId && ids.has(t.parentId)))
    .reduce((n, t) => n + t.estimate, 0);
  return { tasks, unplanned, planned };
}

export function budgetStatus(planned: number, budget: number) {
  return { planned, budget, over: Math.max(0, planned - budget) };
}

export function createInventory(options: InventoryOptions): Inventory {
  const now = options.now ?? Date.now;
  const { log } = options;
  const state = async () => deriveState(await log.events());

  const checkEstimate = (estimate: number, confirmed?: boolean) => {
    if (!isWhole(estimate)) throw new InventoryError('invalid-estimate');
    if (estimate >= SPLIT_HINT_FROM && !confirmed)
      throw new InventoryError('needs-confirmation');
  };
  const checkDue = (due?: string) => {
    if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due))
      throw new InventoryError('invalid-due');
  };
  const cleanTitle = (title: string) => {
    const t = title.trim();
    if (!t) throw new InventoryError('empty-title');
    return t;
  };
  const known = async (id: string) => {
    if (!(await state()).tasks[id]) throw new InventoryError('unknown-task');
  };
  const savePlan = async (taskIds: string[]) =>
    log.append(
      newEvent('plan.changed', { day: dayKey(now()), taskIds }, now()),
    );
  const plan = async () => [...((await state()).plans[dayKey(now())] ?? [])];

  return {
    async create(input, opts) {
      const title = cleanTitle(input.title);
      checkEstimate(input.estimate, opts?.confirmed);
      checkDue(input.due);
      const taskId = crypto.randomUUID();
      const project = input.project?.trim() || undefined;
      await log.append(
        newEvent(
          'task.created',
          {
            taskId,
            title,
            estimate: input.estimate,
            ...(project ? { project } : {}),
            ...(input.due ? { due: input.due } : {}),
            ...(input.recurrence ? { recurrence: input.recurrence } : {}),
          },
          now(),
        ),
      );
      return taskId;
    },
    async createUnplanned(title) {
      const clean = cleanTitle(title);
      const taskId = crypto.randomUUID();
      await log.append(
        newEvent(
          'task.created',
          { taskId, title: clean, estimate: 1, unplanned: true },
          now(),
        ),
      );
      return taskId;
    },
    async createMany(text, opts = {}) {
      const titles = parseLines(text);
      const estimate = opts.estimate ?? 1;
      if (!isWhole(estimate)) throw new InventoryError('invalid-estimate');
      const project = opts.project?.trim() || undefined;
      const at = now();
      // One millisecond apart keeps the pasted order stable in the log.
      const events = titles.map((title, i) =>
        newEvent(
          'task.created',
          {
            taskId: crypto.randomUUID(),
            title,
            estimate,
            ...(project ? { project } : {}),
            ...(opts.unplanned ? { unplanned: true } : {}),
          },
          at + i,
        ),
      );
      if (events.length) await log.append(...events);
      return events.map((e) => e.payload.taskId);
    },
    async createSubtask(parentId, input) {
      const parent = (await state()).tasks[parentId];
      if (!parent) throw new InventoryError('unknown-task');
      if (parent.parentId) throw new InventoryError('nested-subtask');
      const title = cleanTitle(input.title);
      if (!isWhole(input.estimate))
        throw new InventoryError('invalid-estimate');
      const taskId = crypto.randomUUID();
      await log.append(
        newEvent(
          'task.created',
          { taskId, parentId, title, estimate: input.estimate },
          now(),
        ),
      );
      return taskId;
    },
    async createSplit(input, subtaskTitles) {
      const title = cleanTitle(input.title);
      if (!isWhole(input.estimate))
        throw new InventoryError('invalid-estimate');
      const titles = subtaskTitles.map((x) => x.trim()).filter(Boolean);
      const project = input.project?.trim() || undefined;
      const parentId = crypto.randomUUID();
      const at = now();
      const k = Math.max(1, titles.length);
      const base = Math.max(1, Math.floor(input.estimate / k));
      const extra = input.estimate > k ? input.estimate - base * k : 0;
      const subs = titles.map((subTitle, i) =>
        newEvent(
          'task.created',
          {
            taskId: crypto.randomUUID(),
            parentId,
            title: subTitle,
            estimate: base + (i < extra ? 1 : 0),
            ...(project ? { project } : {}),
          },
          at + 1 + i,
        ),
      );
      await log.append(
        newEvent(
          'task.created',
          {
            taskId: parentId,
            title,
            estimate: input.estimate,
            ...(project ? { project } : {}),
          },
          at,
        ),
        ...subs,
      );
      return { parentId, subtaskIds: subs.map((e) => e.payload.taskId) };
    },
    async update(id, changes, opts) {
      await known(id);
      const next: Partial<TaskInput> = { ...changes };
      if (changes.title !== undefined) next.title = cleanTitle(changes.title);
      if (changes.estimate !== undefined)
        checkEstimate(changes.estimate, opts?.confirmed);
      checkDue(changes.due);
      if (changes.project !== undefined)
        next.project = changes.project.trim() || undefined;
      await log.append(
        newEvent('task.changed', { taskId: id, changes: next }, now()),
      );
    },
    async remove(id) {
      await known(id);
      await log.append(newEvent('task.deleted', { taskId: id }, now()));
    },
    async checkOff(id) {
      await known(id);
      const task = (await state()).tasks[id]!;
      const at = now();
      const next =
        !task.done && task.recurrence
          ? newEvent(
              'task.created',
              {
                taskId: `${id}:next`,
                title: task.title,
                estimate: task.estimate,
                recurrence: task.recurrence,
                due: nextDue(task.recurrence, task.due, dayKey(at)),
                ...(task.project ? { project: task.project } : {}),
              },
              at + 1,
            )
          : undefined;
      // Fixed event id: checking off twice (or on two devices) merges to one next instance.
      if (next) next.id = `recur:${id}`;
      await log.append(
        newEvent('task.changed', { taskId: id, changes: { done: true } }, at),
        ...(next ? [next] : []),
      );
    },
    async reestimate(id, estimate) {
      await known(id);
      if (!isWhole(estimate)) throw new InventoryError('invalid-estimate');
      await log.append(
        newEvent('task.reestimated', { taskId: id, estimate }, now()),
      );
    },
    async addToToday(id) {
      await known(id);
      const ids = await plan();
      if (!ids.includes(id)) await savePlan([...ids, id]);
    },
    async removeFromToday(id) {
      const ids = await plan();
      if (ids.includes(id)) await savePlan(ids.filter((x) => x !== id));
    },
    async moveInToday(id, direction) {
      const ids = await plan();
      const from = ids.indexOf(id);
      const to = from + direction;
      if (from < 0 || to < 0 || to >= ids.length) return;
      [ids[from], ids[to]] = [ids[to]!, ids[from]!];
      await savePlan(ids);
    },
    async setBudget(pomodoros) {
      if (!isWhole(pomodoros)) throw new InventoryError('invalid-budget');
      await log.append(
        newEvent(
          'settings.changed',
          { changes: { dailyBudget: pomodoros } },
          now(),
        ),
      );
    },
  };
}
