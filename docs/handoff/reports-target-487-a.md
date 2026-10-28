# Reports #487: Budgettreue and contracts/costs target content

Prepared on live-main base `c57bc7e5f0dff3c9bb3301e359dcd2881c1ecc4a`.
This bounded content package does not complete #487 or unblock all of #620.

## Contract

- `/reports/budgettreue` defaults to `darstellung=budget` (Plan und Ist).
  `darstellung=planungstreue` renders the full existing planning-accuracy reader.
  Both readers use the existing selected `monat`. The forecast retains its six
  closed-month summary, observed snapshots, missing-history/reliability wording,
  category ordering and dated booking drilldown. Its month-row links stay in the
  canonical selected view. Verdict identity remains `planungstreue`.
- `/reports/abos` defaults to `darstellung=vertraege`.
  `darstellung=bankkosten` renders the full existing Bank- und Zinskosten reader,
  including sources, costs versus earnings, current credit lines, estimated
  interest and incomplete-coverage/FX disclosures. Verdict identity remains
  `kosten`. Both views show the canonical title Verträge und Kosten.
- Contracts retain their actual current as-of date. Bank costs retain the
  reader's available closed-month coverage and current conditions date. Neither
  acquires a selected-month or `zeitraum` filter it did not previously support.
  Such query fields are retained as navigation state, never presented as the
  source period. The existing title-block data-basis/stand labels stay intact.
- Selectors merge the current validated search, retaining `ansicht` as the saved
  view ID, `exakt` (boolean true or string 'true'), periods and valid/explicitly
  invalid project state. The shared parser only gains four bounded representation
  values; existing representation and validation rules remain unchanged.
- Legacy `/reports/planungstreue` and `/reports/kosten` still render their original
  standalone pages. No redirects, new calculations, API, writes, migrations,
  dependency, CSS or workflow changes. Existing audit/undo/locks and financial
  tests are untouched. Existing responsive segmented-control CSS is reused.

## Prepared verification (not executed locally)

`apps/web/src/reports/budget-contract-search.test.ts`: new focused parser cases
for all four variants, existing variants, saved IDs, boolean/string exact mode,
valid/invalid project state and rejection of unknown values. No old unit test
was changed.

`e2e/issue-487-budget-contract-views.spec.ts`: two new isolated-ledger cases;
no existing browser test, financial oracle, timeout or baseline was changed.

- Literal budget plan/actual 30,001 cents, zero rest; stored forecast 30,000 cents,
  actual 30,001, deviation -1; one comparable/hit month and November 2026
  reliability boundary. Exact body and verdict parity with the retained legacy
  planning page; selected month, dated booking links, canonical month links,
  switching, reload/back and retained query identity.
- Literal bank subtotal 691 cents, August–September coverage through 2026-09-30,
  conditions 2026-10-02, zero missing-FX periods and one current unknown-rate line.
  Contracts as-of 2026-10-02, zero bound cents and no unconverted contracts. Exact
  legacy bank body/verdict parity, empty-contract body parity, historical query
  not relabeling source periods, switching/reload/back and invalid project marker.
- Axe light/dark, no horizontal page overflow and screenshots for all four new
  views; selector touch targets at least 44px outside desktop. The new `issue-487-`
  filename is included by the existing WebKit iPhone profile matcher. Run desktop,
  mobile and WebKit iPhone profiles; these are prepared assertions, not results.

Required focused regression set also includes the unchanged
`e2e/budget-adherence-report.spec.ts`, `e2e/planning-accuracy.spec.ts`,
`e2e/contracts-report.spec.ts`, `e2e/bank-costs-report.spec.ts`,
`e2e/reports-search-package.spec.ts`, and the existing report detail/parser tests.
These retain nonempty contracts, price history, original FX amounts, modeled
interest, missing-FX coverage, zero/negative budgets, 50/30/20 and old navigation.
The independent reviewer should inspect the new tests' actual coverage.

Host RAM restriction: no local Node/npm/build/test/browser/install/lint/formatter
was run. Author performed source inspection and `git diff --check` only. Runtime,
formatting, screenshots, independent HIGH full-diff review and exact-head CI are
pending coordinator delivery. No PR, push or cloud dispatch by the author.

## Remaining scope

Portfolio Einzahlungen/Rendite and global full project results remain separate
target-content work. Do not redirect `/reports/projekte` onto a project-filtered
income summary or infer an ID from a bare path. #620 still owns eventual aliases
and all-34 landing/query verification. Do not close parent cards from this package.
