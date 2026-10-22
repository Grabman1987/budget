# #470 table readability — NOT VALIDATED

Source-only handoff for branch `codex/impl-470-table-readability`. The initial implementation commit is
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

The initial 13 implementation files are:

- `apps/web/src/reports/{table-scroll,month-report,table-reports,reports-future,spending-analysis-report,explorer-report}.css` and `apps/web/src/pages/portfolio-report-shared.css`: local scroll shadows/focus, sticky income labels, wrapping status text, hover/focus underlines instead of persistent drilldown underlines, and 44 px report table controls.
- `apps/web/src/reports/year-report.tsx`: hide only trailing future columns after the latest available full month. The view still uses `buildYearView` for amounts, comparison pairs, and totals. An unavailable month within the actual-data horizon remains visible as an unavailable month; this is a display projection, not a change to the report's financial period or calculation.
- `apps/web/src/wealth/networth-model.ts`, `apps/web/src/wealth/networth-chart.tsx`, and `apps/web/src/reports/{liquidity-chart,assets-debts-chart,wealth-history-chart}.tsx`: use one unit-aware axis formatter for those four charts, with explicit `€` or `Tsd. €` headings and distinct nice-number tick labels. Exact cent values still feed tooltips and summaries; chart geometry and stored values are unchanged.

The axis label precision uses the selected unit and the existing `portfolioIndexAxis` extra-digit
rule. Manual source examples for later validation (not executed): ticks `[0, 2500, 5000]` should
read `0`, `2,5`, `5` under `Tsd. €`; ticks `[0, 0.25, 0.5]` should read `0`, `0,25`, `0,5` under
`€`. Negative ticks retain the real minus sign. These examples describe expected labels and do
not establish rendered spacing or a test result.

The follow-up source checkpoint `2ccebe0531aceae5a0cf1118679eb751c65a8862` migrated the
remaining production monetary-axis calls in
`apps/web/src/reports/{table-charts,category-trend,explorer-template-trend,cashflow-chart,year-charts}.tsx`
and `apps/web/src/wealth/{freedom-chart,portfolio-overview,debts-chart}.tsx`, with the native
currency unit helper in `networth-model.ts`. Each EUR plot reuses its existing tick values and
adds a `€` or `Tsd. €` heading. The portfolio value view converts its cent ticks to EUR for labels;
the index/return view retains its percentage labels. The debt plot uses `EUR`/`€` for euro loans
and the actual loan currency (for example `Tsd. CHF`) for other loans. Full tooltips, table data,
stored amounts, `yTicks`, and financial formulas were not changed.

## Remaining integration and acceptance

- The legacy exported `kfmt` in `networth-model.ts` still emits `T` because existing test expectations depend on it; no production chart calls it after the follow-up. Removing that export belongs with an authorized test change. Axis-heading placement and narrow labels still require rendered review.
- The fixed Explorer year model still contains all 12 months. `explorer-templates.tsx` now displays only months through `facts.lastFullMonth` for that template, including its month-range note and each row's month cells. Earlier unavailable months remain visible; sum/average, heat statistics, source lookup and CSV keep the canonical model. Other templates are unchanged. The prepared #550/#551 source retains the same month rendering seam, so carry this view-only hunk into its report component when assembling those branches.
- The fixed Explorer year table now starts with its category groups closed. Each existing group row has a keyboard-operated, 44 px disclosure button; opening it reveals the existing category rows without rebuilding amounts. A direct cell selection opens its parent group, and collapsing that group closes the selected drilldown while keeping focus on the control. Group choices reset when the template or year changes. The category rows remain in the table source and print stylesheet reveals all of them, so the existing printed detail, model, CSV and calculations are retained. This is source behavior only; screen-reader and print output remain unvalidated.
- `portfolio-format.ts` now has separate rounded list labels: at most four fractional places for units and two to four for quotes. Values below the last displayed place use a less-than/greater-than bound instead of appearing to be zero. `portfolio-page.tsx` exposes exact `unitsText`/`quoteText` in hover titles and screen-reader text, while the visible list uses compact labels. `portfolio-panel.tsx` keeps exact per-account units and quote details and masks its unit text when amount privacy is enabled. Existing `unitsE8`, `priceMicro`, server valuation, trade input, price history and exact formatters are unchanged. The prepared #544 source retains the same position-row and panel formatter seams; carry those small hunks into its newer page/panel during assembly.
- The #488 depots/payroll shared-scale branch is separate. Reconcile its eventual chart unit treatment when integrating it; this branch did not edit those charts or their scale.
- No trace supports a speculative #542 fix here. The iPhone page overflow, chart label spacing, FAB overlap, light/dark appearance, print appearance, 44 px rendered targets, Axe, and desktop/mobile/WebKit acceptance have not been established by source edits alone.

Manual display examples for later validation (not executed): `0,12345678` units → `0,1235` in the list, exact `0,12345678` in its title and screen-reader text; `0,00000001` units → `<0,0001`, exact `0,00000001`; `60,250001 CHF` → `60,25 CHF` in the list, exact `60,250001 CHF`; `0,000001 €` → `<0,0001 €`, exact `0,000001 €`. A year whose latest full month is October shows January through October, including any unavailable earlier month, while its canonical model/CSV still has twelve months. These are source-level expectations, not validation results.

## Process note

The owner requested source-only work without checks. During source review, one `git diff --check`
was run accidentally before the implementation commit; it is not functional, type, browser, or CI
validation and must not be reported as acceptance evidence. No tests, type/build, browser, or CI
checks were run.
