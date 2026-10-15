# Payslip review flow evidence

All images in this directory are generated from synthetic fixtures by the focused Playwright flow in `e2e/payslip-intake.spec.ts`. They contain no real payroll, account, employer, or payment data.

The `payslip-intake-*`, `payslip-payout-chooser-*`, `payslip-payout-drop-*`, and `payslip-source-*` images are full-page captures. `payslip-review-viewport-*` shows the opened review at the top of the actual desktop/mobile/WebKit viewport. `payslip-review-actions-*` shows the same review scrolled to its action row. The desktop action row is one line; phone captures show the two-row wrap with all four controls reachable.

Verification on the current UI/API tree:

- `npx vitest run apps/web/src/reports/payslip-intake.test.tsx`: 6 tests passed.
- `npm run build:e2e`: web and server builds passed.
- `npx playwright test e2e/payslip-intake.spec.ts --project=desktop --project=mobile --project=webkit-iphone --workers=1`: 12 tests passed, including setup. The tests run Axe in light and dark themes and reject serious/critical findings; they also check horizontal overflow.
- A final screenshot-only browser pass for the direct upload/review case passed on desktop, mobile, and iPhone WebKit (6 tests including setup), producing the viewport and action-row captures.
- Impeccable `detect --json` reported no findings for the changed UI files. This is a static detector result, not a browser or accessibility test.

Playwright used the existing browser cache at `/workspace/work/browser-runtime` with host-requirement validation skipped for the available WebKit runtime. No full repository check is claimed here; the lead owns the integrated full check.


## Lead integration and review

The source was integrated with main `8b9dbe556dc58af208be3ef4b21a9e165a36b6be` (search/sidebar and Playwright 1.64.1). A final Node 22.23.3 `npm run check` with `BUDGET_REQUIRE_AGE=1` passed all typechecks/lint and 434 files / 3,955 tests, zero skips (`payslip-flow-search-final-check.log`). The initial run found two forbidden inline import type annotations in the screenshot helper; they were replaced with ordinary type imports, without changing assertions.

The final integrated WebKit 2.55.0 / revision 2370 root-config run passed 6/6 tests including setup (`payslip-flow-new-webkit-final.log`). The original full three-project matrix above used Playwright 1.56.1 and its existing browser cache; the new official Chromium runtime is verified by required GitHub CI, because its local download was blocked. No Chromium 1.64.1 local pass is claimed.

The lead reviewed the actual wide desktop action-row and iPhone review captures. Backend review added a config-and-parsed-result concurrency guard and excluded internal correction payees from both selection and new payout writes. The focused API/DB payee regression run passed 24/24. The explicit date-clear and expectation-clear UI regressions remain in the full suite. An expected salary date on the 15th is checked literally, its sender is retained, its occurrence is linked, and undo reopens the expectation and removes the new live payout. Matching an existing booking leaves its date and sender unchanged.

Original Windows Chrome blocking before the native chooser remains unreproduced; successful Linux chooser/drop tests do not prove that issue fixed. No private historical payroll PDF or production record was used or modified. Final-head required CI, main CI, automatic deployment and exact live revision remain delivery gates.
