# Account reminders and one-off events — #428

The same derived reminder rule feeds Heute and a separate Posteingang hint. It uses
the account's latest reconciliation day, or latest live valuation on/before today
for P2P/other assets. Never checked accounts count from their opening day; closed
accounts, accounts without live bookings and future openings are ignored. The
threshold is inclusive, defaults to 35 days and can be saved as 1–365 days in
Einstellungen › Profil. Saving and undo reuse the existing app-setting audit path.

Heute retains its recurring-payment windows (7 days in the main section, the next
7 days in the additional section). Enabled one-off planned events from today
through today + 35 days join the main list in date order. Their signed integer-cent
amounts link to the existing Plan › Jahr editor. Reading the list creates no bookings.

Minimal shared changes: extend the existing display-setting endpoint/form for the
new preference, and add a validated `pruefen=reconcile|value` account search parameter
to open the existing form dialogs. No migration or dependency was added. Inbox
reminders are hints and do not alter the persisted decision count.

All fixtures/screenshots are synthetic. The package-specific memory exception
applies: no `npm run check` and no full E2E suite. CI remains the final gate.

## Validation

Fresh focused results on 2026-10-11:

- `tsc --noEmit -p <package>/tsconfig.json`: domain, db, server and web passed.
- ESLint and Prettier on changed files passed; `git diff --check` passed.
- Vitest, one worker: 5 affected files, **48 tests passed**.
- `npm run build:e2e`: passed, run once. Existing dependency annotation, dynamic-import and chunk-size warnings remain.
- Desktop: the existing modified specs passed (20 passed including setup, 1 viewport-specific skip); the new spec passed on the focused rerun (4 passed including setup). Initial test-fixture origin/audit-group cleanup errors were corrected without changing server protections or assertions.
- Mobile, all three modified specs at 390px: **21 passed, 1 viewport-specific skip**.

Final review also allowed reminder deep links to the existing reconciliation form
for explicit receivable accounts. This last eligibility guard is covered by fresh
web typecheck/lint/format checks; browser captures exercise checking and manually
valued accounts. The one-build limit was respected, so the final guard needs CI
browser verification.

The new browser spec covers the inclusive 35-day event/account boundary, navigation
to both existing account forms and the year-plan event editor, the persisted
threshold, light/dark mode, no horizontal page overflow and 44px touch targets.

## Visual review

Synthetic captures: `desktop-light.png`, `desktop-dark.png`, `mobile-light.png`
and `mobile-dark.png`. Existing Linux baselines were not regenerated. Review:

[Desktop light](desktop-light.png), [desktop dark](desktop-dark.png),
[mobile light](mobile-light.png), [mobile dark](mobile-dark.png).

- `e2e/shell.spec.ts-snapshots/shell-heute-light-desktop-linux.png`
- `e2e/shell.spec.ts-snapshots/shell-heute-dark-desktop-linux.png`
- `e2e/shell.spec.ts-snapshots/shell-heute-light-mobile-linux.png`
- `e2e/shell.spec.ts-snapshots/shell-heute-dark-mobile-linux.png`

## Owner steps

Delivery in this sandbox is blocked before staging: Git cannot create the shared
worktree metadata `index.lock` (`Permission denied`, explicit write-deny ACL).
The index is empty; the implementation and evidence remain unstaged in the
working tree. No new commit, push or PR was created. [Prepared PR body](PR.md).
Restore normal Git metadata write access, then commit the retained changes, push
`feat/stale-account-reminder` and open the normal PR with the prepared body.

Review the reminders, event dates/amounts and dialogs on desktop and a physical
phone. Optionally change the 35-day preference under Einstellungen › Profil.
Approve any affected Linux baseline changes through the normal CI workflow.
No keys, consents, migration or provider setup is needed.
