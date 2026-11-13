# ADR 0002: Append-only event log as the data model

Status: accepted (2026-11-13)

All app data is stored as an append-only log of domain events (pomodoro started/completed/aborted, task created/changed/deleted, coins earned, reward redeemed, settings changed). Current state (tasks, pomodoro counts, coin balance, redemptions, settings) is never stored; it is derived from the log by one pure projection (`deriveState`). Each event carries a globally unique `id` (UUID) and a timestamp `at`; the projection orders by `(at, id)` and drops duplicate ids.

## Why

- NFR-10 (sync without losing concurrent changes) and FR-501 (beta upload with offline catch-up) both need two copies of the data to merge. With an event log a merge is a set union by event id; no per-field conflict rules, no lost writes.
- NFR-03 (export/import) becomes "serialise the log" and "union the log in"; import after a wipe restores everything, import on top of existing data is idempotent.
- FR-302/FR-303/FR-504 reports read the history directly; a state-only model would have to keep a separate history anyway.

## Considered options

- **State tables (tasks, balance, settings) in IndexedDB, updated in place.** Simpler reads, but sync would need last-writer-wins per field and loses concurrent edits; history for reports would be a second store.
- **CRDT library (Automerge/Yjs).** Solves merging, but costs 100+ kB of bundle (NFR-07 budget 200 kB) and makes the export format opaque.

## Consequences

- Storage is one IndexedDB object store `events` keyed by `id`, behind the storage module `openStore` (`src/storage/store.ts`); nothing else touches IndexedDB.
- Events are never edited or deleted; a correction is a new event (e.g. `task.changed`, `task.deleted`). Wiping all data is the only removal.
- The log grows without bound. At realistic volumes (some thousand events per year) a full replay is cheap; snapshots can be added later behind the same interface.
- Concurrent `task.changed` events on two devices resolve by `(at, id)` order: the later change of a field wins, other fields of both changes survive.
- The GitHub token (NFR-13) is never an event and therefore never in an export.
