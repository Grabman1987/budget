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
