# #620 routing implementation and coverage handoff

Source phase, 2026-10-28. Routing only; no financial/API/write changes. This is
prepared work, not verified delivery. Local Node/npm/build/test/browser/formatter
execution is prohibited by the owner's current memory constraint. Root owns cloud
proof, independent review, required exact-head CI, publication and issue status.

## Source and test rationale

- `apps/web/src/router.tsx`: 18 explicit static aliases select the source reader's
  existing `darstellung` or Explorer `vorlage`. The other 16 report routes remain
  normal dynamic report routes. The existing redirect helper patches only alias
  intent and source fallback periods, preserving raw query/hash state before the
  destination's existing validator. It retains malformed project input so that
  validation can produce `projektUngueltig`, rather than broadening the scope.
- `apps/web/src/pages/reports-pages.tsx`: canonical Cashflow and Vermögensverlauf
  now consume the same opt-in trend flag as their displaced entry points.
- `apps/web/src/reports/explorer-report.tsx`: relative year selection uses the
  latest year with source full-month data, as the old YearReport does. An explicit
  calendar range still selects its explicit year. `yearsWithData` means at least
  one full month, not a complete calendar year.
- `apps/web/src/nav/redirects.test.ts`: test-first literal all-34 landing table,
  active selector state, explicit month/range/hash, reload, conflicting views,
  template fallbacks, saved identity, exact boolean/string encoding, category and
  group arrays, project validity states, recipient/contact and Plan return.
- `apps/web/src/pages/report-trend-620.test.tsx`: test-first route provider checks
  use the real TrendLine consumer and literal points; report network readers are
  substituted only to isolate the provider's opt-in boundary.
- `apps/web/src/reports/explorer-templates-625.test.tsx`: additive source-gap year
  default regression with literal February 2024 cell `20,01`; optional fixture
  parameter leaves all existing fixtures and oracles unchanged.
- `e2e/issue-620-report-aliases.spec.ts`: all-34 literal browser landings, active
  buttons/templates, explicit month/range/hash and reload in every configured
  profile; invalid saved-view precedence, malformed project scope, actual chart
  trend and Back to Plan. Existing literal cents/financial suites remain needed.

