# Empty monthly target inventory — #271

The Plan › Monat income/target card previously treated an empty list of
unfunded categories as proof that every monthly target was funded. With no
effective targets configured, the card now says `Noch nicht eingerichtet.`
When at least one effective target exists and none is underfunded, the existing
funded message remains.

The card uses `PlanRow.target` metadata from the selected month's budget
summary. That metadata is an effective-dated target or `null`; the Plan page
passes its existing all-rows view, which includes hidden categories. An
explicit zero-amount target is therefore still configured, while an absent or
not-yet-effective target is not. Target math, income estimates and booking
writes are unchanged.

The component tests use literal integer-cent values and cover an empty row set,
a row without an effective target, an explicit zero target, a reached positive
target and an unfunded target with a €12.34 funding need. That need is separate
from the card's income-versus-target difference. The focused Vitest run passed
all 5 tests. `npm run build:e2e` passed. The targeted Playwright command
`npx playwright test e2e/plan.spec.ts -g 'empty target inventory' --project=desktop --project=mobile --workers=1`
passed all 5 selected/setup tests, including the scenario on both desktop and
mobile. The isolated-ledger case exercises a future-dated target, a hidden
category with an effective zero target and a reached positive target through the
real API. For the empty and configured-zero states it captures the card at
1440 px and 390 px in light and dark, checks horizontal overflow and runs Axe on
the card in each state/theme combination.

The full repository check also passed with `VITEST_MAX_WORKERS=1` and
`BUDGET_REQUIRE_AGE=1`: typecheck, lint/format validation, and all 373 Vitest
files (3,447 tests). Exit code: 0. The check log is kept outside the repository
at `C:\Users\fabia\AppData\Local\Temp\budget-goals-271-full-check-2026-10-08.log`.

Screenshots from the passing run:

- Empty: [desktop light](empty-monthly-targets-271/empty-desktop-1440-light.png),
  [desktop dark](empty-monthly-targets-271/empty-desktop-1440-dark.png),
  [mobile light](empty-monthly-targets-271/empty-mobile-390-light.png),
  [mobile dark](empty-monthly-targets-271/empty-mobile-390-dark.png).
- Configured zero: [desktop light](empty-monthly-targets-271/zero-desktop-1440-light.png),
  [desktop dark](empty-monthly-targets-271/zero-desktop-1440-dark.png),
  [mobile light](empty-monthly-targets-271/zero-mobile-390-light.png),
  [mobile dark](empty-monthly-targets-271/zero-mobile-390-dark.png).

The lead reviewed all eight captures without a visual finding. Required CI,
PR integration and live revision verification remain outstanding. Physical
iPhone acceptance remains the separate #310 task.
