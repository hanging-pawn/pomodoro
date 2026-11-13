/**
 * Calls `fn` about once per second. Background tabs throttle page timers to once per minute
 * after a few minutes, which would delay the end-of-phase notification; a dedicated worker's
 * timer is not throttled that way (FR-104: notification ≤ 3 s after the end). Falls back to
 * `setInterval` where workers or blob URLs are unavailable.
 */
export function startTicker(fn: () => void, ms = 1000): () => void {
  try {
    const url = URL.createObjectURL(
      new Blob([`setInterval(() => postMessage(0), ${ms});`], {
        type: 'text/javascript',
      }),
    );
    const worker = new Worker(url);
    worker.onmessage = () => fn();
    return () => {
      worker.terminate();
      URL.revokeObjectURL(url);
    };
  } catch {
    const id = setInterval(fn, ms);
    return () => clearInterval(id);
  }
}
