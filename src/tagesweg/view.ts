import type { AppState } from '../domain/state';
import type { InterruptionType } from '../domain/events';
import type { I18n, MessageKey } from '../i18n/i18n';
import type { Shop } from '../rewards/shop';
import { localizeReward } from '../rewards/templates';
import { coinAmount, withCoins } from '../ui/components/coin';
import { DATA_CHANGED, PICK_TASK } from '../tasks/events';
import { formatClock } from '../timer/alerts';
import type { Timer, PhaseEnd } from '../timer/controller';
import type { TimerView } from '../timer/cycle';
import { button } from '../ui/components/button';
import { openDialog } from '../ui/components/dialog';
import { iconButton } from '../ui/components/icon-button';
import { progressBar } from '../ui/components/progress-bar';
import { deriveStreak } from '../streak/model';
import {
  deriveDayProgress,
  deriveTagesweg,
  type TagesRow,
  type Tagesweg,
} from './model';

export interface TageswegDeps {
  state(): Promise<AppState>;
  /** Ticks a bullet point of the zoomed task (FR-609); without it the bullets are shown read-only. */
  tickBullet?(taskId: string, bullet: string, done: boolean): Promise<void>;
  now?: () => number;
  /**
   * Asks for notification permission and unlocks sound (FR-104). Called synchronously inside the
   * Start click: browsers allow both only within a user gesture.
   */
  prepareAlerts?: () => void;
}

const DIGITS_MS = 3000;

/**
 * Main screen «Tagesweg» (concept A, FR-602–605): the day as a path of task rows with their
 * rounds as stations and reward rows between them; zooms to the current path piece during a
 * round (FR-604); ring moment after a round (FR-605). Returns an unmount function.
 */
