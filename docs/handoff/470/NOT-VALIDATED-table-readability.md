# #470 table readability — NOT VALIDATED

Source-only handoff for branch `codex/impl-470-table-readability`. The implementation commit is
`7033155e6b4b1a79a55336e3dc75567f3d317ca8`, based on
`4f50e612fed8d812ae054470a3e31ab9553e2732`. This branch contains no test, build, browser,
CI, PR, merge, or deployment evidence. The issue's visual and accessibility acceptance criteria
remain open.

## Source inventory and changes

The base already had a locally scrollable, keyboard-focusable `RowsGrid` with a sticky first
column and 44 px amount controls. The Explorer fixed templates had the same table structure.
The legacy year report defaulted to the grouped depth. Liquidity and report tables already had
horizontal scrollers, and the liquidity chart already had a minimum-height container. Portfolio
`unitsText` and `quoteText` still exposed the complete source precision.

The 13 implementation files are:

- `apps/web/src/reports/{table-scroll,month-report,table-reports,reports-future,spending-analysis-report,explorer-report}.css` and `apps/web/src/pages/portfolio-report-shared.css`: local scroll shadows/focus, sticky income labels, wrapping status text, hover/focus underlines instead of persistent drilldown underlines, and 44 px report table controls.
- `apps/web/src/reports/year-report.tsx`: hide only trailing future columns after the latest available full month. The view still uses `buildYearView` for amounts, comparison pairs, and totals. An unavailable month within the actual-data horizon remains visible as an unavailable month; this is a display projection, not a change to the report's financial period or calculation.
- `apps/web/src/wealth/networth-model.ts`, `apps/web/src/wealth/networth-chart.tsx`, and `apps/web/src/reports/{liquidity-chart,assets-debts-chart,wealth-history-chart}.tsx`: use one unit-aware axis formatter for those four charts, with explicit `€` or `Tsd. €` headings and distinct nice-number tick labels. Exact cent values still feed tooltips and summaries; chart geometry and stored values are unchanged.

The axis label precision uses the selected unit and the existing `portfolioIndexAxis` extra-digit
rule. Manual source examples for later validation (not executed): ticks `[0, 2500, 5000]` should
read `0`, `2,5`, `5` under `Tsd. €`; ticks `[0, 0.25, 0.5]` should read `0`, `0,25`, `0,5` under
`€`. Negative ticks retain the real minus sign. These examples describe expected labels and do
not establish rendered spacing or a test result.

## Remaining integration and acceptance

- `kfmt` still emits `T` in the other callers: `apps/web/src/reports/{table-charts,explorer-template-trend,year-charts,category-trend,cashflow-chart}.tsx` and `apps/web/src/wealth/{debts-chart,portfolio-overview,freedom-chart}.tsx`. Their plot margins and unit placement need individual source and rendered review; a global suffix replacement would make narrow labels longer.
- The newer fixed Explorer year template in `packages/domain/src/overview/explorer-templates.ts` still projects all 12 calendar columns. Reconcile its presentation with the #550/#551 composition branches; do not copy the legacy view's slicing into the domain calculation without checking its fixed-template and CSV contract.
- Portfolio position units and prices remain fully precise in `apps/web/src/wealth/portfolio-format.ts`, `portfolio-page.tsx`, and `portfolio-panel.tsx`. Any C-22 shortening to four unit decimals or two-to-four price decimals needs an accessible full-precision value and must not alter `unitsE8`/`priceMicro` or valuation. Coordinate with the #544 portfolio work.
- No trace supports a speculative #542 fix here. The iPhone page overflow, chart label spacing, FAB overlap, light/dark appearance, print appearance, 44 px rendered targets, Axe, and desktop/mobile/WebKit acceptance have not been established by source edits alone.

## Process note

The owner requested source-only work without checks. During source review, one `git diff --check`
was run accidentally before the implementation commit; it is not functional, type, browser, or CI
validation and must not be reported as acceptance evidence. No tests, type/build, browser, or CI
checks were run.
