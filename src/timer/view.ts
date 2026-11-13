import { APP_NAME } from '../config';
import type { InterruptionType, Mode } from '../domain/events';
import type { I18n, MessageKey } from '../i18n/i18n';
import { button } from '../ui/components/button';
import { card } from '../ui/components/card';
import { openDialog } from '../ui/components/dialog';
import { progressBar } from '../ui/components/progress-bar';
import { createAlerts, formatClock, tabTitle, type Alerts } from './alerts';
import { DATA_CHANGED, PICK_TASK } from '../tasks/events';
import type { Timer } from './controller';
import type { TimerView } from './cycle';

export interface TimerViewDeps {
  /** Open tasks the next round can be assigned to. */
  tasks(): Promise<{ id: string; title: string }[]>;
  getMode(): Promise<Mode>;
  setMode(mode: Mode): Promise<void>;
  alerts?: Alerts;
  /** Setting «digits always» (FR-606): without it the panel shows no digits, only the bar and tab title. */
  digitsAlways?: () => Promise<boolean>;
}

/**
 * Mounts the timer panel. Start is one click (the first open task is preselected, so
 * open app → Start = 1 interaction, FR-102); strict mode renders no Pause control (FR-107).
 * Returns an unmount function.
 */
export function mountTimer(
  root: HTMLElement,
  i18n: I18n,
  timer: Timer,
  deps: TimerViewDeps,
): () => void {
  const alerts = deps.alerts ?? createAlerts();
  let tasks: { id: string; title: string }[] = [];
  let mode: Mode = 'strict';
  let taskId = '';
  let structureKey = '';
  let clock: HTMLElement | undefined;
  let digits = false;
  let bar: ReturnType<typeof progressBar> | undefined;

  const taskTitle = (id?: string) =>
    tasks.find((t) => t.id === id)?.title ?? '';
  const t = (key: string) => i18n.t(key as MessageKey);

  const run = (p: Promise<unknown>) => p.catch(() => {});

  async function confirmAbort() {
    const body = document.createElement('p');
    body.textContent = t('timer.abort.hint');
    const choice = await openDialog({
      title: t('timer.abort.title'),
      body,
      actions: [
        { label: t('timer.abort.internal'), value: 'internal' },
        { label: t('timer.abort.external'), value: 'external' },
        { label: t('timer.abort.keep'), value: 'keep', variant: 'quiet' },
      ],
    });
    if (choice === 'internal' || choice === 'external')
      await timer.abort(choice);
  }

  /** Park key (FR-205): P focuses the field, text + Enter stores the note; the clock keeps running. */
  function parkForm() {
    const form = document.createElement('form');
    form.className = 'timer__park';
    form.noValidate = true;
    const label = document.createElement('label');
    label.textContent = t('timer.park.label');
    const input = document.createElement('input');
    input.type = 'text';
    input.name = 'park';
    input.autocomplete = 'off';
    input.placeholder = t('timer.park.placeholder');
    label.htmlFor = input.id = 'timer-park';
    const kind = document.createElement('select');
    kind.name = 'park-kind';
    kind.setAttribute('aria-label', t('timer.park.kind'));
    for (const k of ['internal', 'external'] as const)
      kind.append(new Option(t(`timer.park.${k}`), k));
    const ok = document.createElement('p');
    ok.setAttribute('role', 'status');
    ok.dataset.role = 'park-status';
    form.append(label, input, kind, ok);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = input.value;
      if (!text.trim()) return;
      input.value = '';
      ok.textContent = t('timer.park.saved');
      void run(
        timer
          .park(text, kind.value as InterruptionType)
          .then(() => document.dispatchEvent(new Event(DATA_CHANGED))),
      );
    });
    return form;
  }

  const onKey = (e: KeyboardEvent) => {
    if (e.key.toLowerCase() !== 'p' || e.ctrlKey || e.metaKey || e.altKey)
      return;
    const el = e.target as HTMLElement | null;
    if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
    const field = root.querySelector<HTMLInputElement>('input[name="park"]');
    if (!field) return;
    e.preventDefault();
    field.focus();
  };
  document.addEventListener('keydown', onKey);

  function build(view: TimerView) {
    const phase = document.createElement('p');
    phase.className = 'timer__phase';
    phase.textContent = t(`timer.phase.${view.phase}`);

    clock = document.createElement('p');
    clock.className = 'timer__clock';
    clock.setAttribute('role', 'timer');
    clock.hidden = !digits;
    bar = progressBar({
      label: t('timer.progress'),
      value: 0,
      max: Math.max(1, view.totalMs),
    });

    const children: Node[] = [phase, clock, bar.element];
    const controls = document.createElement('div');
    controls.className = 'timer__controls';

    if (view.phase === 'idle') {
      const label = document.createElement('label');
      label.textContent = t('timer.task');
      const select = document.createElement('select');
      select.id = 'timer-task';
      label.htmlFor = select.id;
      const none = new Option(t('timer.noTask'), '');
      select.append(none, ...tasks.map((x) => new Option(x.title, x.id)));
      select.value = tasks.some((x) => x.id === taskId)
        ? taskId
        : (tasks[0]?.id ?? '');
      taskId = select.value;
      select.addEventListener('change', () => (taskId = select.value));

      const modeLabel = document.createElement('label');
      modeLabel.textContent = t('timer.mode');
      const modeSelect = document.createElement('select');
      modeSelect.id = 'timer-mode';
      modeLabel.htmlFor = modeSelect.id;
      for (const m of ['strict', 'flexible'] as const)
        modeSelect.append(new Option(t(`timer.mode.${m}`), m));
      modeSelect.value = mode;
      modeSelect.addEventListener('change', () => {
        mode = modeSelect.value as Mode;
        void run(deps.setMode(mode));
      });

      controls.append(
        label,
        select,
        modeLabel,
        modeSelect,
        button({
          label: t('timer.start'),
          variant: 'primary',
          action: 'start',
          onClick: () => {
            alerts.prepare();
            void run(timer.start(taskId));
          },
        }),
      );
    } else if (view.phase === 'focus' || view.phase === 'paused') {
      if (view.mode === 'flexible')
        controls.append(
          button({
            label: t(view.phase === 'paused' ? 'timer.resume' : 'timer.pause'),
            action: view.phase === 'paused' ? 'resume' : 'pause',
            onClick: () =>
              void run(
                view.phase === 'paused' ? timer.resume() : timer.pause(),
              ),
          }),
        );
      children.push(parkForm());
      controls.append(
        button({
          label: t('timer.abort'),
          variant: 'quiet',
          action: 'abort',
          onClick: () => void run(confirmAbort()),
        }),
      );
    } else {
      controls.append(
        button({
          label: t('timer.skipBreak'),
          variant: 'secondary',
          action: 'skip-break',
          onClick: () => void run(timer.skipBreak()),
        }),
      );
    }
    children.push(controls);
    root.replaceChildren(card({ title: t('timer.title'), children }));
  }

  function paint(view: TimerView) {
    const key = [view.phase, view.mode, i18n.locale, view.pomodoroId].join('|');
    if (key !== structureKey) {
      structureKey = key;
      build(view);
    }
    if (clock) clock.textContent = digits ? formatClock(view.remainingMs) : '';
    bar?.set(view.totalMs - view.remainingMs, Math.max(1, view.totalMs));
    document.title = tabTitle(view, taskTitle(view.taskId), APP_NAME);
    document.documentElement.dataset.timerPhase = view.phase;
  }

  const offChange = timer.onChange((view, end) => {
    if (end)
      alerts.announce(
        t(`timer.notify.${end}.title`),
        t(`timer.notify.${end}.body`),
      );
    paint(view);
  });
  const readDigits = async () => (await deps.digitsAlways?.()) ?? false;
  const onData = () =>
    void Promise.all([deps.tasks(), readDigits()])
      .then(([list, d]) => {
        tasks = list;
        digits = d;
        structureKey = '';
        paint(timer.view);
      })
      .catch(() => {});
  document.addEventListener(DATA_CHANGED, onData);
  const onPick = (e: Event) => {
    const id = (e as CustomEvent<string>).detail;
    if (!tasks.some((x) => x.id === id)) return;
    taskId = id;
    const select = root.querySelector<HTMLSelectElement>('#timer-task');
    if (select) select.value = id;
  };
  document.addEventListener(PICK_TASK, onPick);
  const offLocale = i18n.onChange(() => {
    structureKey = '';
    paint(timer.view);
  });

  void (async () => {
    [tasks, mode, digits] = await Promise.all([
      deps.tasks(),
      deps.getMode(),
      readDigits(),
    ]);
    await timer.refresh();
  })().catch(() => {});

  return () => {
    offChange();
    offLocale();
    document.removeEventListener(DATA_CHANGED, onData);
    document.removeEventListener(PICK_TASK, onPick);
    document.removeEventListener('keydown', onKey);
  };
}