export function mountTagesweg(
  root: HTMLElement,
  i18n: I18n,
  timer: Timer,
  shop: Shop,
  deps: TageswegDeps,
): () => void {
  const now = deps.now ?? Date.now;
  const t = (key: string, vars: Record<string, string | number> = {}) =>
    Object.entries(vars).reduce(
      (s, [k, v]) => s.replaceAll(`{${k}}`, String(v)),
      i18n.t(key as MessageKey),
    );
  const coinText = (key: string, n: number) =>
    withCoins(t(key), n, t('header.coins', { n }));
  let state: AppState | undefined;
  let ring = false;
  let digitsUntil = 0;
  let digitsTimer: ReturnType<typeof setTimeout> | undefined;
  let lastView: TimerView = timer.view;
  /** Live parts of the round view, updated in place every tick (no re-render: taps stay on their button). */
  let livePiece: ReturnType<typeof progressBar> | undefined;
  let liveDigits: HTMLButtonElement | undefined;
  let liveBreak: HTMLElement | undefined;
  /** Task picked in the Horizon for the next round (FR-607); used once. */
  let picked: string | undefined;

  const run = (p: Promise<unknown>) => p.catch(() => {});

  async function park() {
    const form = document.createElement('div');
    const label = document.createElement('label');
    label.textContent = t('timer.park.label');
    const input = document.createElement('input');
    input.type = 'text';
    input.name = 'park';
    input.autocomplete = 'off';
    input.placeholder = t('timer.park.placeholder');
    label.append(input);
    const kind = document.createElement('select');
    kind.setAttribute('aria-label', t('timer.park.kind'));
    for (const k of ['internal', 'external'] as const)
      kind.append(new Option(t(`timer.park.${k}`), k));
    form.append(label, kind);
    const choice = await openDialog({
      title: t('tagesweg.park'),
      body: form,
      actions: [
        { label: t('tagesweg.parkSave'), value: 'save' },
        { label: t('tagesweg.parkCancel'), value: 'cancel', variant: 'quiet' },
      ],
    });
    if (choice === 'save' && input.value.trim()) {
      await timer.park(input.value, kind.value as InterruptionType);
      document.dispatchEvent(new Event(DATA_CHANGED));
    }
  }

  async function abort() {
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

  const stations = (row: Extract<TagesRow, { kind: 'task' }>) => {
    const ul = document.createElement('span');
    ul.className = 'tw-stations';
    for (const s of row.stations) {
      const dot = document.createElement('span');
      dot.className = `tw-station tw-station--${s}`;
      dot.setAttribute('role', 'img');
      dot.setAttribute('aria-label', t(`tagesweg.station.${s}`));
      ul.append(dot);
    }
    return ul;
  };

  function taskRow(
    row: Extract<TagesRow, { kind: 'task' }>,
    next: string | undefined,
    pickable: boolean,
  ) {
    const li = document.createElement('li');
    li.className = 'tw-row tw-row--task';
    li.dataset.role = 'task-row';
    if (row.taskId === next) li.classList.add('tw-row--next');
    const title = document.createElement('span');
    title.className = 'tw-row__title';
    title.textContent = row.title;
    const body: Node[] = [title];
    if (row.unplanned) {
      const u = document.createElement('span');
      u.className = 'tw-row__tag';
      u.textContent = t('tagesweg.unplanned');
      body.push(u);
    }
    body.push(stations(row));
    const open = row.stations.some((st) => st !== 'done');
    if (pickable && open) {
      // Tap a row to make it the next round's task (replaces the old task select).
      const pick = document.createElement('button');
      pick.type = 'button';
      pick.className = 'tw-row__pick';
      pick.dataset.action = 'pick';
      pick.setAttribute('aria-pressed', String(row.taskId === next));
      pick.setAttribute('aria-label', t('tagesweg.pick', { title: row.title }));
      pick.addEventListener('click', () => {
        picked = row.taskId;
        render();
      });
      li.append(pick, ...body);
    } else li.append(...body);
    return li;
  }

  function rewardRow(row: Extract<TagesRow, { kind: 'reward' }>) {
    const li = document.createElement('li');
    li.className = 'tw-row tw-row--reward';
    li.dataset.role = 'reward-row';
    const title = document.createElement('span');
    title.className = 'tw-row__title';
    title.textContent = localizeReward(row.title, i18n.locale);
    const text = document.createElement('span');
    text.className = 'tw-row__text';
    const metas = document.createElement('span');
    metas.className = 'tw-row__metas';
    const price = document.createElement('span');
    price.className = 'tw-row__meta';
    price.append(coinAmount(row.price, t('header.coins', { n: row.price })));
    metas.append(price);
    text.append(title, metas);
    li.append(text);
    if (row.reached)
      li.append(
        button({
          label: t('tagesweg.redeem'),
          action: 'redeem',
          onClick: () =>
            void run(
              shop.redeem(row.rewardId).then(() => {
                document.dispatchEvent(new Event(DATA_CHANGED));
              }),
            ),
        }),
      );
    else {
      const go = document.createElement('span');
      go.className = 'tw-row__meta';
      go.append(coinText('tagesweg.toGo', row.toGo));
      metas.append(go);
      if (row.etaAt !== undefined) {
        const eta = document.createElement('span');
        eta.className = 'tw-row__meta';
        eta.dataset.role = 'eta';
        eta.textContent = t('tagesweg.eta', {
          time: new Intl.DateTimeFormat(i18n.locale, {
            hour: '2-digit',
            minute: '2-digit',
          }).format(row.etaAt),
        });
        metas.append(eta);
      }
    }
    return li;
  }

  /** Budget line of the day: rounds done of planned, budget (FR-203, main-360). */
  function summary() {
    const day = state
      ? deriveDayProgress(state, now())
      : { done: 0, planned: 0 };
    const budget = state?.settings.dailyBudget ?? 0;
    const wrap = document.createElement('div');
    wrap.className = 'tw-summary';
    const p = document.createElement('p');
    p.dataset.role = 'summary';
    p.textContent = t('tagesweg.summary', {
      done: day.done,
      planned: day.planned,
      budget,
    });
    wrap.append(
      p,
      progressBar({
        label: t('tagesweg.ringDayLabel'),
        value: day.done,
        max: Math.max(1, day.planned, day.done),
        valueText: p.textContent,
      }).element,
    );
    return wrap;
  }

  const breakLeft = (ms: number) =>
    t('tagesweg.breakLeft', { min: Math.max(1, Math.ceil(ms / 60_000)) });

  const parkButton = () =>
    iconButton({
      icon: 'park',
      label: t('tagesweg.park'),
      action: 'park',
      shortcut: 'P',
      onClick: () => void run(park()),
    });

  /** The one main action of Today (FR-610): next task, Start, Park. */
  function nextCard(w: Tagesweg, phase: TimerView['phase']) {
    const next = picked ?? w.currentTaskId;
    const card = document.createElement('section');
    card.className = 'ui-card tw-next';
    card.dataset.role = 'next';
    const label = document.createElement('p');
    label.className = 'tw-next__label';
    label.textContent =
      phase === 'short-break' || phase === 'long-break'
        ? t(`timer.phase.${phase}`)
        : t('tagesweg.next');
    const title = document.createElement('p');
    title.className = 'tw-next__title';
    title.textContent = (next && state?.tasks[next]?.title) || '';
    const onBreak = phase === 'short-break' || phase === 'long-break';
    // Break bar (pause-360): how much of the break is over, minutes left; ticks update it in place.
    const breakParts: Node[] = [];
    if (onBreak && lastView.totalMs > 0) {
      const bar = progressBar({
        label: t('tagesweg.breakBar'),
        value: 1 - lastView.remainingMs / lastView.totalMs,
        max: 1,
      });
      bar.element.dataset.role = 'break-bar';
      bar.element.classList.add('tw-break');
      livePiece = bar;
      const left = document.createElement('p');
      left.className = 'tw-next__left';
      left.dataset.role = 'break-left';
      left.textContent = breakLeft(lastView.remainingMs);
      liveBreak = left;
      breakParts.push(bar.element, left);
    }
    const actions = document.createElement('div');
    actions.className = 'tw-next__actions';
    actions.append(
      button({
        label: t('tagesweg.start'),
        variant: 'primary',
        action: 'start',
        disabled: !next,
        onClick: () => {
          if (!next) return;
          deps.prepareAlerts?.();
          ring = false;
          const go = async () => {
            if (phase !== 'idle') await timer.skipBreak();
            picked = undefined;
            await timer.start(next);
          };
          void run(go());
        },
      }),
      parkButton(),
    );
    card.append(label, ...breakParts, title, actions);
    return card;
  }

  function emptyState() {
    const box = document.createElement('section');
    box.className = 'tw-empty';
    box.dataset.role = 'empty';
    const h = document.createElement('h2');
    h.textContent = t('tagesweg.emptyTitle');
    const p = document.createElement('p');
    p.textContent = t('tagesweg.empty');
    box.append(
      h,
      p,
      button({
        label: t('tagesweg.plan'),
        variant: 'primary',
        action: 'plan',
        onClick: () => {
          location.hash = '#/tasks';
        },
      }),
    );
    return box;
  }

  function ringCard(w: Tagesweg) {
    const el = document.createElement('section');
    el.className = 'ui-card ui-card--highlight tw-ring';
    el.dataset.role = 'ring';
    const gain = state?.settings.coinsPerPomodoro ?? 0;
    const lines: [string, string | Node][] = [];
    if (state?.settings.gamification !== 'off') {
      lines.push(['ring-gain', coinText('tagesweg.ring', gain)]);
      lines.push([
        'ring-balance',
        coinText('tagesweg.ringBalance', state?.coins ?? 0),
      ]);
      const next = w.rows.find((r) => r.kind === 'reward');
      if (next?.kind === 'reward')
        lines.push([
          'ring-next',
          next.reached
            ? t('tagesweg.ringReached')
            : coinText('tagesweg.ringNext', next.toGo),
        ]);
    } else lines.push(['ring-gain', t('tagesweg.ringDone')]);
    const day = state
      ? deriveDayProgress(state, now())
      : { done: 0, planned: 0 };
    lines.push([
      'ring-day',
      t('tagesweg.ringDay', { done: day.done, planned: day.planned }),
    ]);
    const streak = state && deriveStreak(state, now());
    if (streak?.visible && streak.length > 0)
      lines.push([
        'ring-streak',
        streak.restarted
          ? t('tagesweg.streakNew')
          : t('tagesweg.streak', { n: streak.length }),
      ]);
    for (const [role, text] of lines) {
      const p = document.createElement('p');
      p.dataset.role = role;
      p.append(text);
      el.append(p);
      if (role === 'ring-day')
        el.append(
          progressBar({
            label: t('tagesweg.ringDayLabel'),
            value: day.done,
            max: Math.max(day.planned, day.done),
            valueText: p.textContent,
          }).element,
        );
    }
    el.append(
      button({
        label: t('tagesweg.ringContinue'),
        variant: 'quiet',
        action: 'ring-continue',
        onClick: () => {
          ring = false;
          render();
        },
      }),
    );
    return el;
  }

  function render() {
    if (!state) return;
    livePiece = undefined;
    liveDigits = undefined;
    liveBreak = undefined;
    const w = deriveTagesweg(state, lastView, now());
    const phase = lastView.phase;
    const children: Node[] = [];
    const section = document.createElement('section');
    section.className = 'tagesweg';
    section.setAttribute('aria-label', t('tagesweg.title'));

    if (w.zoom) {
      // Round running (FR-604): only the task, its path piece, notes and the round controls.
      section.classList.add('tagesweg--focus');
      const row = w.rows.find(
        (r) => r.kind === 'task' && r.taskId === w.zoom!.taskId,
      );
      const task = state.tasks[w.zoom.taskId];
      const head = document.createElement('p');
      head.className = 'tw-focus__phase';
      if (row?.kind === 'task') {
        const n = row.stations.filter((st) => st === 'done').length + 1;
        head.textContent = t('tagesweg.focusHead', {
          phase: t(`timer.phase.${phase}`),
          n,
          m: row.stations.length,
        });
      } else head.textContent = t(`timer.phase.${phase}`);
      const title = document.createElement('h2');
      title.className = 'tw-focus__task';
      title.textContent = task?.title ?? '';
      const list = document.createElement('ol');
      list.className = 'tw-path tw-path--focus';
      if (row?.kind === 'task') list.append(taskRow(row, undefined, false));
      const piece = progressBar({
        label: t('tagesweg.piece'),
        value: w.zoom.progress,
        max: 1,
      });
      piece.element.dataset.role = 'piece';
      piece.element.classList.add('tw-piece');
      livePiece = piece;
      const showing = !!state.settings.digitsAlways || Date.now() < digitsUntil;
      const digits = button({
        label: showing
          ? formatClock(lastView.remainingMs)
          : t('tagesweg.digits'),
        variant: 'quiet',
        action: 'digits',
        onClick: () => {
          digitsUntil = Date.now() + DIGITS_MS;
          clearTimeout(digitsTimer);
          digitsTimer = setTimeout(render, DIGITS_MS);
          render();
        },
      });
      digits.classList.add('tw-digits');
      if (showing) digits.classList.add('tw-digits--on');
      liveDigits = showing ? digits : undefined;
      children.push(head, title, piece.element, digits);
      if (task?.bullets?.length) {
        const ul = document.createElement('ul');
        ul.className = 'tw-bullets';
        ul.dataset.role = 'bullets';
        for (const bullet of task.bullets) {
          const li = document.createElement('li');
          const label = document.createElement('label');
          const box = document.createElement('input');
          box.type = 'checkbox';
          box.checked = !!task.ticked?.includes(bullet);
          box.disabled = !deps.tickBullet;
          box.addEventListener('change', () =>
            run(
              deps.tickBullet!(task.id, bullet, box.checked).then(() =>
                document.dispatchEvent(new Event(DATA_CHANGED)),
              ),
            ),
          );
          label.append(box, document.createTextNode(bullet));
          li.append(label);
          ul.append(li);
        }
        children.push(ul);
      }
      const controls = document.createElement('div');
      controls.className = 'tw-controls';
      const parkBtn = button({
        label: t('tagesweg.park'),
        variant: 'secondary',
        action: 'park',
        onClick: () => void run(park()),
      });
      parkBtn.setAttribute('aria-keyshortcuts', 'P');
      controls.append(parkBtn);
      // Flexible mode may pause (FR-107); strict shows Abort only.
      if (lastView.mode === 'flexible')
        controls.append(
          button({
            label: t(phase === 'paused' ? 'timer.resume' : 'timer.pause'),
            variant: 'secondary',
            action: phase === 'paused' ? 'resume' : 'pause',
            onClick: () =>
              void run(phase === 'paused' ? timer.resume() : timer.pause()),
          }),
        );
      controls.append(
        button({
          label: t('tagesweg.abort'),
          variant: 'quiet',
          action: 'abort',
          onClick: () => void run(abort()),
        }),
      );
      children.push(controls, list);
    } else {
      const tasksToday = w.rows.some((r) => r.kind === 'task');
      if (ring) children.push(ringCard(w));
      if (!tasksToday && !picked) children.push(emptyState());
      else {
        children.push(summary());
        const next = picked ?? w.currentTaskId;
        const pickable =
          phase === 'idle' || phase === 'short-break' || phase === 'long-break';
        const list = document.createElement('ol');
        list.className = 'tw-path';
        for (const r of w.rows)
          list.append(
            r.kind === 'task' ? taskRow(r, next, pickable) : rewardRow(r),
          );
        children.push(list);
        if (pickable) children.push(nextCard(w, phase));
      }
    }
    section.append(...children);
    root.replaceChildren(section);
  }

  /** Next open task of today after the current pick, wrapping (NFR-06, N). */
  function pickNext() {
    if (!state) return false;
    const w = deriveTagesweg(state, lastView, now());
    const open = w.rows.filter(
      (r) => r.kind === 'task' && r.stations.some((st) => st !== 'done'),
    ) as Extract<TagesRow, { kind: 'task' }>[];
    if (open.length === 0) return false;
    const cur = picked ?? w.currentTaskId;
    const i = open.findIndex((r) => r.taskId === cur);
    picked = open[(i + 1) % open.length]!.taskId;
    render();
    return true;
  }

  /** Keys (NFR-06): Space starts, P parks, N picks the next task; never while typing or in a dialog. */
  const onKey = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (!root.isConnected || root.closest('[hidden], [inert]')) return;
    if (document.querySelector('.ui-dialog-backdrop')) return;
    const el = e.target as HTMLElement | null;
    if (
      el &&
      (/^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(el.tagName) ||
        el.isContentEditable)
    )
      return;
    const key = e.key.toLowerCase();
    if (key === ' ') {
      const start = root.querySelector<HTMLButtonElement>(
        '[data-action="start"]',
      );
      if (!start || start.disabled) return;
      e.preventDefault();
      start.click();
    } else if (key === 'p') {
      if (!root.querySelector('[data-action="park"]')) return;
      e.preventDefault();
      void run(park());
    } else if (key === 'n') {
      if (lastView.phase === 'focus' || lastView.phase === 'paused') return;
      if (pickNext()) e.preventDefault();
    }
  };
  document.addEventListener('keydown', onKey);

  const reload = async () => {
    state = await deps.state();
    render();
  };
  const offTimer = timer.onChange((view: TimerView, end?: PhaseEnd) => {
    const prev = lastView;
    lastView = view;
    if (end === 'focus') ring = true;
    // A plain tick (same phase, same round): move the piece and the digits only. Re-rendering every
    // second would swap the buttons under a finger and swallow taps on the iPhone (NFR-18).
    if (
      !end &&
      state &&
      view.phase === prev.phase &&
      view.pomodoroId === prev.pomodoroId &&
      view.mode === prev.mode
    ) {
      if (livePiece && view.totalMs > 0)
        livePiece.set(1 - view.remainingMs / view.totalMs, 1);
      if (liveDigits) liveDigits.textContent = formatClock(view.remainingMs);
      if (liveBreak) liveBreak.textContent = breakLeft(view.remainingMs);
      return;
    }
    void reload().catch(() => {});
  });
  const onData = () => void reload().catch(() => {});
  document.addEventListener(DATA_CHANGED, onData);
  const onPick = (e: Event) => {
    picked = (e as CustomEvent<string>).detail;
    render();
  };
  document.addEventListener(PICK_TASK, onPick);
  const offLocale = i18n.onChange(render);
  void reload().catch(() => {});

  return () => {
    offTimer();
    offLocale();
    clearTimeout(digitsTimer);
    document.removeEventListener(DATA_CHANGED, onData);
    document.removeEventListener(PICK_TASK, onPick);
    document.removeEventListener('keydown', onKey);
  };
}
