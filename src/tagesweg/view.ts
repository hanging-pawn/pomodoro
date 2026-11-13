import type { AppState } from '../domain/state';
import type { InterruptionType } from '../domain/events';
import type { I18n, MessageKey } from '../i18n/i18n';
import type { Shop } from '../rewards/shop';
import { DATA_CHANGED } from '../tasks/events';
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
  now?: () => number;
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
  let state: AppState | undefined;
  let ring = false;
  let digitsUntil = 0;
  let digitsTimer: ReturnType<typeof setTimeout> | undefined;
  let lastView: TimerView = timer.view;

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

  function taskRow(row: Extract<TagesRow, { kind: 'task' }>) {
    const li = document.createElement('li');
    li.className = 'tw-row tw-row--task';
    li.dataset.role = 'task-row';
    const title = document.createElement('span');
    title.className = 'tw-row__title';
    title.textContent = row.title;
    li.append(title);
    if (row.unplanned) {
      const u = document.createElement('span');
      u.className = 'tw-row__tag';
      u.textContent = t('tagesweg.unplanned');
      li.append(u);
    }
    li.append(stations(row));
    return li;
  }

  function rewardRow(row: Extract<TagesRow, { kind: 'reward' }>) {
    const li = document.createElement('li');
    li.className = 'tw-row tw-row--reward';
    li.dataset.role = 'reward-row';
    const title = document.createElement('span');
    title.className = 'tw-row__title';
    title.textContent = row.title;
    const price = document.createElement('span');
    price.className = 'tw-row__meta';
    price.textContent = t('tagesweg.coins', { n: row.price });
    li.append(title, price);
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
      go.textContent = t('tagesweg.toGo', { n: row.toGo });
      li.append(go);
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
        li.append(eta);
      }
    }
    return li;
  }

  function header(w: Tagesweg) {
    const head = document.createElement('header');
    head.className = 'tw-head';
    const h = document.createElement('h2');
    h.textContent = t('tagesweg.title');
    head.append(h);
    if (w.showCoins) {
      const coins = document.createElement('p');
      coins.className = 'tw-coins';
      coins.dataset.role = 'coins';
      coins.setAttribute('aria-label', t('tagesweg.coinsLabel'));
      coins.textContent = t('tagesweg.coins', { n: w.coins });
      head.append(coins);
    }
    head.append(
      iconButton({
        icon: 'park',
        label: t('tagesweg.park'),
        action: 'park',
        shortcut: 'P',
        onClick: () => void run(park()),
      }),
    );
    return head;
  }

  function ringCard(w: Tagesweg) {
    const el = document.createElement('section');
    el.className = 'ui-card ui-card--highlight tw-ring';
    el.dataset.role = 'ring';
    const gain = state?.settings.coinsPerPomodoro ?? 0;
    const lines: [string, string][] = [];
    if (state?.settings.gamification !== 'off') {
      lines.push(['ring-gain', t('tagesweg.ring', { n: gain })]);
      lines.push([
        'ring-balance',
        t('tagesweg.ringBalance', { n: state?.coins ?? 0 }),
      ]);
      const next = w.rows.find((r) => r.kind === 'reward');
      if (next?.kind === 'reward')
        lines.push([
          'ring-next',
          next.reached
            ? t('tagesweg.ringReached')
            : t('tagesweg.ringNext', { n: next.toGo }),
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
      p.textContent = text;
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
    const w = deriveTagesweg(state, lastView, now());
    const phase = lastView.phase;
    const children: Node[] = [header(w)];

    if (w.zoom) {
      const row = w.rows.find(
        (r) => r.kind === 'task' && r.taskId === w.zoom!.taskId,
      );
      const list = document.createElement('ol');
      list.className = 'tw-path';
      if (row?.kind === 'task') list.append(taskRow(row));
      const piece = progressBar({
        label: t('tagesweg.piece'),
        value: w.zoom.progress,
        max: 1,
      });
      piece.element.dataset.role = 'piece';
      piece.element.classList.add('tw-piece');
      const controls = document.createElement('div');
      controls.className = 'tw-controls';
      const showing = Date.now() < digitsUntil;
      controls.append(
        button({
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
        }),
        button({
          label: t('tagesweg.abort'),
          variant: 'quiet',
          action: 'abort',
          onClick: () => void run(abort()),
        }),
      );
      children.push(list, piece.element, controls);
    } else {
      if (ring) children.push(ringCard(w));
      if (w.rows.length === 0) {
        const empty = document.createElement('p');
        empty.textContent = t('tagesweg.empty');
        children.push(empty);
      } else {
        const list = document.createElement('ol');
        list.className = 'tw-path';
        for (const r of w.rows)
          list.append(r.kind === 'task' ? taskRow(r) : rewardRow(r));
        children.push(list);
      }
      const canStart = !!w.currentTaskId && phase === 'idle';
      if (phase === 'idle' || phase === 'short-break' || phase === 'long-break')
        children.push(
          button({
            label: t('tagesweg.start'),
            variant: 'primary',
            action: 'start',
            disabled: !w.currentTaskId,
            onClick: () => {
              if (!canStart && phase === 'idle') return;
              ring = false;
              const go = async () => {
                if (phase !== 'idle') await timer.skipBreak();
                if (w.currentTaskId) await timer.start(w.currentTaskId);
              };
              void run(go());
            },
          }),
        );
    }
    const section = document.createElement('section');
    section.className = 'tagesweg';
    section.setAttribute('aria-label', t('tagesweg.title'));
    section.append(...children);
    root.replaceChildren(section);
  }

  const reload = async () => {
    state = await deps.state();
    render();
  };
  const offTimer = timer.onChange((view: TimerView, end?: PhaseEnd) => {
    lastView = view;
    if (end === 'focus') ring = true;
    void reload().catch(() => {});
  });
  const onData = () => void reload().catch(() => {});
  document.addEventListener(DATA_CHANGED, onData);
  const offLocale = i18n.onChange(render);
  void reload().catch(() => {});

  return () => {
    offTimer();
    offLocale();
    clearTimeout(digitsTimer);
    document.removeEventListener(DATA_CHANGED, onData);
  };
}
