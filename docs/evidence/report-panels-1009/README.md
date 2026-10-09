# Report panels and layouts, 2026-10-09

This package builds on PR #411's category trend work. Synthetic fixtures only.

## Scope and source evidence

- #335: `/reports/gehalt/historie?monat=...&zettel=...` owns the existing payslip history and line details. The report retains its charts, annual tables and month. Reads still use `payrollQuery`; captured IDs, linked payouts and missing records retain their existing identity.
- #336: manual capture/edit uses the existing `PayslipPanel` form inside `FormDialog`, with a scrolling body and fixed header/footer inside the dialog. The PDF/password picker is the existing `PayslipUpload` in a form dialog. Validation, cent control, receipt staging, audit and undo use the unchanged APIs. Closing a dirty form asks once; upload cannot navigate away while pending.
- #337: monthly, total and average cells are anchors to `/reports/einnahmen-ausgaben/buchungen`, retaining period, row, column and expanded groups. The same `incomeExpenseSources` selects source splits. Each source links to the existing filtered booking view. Minimal shared changes: router registration/report scroll restoration and a bounded, report-only return link in booking search/page. No booking editor change.
- #344: `.rf-main` and `.rf-side` span the full existing future-report grid. Liquidity events and levers follow their existing DOM order.
- #345: on the #411 base, `.rc-d` already has only one facts-list child, after the category trend. Its remaining two-column CSS still reserves an empty third of the width. Only that CSS gap is removed.
- #347: `.sr` now stacks main content and secondary changes/summary/source sections. Existing full-width numeric tables and the #411 category links remain.
- #348: `.ov-split` now stacks the current/next-stage source sections and Today/actions sections of the finance-check report.

No report formula, database schema, API write contract or dependency changed.

## Verification

- Web TypeScript: exit 0.
- Changed-file ESLint (TypeScript/TSX): exit 0; CSS is checked separately.
- Changed-file Prettier: exit 0, including the final documentation rerun before commit.
- CSS scale: exit 0.
- Focused UI/search unit run: 4 files, 11 tests passed. Report selector tests first failed on the missing URL fields; the return-link regression first failed on the missing return parameter.
- Payroll/table domain regressions: 2 files, 38 tests passed.
- One `npm run build:e2e`: exit 0. Targeted web-only rebuilds verified the browser-discovered local dialog-flex, focus-return and cell-link hit-area repairs. Existing Rollup annotation/chunk warnings remain.
- All six functional desktop scenarios passed across focused reruns. The final mobile run passed all 9 tests (3 setup + 6 functional) in 2.7 minutes, at 390 x 844 px, with one worker on port 4930. The three touched/added specs cover navigation/reloads, source filters, dirty cancellation, focus return, upload/password dialog, real synthetic capture/edit/undo, full-width geometry, no page overflow, 44 px links and light/dark Axe checks. The first browser runs caught the local Grid override pushing form actions outside the viewport, missing focus return after unmount, and inline anchors ignoring minimum height. Each was repaired at the local caller/style; assertions were retained. The category check now selects a closed row, because #411 opens the first row by default.

The package-specific memory constraint overrides the common full-local-check rule. No full check, full E2E suite or local snapshot regeneration is run. CI is the final gate.

## Visual evidence and remaining acceptance

- [Cell sources, desktop 1440 px](cell-sources-desktop-1440.png)
- [Cell sources, mobile 390 px](cell-sources-mobile-390.png)
- [Payslip history, mobile 390 px](payslip-history-mobile-390.png)
- [Payslip upload dialog, mobile 390 px](payslip-upload-mobile-390.png)

These captures use only the existing synthetic seed or synthetic test fixtures. Full-page mobile images include the fixed shell navigation at the viewport boundary.

The affected report specs use review screenshots rather than committed pixel baselines. Review payslip, income/expense, liquidity, category, spending and finance-check captures on Linux; the shell report-catalog baselines are unaffected. No baseline was regenerated.

Required PR CI, integration after #411, owner review on desktop and a physical 390 px phone remain open. No keys, provider consent, private PDF, migration, deployment or automatic booking is needed for this package.
