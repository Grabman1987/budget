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
