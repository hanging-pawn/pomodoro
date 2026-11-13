import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { deriveState } from '../domain/state';
import { openStore, type Store } from '../storage/store';
import { createUsageLog } from './usage';

let store: Store;
let beta: boolean;
let changes: number;
let n = 0;

const usage = () =>
  createUsageLog({
    isBeta: () => beta,
    append: (e) => store.append(e),
    changed: () => changes++,
  });

beforeEach(async () => {
  store = await openStore({ name: `usage-test-${++n}` });
  beta = true;
  changes = 0;
});

afterEach(() => store.close());

describe('usage events (FR-505)', () => {
  it('beta on: opening the week view records a usage event in the log', async () => {
    await usage().viewOpened('week');
    const [e] = await store.events();
    expect(e).toMatchObject({
      type: 'usage.view-opened',
      payload: { view: 'week' },
    });
    expect(changes).toBe(1);
  });

  it('beta off: no usage event', async () => {
    beta = false;
    const log = usage();
    await log.viewOpened('week');
    await log.featureUsed('export-csv');
    await log.error(new TypeError('boom'));
    expect(await store.events()).toEqual([]);
    expect(changes).toBe(0);
  });

  it('records a used feature and an error by its kind only, never its message', async () => {
    const log = usage();
    await log.featureUsed('export-csv');
    await log.error(new TypeError('secret task title'));
    const events = await store.events();
    // Same millisecond: log order between the two is by random id, so compare as a set.
    expect(events).toHaveLength(2);
    expect(events.map((e) => [e.type, e.payload])).toEqual(
      expect.arrayContaining([
        ['usage.feature-used', { feature: 'export-csv' }],
        ['usage.error', { kind: 'TypeError' }],
      ]),
    );
    expect(JSON.stringify(events)).not.toContain('secret');
  });

  it('follows the beta state at the moment of use (sign-in, sign-out)', async () => {
    const log = usage();
    beta = false;
    await log.viewOpened('day');
    beta = true;
    await log.viewOpened('week');
    beta = false;
    await log.viewOpened('shop');
    expect((await store.events()).map((e) => e.payload)).toEqual([
      { view: 'week' },
    ]);
  });

  it('usage events survive export/import and leave the derived state untouched', async () => {
    await usage().viewOpened('week');
    const json = await store.exportJson();
    await store.wipe();
    await store.importJson(json);
    const events = await store.events();
    expect(events).toHaveLength(1);
    expect(deriveState(events)).toEqual(deriveState([]));
  });
});
