# ADR 0001: Stack

Status: accepted (2026-11-13)

## Decision

Vite + TypeScript (strict), vanilla TS for the UI (no framework), Vitest with jsdom, ESLint + Prettier, GitHub Actions deploying `dist/` to GitHub Pages.

## Reasons

- NFR-07: bundle < 200 kB gzip. Vanilla TS adds 0 kB of runtime; Preact (~4 kB) or Lit (~6 kB) stay within the 10 kB budget and remain an option if component complexity grows.
- NFR-01: purely static output, no backend.
- Fewer dependencies, simpler long-term maintenance for a small app.

## Consequences

- Views are plain functions mounting into a root element (`mountApp`), tested through the DOM.
- If state-driven rendering becomes painful, revisit with Preact (ADR to supersede this one).
