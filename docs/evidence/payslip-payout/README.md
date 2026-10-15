# Payslip payout and upload continuation — 2026-10-15

All accounts, PDFs, passwords and amounts in this evidence are synthetic. The
cloud continuation preserves the inherited `fix/payslip-upload-review` work and
integrates main `514ed362ea7cbb422c60667003a5296e76904084` without resetting it.

## Verified behavior

- The actual inner upload button emits the browser filechooser event before any
  PDF bytes are supplied. Existing-match confirmation, undo, rejection and
  duplicate upload still work.
- A dropped PDF reaches the same bounded analysis without opening the chooser.
- Review initially selects the configured salary account and permits another
  active EUR account. The new payout is created only at confirmation. The literal
  example saves 297500 cents as 287500 salary plus 10000 reimbursement; undo removes
  payout and payslip together and restores the inbox task.
- Cash payouts are confirmed immediately. Special income and signed one-cent
  rounding cases preserve the literal payout, separate reimbursement and undo.
- Unknown, closed, foreign-currency and not-yet-open accounts, warnings and a
  missing inbox row leave no partial payout or payslip. Existing matching payouts
  remain unchanged; an exact match in the selected account blocks a duplicate.

## Fresh cloud checks

Node 22.23.3, lockfile `npm ci`, E2E build: passed. Focused DB/API/intake/UI suite:
32 tests passed, followed by 11 payout tests including three new cash/special/
rounding cases. The complete check result is recorded below when complete.

Playwright 1.56.1:

- Chromium desktop 1440 and phone 390: **6 passed**, 49.0 seconds.
- WebKit iPhone 13: **3 passed**, 1.2 minutes.
- Each scenario checks light/dark Axe (no serious/critical findings) and no page
  overflow. The 24 screenshots here are fresh review evidence, not replacement
  baselines. Full-page phone captures show the fixed navigation at its viewport
  position; content below it remains scrollable and the confirmation is exercised.
- Independent read-only review found no blocking API, transaction, undo or UI
  defect. Lead reviewed the diff and representative desktop/mobile images.

Commands:

```sh
npm ci --no-audit --no-fund
npm run build:e2e
npx vitest run packages/db/src/repos/payslip-payout.test.ts apps/server/src/api/payslip-intake.test.ts apps/server/src/payslips/intake.test.ts apps/web/src/reports/payslip-intake.test.tsx --maxWorkers=2
E2E_PORT=5070 E2E_LEDGER_PORT_OFFSET=100 BUDGET_SPENDING_EVIDENCE=docs/evidence/payslip-payout npx playwright test --config e2e/payslip-intake.config.ts
npm run check
```

The cloud image had no root installation access. Chromium started with its existing
libraries. For WebKit, missing Debian 13 libraries were downloaded from the Debian
repository and extracted into `/workspace/work/browser-libs`, then linked into a
workspace copy of the matching Playwright WebKit bundle. Its launcher overwrites
`LD_LIBRARY_PATH`, so supplying that variable alone is insufficient. A real WebKit
launch/DOM smoke passed before the browser cases. The local-only
`PLAYWRIGHT_BROWSERS_PATH=/workspace/work/browser-runtime` and
`PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1` bypass the system ldconfig-cache
preflight, not browser execution or assertions. CI retains its unchanged full
`playwright install --with-deps chromium webkit` installation and required tests.

## Delivery boundary

The owner's Chrome hang occurs before native file selection. It was not reproduced
in the previous isolated Windows Chrome test or these Linux Chromium/WebKit flows.
This package verifies the drop alternative and payout behavior; **it does not claim
a fix for the owner's native chooser hang**. A native Windows/profile retest remains
open. No private PDF, financial data, production mutation or new secret was needed.

Required final-head PR checks, main CI, automatic deployment and the actual health
revision must still be verified before calling this package live. #499 stays open.
