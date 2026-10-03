# Performance report 4.4

`/reports/prendite` extends the existing securities-only summary with the prototype's
benchmark index chart, asset-class chart/table and month-by-year returns heatmap.
The depot cash view and private owner acceptance remain separate.

## Sources and calculations

- The report requests `GET /api/portfolio?period=…&view=securities&history=performance`.
  Existing callers do not load the optional history. Named periods and shared custom
  calendar ranges use the existing effective window, including its clamped start.
- The summary loads the existing daily securities valuation once. Class series sum
  those same position values; class flows use the existing securities flow filter.
  Class end values use the selected period end, including historical calendar
  ranges, rather than today's position value. Class membership follows the current settings, including sold positions and an
  explicit unclassified group. Empty configured classes keep their names but have
  no invented return. Changing class membership regroups historical attribution.
- `performanceReportSeries` partitions the effective window at calendar month ends
  and calls shared `windowPerformance` for TTWROR. Contributions, Dietz, volatility,
  drawdown and Sharpe retain their existing definitions. Monthly returns compound
  into year subtotals. Partial months/years show `*` and exact dates in the fallback
  table. A month without a positive-capital subperiod has no return, distinct from
  an observed zero return. Sharpe below 0.5% volatility is omitted, as in report 4.1.
- Settings › Depots & Kryptos selects an existing, live security, even without a
  held position. `GET/PATCH /api/portfolio/benchmark` reads/writes
  `portfolio.benchmark_security_id` in `app_setting`; null clears it. Writes use the
  session/origin boundary, strict zod validation, a transaction/savepoint and the
  existing audit/undo mechanism. No migration or new secret is required.
- An unset/deleted benchmark never falls back to the largest holding in report 4.4.
  Its stored prices are converted to EUR levels using historical FX on the quote
  date. The comparison is a price return; additional cash distributions are not
  inferred. Saturday/Sunday boundaries can use Friday's stored close; missing
  weekday or holiday closes are explicit gaps because no exchange trading
  calendar is stored. Both interval boundaries must have a qualifying quote.
  Later quotes never backfill a missing beginning. An observed zero end price
  remains a valid −100% return; a zero start cannot define a ratio. Quote dates
  appear in the monthly source table.
- A benchmark quote/FX gap interrupts the index line and withholds aggregate
  benchmark return, difference and beta. Available monthly comparisons remain
  visible. The portfolio keeps its own valid figures. A missing held-security
  valuation still returns the existing whole-read `valuation_unavailable` error.

## UI and verification

German labels, shared blueprint tokens, actual versus dash-dot benchmark lines,
signed pastel heat cells, keyboard-scrollable tables, native details fallbacks and
light/dark layouts follow `reports-portfolio.js` (`R.prendite`). Benchmark settings
offer audit undo/redo and invalidate report reads after a change.

Synthetic literal domain/API tests cover flow-adjusted compounding, partial/empty
months, sold class history, unheld benchmark, quote/FX gaps, settings persistence,
undo/redo, no-op saves, invalid/session/origin writes and atomic audit rollback.
`e2e/portfolio-performance-comparisons.spec.ts` covers selection/reload, signed
returns, keyboard fallback tables, light/dark Axe and mobile overflow. Existing
performance report specs keep their whole-valuation-error and sample-ledger cases.

Synthetic browser captures (1440px desktop, 390px mobile):
[desktop light](evidence/performance-comparisons/desktop-light.png),
[desktop dark](evidence/performance-comparisons/desktop-dark.png),
[mobile light](evidence/performance-comparisons/mobile-light.png),
[mobile dark](evidence/performance-comparisons/mobile-dark.png).

Verification commands on Windows (local execution limits only; CI unchanged):

```powershell
$env:VITEST_MAX_WORKERS='2'
npm.cmd run check -- -- --testTimeout=30000 --hookTimeout=30000
npm.cmd run build
npm.cmd run build:e2e
$env:E2E_START_TIMEOUT='120000'
npx.cmd playwright test e2e/portfolio-performance-comparisons.spec.ts e2e/portfolio-performance-report.spec.ts --workers=1
```

The selected browser run passes all 13 scenarios, including setup and the real
synthetic sample API. The first unbounded unit run was stopped after existing
auth/import stress tests exceeded their default time limits under Windows load;
the final run uses the limits above. No dependency install was needed because the
existing `node_modules` passed the focused domain/API run.

Owner steps: choose a benchmark security and provide its stored price history;
review the report with privately reconciled data after deployment. No provider
credentials, consent, trade, booking or automatic budget assignment is added.
