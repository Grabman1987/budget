# Mobile shell and sheets — #995

All screenshots use the repository's synthetic sample ledger. No private data or
production services were used. Browser emulation is not physical-device acceptance.

## Evidence

- iPhone WebKit: 390 × 844 CSS pixels, simulated 47px top and 34px bottom safe areas.
  [Light register](iphone-register-light.png), [dark register](iphone-register-dark.png),
  [light sheet](iphone-sheet-light.png), [dark sheet](iphone-sheet-dark.png),
  [light list end](iphone-register-end-light.png), [dark list end](iphone-register-end-dark.png).
- Desktop Chromium: 1440 × 900 CSS pixels.
  [Light register](desktop-register-light.png), [dark register](desktop-register-dark.png),
  [light dialog](desktop-dialog-light.png), [dark dialog](desktop-dialog-dark.png).

The phone dock reserves 49px plus the bottom safe area. Its 24px icons and 11px
labels retain at least 44px touch targets. The shell reserves the FAB slot below
page content. Native dialogs retain their focus handling and discard guard; only
the phone handle accepts downward dismissal. Date headings reuse the existing
date formatter and input order, without changing ledger amounts or writers.

## Regression coverage

- `issue-995-mobile-sheets.spec.ts`: finite date-filtered history, safe-area and
  touch geometry, list-end clearance, light/dark screenshots, desktop dialogs,
  downward versus sideways gestures, unsaved-input preservation, focus return,
  and no API writes.
- `panel.test.tsx`: short, horizontal, upward, cancelled and accepted gestures;
  guard refusal, one guard invocation per gesture, keyboard activation, rollback.
- `booking-table-581.test.tsx`: both register variants retain row order, supplied
  dates, cent-formatted amounts and the existing booking opener.
- `css-scale.test.ts`: the 11px exception applies only to the redesign dock;
  generic tabs and registers remain rejected.
- Existing `mobile-panels`, `booking-acceptance`, `capture-dialog-layout` and
  `issue-586-mobile-capture` assertions now distinguish the ON sheet inset from
  OFF full-screen geometry. Financial, discard and touch-target assertions remain.
- Existing `mobile-shell` and `tap-targets` assertions follow the requested dock
  height and label size; their touch-target and content-clearance checks remain.

The initial end-of-list test used the shell month parameter rather than the
register's date filters. Scrolling correctly triggered `LoadOlder` and appended
another page. The corrected fixture uses explicit `von`/`bis` dates and asserts
that no load-more sentinel remains before measuring the final row. Product
pagination and scrolling were not changed.

Independent review approved the final implementation and scoped test adaptations.

## Local validation

- Redesign ON: `npm run build:e2e`.
- Rollback OFF: `npm run build -w @budget/web` with `VITE_BUDGET_REDESIGN=0`.
- `npm run typecheck`, changed-file ESLint and Prettier checks, CSS scale check.
- Focused Vitest: panel gestures, both booking-table variants and mobile shell.
- Focused Playwright: `e2e/issue-995-mobile-sheets.spec.ts`, desktop and
  `webkit-iphone`, `--workers=1`: 8 passed including setup, with the phone-only
  gesture test intentionally inapplicable to desktop.
- `VITEST_MAX_WORKERS=1` is set for local test runs and the enabled pre-push hook.

Integration retains the issue's ordering after #984. Existing affected screenshot
baselines remain subject to the repository's targeted CI snapshot workflow before
merge; these images are review evidence, not replacement baselines.
