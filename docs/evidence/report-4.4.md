# Report 4.4 evidence

## Scope

This first body for `prendite` connects the existing `/api/portfolio` summary in its
securities-only view. It shows selected-period performance and documented lifetime
realized gains separately. A typed valuation gap suppresses the whole summary,
including the realized total. No financial formula or benchmark is added.

The browser spec combines synthetic edge responses with a read-only run against the
seeded sample database. The sample run checks the real API response against the
period, ending value and realized gain shown in the page, then changes period and
checks the second API request. It does not change sample data.

## Verification

Source base: `37f87c9` (`/workspace/budget-agent-missing-quotes`). Branch:
`feat/portfolio-performance-report`.

- `npm run typecheck -w @budget/web` — passed.
- `npm run typecheck -w @budget/server` — passed.
- `npx vitest run apps/server/src/api/invest.test.ts` — 13 tests passed, including a full-sale realized gain and a missing-price valuation error.
- `npm run build:e2e` — passed.
- `E2E_PORT=4730 BUDGET_PORTFOLIO_REPORT_EVIDENCE=/workspace/.budget-tools/portfolio-report-evidence npx playwright test e2e/portfolio-performance-report.spec.ts --project=desktop --project=mobile` — 11 tests passed (8 report cases across desktop/mobile and 3 setup cases). Axe serious/critical checks and horizontal-overflow checks passed; the sample-ledger body rendered live portfolio values and accepted a period switch.
- `git diff --check` — passed.

Build and browser logs are in `/workspace/.budget-tools/portfolio-report-build.log`
and `/workspace/.budget-tools/portfolio-report-browser.log`.

The four final captures use the real sample-ledger API response after switching to
`1J`:

- `/workspace/.budget-tools/portfolio-report-evidence/portfolio-performance-light-desktop.png`
- `/workspace/.budget-tools/portfolio-report-evidence/portfolio-performance-dark-desktop.png`
- `/workspace/.budget-tools/portfolio-report-evidence/portfolio-performance-light-mobile.png`
- `/workspace/.budget-tools/portfolio-report-evidence/portfolio-performance-dark-mobile.png`

The report has no comparison benchmark, class comparison or monthly heatmap yet;
the securities-only label excludes depot cash. Those are follow-up scope, not
represented by this evidence.
