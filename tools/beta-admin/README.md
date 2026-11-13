# beta-admin

Admin CLI for the pomo.pomo beta (FR-503): add, list and lock testers in the private data repo `hanging-pawn/pomodoro-beta-data`. It never stores a token.

## Prerequisites

- `npm install` in this repo (brings `tsx`).
- `gh auth login` with access to `hanging-pawn/pomodoro-beta-data`; git pushes use the `gh` credentials (`gh auth setup-git` once).

## Usage

```bash
npm run beta-admin -- tester add --id anna --name "Anna Muster" --email anna@example.com --lang de --token-expiry 2027-02-13
npm run beta-admin -- tester list
npm run beta-admin -- tester lock --id anna
```

Without `--dir` the tool clones the data repo with `gh repo clone` into a temporary folder, makes the change, commits and pushes. Options:

| Option | Effect |
| --- | --- |
| `--dir <path>` | Use an existing working copy instead of a fresh clone (it is pulled first if it has a remote). |
| `--repo <owner/name>` | Other data repo (default `hanging-pawn/pomodoro-beta-data`). |
| `--no-push` | Commit locally only. |

`tester add` initialises an empty data repo (README, `admin/testers.json`, `testers/`) on first use.

## What is written

- `testers/<id>/account.json`: tester ID, name, e-mail, language, status, created at; `lastLogin`, `device`, `appVersion` stay `null` until the app fills them (FR-502).
- `admin/testers.json`: one entry per tester with ID, name, e-mail, token expiry, status, created at.

`tester lock` sets the status `gesperrt` in both files and reminds you to revoke the tester's token on GitHub (Settings → Developer settings → Fine-grained tokens). Locking does not revoke the token by itself.

## Tokens

The tester's fine-grained token (only "Contents: read/write" on the data repo) is created on GitHub and handed to the tester directly. The tool only records its expiry date. Any input that looks like a GitHub token (`github_pat_…`, `ghp_…`, …) is refused, and every commit is aborted if a token-like string is found anywhere in the working copy. Check the repo yourself:

```bash
grep -r github_pat_ <working copy> --exclude-dir=.git
```

## Tests

`npx vitest run tools/beta-admin` runs against temporary local git repos, never against GitHub.
