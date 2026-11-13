import type { Screen } from '../shell/shell';
import type { TourStep } from './tour';

/** One tour per screen (POMO-86). First step = what the screen is for; then its key elements. */
const inScreen = (s: Screen, sel: string) => `.app-screen--${s} ${sel}`;

export const TOURS: Record<Screen, readonly TourStep[]> = {
  today: [
    { title: 'screen.today', body: 'info.today' },
    {
      target: inScreen('today', '[data-role="task-row"]'),
      title: 'tour.today.task.title',
      body: 'tour.today.task.body',
    },
    {
      target: inScreen('today', '[data-role="reward-row"]'),
      title: 'tour.today.reward.title',
      body: 'tour.today.reward.body',
    },
    {
      target: inScreen('today', '[data-role="next"]'),
      title: 'tour.today.next.title',
      body: 'tour.today.next.body',
    },
    {
      target: '[data-role="header-coins"]',
      title: 'tour.today.coins.title',
      body: 'tour.today.coins.body',
    },
    {
      target: '.app-header [data-action="horizon"]',
      title: 'tour.today.horizon.title',
      body: 'tour.today.horizon.body',
    },
    {
      target: '.app-header [data-action="settings"]',
      title: 'tour.today.settings.title',
      body: 'tour.today.settings.body',
    },
    {
      target: '.app-nav',
      title: 'tour.today.nav.title',
      body: 'tour.today.nav.body',
    },
  ],
  tasks: [
    { title: 'screen.tasks', body: 'info.tasks' },
    {
      target: inScreen('tasks', '[data-role="budget-input"]'),
      title: 'tour.tasks.budget.title',
      body: 'tour.tasks.budget.body',
    },
    {
      target: inScreen('tasks', '[data-role="today-list"]'),
      title: 'tour.tasks.today.title',
      body: 'tour.tasks.today.body',
    },
    {
      target: () =>
        document
          .querySelector('.app-screen--tasks [data-action="add"]')
          ?.closest('form'),
      title: 'tour.tasks.add.title',
      body: 'tour.tasks.add.body',
    },
    {
      target: inScreen('tasks', '[data-role="inventory-list"]'),
      title: 'tour.tasks.list.title',
      body: 'tour.tasks.list.body',
    },
  ],
  shop: [
    { title: 'screen.shop', body: 'info.shop' },
    {
      target: inScreen('shop', '[data-role="coins"]'),
      title: 'tour.shop.balance.title',
      body: 'tour.shop.balance.body',
    },
    {
      target: inScreen('shop', '[data-role="shop-list"]'),
      title: 'tour.shop.list.title',
      body: 'tour.shop.list.body',
    },
    {
      target: inScreen('shop', 'details'),
      title: 'tour.shop.add.title',
      body: 'tour.shop.add.body',
    },
  ],
  week: [
    { title: 'screen.week', body: 'info.week' },
    {
      target: inScreen('week', 'table.week__days'),
      title: 'tour.week.days.title',
      body: 'tour.week.days.body',
    },
    {
      target: inScreen('week', '[data-role="fulfilment"]'),
      title: 'tour.week.plan.title',
      body: 'tour.week.plan.body',
    },
    {
      target: inScreen('week', 'table.dayclose__table'),
      title: 'tour.week.close.title',
      body: 'tour.week.close.body',
    },
  ],
  horizon: [
    { title: 'screen.horizon', body: 'info.horizon' },
    {
      target: inScreen('horizon', '.horizon__lines'),
      title: 'tour.horizon.lines.title',
      body: 'tour.horizon.lines.body',
    },
    {
      target: inScreen('horizon', 'form'),
      title: 'tour.horizon.target.title',
      body: 'tour.horizon.target.body',
    },
  ],
  settings: [
    { title: 'screen.settings', body: 'info.settings' },
    {
      target: inScreen('settings', '.set-group'),
      title: 'tour.settings.focus.title',
      body: 'tour.settings.focus.body',
    },
    {
      target: '#beta',
      title: 'tour.settings.beta.title',
      body: 'tour.settings.beta.body',
    },
    {
      target: '#data',
      title: 'tour.settings.data.title',
      body: 'tour.settings.data.body',
    },
  ],
};
