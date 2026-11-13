# Pomodoro (Leitstand POMO)

## Leitstand
Jira-Projekt: POMO
Profil: Software · Sprints 2 Wo · Releases
`/ap` zieht hier nur Tickets des Jira-Projekts POMO (Pomodoro).

## Product name
- User-facing name: **pomo.pomo** (lower case, with dot), same in DE/EN/IT — page title, manifest `name`, intro, privacy notice. Use it from i18n/config, not hard-coded per view. Replaces «Pomo d·oro» (trademark risk, POMO-40).
- Technical name stays `pomodoro` (repo, package, Pages URL); slug where a dot is not allowed: `pomo-pomo`.
- No tomato imagery in app icon, name, illustrations or marketing (trademark owner claims it, report POMO-33). Single exception by Gianluca (13.11.2026, POMO-82): the red tomato as in-app coin symbol, only in `src/ui/components/coin.ts`. Never use «Pomodoro» or «Pomodoro Technique» in UI texts; describe the method as focus rounds.
- Name is pending its own trademark and availability check; keep it in one place so a rename is a one-line change.

## Sources of truth
- Requirements (62 IDs FR-nnn / NFR-nn; FR-601–609 UI «Tagesweg», all released): vault `Projekte/Pomodoro/01_Anforderungen/2026-11-13_Anforderungen_Pomodoro_v0.4.md`
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
- **Pocock trial:** POMO is a test project for these skills (Gianluca, 2026-11-13). Invoke them via the Skill tool (`mattpocock-skills:<name>`). Every ERGEBNIS carries one line `POCOCK: <skills used> — <benefit or friction in one sentence>`; not used → say why. POMO-38 evaluates these lines.
- Every commit references the Jira key and the requirement IDs it serves (e.g. `POMO-12: timer cycle [FR-101]`).
- Tests: `npm test` (Vitest) must be green before a ticket goes to Review; `npm run build` must succeed.
