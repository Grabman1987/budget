# Upcoming account register — #453

Synthetic delivery evidence for `feat/register-upcoming` (base `60e21bcc`).

## Behavior

- Account and All Bookings registers separate all future captures from history ending on the Vienna day. The date is checked on focus and every 30 seconds, so open registers roll over at midnight.
- `Kommend · N` remembers expansion per register/account and device size; phones start collapsed. Entries sort by date, with relative hints, calendar/repeat status icons, regular muted type and muted signed amounts.
- Each schedule contributes its next unbooked occurrence. Read-only matching reuses the account preview's existing candidate/account/identity/date/amount rules, including pending captures; reads do not run the matching worker or create bookings.
- Today’s cash balance separates the lists. Future running balances include the next schedule occurrence and all future captures in each native account currency; historical running balances retain the existing chronological calculation. All Bookings includes account names and upcoming projected balances.
- Future captures keep their existing editor and inline cells. `Jetzt buchen` captures on today, atomically linking the existing occurrence in the same audit group. The API also accepts its due date. Duplicate/closed/skipped captures and guessed FX are refused. `Überspringen` uses the existing skip path; both actions offer undo/redo.

## Verification

- Typechecks: `@budget/web`, `@budget/server`, `@budget/db`, `@budget/domain` — exit 0.
- Changed-file ESLint and Prettier; CSS scale; `git diff --check` — exit 0.
- Focused Vitest: 6 files, 38 tests passed (projection, account preview, register mutation/rollback/undo/redo, expected payments/skip, inline cells).
- `npm run build:e2e` was run once. Scoped web/server rebuilds refreshed bundles after test-driven corrections; no full local check or full E2E suite was run under the owner's parallel-job memory exception.
- `E2E_PORT=5060 E2E_START_TIMEOUT=300000 npx playwright test e2e/register-upcoming.spec.ts --workers=1 --project=desktop` and `--project=mobile`: each passed 5 tests (two scenarios per viewport plus three setup tests).
- The browser scenarios use `BUDGET_TODAY=2026-10-13`, a weekly repetition created through the real booking dialog, a capture 14 days ahead, literal cent balances, inline date movement/undo, skip/book/undo, detail navigation, persisted collapse, full light/dark Axe, 44px actions and no page overflow at 390px. A second scenario loads 201 far-future captures beyond the first cursor page and chart preview.
- Visual inspection caught and corrected an implicit mobile All Bookings grid column. A browser assertion now protects the payee's usable width.

## Screenshots and remaining gates

The eight `desktop-*.png` / `mobile-*.png` files show synthetic account and All Bookings views in both themes at 1440px and 390px. These are evidence, not regenerated snapshot baselines. No existing account-register snapshot baseline was found; existing shell and expected-payment baselines are unchanged.

Required CI and physical desktop/phone owner acceptance remain open. No migration, credentials, provider setup or new dependency is required. The existing occurrence materialization window is retained. Cross-currency schedules without a native conversion show `Saldo offen`; direct capture requires the existing booking dialog with the actual FX amount.

## Delivery blocker

Implementation and scoped checks are complete locally, but `git add` cannot create `C:/Users/fabia/budget/.git/worktrees/budget-k1/index.lock` (`Permission denied`). The normal commit attempt consequently found nothing staged. `git push -u origin HEAD` was attempted and failed with `schannel: AcquireCredentialsHandle failed: SEC_E_NO_CREDENTIALS`.

No new commit or PR was created. The index is empty; implementation, tests, screenshots and the ready English [PR body](PR.md) remain unstaged in this worktree. The owner's clean-status/last-commit delivery requirement cannot be met while staging is denied; requested changes were retained. No permission or transport workaround was used. Restore Git metadata write access and GitHub authentication, then stage/commit this package, push the branch and open the normal PR titled `Konten: kommende Buchungen und nächste Wiederholung (K1)`. Required CI and owner acceptance still follow.

## Polish pass (CI follow-up)

`Kommend` is now part of the register's own table: one header, shared column widths and alignment with the history below (a `<tbody>` with a disclosure row, then the `Heute · Saldo` row, then the history). The toggle uses the Plan groups' `ChevronDown` (16 px, rotated −90° when closed) instead of the native marker. `Jetzt buchen` / `Überspringen` are small ghost buttons on the right of the payee cell, on one line (44 px on phones). The eight screenshots were refreshed from the browser scenario. A browser assertion compares the column boxes of upcoming, scheduled and history rows. The empty-state texts keep their original wording unless upcoming rows exist.
