import type { AppState } from '../domain/state';
import type { I18n, MessageKey } from '../i18n/i18n';
import { DATA_CHANGED } from '../tasks/events';
import { button } from '../ui/components/button';
import { card } from '../ui/components/card';
import { openDialog } from '../ui/components/dialog';
import { iconButton } from '../ui/components/icon-button';
import { listRow } from '../ui/components/list-row';
import { coinAmount, withCoins } from '../ui/components/coin';
import { ShopError, type Shop } from './shop';
import { localizeReward } from './templates';

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
  const coins = (n: number) => coinAmount(n, t('header.coins', { n }));
  const coinText = (key: string, n: number) =>
    withCoins(t(key), n, t('header.coins', { n }));
  let error = '';
  let addOpen = false;
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
    const title = field(
      t('rewards.title'),
      localizeReward(reward.title, i18n.locale),
      'text',
    );
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

  /** «…» action sheet for the rarer reward actions (NFR-18). */
  const more = (reward: { id: string; title: string; price: number }) =>
    iconButton({
      icon: 'more',
      label: t('tasks.more'),
      action: 'more',
      onClick: () =>
        void openDialog({
          title: localizeReward(reward.title, i18n.locale),
          actions: [
            {
              label: t('tasks.edit'),
              value: 'edit-reward',
              variant: 'secondary',
            },
            {
              label: t('tasks.delete'),
              value: 'delete-reward',
              variant: 'secondary',
            },
            { label: t('data.cancel'), value: 'cancel', variant: 'quiet' },
          ],
        }).then((v) => {
          if (v === 'edit-reward') void edit(reward);
          if (v === 'delete-reward') void run(() => shop.remove(reward.id));
        }),
    });

  /** «40 🍅 · 20 🍅 to go» (POMO-82). */
  function priceMeta(price: number, toGo: number): Node {
    const frag = document.createDocumentFragment();
    frag.append(coins(price));
    const sep = ' · ';
    if (toGo > 0) frag.append(sep, coinText('tagesweg.toGo', toGo));
    return frag;
  }

  async function render() {
    const state = await deps.state();
    const level = state.settings.gamification;

    // Level and streak live in Settings (FR-610); the Shop shows balance, rewards and history.
    const children: Node[] = [];

    if (level !== 'off') {
      const balance = document.createElement('p');
      balance.dataset.role = 'coins';
      balance.className = 'shop-balance';
      balance.append(coinText('rewards.balance', state.coins));
      children.push(balance);

      const list = document.createElement('ul');
      list.className = 'ui-list';
      list.dataset.role = 'shop-list';
      for (const reward of Object.values(state.rewards)) {
        const actions = document.createElement('span');
        actions.className = 'tasks__actions';
        const redeem = button({
          label: t('rewards.redeem'),
          action: 'redeem',
          variant: 'secondary',
          disabled: state.coins < reward.price,
          onClick: () => void run(() => shop.redeem(reward.id)),
        });
        redeem.classList.add('ui-pill');
        actions.append(redeem, more(reward));
        const toGo = reward.price - state.coins;
        list.append(
          listRow({
            title: localizeReward(reward.title, i18n.locale),
            meta: priceMeta(reward.price, toGo),
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
      const add = document.createElement('details');
      add.className = 'tasks-add__details shop-add';
      add.open = addOpen || !!error;
      add.addEventListener('toggle', () => (addOpen = add.open));
      const sum = document.createElement('summary');
      sum.textContent = t('rewards.add');
      add.append(sum, form);
      children.push(add);

      if (state.redemptions.length) {
        const log = document.createElement('ul');
        log.className = 'ui-list';
        log.dataset.role = 'redemption-log';
        for (const r of [...state.redemptions].reverse().slice(0, 10))
          log.append(
            listRow({
              title: localizeReward(r.title, i18n.locale),
              meta: coins(r.price),
            }),
          );
        const hist = document.createElement('details');
        hist.className = 'tasks-add__details';
        const hs = document.createElement('summary');
        hs.textContent = t('rewards.history');
        hist.append(hs, log);
        children.push(hist);
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
