# Portfolio registers — #544 only

Base: `ae96107794fe3218a4aad408a42f8fa7f473ddee`. The old mixed
`codex/impl-544-548-portfolio` source was read without modifying its worktree.
Only the register routing, existing content separation, dated positions read and
allocation presentation/navigation were adapted. No mixed commit was cherry-picked.

Five real routes retain the selected period and legacy detail bookmarks. Übersicht
keeps the existing value/return chart and capture actions. Positionen retains the
existing class-grouped table and instrument destination. Allokation retains the
existing allocation, rebalance and wealth-stage/settings destination; out-of-band
values use the existing orange token. Sparpläne hosts the existing list and funding
planner. Kennzahlen links to the existing report; new metrics content (#546),
instrument chart (#547) and savings month strip (#548) are excluded.

The optional past-date positions GET uses the existing canonical positions producer,
validates real dates and rejects future dates. The lead and table use the chart's
period endpoint date. No return, benchmark, valuation calculation or writer changed.
Current-position consumers retain their existing undated query key and URL. Missing
performance retains an explicit current-position fallback with its actual date and
an explanation that the chart comparison is unavailable.

## Test changes and independent review scope

Every existing amount, financial/security/Undo assertion, timeout and skip remains.
Each file below needs independent review of its adapter and retained coverage.

| File | Reason |
| --- | --- |
| `apps/server/src/api/portfolio-positions.test.ts` | Adds literal dated 2 × EUR 12.345 = 2469 cents, later-quote exclusion, current-read compatibility, invalid/future-date rejection and authentication. |
| `e2e/issue-544-portfolio-registers.spec.ts` | New five-route/reload/period, literal 8800000-cent endpoint = independently summed class positions = lead, closed-calendar-month date parity, desktop height, mobile label fit, both themes/Axe/44px/overflow and viewport evidence. |
| `e2e/portfolio-positions.spec.ts` | Opens the positions register; fault interception accepts its optional date query; contextual back expectations target Positionen. |
| `e2e/portfolio-instruments.spec.ts` | Opens the positions register and matches both dated/undated position fault requests; metadata, quotes and Undo checks stay. |
| `e2e/portfolio-allocation.spec.ts` | Opens Allokation; all figures/editor/Undo/rebalance assertions retained. |
| `e2e/portfolio-trades.spec.ts` | One table-entry setup opens Positionen; legacy product bookmarks remain tested. |
| `e2e/savings-plans.spec.ts` | Opens Sparpläne; contextual returns follow it. Integrated dialog test navigates Allokation → Positionen → Sparpläne between existing checks; legacy mixed bookmarks remain. |
| `e2e/funding-plan.spec.ts` | Existing planner lives under Sparpläne; unchanged calculations/writes/conflict/Undo. |
| `e2e/portfolio-package-d.spec.ts` | Catalog setup opens Positionen, scope comparison navigates to Allokation after checking the securities denominator. |
| `e2e/wealth-detail-pages.spec.ts` | Origin/fallback route expectations follow the proper register. Uses a 500px-high viewport to retain actual nonzero scroll/restoration coverage on the shorter pages. Original nonzero-scroll/restoration assertions remain. New #544 tests separately cover required 1440×900/390 geometry. |
| `e2e/wealth-ux-v1.spec.ts` | Reads instrument and savings destinations from their separate registers; original chart/geometry/theme/privacy assertions remain. |
| `e2e/report-polish.spec.ts` | Direct instrument fallback now returns to Positionen. |
| `e2e/asset-exposure.spec.ts` | Opens the class-grouped positions table before the unchanged split/rounding/editor checks. |
| `e2e/missing-quotes.spec.ts` | Opens Positionen before unchanged missing-quote/value/Undo assertions. |
| `e2e/mobile-chart-containers.spec.ts` | Allocation bar geometry now opens Allokation. |

## Actual evidence and remaining gates

Test-first checkpoint `fa7ac321`: disposable remote proof `40462862164`, default
configuration, desktop, one worker, zero retries, snapshots disabled. Build and
three setup tests passed; both new feature tests failed as expected: zero register
links instead of five, and missing scope text in the lead. The independent sample
API/date/sum assertions passed before the missing scope failure. No baseline changed.

Implementation is a source checkpoint, not runtime acceptance. The additional
dated API case must also be observed failing with the old endpoint before its
green run. Pending: remote static/unit/focused browsers, capable independent full
diff and per-test review, representative image inspection, exact-head required CI,
canonical integration/preview/publication and fresh live verification. No local
Node/npm/build/test/browser/install/lint/formatter was run under the host RAM limit.
