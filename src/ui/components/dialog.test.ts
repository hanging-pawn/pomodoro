import { afterEach, describe, expect, it } from 'vitest';
import { openDialog } from './dialog';

const key = (k: string, shiftKey = false) =>
  document.dispatchEvent(
    new KeyboardEvent('keydown', { key: k, shiftKey, bubbles: true }),
  );

afterEach(() => document.body.replaceChildren());

describe('openDialog', () => {
  it('resolves with the chosen action, removes itself and returns focus', async () => {
    const opener = document.createElement('button');
    const page = document.createElement('main');
    page.append(opener);
    document.body.append(page);
    opener.focus();

    const result = openDialog({
      title: 'Abort this round?',
      actions: [
        { label: 'Keep going', value: 'keep' },
        { label: 'Abort', value: 'abort', variant: 'primary' },
      ],
    });
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(
      document.getElementById(dialog.getAttribute('aria-labelledby')!)
        ?.textContent,
    ).toBe('Abort this round?');
    expect(document.activeElement?.textContent).toBe('Keep going');
    expect(page.hasAttribute('inert')).toBe(true);

    dialog.querySelector<HTMLButtonElement>('[data-action="abort"]')!.click();
    expect(await result).toBe('abort');
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(page.hasAttribute('inert')).toBe(false);
    expect(document.activeElement).toBe(opener);
  });

  it('resolves undefined on Escape and on a backdrop click', async () => {
    const esc = openDialog({
      title: 'T',
      actions: [{ label: 'OK', value: 'ok' }],
    });
    key('Escape');
    expect(await esc).toBeUndefined();

    const backdrop = openDialog({
      title: 'T',
      actions: [{ label: 'OK', value: 'ok' }],
    });
    document.querySelector<HTMLElement>('.ui-dialog-backdrop')!.click();
    expect(await backdrop).toBeUndefined();
  });

  it('keeps Tab inside the dialog', async () => {
    const body = document.createElement('input');
    const result = openDialog({
      title: 'Park',
      body,
      actions: [{ label: 'Save', value: 'save' }],
    });
    const save = document.querySelector<HTMLButtonElement>(
      '[data-action="save"]',
    )!;
    save.focus();
    key('Tab');
    expect(document.activeElement).toBe(body);
    key('Tab', true);
    expect(document.activeElement).toBe(save);
    key('Escape');
    await result;
  });
});