Fallbacks were read from the original consumers, not chosen as one common period:
CategoryReport uses `useZeitraum()` (YTD), TotalTableReport reads every month through
current month (Alles), YearReport chooses the latest `yearsWithData` year (YTD
plus the existing year template's source-data selection). Other alias readers are
the original mounted readers and keep their own existing fallbacks. Explicit valid
`zeitraum` is never overwritten. Saved `ansicht` remains separate from `vorlage`;
the Explorer consumer gives saved identity precedence, including a missing ID.

## Existing test impact inventory (source inspection, runtime proof pending)

Do not blanket-edit the 48 files containing a displaced URL. Most reader DOM,
source requests, literals and control behavior remain unchanged. The following
are concrete adaptations or coverage moves to review before the full CI gate:

| Existing file | Concrete old expectation / required treatment |
| --- | --- |
| `e2e/payee-analysis-report.spec.ts` | Old main heading `Empfänger-Analyse` becomes canonical `Ausgabenanalyse`; retain all real period/source/recipient/amount/keyboard/privacy checks. |
| `e2e/portfolio-performance-report.spec.ts` | Main heading `Rendite und Kennzahlen` becomes `Portfolio-Auswertung`; preserve all performance/quality/literal fixtures. |
| `e2e/reports-search-package.spec.ts` | Search still emits legacy links; after click expect canonical path plus forced `darstellung` for Kosten/Planungstreue. The canonical Budgettreue heading replaces legacy Prognosegenauigkeit title. |
| `e2e/issue-621-income-project-views.spec.ts` | Legacy entry remains literal cents proof; canonical wrapper is now present at both entries. Preserve `300003`, `700`, cashflow/overview net distinctions and every scoped/invalid/API/CSV assertion. Check active alias view to avoid parity becoming the only oracle. |
| `e2e/issue-622-623-report-views.spec.ts` | Preserve literal `29500`, `9500`, `99000`, FX/debt/estimate/CSV/source/read-only oracles; legacy entries now select canonical views. No unconditional URL replacement. |
| `e2e/issue-487-remaining-target-views.spec.ts` | Portfolio legacy reader now includes the canonical control; retain literal fixture test and source verdict/period parity. Alias intent must be asserted separately from equal canonical DOM. |
| `e2e/issue-487-budget-contract-views.spec.ts` | Same shared-reader observation for Budget/Contracts; keep every literal/source/unavailable oracle and month defaults. |
| `e2e/report-tables.spec.ts` | Year/Category/Total DOM becomes accepted Explorer templates; old chain/comparison/multicategory/depth/CSV checks require assertion-level map to independent existing domain/API and retained-component coverage before replacing UI checks. Sparquote stays unchanged. |
| `e2e/category-trend.spec.ts` | First two legacy multicategory/previous-year tests differ from accepted single-category template; retain prior-period and source-cell facts at the appropriate tested consumer. Existing Ausgaben heatmap exact-window/source/44px tests still apply unchanged. |
| `e2e/issue-552-report-frame.spec.ts` | Canonical income wrapper adds a project combobox; accepted category template adds its category combobox and Explorer toolbar. Scope control-count checks to the period control and account explicitly for approved extra controls; do not remove geometry/keyboard/trend/contrast checks. |
| `e2e/issue-552b-report-sections.spec.ts` | Year now uses Explorer template sections rather than old table-report collapse wrapper; preserve collapsible-section guarantees on current framed readers and review target template expectations separately. Income and Sparquote still use their existing section consumers. |
| `e2e/plan-panels.spec.ts` | `/reports/sparziele` now lands on Plan goals list: `.goals-report-list`, `quelle=report`, report-return title/path are superseded. Preserve same goal history, month, no dialog, edit/Escape focus, Axe and unknown-goal checks using current Plan list/detail. |
| `e2e/payments-preview-report.spec.ts` | Retired preview calendar/chart DOM moves to actual Plan destination assertions. Preserve 170000/14167/42000, FX/range/stored-booking/ambiguous/native/large-cent/empty/error/no-write facts through existing independent domain/real API and retained renderer coverage; no mock-response self-equality. |
| `e2e/finanzcheck-report.spec.ts` | Retired 13-day matrix/chart DOM becomes real API assertions for exact 13 dates ending 2026-09-17 and matrix/current counts, plus actual Heute current-rule behavior and privacy/accessibility. Existing timeouts stay unchanged. |
| `e2e/goals-progress-report.spec.ts` | Retired report aggregate/chart becomes Plan list/detail; retain literal goal/source/unavailable/large-cent/retry/month-end/read-only facts via an assertion-level map, existing model/query tests and added retained consumer checks where needed. |
| `e2e/contact-report.spec.ts` | Explicit contact identity reaches existing ContactDetail through ContactsPage effect. Preserve credit/history/source/settlement/Undo, privacy, focus and real API assertions; inspect exact report-only labels/chart comparisons before adapting. |

Other inspected candidates retain their financial readers and should first run
unchanged: `cashflow-report`, `wealth-history-report`, `whole-picture`,
`bank-costs-report`, `planning-accuracy`, `portfolio-contributions-report`,
`month-reports`, `payroll-projects`, `a11y-strict-q2`. Generic layout/privacy,
chart-inspection and mobile specs need runtime evidence of actual changed wrapper
geometry before any edit. No timeout/oracle/tolerance/skip/baseline changes are
included in this source phase.

## Next proof

Run focused static/unit proof for the three changed/new unit specs and the new
620 browser spec plus the four canonical target suites listed above. Root may
generate a formatting-only patch in its workflow-only proof child; apply only to
unchanged source blobs. Review actual failures, then stage the coverage adaptation
commit within the same #620 package. Full required CI remains mandatory before
integration; router and tests are outside the mapped UI fast lane.
