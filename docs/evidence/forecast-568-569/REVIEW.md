# Independent review — #568/#569

Reviewed head `a6399267c4eaa543ddbb09e53e06551db1639fd8` against live base `331bf3750341e0ad90f2392a2290160c6149bafb`; separate read-only reviewer, no edits/tests/install. Read SPEC/current queue/Ponytail and relevant design/page-review contracts, production diff and relevant forecast/API/account callers, five new tests and three old adapters.

**P2 — account forecast selector cannot represent the newly linked 35-day forecast.** `apps/web/src/reports/liquidity-report.tsx:363` preserves the account-detail link with the current `horizon`, now including `35d`. The receiving `AccountBody` accepts that horizon and correctly queries the 35-day series, but `apps/web/src/ledger/account-page.tsx:291` binds the native select to `35d` while its options at306–309 contain only standard/90d/6m/12m. Reproduce by following a Budget-Konto link from the 35-day detail. The active period cannot be selected/displayed accurately; native DOM selection has no matching option (can appear blank or standard while the chart is35d). Add an explicit35d option to this existing caller and cover the report→account path without altering curve arithmetic. The current new UI/native tests cover Heute→detail but omit account navigation.

No other concrete correctness defect identified. The new shared horizon reaches the existing API allowlist and horizonDays path; unsupported API values remain rejected, invalid URL/storage horizons fall back to an allowed preference/default. Existing 90d/6m/12m arithmetic, fixed six-month verdict, buffer and month calculations are unchanged. Scheduled inflows come from the selected run before display cutoff, retaining real positive referenced income/fixed occurrences and excluding events, zero/suppressed receipts, day0 and day36. The9000-cent provenance fixture remains literal. Heute and Details use the same35d/no-lever query key and unmodified shared chart/low; Plan report-filter validation and current Heute task-navigation code remain intact.

Controlled disclosure state belongs to the page, keeping the user's open choice across uncached queries; native collapse preserves mounted draft children. Existing write handlers, selected occurrence identity, audit/Undo and financial amounts are unchanged. New tests exercise actual API/DB read parity, no-write states, skip/Undo/unskip, privacy, geometry/Axe and retained draft/open state; runtime outcomes remain pending the root's verification.

Old adapters reviewed per file: `e2e/income-pause.spec.ts` adds only two ordinary tools-summary clicks; `e2e/liquidity-report.spec.ts` adds only five such clicks; `liquidity-lowpoint.test.ts` moves the same three dated/cents/referenced salary fixtures from display movements to scheduledInflows. Every existing assertion, literal financial expectation, security/Undo check, timeout/retry/tolerance remains unchanged; none removed/skipped. Domain/API writers, schemas and dependencies are unchanged.

Review disposition: resolve the single caller consistency finding and independently review that delta; not yet CLEAR. No runtime/build/CI/live acceptance claimed.

## Correction delta review — CLEAR

Independently reviewed only `a6399267c4eaa543ddbb09e53e06551db1639fd8..15db3018900a9180a79ca27d6628cf2fb95a047f`. Prior P2 is closed by the one explicit35d option in the existing native select. The new synthetic real Router/SQLite/API regression checks the incoming35d account URL's selected option, an actual35d series request and normal90d→35d selection with retained liquiditaet/empty-lever URL state. It does not mock forecast results or alter existing assertions, financial semantics, timeouts, retries or writers. The evidence note accurately describes the correction and pending validation. No new finding; combined source review is now CLEAR at15db3018900a9180a79ca27d6628cf2fb95a047f. Runtime/types/build/browser/CI gates remain for root; this review ran none.

## New-test matcher delta — CLEAR

Reviewed only `15db3018900a9180a79ca27d6628cf2fb95a047f..03fc3f7e75d91a46902f72375af97df0c09c0ba2`. All three unsupported toHaveValue calls become native toHaveProperty('value', same35d/90d/35d literal), inside the same waitFor. This remains the same HTMLSelectElement selected-value invariant; option-selected, actual series-read and final URL assertions are untouched. No lost coverage or protected expectation/timeout/source change. Evidence accurately qualifies the matcher failure; root's rerun remains the execution proof. Combined review CLEAR at03fc3f7e75d91a46902f72375af97df0c09c0ba2; reviewer ran no tests.

