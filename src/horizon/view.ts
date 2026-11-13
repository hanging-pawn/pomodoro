import type { AppState } from '../domain/state';
import type { I18n, MessageKey } from '../i18n/i18n';
import { DATA_CHANGED, PICK_TASK } from '../tasks/events';
import { deriveHorizon } from './model';

export interface HorizonDeps {
  state(): Promise<AppState>;
  /** Stores a project's target date (empty string clears it). */
  setTarget(project: string, date: string): Promise<void>;
  /** Called with the next open task of the clicked project; default: fires `PICK_TASK` on `document`. */
  pick?(taskId: string, project: string): void;
  now?: () => number;
}

/**
 * Horizon (FR-607, FR-608): the zoom level beyond the Tagesweg. One line per project up to its
 * target date with today marked; a click on a line picks the project's next open task for the
 * next round. Returns an unmount function.
 */
export function mountHorizon(
  root: HTMLElement,
  i18n: I18n,
  deps: HorizonDeps,
): () => void {
  const now = deps.now ?? Date.now;
  const t = (key: string, vars: Record<string, string | number> = {}) =>
    Object.entries(vars).reduce(
      (s, [k, v]) => s.replaceAll(`{${k}}`, String(v)),
      i18n.t(key as MessageKey),
    );
  const pick =
    deps.pick ??
    ((id: string) =>
      document.dispatchEvent(new CustomEvent(PICK_TASK, { detail: id })));

  async function render() {
    const lines = deriveHorizon(await deps.state(), now());
    const section = document.createElement('section');
    section.className = 'horizon';
    // The screen title (shell) names the Horizon; this heading stays for screen readers only.
    const h = document.createElement('h2');
    h.className = 'visually-hidden';
    h.textContent = t('horizon.title');
    section.append(h);

    if (lines.length === 0) {
      const empty = document.createElement('p');
      empty.textContent = t('horizon.empty');
      section.append(empty);
    }
    const list = document.createElement('ul');
    list.className = 'horizon__lines';
    for (const line of lines) {
      const li = document.createElement('li');
      li.dataset.project = line.project;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'horizon__line';
      b.dataset.action = 'pick-project';
      b.disabled = !line.nextTaskId;
      b.setAttribute(
        'aria-label',
        t('horizon.line', {
          project: line.project,
          date: line.targetDate,
          n: Math.max(0, line.daysLeft),
        }),
      );
      const head = document.createElement('span');
      head.className = 'horizon__head';
      const name = document.createElement('span');
      name.className = 'horizon__name';
      name.textContent = line.project;
      const left = document.createElement('span');
      left.className = 'horizon__left';
      left.textContent = t('tasks.daysLeft', { n: Math.max(0, line.daysLeft) });
      head.append(name, left);
      const track = document.createElement('span');
      track.className = 'horizon__track';
      track.dataset.role = 'line';
      const walked = document.createElement('span');
      walked.className = 'horizon__walked';
      walked.style.width = `${Math.round(line.today * 100)}%`;
      const today = document.createElement('span');
      today.className = 'horizon__today';
      today.dataset.role = 'today';
      today.title = t('horizon.today');
      today.style.left = `${Math.round(line.today * 100)}%`;
      track.append(walked, today);
      const end = document.createElement('span');
      end.className = 'horizon__meta';
      const when = document.createElement('time');
      when.dateTime = line.targetDate;
      const [y, m, d] = line.targetDate.split('-').map(Number);
      when.textContent = new Date(y!, m! - 1, d!).toLocaleDateString(
        i18n.locale,
        { day: 'numeric', month: 'short', year: 'numeric' },
      );
      const progress = document.createElement('span');
      progress.className = 'horizon__next';
      progress.textContent = line.nextTaskId
        ? t('horizon.progress', { done: line.done, total: line.total })
        : t('horizon.nothingOpen');
      end.append(when, progress);
      b.append(head, track, end);
      b.addEventListener('click', () => {
        if (line.nextTaskId) pick(line.nextTaskId, line.project);
      });
      li.append(b);
      list.append(li);
    }
    section.append(list);

    // Setting a target date is a small form in its own card (FR-608).
    const form = document.createElement('form');
    form.noValidate = true;
    form.className = 'ui-card horizon__form';
    const formTitle = document.createElement('h3');
    formTitle.className = 'ui-card__title';
    formTitle.textContent = t('horizon.date');
    const project = document.createElement('input');
    project.name = 'project';
    project.id = 'horizon-project';
    project.setAttribute('list', 'horizon-projects');
    const known = document.createElement('datalist');
    known.id = 'horizon-projects';
    for (const p of lines) known.append(new Option(p.project));
    const pLabel = document.createElement('label');
    pLabel.htmlFor = project.id;
    pLabel.textContent = t('horizon.project');
    const date = document.createElement('input');
    date.type = 'date';
    date.name = 'date';
    date.id = 'horizon-date';
    const dLabel = document.createElement('label');
    dLabel.htmlFor = date.id;
    dLabel.textContent = t('horizon.date');
    const save = document.createElement('button');
    save.type = 'submit';
    save.className = 'ui-button ui-button--secondary horizon__save';
    save.textContent = t('horizon.save');
    form.append(formTitle, pLabel, project, known, dLabel, date, save);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      void deps
        .setTarget(project.value, date.value)
        .then(() => document.dispatchEvent(new Event(DATA_CHANGED)))
        .catch(() => {});
    });
    section.append(form);
    root.replaceChildren(section);
  }

  const redraw = () => void render().catch(() => {});
  document.addEventListener(DATA_CHANGED, redraw);
  const offLocale = i18n.onChange(redraw);
  redraw();
  return () => {
    offLocale();
    document.removeEventListener(DATA_CHANGED, redraw);
  };
}
