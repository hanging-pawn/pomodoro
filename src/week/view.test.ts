import { describe, expect, it } from 'vitest';
import { newEvent } from '../domain/events';
import { deriveState } from '../domain/state';
import { createI18n } from '../i18n/i18n';
import { mountWeek } from './view';

const D = new Date(2026, 10, 13, 12, 0, 0).getTime();
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('mountWeek', () => {
  it('shows per day, per project and the plan fulfilment', async () => {
    const events = [
      newEvent(
        'task.created',
        { taskId: 'a', title: 'A', project: 'Alpha', estimate: 2 },
        1,
      ),
      newEvent('plan.changed', { day: '2026-11-13', taskIds: ['a'] }, 2),
      newEvent(
        'pomodoro.started',
        { pomodoroId: 'p', taskId: 'a', mode: 'strict', focusMinutes: 25 },
        D,
      ),
      newEvent('pomodoro.completed', { pomodoroId: 'p' }, D + 1),
    ];
    const root = document.createElement('div');
    document.body.replaceChildren(root);
    mountWeek(
      root,
      createI18n({
        languages: ['en'],
        storage: undefined as unknown as Storage,
      }),
      { state: async () => deriveState(events), now: () => D },
    );
    await flush();
    expect(root.querySelectorAll('.week__days tbody tr')).toHaveLength(7);
    expect(
      root.querySelector('tr[data-day="2026-11-13"] td:last-child')
        ?.textContent,
    ).toBe('1');
    expect(root.querySelector('.week__projects tbody')?.textContent).toContain(
      'Alpha1',
    );
    expect(
      root.querySelector('[data-role="fulfilment"]')?.textContent,
    ).toContain('50 %');
    expect(
      root.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow'),
    ).toBe('1');
  });
});
