# Receipt browser evidence (Y21)

Synthetic fixtures only. Captured on Windows with Playwright 1.56.1 / Chromium,
1440 x 900 desktop and 390 x 844 mobile, in light and dark themes.

- [Desktop light](receipts-desktop-light.png) / [dark](receipts-desktop-dark.png)
- [Mobile light](receipts-mobile-light.png) / [dark](receipts-mobile-dark.png)

The 41-test receipt, inbox, capture and undo-feedback run passed with one worker.
Receipt coverage captures a PNG into the inbox, explicitly links it to a booking,
checks the rendered preview and native capture attribute, attaches/downloads a
PDF, unlinks and undoes/redoes the link, and attaches an existing inbox receipt.
Both themes pass axe serious/critical checks and have no horizontal overflow.
The receipt section sits inside the booking form's scroll area; its footer stays
usable when files are attached. Screenshots were inspected at both widths.

Standard reproduction after installing Chromium:

```
npm run test:e2e -- e2e/receipts.spec.ts e2e/inbox.spec.ts e2e/capture.spec.ts e2e/undo-feedback.spec.ts --workers=1
```

Local harness limitation: `tsx` failed at `os.userInfo()` with
`ERR_SYSTEM_ERROR` / `uv_os_get_passwd ENOMEM` under the Windows sandbox on both
Node 22 and 24. The local run used an ignored configuration wrapper replacing
only the sample server's `tsx` seed command with an esbuild compilation of the
same `scripts/db-seed.ts`, with the original migrations directory and repository
working directory. Application code and test assertions were unchanged.

The complete 511-test browser suite was attempted and stopped after existing
sitemap/theme accessibility tests exceeded their time limits in this environment.
A first parallel scoped run also lost an existing inbox redo toast during axe
checks; the final sequential 41-test run passed. Linux CI and the full browser
suite remain review gates. Existing Linux pixel baselines were not changed;
`e2e/visual.ts` skips those comparisons on Windows by design. These screenshots
are visual review evidence, not a claimed Linux baseline comparison.

The focused 17-test file/API/backup run also passed with age required, including
synthetic encrypted archive download/decryption, DB integrity/table counts,
retained receipt bytes/hash verification and rejection with a different key.
No real-phone capture or owner backup restore is claimed. See
[receipt acceptance steps](../../receipts.md#backup-and-owner-acceptance).

Production `npm run build` passed. Two existing CSV export filesystem-cleanup
tests were given explicit 30-second timeouts after their unchanged assertions
passed with that timeout under local I/O contention.

Full `npm run check` passed on Node 24.12.0 with `VITEST_MAX_WORKERS=2` and
`BUDGET_REQUIRE_AGE=1`: 215 files, 2035 tests, no skips. `npm ci` completed
before verification. The older downloaded Node 22.14.0 failed the existing
TypeScript import-worker startup with `ERR_UNKNOWN_FILE_EXTENSION`; those four
worker tests passed under Node 24 without application changes.

The resumed delivery can use the normal worktree index. No owner Git-index reset
is needed.

## Resumed delivery (2026-10-03)

The complete local suite was not rerun, as requested by the owner; full-suite CI
and independent review remain open. Node 24.12.0 was used for the scoped checks.
Before merging, the DB package and affected server tests ran 407 cases: 404
passed immediately; the three unchanged timestamp/duplicate-order tests passed
in a separate single-worker run of their 62 cases. SQLite and JavaScript clocks
occasionally differ by 1 ms here. All five affected CSV export tests also passed.

Merged `origin/main` at `c22d341`. Its last migration was `0016`; the banking and
payslip PRs were still unmerged. Drizzle Kit regenerated `0017_receipts` and its
snapshot/journal from that predecessor. SQL and schema are unchanged, the main
journal prefix is preserved, and a second generation reports no schema changes.
The new upgrade test retains legacy receipt/split links and booking rows, checks
restart idempotence, and exercises a new booking-level link after upgrading.

After the merge, all 129 focused migration/DB/file/API/backup/app tests passed
(11 files, age required), as did typecheck, lint and the production build. The
isolated receipt browser rerun passed all five cases, including setup, on desktop
and mobile. The first post-merge browser run exceeded the unchanged 30-second
limit during page load and axe while checks in several worktrees competed for
memory. The pre-merge receipt run also passed all five cases.
The four linked screenshots were refreshed from the successful final run.

Browser checks use the standard configuration and production build with
`E2E_PORT=4510` because the default port was already occupied. The standard `tsx`
sample seed worked in this resumed Node 24 run; no wrapper was required. No
assertions, pixel baselines or timeouts were changed during the resume.

Re-merged `origin/main` at `17e655b` (banking migrations `0017`/`0018`). Drizzle Kit
regenerated the receipts migration as `0019_receipts` chained to main's `0018`
snapshot; the SQL is byte-identical to the earlier `0017_receipts`. It will be
renumbered once more after the payslip PR #139 lands.
