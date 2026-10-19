# #543 — one benchmark quote contract

Scope: read-only benchmark comparison in `windowPerformance`, daily/monthly
`performanceReportSeries`, the portfolio-summary fallback, and the depot comparison
read caller. That caller now samples the same report benchmark at its existing
month-boundary dates; the public legacy `benchmarkIndexLine` compatibility helper
and its existing tests are unchanged. Holding valuation,
ledger writes, cash facts, TTWROR/XIRR formulae, reporting dates and whole-period
annualisation remain unchanged. No frontend files are changed.

## Contract and independent literals

Authority: [owner's shared quote-rule follow-up](https://github.com/Grabman1987/budget/issues/525#issuecomment-6223488548),
[whole-period annualisation](https://github.com/Grabman1987/budget/issues/525#issuecomment-6215073807),
[SPEC](../../../SPEC.md), [benchmark boundaries](../../performance-report.md),
and [stored ECB direction](../../market-data.md). Rates are **EUR per foreign unit**,
as documented by `RateTable`/`fxOn` and used by `marketValueEurCents`/`toEurCents`.
The old report's division contradicted this direction; this fix does not change
stored FX or introduce a new conversion policy. Derived benchmark index levels
retain fractional micro-units; cash and holdings retain their existing integer cents.

Synthetic fixtures use literal expected values independently of the helper:

| Case | Expected evidence |
| --- | --- |
| Monday close 100, Tuesday absent | `[100, null]`, both actual-window comparisons unavailable |
| March 2/3 closes 100/105; March 4/5 absent | `[100,105,null,null]`, actual March 2–5 dates retained, aggregates unavailable |
| Friday 100 through weekend | ETF/fund/stock/bond `[100,100,100]`; manual/crypto `[100,null,null]`; Thursday never substitutes for Friday |
| Opening and terminal closes 100/110, interior missing | `[100,105,null,110]`, aggregate +10%, preserving existing boundary-versus-interior contract |
| USD 100 × 2 EUR/USD, then USD 110 × 1 EUR/USD | EUR 200 → EUR 110, index `[100,55]`, return −45% |
| One USD micro × 0.5 EUR/USD, then two USD micro | EUR micro levels `[0.5,1]`, index `[100,200]`, return +100% |
| Future FX only | Missing historical rate remains `missing_fx`; no future-rate/default-EUR fallback |
| Fresh close 100 → 0; opening zero | Closing zero returns −100%; zero opening leaves return unavailable |
| Funding only final two days of a 365-day report | Literal 10,000 → 11,000 cents: gain 1,000 cents; return and annualised return +10% over the whole period |

Repository and API tests use an unheld USD benchmark and a held EUR position worth
10,000 cents on both days. They compare fallback/history reads, preserve zero flows,
zero gain and zero portfolio TTWROR, and prove `total_changes()` is unchanged across
repeated reads. New depot comparison regressions additionally prove terminal
`[100,null]`, source-kind weekends, and literal USD/EUR line `[100,55]` agreeing with
the period return. Its USD holding keeps exact EUR values 20,000 → 11,000 cents
and gain −9,000 cents. Every new depot read also checks unchanged `total_changes()`.
No mutation endpoint or undo behaviour is changed by this slice.

## Verification status

- Initial new boundary/fallback regressions on unmodified source: six failures and
  four passes; stale weekday/end dates, manual weekend, Thursday and native-currency
  fallback discrepancies reproduced. The initial FX oracle copied the old division;
  independent review identified that error before delivery, and the new literal
  fixtures now follow the documented EUR-per-unit direction above.
- Corrected focused run: six files / 67 tests passed, including new domain/repository/API
  evidence and unchanged domain performance/report and depot summary suites.
- New depot caller regressions reproduced three failures / one pass before the
  caller fix. After it, seven files / 62 tests passed, including the new caller tests,
  unchanged repository/depot-helper neighbors, the corrected API suite, and new
  domain/repository/API evidence.
- After the owner explicitly approved the two specific financial expectations, the
  coordinator changed only `apps/server/src/api/portfolio-performance.test.ts`
  literals `1.205` → `-0.44875` and `1.1` → `-0.475`. The fixture, both assertions
  and 12-decimal tolerance are unchanged. The implementing agent did not edit this
  existing financial test. Exact owner approval in chat on 2026-10-19:
  **“Ja, beide Finanztest-Erwartungen berichtigen”.** An independent reviewer verified the exact two-literal
  delta and ran its API suite: 14/14 passed. The authoritative stored-FX contract
  above justifies both replacements; no test was weakened or removed.
- Required `BUDGET_REQUIRE_AGE=1 VITEST_MAX_WORKERS=2 npm run check` passed:
  485 test files / 4,410 tests, exit 0. The shared host check lock serialized the
  run. Production `npm run build` also passed, exit 0. Both ran on the independently
  reviewed, frozen source/test tree before this evidence-only status update.
- Independent whole-diff Codex review found no remaining actionable findings. Its
  isolated runs passed 67 focused tests, 14 tests in the exact approved API file,
  and 27 expanded depot/neighbor tests (overlapping counts, not a summed total).
- Exact-head remote CI and controlled integration remain delivery gates. No browser
  or private Portfolio Performance reconciliation is claimed; this synthetic
  read-only slice does not close private Gate 3.
