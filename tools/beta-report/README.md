# beta-report

Evaluation report for the pomo.pomo beta (FR-504): reads every tester folder of the private data repo and writes a Markdown and a CSV report with usage days, pomodoros, abort rate per mode, plan fulfilment, redemptions and features used, per tester and in total.

```bash
npm run beta-report                      # shallow clone of hanging-pawn/pomodoro-beta-data via gh, writes to the vault
npm run beta-report -- --dir <working copy> --out <folder> --date 2026-12-01
```

Output defaults to the vault folder `Projekte/Pomodoro/06_Auswertung/` (created if missing), files `<date>_Auswertung_Beta.md` and `.csv`. The tool only reads the data repo and never pushes. Metric definitions are at the top of each Markdown report. `npx vitest run tools/beta-report` runs the tests (fixture with three testers).
