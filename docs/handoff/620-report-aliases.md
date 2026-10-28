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

## Coverage phase A (prepared, runtime checks pending)

This phase changes only the following existing checks; no financial oracle,
tolerance, timeout or skip is changed. The new retained-reader tests substitute
network transport and PageFrame chrome, render the real production reader and
assert the original literal output. They do not assert a mocked payload against
itself and do not introduce a production test route.

| File | Assertion-preserving adaptation |
| --- | --- |
| `e2e/payee-analysis-report.spec.ts` | Only main heading `Empfänger-Analyse` → `Ausgabenanalyse`; all numbers/source and action assertions untouched. |
| `e2e/portfolio-performance-report.spec.ts` | Only main heading `Rendite und Kennzahlen` → `Portfolio-Auswertung`; all financial assertions untouched. |
| `e2e/reports-search-package.spec.ts` | Search option names remain original. After click assert canonical pathname and alias-specific `darstellung`; main canonical Budgettreue title. Keyboard/search/Axe/44px checks retained. |
| `e2e/plan-panels.spec.ts` | Legacy goals entry now asserts Plan list, current list link, selected server month, Plan return label/path. Same goal history, month, modal absence, edit/Escape focus, unknown-ID and accessibility assertions retained. |
| `e2e/finanzcheck-report.spec.ts` | Retired stage/matrix/strip/chart DOM becomes actual authenticated `/api/rules/results` and `/check` assertions: literal 13 dates, all active rules, 13 aligned cells per rule, real last-day counts equal live check and Heute counts. Destination current violation count/action/focus/44px and reload are asserted. Existing 150s/60s/90s limits and both-theme inspection remain. No mock data is used. |
| `e2e/payments-preview-report.spec.ts` | Calendar monetary rendering is retained below; browser now asserts actual Plan payment dates/3812 EUR/20 USD/1260 EUR, keyboard contracts switch,44px, both-theme Axe/overflow and reload. Real twelve-month preview API still asserts exact window and nonempty facts. Plan's existing idempotent `/api/expected/refresh` is allowed; no booking endpoint may be called by navigation. Original preview no-write guarantee stays covered by unchanged API DB/audit snapshots plus retained-reader GET-only checks. |
| `apps/web/src/pages/payments-preview-retained-620.test.tsx` (new) | Moves exact original calendar 1700 EUR,141.67 average,100/120/420 month cells,12-month heading,14 columns, keyboard focus and projected status. Retains native100–150 USD range, unavailable EUR total, actual−110 EUR, ambiguous currency and no99999 substitution,9007199254740990 cents formatting, failed read hiding, retry and explicit empty zero. Existing domain/API precision/no-write/auth fixtures remain untouched. |
| `apps/web/src/pages/goals-progress-retained-620.test.tsx` (new) | Additive coverage before browser adaptation: original target/saved/remaining/rate/forecast literals; shared live GoalDetail category/account source links bounded to month end; duplicate/missing/foreign source withholding, large exact cents, reached/no-date/overdue and negative/zero-rate rendering; stale metadata pending/failure/retry/empty withholding and GET-only requests. Existing query real-API/DB/audit and model tests unchanged. |
| `apps/web/src/contacts/contacts-page.test.tsx` | Additive test-first real QueryClient list/detail read-state regression: cached10001 cents visible, pending refresh hidden,422 hidden, pending retry hidden, successful same amount restored. |
| `apps/web/src/contacts/contacts-page.tsx` | Root-authorized small target prerequisite: hide list/detail cached content while fetching or failed; show loading on refetch. No query/API/settlement/Undo changes. This preserves the retired contact report's no stale/partial amount invariant at its actual destination. |

Still pending: goal/contact browser adaptation, accepted Explorer template tests,
actual focused proof findings and any justified current wrapper selector changes.
Phase A does not claim those tests pass or that #620 is ready for integration.

## Coverage phase B (prepared, runtime checks pending)

- `e2e/goals-progress-report.spec.ts`: the old report table's literal target,
  saved, remaining, future rate and forecasts remain in the live Plan list/detail
  browser test. Enter opens the actual detail, whose existing GoalDetail still
  supplies month-end category/account booking links and Plan assignment links.
  The old aggregate/source/large-cent/negative-rate/reached/no-date/overdue
  renderer checks were retained additively in
  `goals-progress-retained-620.test.tsx` before this browser adaptation. Pending
  metadata, error, retry and missing-goal withholding also run against the actual
  Plan detail; source ambiguity must not show a euro amount in that detail. The
  real sample still asserts five goals, three in plan, every goal's exact target,
  saved, remaining, average and needed rate, plus no writes and both-theme Axe.
  Retired chart/aggregate horizontal scroll is replaced by actual destination
  keyboard link navigation and44px Back action. The existing90s timeout stays.
  Overflow compares the exact configured viewport in all three profiles.
- `e2e/contact-report.spec.ts`: same real booking/settlement fixture, receipt Undo
  and Undo-of-Undo. Contact credit−2000/2000, signed10000/−12000, running10000/−2000
  and pending/confirmed account provenance are independently asserted from the
  real statement API; the destination renders signed shares and words for the
  same balance. Recorded receipt disclosure retains20 EUR credit. The retired
  running-balance chart/jump-list and report-only read-only action chrome are
  superseded by the owner-approved contact statement. Its actual heading focus,
  keyboard source opening, fresh whole-booking editor, dialog Escape,44px source
  action and both-theme Axe stay covered; navigation/source opening must write
  nothing. Balanced history now uses the actual Offen/Alle area filter, retained
  across detail/reload/Back. Mixed-currency422, blocked retry, recovery and failed
  background refresh withhold all person amounts/tables on the actual target.
  List withholding has the additive Contacts QueryClient regression from phaseA;
  unchanged real API tests retain global mixed-currency totals rejection and
  no-partial-payload guarantees. Original60s fixture test timing stays unchanged.

No balance, goal source, audit/Undo or rate implementation changed. Old screenshot
filenames and exact retired wrapper/chart geometry are presentation evidence,
not a reason to recreate those owner-retired pages inside this routing package.
