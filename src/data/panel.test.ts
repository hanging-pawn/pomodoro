import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { newEvent } from '../domain/events';
import { createI18n } from '../i18n/i18n';
import { openStore } from '../storage/store';
import { DATA_CHANGED } from '../tasks/events';
import { mountDataPanel, type Download } from './panel';

const flush = () => new Promise((r) => setTimeout(r, 0));
const i18n = () =>
  createI18n({ languages: ['en'], storage: undefined as unknown as Storage });
const q = (root: ParentNode, a: string) =>
  root.querySelector<HTMLElement>(`[data-action="${a}"]`);

async function setup() {
  localStorage.clear();
  const store = await openStore({ indexedDB: new IDBFactory() });
  await store.append(
    newEvent('task.created', { taskId: 'a', title: 'Report', estimate: 2 }, 1),
    newEvent('task.created', { taskId: 'b', title: 'Mail', estimate: 1 }, 2),
    newEvent(
      'pomodoro.started',
      { pomodoroId: 'p', taskId: 'a', mode: 'strict', focusMinutes: 25 },
      3,
    ),
    newEvent('pomodoro.completed', { pomodoroId: 'p' }, 4),
  );
  const downloads: Download[] = [];
  const root = document.createElement('div');
  document.body.append(root);
  mountDataPanel(root, i18n(), store, {
    download: (d) => void downloads.push(d),
    now: () => Date.UTC(2026, 10, 13, 9),
  });
  return { root, store, downloads };
}

const counts = async (store: Awaited<ReturnType<typeof openStore>>) => {
  const s = await store.state();
  return {
    tasks: Object.keys(s.tasks).length,
    pomodoros: s.pomodoros.completed,
    coins: s.coins,
  };
};

async function importFile(root: HTMLElement, text: string) {
  const input = root.querySelector<HTMLInputElement>('input[type="file"]')!;
  const file = new File([text], 'backup.json', { type: 'application/json' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new Event('change'));
  for (let i = 0; i < 10; i++) await flush();
}

async function answer(label: string) {
  await flush();
  const b = [
    ...document.querySelectorAll<HTMLButtonElement>('.ui-dialog button'),
  ].find((x) => x.textContent === label);
  b!.click();
  for (let i = 0; i < 10; i++) await flush();
}

describe('mountDataPanel (NFR-03)', () => {
  it('exports all data as JSON and the protocol as CSV', async () => {
    const { root, downloads } = await setup();
    q(root, 'export-json')!.click();
    await flush();
    q(root, 'export-csv')!.click();
    await flush();
    expect(downloads.map((d) => [d.name, d.type])).toEqual([
      ['pomo-pomo-2026-11-13.json', 'application/json'],
      ['pomo-pomo-protocol-2026-11-13.csv', 'text/csv'],
    ]);
    expect(JSON.parse(downloads[0]!.text).events).toHaveLength(4);
    expect(downloads[1]!.text.split('\r\n')[0]).toContain('id,time,type');
  });

  it('export → delete all data → import gives the same tasks, pomodoros and coins', async () => {
    const { root, store, downloads } = await setup();
    const before = await counts(store);
    q(root, 'export-json')!.click();
    await flush();

    q(root, 'wipe')!.click();
    await answer('Delete all data');
    expect(await counts(store)).toEqual({ tasks: 0, pomodoros: 0, coins: 0 });

    let changed = 0;
    document.addEventListener(DATA_CHANGED, () => changed++);
    await importFile(root, downloads[0]!.text);
    expect(await counts(store)).toEqual(before);
    expect(before).toEqual({ tasks: 2, pomodoros: 1, coins: 10 });
    expect(changed).toBe(1);
    expect(root.querySelector('[role="status"]')?.textContent).toBe(
      'Data imported.',
    );
  });

  it('deletes nothing when the confirmation is cancelled', async () => {
    const { root, store } = await setup();
    q(root, 'wipe')!.click();
    await answer('Cancel');
    expect((await counts(store)).tasks).toBe(2);
  });

  it('rejects a file that is no export and changes nothing', async () => {
    const { root, store } = await setup();
    await importFile(root, '{"hello":1}');
    expect((await counts(store)).tasks).toBe(2);
    expect(root.querySelector('[role="status"]')?.textContent).toBe(
      'This file is not a pomo.pomo export. Nothing was changed.',
    );
  });
});
