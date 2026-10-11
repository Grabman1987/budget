Refs #425

A new booking now exposes its note and split action immediately. The note starts on one line and grows/shrinks with input; split editing remains in the main form. The account register shows a truncated desktop Notiz column with the full hover text and keeps the note under the payee on phones. The overview sparkline describes its actual 90-day range.

Replace the status segments beside the date with an 18 px checkmark (1.75 stroke): outlined pending, filled forest green confirmed. Its German accessible name/tooltip and aria-pressed follow the state; new bookings, including cash, start pending. Existing stored/prefilled/queued states and Heute/Gestern remain intact. No ledger calculations or schema changes.

Validation
- Web typecheck passed (tsc -p apps/web/tsconfig.json); ESLint and Prettier passed on all changed source/test files and documentation.
- Affected Vitest files: 48 tests passed across capture form/model, booking model and note/sparkline rendering; final DOM rerun: 2 files / 6 tests passed. The capture fork initially timed out during worker startup under concurrent machine load; its four tests passed with one thread worker.
- One build:e2e completed successfully; existing dependency annotation, mixed import and bundle-size warnings remain.
- First scoped capture run: 10 passed / 1 failed (including three setup cases). Note growth/shrink, persistence, desktop truncation/full title, mobile payee note, direct split, date chips, status persistence, 390 px overflow and 44 px controls passed on desktop/mobile. Desktop accessibility timed out at the discard click; mobile light/dark accessibility passed.
- A repeat also encountered accessibility timeouts and a five-second desktop register-refresh timeout; the failure snapshot already contained the correctly saved booking. The test now waits for dialog completion and refreshed rows. The accessibility case now honors a larger CLI timeout instead of overwriting it with its internal 90-second limit. These final timing adjustments and the compatibility edits in booking-acceptance/booking-ux/ledger await CI browser verification; local E2E is not fully green.
- Windows test startup required an ignored, local os.userInfo fallback for the sandbox's uv_os_get_passwd ENOMEM error. No application code or repository configuration was patched for the environment; only the task's synthetic local servers were stopped during cleanup.
- Full local check and full E2E suite deliberately skipped under this package's memory-limit override; CI is the final gate.

Visual review
- Synthetic desktop 1440/mobile 390 dialog captures and the mobile register capture are stored alongside this file. The desktop register review image remains open; the first capture was above the table, and the repeat hit the refresh timeout before its replacement.
- No visual baselines regenerated locally. Affected existing pixel baselines: none; capture/register specs use review images, and the baseline inventory contains no capture/account-register snapshots.

Publication blocker
- Git staging and commit cannot create the shared worktree index.lock: Permission denied. No new commit, push or PR was created. The index remains unchanged and all changes are retained in the worktree. No permission/transport workaround was attempted.
- Commit and publish from a shell with write access to this worktree's Git metadata, using this PR body and the requested title; required CI and owner review remain open.

Owner steps
- Review the dialog checkmark and register on desktop and phone after CI; accept the UI when satisfied.
- No keys, consents or migration required. Do not merge before required CI passes.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
