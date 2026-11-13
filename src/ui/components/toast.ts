export interface ToastOptions {
  /** Optional action, e.g. «Undo»; the toast closes after it runs. */
  action?: { label: string; run: () => void };
}

export interface Toaster {
  /** Queues a short message; one toast is visible at a time, each for `durationMs`. */
  show(message: string, options?: ToastOptions): void;
  /** Removes the visible toast and the queue (e.g. on view change). */
  clear(): void;
}

/**
 * Mounts a polite live region into `root` and shows short, calm status messages there
 * (no confetti, FR-601). Screen readers announce each message once.
 */
export function createToaster(root: HTMLElement, durationMs = 4000): Toaster {
  const region = document.createElement('div');
  region.className = 'ui-toast-region';
  region.setAttribute('role', 'status');
  region.setAttribute('aria-live', 'polite');
  root.append(region);

  const queue: { message: string; options?: ToastOptions }[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;

  const hide = () => {
    clearTimeout(timer);
    timer = undefined;
    region.replaceChildren();
    next();
  };
  function next() {
    const item = queue.shift();
    if (!item) return;
    const toast = document.createElement('div');
    toast.className = 'ui-toast';
    const text = document.createElement('span');
    text.textContent = item.message;
    toast.append(text);
    const action = item.options?.action;
    if (action) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ui-toast__action';
      b.textContent = action.label;
      b.addEventListener('click', () => {
        action.run();
        hide();
      });
      toast.append(b);
    }
    region.replaceChildren(toast);
    timer = setTimeout(hide, durationMs);
  }

  return {
    show(message, options) {
      queue.push({ message, options });
      if (timer === undefined) next();
    },
    clear() {
      queue.length = 0;
      clearTimeout(timer);
      timer = undefined;
      region.replaceChildren();
    },
  };
}
