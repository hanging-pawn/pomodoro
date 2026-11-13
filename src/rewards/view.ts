import type { AppState } from '../domain/state';
import type { I18n, MessageKey } from '../i18n/i18n';
import { DATA_CHANGED } from '../tasks/events';
import { button } from '../ui/components/button';
import { card } from '../ui/components/card';
import { openDialog } from '../ui/components/dialog';
import { listRow } from '../ui/components/list-row';
import { ShopError, type Shop } from './shop';

export interface RewardsViewDeps {
  state(): Promise<AppState>;
}

/**
 * Coins and reward shop (FR-401–408). Level «off» renders nothing but errors: no balance, no
 * shop (FR-405); the level itself is set in Settings. Returns an unmount function.
 */
export function mountRewards(
  root: HTMLElement,
  i18n: I18n,
  shop: Shop,
  deps: RewardsViewDeps,
): () => void {
  const t = (key: string, vars: Record<string, string | number> = {}) =>
    Object.entries(vars).reduce(
      (s, [k, v]) => s.replaceAll(`{${k}}`, String(v)),
      i18n.t(key as MessageKey),
    );
  let error = '';
  let draft = { title: '', price: '' };

  const changed = () => document.dispatchEvent(new Event(DATA_CHANGED));
  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      error = '';
    } catch (e) {
      if (e instanceof ShopError) error = t(`rewards.error.${e.code}`);
      else throw e;
    }
    changed();
    await render();
  };

  async function edit(reward: { id: string; title: string; price: number }) {
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
    const title = field(t('rewards.title'), reward.title, 'text');
    const price = field(t('rewards.price'), String(reward.price), 'number');
    const choice = await openDialog({
      title: t('rewards.edit'),
      body: form,
      actions: [
        { label: t('tasks.save'), value: 'save' },
        { label: t('tasks.cancel'), value: 'cancel', variant: 'quiet' },
      ],
    });
    if (choice === 'save')
      await run(() =>
        shop.save({
          id: reward.id,
          title: title.value,
          price: Number(price.value),
        }),
      );
  }

  const small = (label: string, action: string, onClick: () => void) =>
    button({ label, action, variant: 'quiet', onClick });

  async function render() {
    const state = await deps.state();
    const level = state.settings.gamification;

    // Level and streak live in Settings (FR-610); the Shop shows balance, rewards and history.
    const children: Node[] = [];

    if (level !== 'off') {
      const balance = document.createElement('p');
      balance.dataset.role = 'coins';
      balance.className = 'today__summary';
      balance.textContent = t('rewards.balance', { n: state.coins });
      children.push(balance);

      const list = document.createElement('ul');
      list.className = 'ui-list';
      list.dataset.role = 'shop-list';
      for (const reward of Object.values(state.rewards)) {
        const actions = document.createElement('span');
        actions.className = 'tasks__actions';
        actions.append(
          button({
            label: t('rewards.redeem'),
            action: 'redeem',
            variant: 'secondary',
            disabled: state.coins < reward.price,
            onClick: () => void run(() => shop.redeem(reward.id)),
          }),
          small(t('tasks.edit'), 'edit-reward', () => void edit(reward)),
          small(
            t('tasks.delete'),
            'delete-reward',
            () => void run(() => shop.remove(reward.id)),
          ),
        );
        list.append(
          listRow({
            title: reward.title,
            meta: t('rewards.coins', { n: reward.price }),
            trailing: actions,
          }),
        );
      }
      children.push(list);

      const form = document.createElement('form');
      form.noValidate = true;
      const input = (label: string, key: 'title' | 'price', type: string) => {
        const l = document.createElement('label');
        l.textContent = label;
        const i = document.createElement('input');
        i.type = type;
        i.name = `reward-${key}`;
        i.value = draft[key];
        if (type === 'number') {
          i.min = '1';
          i.step = '1';
        }
        i.addEventListener('input', () => (draft[key] = i.value));
        l.append(i);
        return l;
      };
      const err = document.createElement('p');
      err.setAttribute('role', 'alert');
      err.dataset.role = 'error';
      err.textContent = error;
      err.hidden = !error;
      form.append(
        input(t('rewards.title'), 'title', 'text'),
        input(t('rewards.price'), 'price', 'number'),
        err,
        button({
          label: t('rewards.add'),
          variant: 'primary',
          type: 'submit',
          action: 'add-reward',
        }),
      );
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        void run(async () => {
          await shop.save({
            title: draft.title,
            price: Number(draft.price),
          });
          draft = { title: '', price: '' };
        });
      });
      children.push(form);

      if (state.redemptions.length) {
        const log = document.createElement('ul');
        log.className = 'ui-list';
        log.dataset.role = 'redemption-log';
        for (const r of [...state.redemptions].reverse().slice(0, 10))
          log.append(
            listRow({
              title: r.title,
              meta: t('rewards.coins', { n: r.price }),
            }),
          );
        children.push(log);
      }
    } else if (error) {
      const err = document.createElement('p');
      err.setAttribute('role', 'alert');
      err.textContent = error;
      children.push(err);
    }

    root.replaceChildren(card({ title: t('rewards.heading'), children }));
  }

  const onData = () => void render().catch(() => {});
  document.addEventListener(DATA_CHANGED, onData);
  void render();
  const off = i18n.onChange(() => void render());
  return () => {
    off();
    document.removeEventListener(DATA_CHANGED, onData);
  };
}
