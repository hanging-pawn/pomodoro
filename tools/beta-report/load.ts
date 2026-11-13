import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { DomainEvent } from '../../src/domain/events';
import type { TesterData } from './aggregate';

/** Reads `testers/<id>/events/*.jsonl` of every tester folder in a working copy of the beta data repo. */
export function loadTesters(dir: string): TesterData[] {
  const root = join(dir, 'testers');
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter((id) => statSync(join(root, id)).isDirectory())
    .sort()
    .map((testerId) => {
      const eventsDir = join(root, testerId, 'events');
      const files = existsSync(eventsDir)
        ? readdirSync(eventsDir)
            .filter((f) => f.endsWith('.jsonl'))
            .sort()
        : [];
      const events = files.flatMap((file) =>
        readFileSync(join(eventsDir, file), 'utf8')
          .split('\n')
          .flatMap((text, i) => {
            if (!text.trim()) return [];
            try {
              return [JSON.parse(text) as DomainEvent];
            } catch {
              throw new Error(
                `${testerId}/events/${file}: invalid JSON on line ${i + 1}`,
              );
            }
          }),
      );
      return { testerId, events };
    });
}