## Verification history after source review

Root verified source `03fc3f7e`: workspace types PASS (115.93s), five unchanged
domain/API compatibility files 53/53 PASS (6.98s), build:e2e PASS (8.28s), canonical
WebKit feature spec 7/7 PASS including three setup and four feature scenes
(82.99s, no retries/skips). Root visually inspected the four linked README
images; labels readable without overlap and forecast scope clear. These are
execution/visual results reported by root, separate from independent source
review. Exact-head required CI/Chromium and live delivery remain pending.

## Existing caller/fixture delta — CLEAR

Reviewed `03fc3f7e75d91a46902f72375af97df0c09c0ba2..43846fa8ab9358b24694fa34c0bd948a69b8b8ed` with ADOPTION and external OLD-CALLER-INVENTORY. This extends the prior CLEAR source review; no tests, edits or GitHub actions performed. No concrete correctness/coverage finding.

- `heute-visual-fixture.ts`: same fixed-day seeded SQLite database supplies new35d liquidity and expected-payment GET DTOs, using real readers before close; exact route scopes do not intercept writes or other horizons. Existing technical-font wait retained for both chart reads. Readiness now requires the actual visible chart, HEUTE marker and rendered dated low rather than an absent legacy node. Lead988.26 and KPI/wealth assertions remain.
- `heute-cards`: one visibility selector follows the replacement chart; all money/date/layout checks retained.
- `account-scope-267`: literal financial/API checks unchanged; visible explicit credit-card/reserve scope replaces legacy SVG-specific wording. New product prose matches liquidityReportView's existing onBudget&&role=budget filter. No account arithmetic/type inclusion change.
- `booking-acceptance`: original keyboard Prognose tooltip, actual-solid and forecast7/5 styling assertions run on the real surviving R07 BalanceChart, with visible precondition. Return to Heute preserves original main Axe/overflow/evidence checks; replacement card visibility added.
- `heute`: original literal endpoints, salary/rent/excluded-credit labels, keyboard payment tooltip, historical marker absence and join coordinates/animation-offset tolerance remain on R07. R07 actually uses heuteQuery(month,period) and shared useBalancePeriod, preserving the selected-month/payday data source; original API low/date/last-axis oracle remains independently asserted. The old cross-page equality comparison is now redundant across R07 visits, but does not replace/remove its independent API oracle; new35d card/detail parity is separately covered. Absent-old-chart zero-count checks now require visible R07 and explicit HEUTE on the replacement card. Pace assertions stay on Heute. Original composition/overflow and motion-mode loop remain on Heute after returning. Exact mobile height232→220 maps the intentionally changed compact chart at narrow width, documented explicitly rather than widening tolerance.

All prior financial literals, protected security/Undo checks, numerical tolerances, timeout values and retries are retained. Added navigation/font settling is structural; no forced interactions, skipped expectations or fake historical chart added. Documentary runtime evidence is scoped to its actual03fc revision and pending gates remain explicit; no new runtime acceptance inferred. Combined independent review CLEAR at43846fa8ab9358b24694fa34c0bd948a69b8b8ed, subject to root's required actual compatibility/CI verification.

## Final merged-source verification

Root verified `fd01ae86093def596002f60b932928142e5e4b84`: all six adapter files
scoped ESLint PASS (3.2s), formatting PASS (1.51s), fresh build:e2e PASS (9.14s),
canonical WebKit 7/7 PASS including three setup and four feature scenes (79.64s,
no retries/skips). Root inspected final desktop-light/configured-dark cards;
scope wording readable and labels intact. Detail PNGs were byte-identical to
previous inspected artifacts by SHA comparison. Normal main merge reviewed clean
and CLEAR by root. Full required CI/Chromium and live delivery remain pending;
no complete local check execution is inferred.
