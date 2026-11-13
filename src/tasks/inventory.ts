import { newEvent, type DomainEvent } from '../domain/events';
import { deriveState, type AppState, type Task } from '../domain/state';

/** From this estimate on the UI suggests splitting the task and asks for confirmation (FR-202). */
export const SPLIT_HINT_FROM = 8;

export type InventoryErrorCode =
  | 'empty-title'
  | 'invalid-estimate'
  | 'needs-confirmation'
  | 'invalid-budget'
  | 'unknown-task';

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
}

export interface Inventory {
  /** Returns the new task id. Estimate ≥ SPLIT_HINT_FROM throws `needs-confirmation` unless confirmed. */
  create(input: TaskInput, opts?: { confirmed?: boolean }): Promise<string>;
  update(
    id: string,
    changes: Partial<TaskInput>,
    opts?: { confirmed?: boolean },
  ): Promise<void>;
  remove(id: string): Promise<void>;
  /** Marks the task done; it leaves Today (FR-305). */
  checkOff(id: string): Promise<void>;
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

const isWhole = (n: number) => Number.isInteger(n) && n >= 1;

export interface TodayView {
  /** Planned, not yet done tasks in plan order. */
  tasks: Task[];
  /** Sum of the estimates of `tasks`. */
  planned: number;
}

export function todayView(state: AppState, now: number): TodayView {
  const tasks = (state.plans[dayKey(now)] ?? [])
    .map((id) => state.tasks[id])
    .filter((t): t is Task => !!t && !t.done);
  return { tasks, planned: tasks.reduce((n, t) => n + t.estimate, 0) };
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
          },
          now(),
        ),
      );
      return taskId;
    },
    async update(id, changes, opts) {
      await known(id);
      const next: Partial<TaskInput> = { ...changes };
      if (changes.title !== undefined) next.title = cleanTitle(changes.title);
      if (changes.estimate !== undefined)
        checkEstimate(changes.estimate, opts?.confirmed);
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
      await log.append(
        newEvent(
          'task.changed',
          { taskId: id, changes: { done: true } },
          now(),
        ),
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
