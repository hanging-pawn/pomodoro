import { newEvent, type DomainEvent } from '../domain/events';

/**
 * Usage events for the beta (FR-505): views opened, features used, errors. Recorded in the event
 * log only while beta mode is on (a signed-in beta account), so they upload with the rest of the
 * log; outside the beta every call is a no-op.
 */
export interface UsageLog {
  viewOpened(view: string): Promise<void>;
  featureUsed(feature: string): Promise<void>;
  /** Records the error's kind (its name), never its message. */
  error(error: unknown): Promise<void>;
}

export interface UsageLogOptions {
  /** True while beta mode is on, asked at every call (e.g. `session.state === 'signed-in'`). */
  isBeta: () => boolean;
  /** Adds to the event log (e.g. `store.append`). */
  append: (event: DomainEvent) => Promise<void>;
  /** Called after an event was added (e.g. `session.changed` to queue the upload). */
  changed?: () => void;
}

export function createUsageLog(options: UsageLogOptions): UsageLog {
  async function record(event: () => DomainEvent) {
    if (!options.isBeta()) return;
    await options.append(event());
    options.changed?.();
  }
  return {
    viewOpened: (view) => record(() => newEvent('usage.view-opened', { view })),
    featureUsed: (feature) =>
      record(() => newEvent('usage.feature-used', { feature })),
    error: (error) =>
      record(() => newEvent('usage.error', { kind: errorKind(error) })),
  };
}

function errorKind(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}
