# Contact history and monthly payments

The screenshots use the synthetic ledger created by `e2e/contacts.spec.ts`. The test records two
September outlays, a partial repayment, an October repayment, and an explicit final settlement.
It checks that the contact balance link opens the same statement as the name, October payments
remain itemized with their saved allocations, and older outlays appear in closed history only after
the explicit recorded clearing. Domain tests also cover the independent 5,500-cent open balance
case and reject inferred legacy receipts as a history boundary.

The browser test checks Axe in light and dark mode at desktop, Chromium mobile, and WebKit iPhone
viewports. Screenshots show the statement with the historical section expanded:

Mobile and WebKit screenshots retain the application's fixed bottom navigation and booking
button. The full-page capture can place that viewport chrome over rows it crosses; this is the
unmodified app chrome, preserved in the evidence.

- `statement-desktop-light.png` and `statement-desktop-dark.png`
- `statement-mobile-light.png` and `statement-mobile-dark.png`
- `statement-webkit-iphone-light.png` and `statement-webkit-iphone-dark.png`

Verification on feature commit `ea34eccb`: full `npm run check` passed with Node 22.23.3,
`BUDGET_REQUIRE_AGE=1` and age 1.2.1 (433 files, 3,936 tests, no skips). Typechecks,
CSS checks, formatting and lint passed; lint retains the existing unused-disable warning
in `packages/ui/src/components/panel.tsx`. Focused domain/DB/API/UI checks passed (45 tests),
then the no-closure/current-month regression passed (3 UI tests). All three browser projects
passed after review. The root WebKit project now includes `contacts.spec.ts` for continuing CI
coverage. Final-head CI, main integration, automatic deployment and live revision remain pending.

Lead verification with the final root Playwright configuration passed all six cases (three setup
cases and desktop/mobile/WebKit contact flows) in 1.1 minutes; changed-file lint, formatting
and `git diff --check` also passed.
