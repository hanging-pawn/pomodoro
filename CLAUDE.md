# Pomodoro (Leitstand POMO)

## Leitstand
Jira-Projekt: POMO
Profil: Software · Sprints 2 Wo · Releases
`/ap` zieht hier nur Tickets des Jira-Projekts POMO (Pomodoro).

## Sources of truth
- Requirements (released, 53 IDs FR-nnn / NFR-nn): vault `Projekte/Pomodoro/01_Anforderungen/2026-11-13_Anforderungen_Pomodoro_v0.3.md`
- Decisions E1–E7: vault `Projekte/Pomodoro/01_Anforderungen/2026-11-12_Entscheidvorlage_Anforderungen.md`
- Architecture decisions: `docs/adr/` in this repo (create on first decision)
- Vault root: `/Users/gianluca/Library/Mobile Documents/iCloud~md~obsidian/Documents/Projekte/Pomodoro`

## Stack and constraints
- Vite + TypeScript, static build deployed to GitHub Pages by GitHub Actions (public repo `hanging-pawn/pomodoro`).
- No backend. Data local-first in the browser (IndexedDB). Optional sync and beta upload only to `api.github.com`.
- Beta data repo: `hanging-pawn/pomodoro-beta-data` (private). Never commit a token, never put a token in the build (NFR-16).
- UI languages DE, EN, IT; no hard-coded UI strings (NFR-11).
- Bundle < 200 kB gzip (NFR-07); Lighthouse a11y ≥ 90 (NFR-08).

## How to build here
- Autonomous build via `/ap`. Never ask Gianluca where a sensible assumption works; record it under `ANNAHMEN:` in the ERGEBNIS.
- Matt Pocock skills are enabled for this repo (plugin `mattpocock-skills`). Use them:
  - `tdd` for every feature and bug fix: red → green → refactor, tests first.
  - `codebase-design` when shaping a module interface (deep modules, clear seams).
  - `domain-modeling` for `GLOSSARY.md` and ADRs in `docs/adr/`.
  - `diagnosing-bugs` for anything broken, flaky or slow.
  - `implement` when working a ticket with a written spec.
- Every commit references the Jira key and the requirement IDs it serves (e.g. `POMO-12: timer cycle [FR-101]`).
- Tests: `npm test` (Vitest) must be green before a ticket goes to Review; `npm run build` must succeed.
