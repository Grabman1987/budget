# Income targets and shared report ranges

Branch: `feat/income-targets-and-report-ranges`. Working-tree delivery only; no commits or PR created by this task.

## Behavior

- Plan month: read-only expected-payment schedules and dated amount versions; conservative lower income range bound. Excludes capital income, refunds, advance repayments and non-budget accounts. Missing EUR schedule amounts remain unavailable. With no due schedule, use the median of three complete earned-income months; future planning uses the latest three complete months. The existing payday rule specifies a date, not an amount, so it cannot supply a salary estimate.
- Compare existing monthly target requirements before funding, display surplus/gap and remaining target needs, and open affected categories. Stored monthly holds move income into the following month. Estimates never increase money available for assignment.
- Shared selectors cover categories, savings, spending, recipients, cashflow, wealth history, contributions, depots, returns and Explorer. Current/previous month, 3/6/12 complete months, current/previous year, all and custom inclusive month ranges. Preserve legacy short-period semantics, URL keys and Explorer saved views.
- Opt-in dotted linear fits for actual time-series charts; off by default, retained with `trend=true`. Fits are descriptive and never forecast or book money. Categorical/metric-only reports have no trend control.
- No migration. Only synthetic test data and local test APIs.

## Verification

Completed browser verification: 32 distinct selected scenarios across desktop/mobile, with the formerly failing cases repeated successfully. After the final header CSS correction, Plan, shared selectors/custom reload/trend, recipients and contributions passed in both viewports; the last desktop selector retry passed in isolation. Axe covers main content in light/dark; header cell bounds and horizontal containment are checked. Initial concurrent runs hit Windows load timeouts; final runs use bounded workers.

Commands: `npm ci`; focused four-file Vitest suite (17 tests); `npm run build:e2e`; selected Playwright report/Plan tests (one worker, 90-second execution limit). Full `npm run check -- -- --maxWorkers=2 --testTimeout=15000` passed: all workspace typechecks, repository ESLint/Prettier and all 2,220 tests in 231 files (520 seconds for Vitest on the loaded Windows host). The earlier unbounded parallel unit attempt was stopped after resource/time-limit failures; the complete bounded rerun passed. Production `npm run build` passed; existing bundler size/static-dynamic-import and dependency annotation warnings remain. New literal cases cover holds, source precedence, dated schedule edits and undo, unavailable currency/history, integer cents, year/leap boundaries, preserved legacy windows, current-day cutoffs, historical closing balances, invalid/future API ranges and trend geometry.

Browser evidence uses the existing sample fixed-clock helper (2026-09-17), desktop 1440 and mobile 390, both themes, keyboard category navigation, URL reload and Axe checks across the main content. The pre-existing mobile shell floating booking action is outside the main landmark and is outside this task's Axe scope.

## Linux screenshot baselines

No existing Linux snapshot baseline is expected to change. The affected Plan and report specs save evidence screenshots without `toHaveScreenshot` baselines. Existing shell/catalog, component and expected-payment baselines retain their default content; trend is disabled outside the opted-in report context. Pinned Linux CI and owner visual acceptance remain orchestrator steps. Evidence images that change: Plan month inspector gains the income card; all listed report headers gain the shared selector; opted-in series gain dotted fits.

## Changed files

64 files: 50 existing files modified and 14 new files. No migration, lockfile or screenshot baseline changed.

- `apps/server/src/api/budget.ts`
- `apps/server/src/api/cashflow-report.ts`
- `apps/server/src/api/index.ts`
- `apps/server/src/api/invest.ts`
- `apps/server/src/api/networth-history.ts`
- `apps/server/src/api/overview-reports.ts`
- `apps/server/src/api/payee-report.ts`
- `apps/server/src/api/report-period.ts`
- `apps/server/src/api/report-ranges.test.ts`
- `apps/server/src/api/spending-reports.ts`
- `apps/server/src/api/wealth.ts`
- `apps/web/src/budget/budget-api.ts`
- `apps/web/src/budget/income-targets-card.tsx`
- `apps/web/src/budget/plan-page.tsx`
- `apps/web/src/budget/plan.css`
- `apps/web/src/pages/payee-analysis-report.tsx`
- `apps/web/src/pages/portfolio-contributions-report.tsx`
- `apps/web/src/pages/portfolio-depots-report.tsx`
- `apps/web/src/pages/portfolio-performance-report.tsx`
- `apps/web/src/pages/reports-pages.tsx`
- `apps/web/src/reports/cashflow-report.tsx`
- `apps/web/src/reports/category-report.tsx`
- `apps/web/src/reports/explorer-report.tsx`
- `apps/web/src/reports/period-quick-select.css`
- `apps/web/src/reports/period-quick-select.tsx`
- `apps/web/src/reports/savings-report.tsx`
- `apps/web/src/reports/spending-shared.tsx`
- `apps/web/src/reports/table-charts.tsx`
- `apps/web/src/reports/table-format.ts`
- `apps/web/src/reports/table-report-frame.tsx`
- `apps/web/src/reports/wealth-history-report.tsx`
- `apps/web/src/router.tsx`
- `apps/web/src/wealth/networth-model.ts`
- `apps/web/src/wealth/zeitraum.ts`
- `docs/FEATURES.md`
- `docs/ROADMAP.md`
- `docs/evidence/income-targets-report-ranges.md`
- `e2e/income-targets-report-ranges.spec.ts`
- `packages/db/src/index.ts`
- `packages/db/src/repos/cashflow-report.ts`
- `packages/db/src/repos/income-targets.test.ts`
- `packages/db/src/repos/income-targets.ts`
- `packages/db/src/repos/networth-history.ts`
- `packages/db/src/repos/overview-reports.ts`
- `packages/db/src/repos/portfolio-depots.ts`
- `packages/db/src/repos/portfolio-summary.ts`
- `packages/db/src/repos/queries.ts`
- `packages/db/src/repos/report-tables.ts`
- `packages/db/src/repos/spending-report.ts`
- `packages/domain/src/income-targets.test.ts`
- `packages/domain/src/income-targets.ts`
- `packages/domain/src/index.ts`
- `packages/domain/src/invest/performance.ts`
- `packages/domain/src/ledger/cashflow.ts`
- `packages/domain/src/overview/explorer.ts`
- `packages/domain/src/report-range.test.ts`
- `packages/domain/src/report-range.ts`
- `packages/domain/src/report-tables/tables.ts`
- `packages/domain/src/spending/period.ts`
- `packages/ui/src/charts/bars.tsx`
- `packages/ui/src/charts/index.ts`
- `packages/ui/src/charts/lines.tsx`
- `packages/ui/src/charts/trend.tsx`
- `packages/ui/src/styles/charts.css`
