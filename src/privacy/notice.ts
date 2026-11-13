import { APP_NAME } from '../config';
import type { I18n, MessageKey } from '../i18n/i18n';
import { button } from '../ui/components/button';
import { openDialog } from '../ui/components/dialog';

/**
 * Footer link that opens the privacy notice (NFR-14). The footer is part of every view, so the
 * notice is one click away from anywhere; reading it is the second interaction. Returns an
 * unmount function.
 */
export function mountPrivacyLink(root: HTMLElement, i18n: I18n): () => void {
  const t = (key: string) =>
    i18n.t(key as MessageKey).replaceAll('{app}', APP_NAME);

  async function open() {
    const body = document.createElement('div');
    for (const part of ['local', 'sync', 'beta']) {
      const h = document.createElement('h3');
      h.textContent = t(`privacy.${part}.title`);
      const p = document.createElement('p');
      p.textContent = t(`privacy.${part}.body`);
      body.append(h, p);
    }
    await openDialog({
      title: t('privacy.title'),
      body,
      actions: [{ label: t('privacy.close'), value: 'close' }],
    });
  }

  const render = () =>
    root.replaceChildren(
      button({
        label: t('privacy.link'),
        variant: 'quiet',
        action: 'privacy',
        onClick: () => void open(),
      }),
    );
  render();
  return i18n.onChange(render);
}
