# Forecast #568/#569 adoption — validation pending

Base: `331bf3750341e0ad90f2392a2290160c6149bafb`. Owned source:
`5a6f6bcdafe9daa110bf0e5402a62c42c2f96bdf` (parent `cadefe1523`).
Adopted only its eight source paths, preserving current Heute task navigation and
Plan filter URL validation. No backend writer, schema, dependencies or financial
formula changed.

Final prepared overlays: controlled-tools state (`33d069e3` candidate SHA256),
salary-marker source and provenance test (manifest `3618ca89`), domain/API tests
(manifest `c34b6af4`), corrected UI/native tests (manifest `26601e5d`), and dependent
OLD2 controlled-tools adapters (manifest `b608c7a3`). Historical disclosure/remount
adapters and initial UI/native proposal are superseded.

The salary marker reads referenced positive scheduled inflows from the existing
selected forecast run, before the movement display cutoff. The literal 9000-cent
salary remains in acceptance fixtures. Controlled disclosure state belongs to the
page, so loading a new query can withhold stale financial data while retaining the
user's open/closed choice.

## Existing-test changes for independent review

Owner authorization transferred by the coordinating chat permits technical test
adapters with per-file justification and independent review. No financial oracle,
security/lock/audit/Undo assertion, tolerance, timeout or coverage was weakened.

| File                                              | Technical adaptation                                                                                                                                | Decision and preserved coverage                                                                                                                                |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `e2e/income-pause.spec.ts`                        | Two ordinary Werkzeuge summary clicks after initial navigation and document reload.                                                                 | #568 owner-approved default-closed tools disclosure; every original pause/date/amount/action/assertion remains.                                                |
| `e2e/liquidity-report.spec.ts`                    | Five ordinary Werkzeuge summary clicks before accessing relocated controls. First click precedes horizon selection to exercise retained open state. | #568 tools relocation; unchanged levers, event writers, amounts, dates, Undo, privacy, accessibility, touch and timeout checks.                                |
| `apps/web/src/reports/liquidity-lowpoint.test.ts` | Handcrafted salaryDay DTO fixture now provides scheduledInflows instead of display-only movements. Same three dates, cents and payment references.  | #569 shared chart salary marker must retain real inflows below the movement cutoff; every existing expected salary date/null assertion remains byte-identical. |

## Required verification (not executed by adoption)

- Focused NEW domain/API/UI/provenance and unchanged lowpoint/navigation/income-pause/liquidity/issue-567 regressions.
- Independent whole combined source/test-adapter review; scoped formatting/types/lint.
- `npm run check`, `npm run build`, fresh `npm run build:e2e`.
- Canonical WebKit iPhone and Chromium desktop/mobile, both themes: real API parity,
  salary/low labels, compactness, Axe, keyboard/privacy/drafts, retention and real
  skip/Undo/unskip. Expected screenshots/JSON are future artifacts, not proof.
- Exact-head required CI and serial main-green/deployed/live gates before delivery.

This checkpoint is source adoption only. Tests, runtime acceptance, publication,
merge and live completion remain pending. Refs #568 and #569.

## Account detail caller correction

Independent review found the linked `35d` forecast was queried correctly by
AccountPage but had no matching select option. Add only its existing-style
35-day option. The new real Router/SQLite/API test covers initial selected
representation, the 35d series read and switching away/back with URL state.
Existing receipt links and all financial/Undo/timeouts stay unchanged.

Focused account regression initially failed because this repository does not
register the jest-dom `toHaveValue` matcher (Invalid Chai property), rather than
a mismatched selected value. Use equivalent native `value` property assertions;
production router accepts 35d through LIQUIDITY_HORIZONS and the test validator
uses the same shared horizon/lever validation. No source or expectation changed.

## Validation status update

The pending-check list above records the historical adoption checkpoint. Current
verified source results and remaining gates are in [README](README.md). Required
complete checks can be fulfilled by exact-head CI under the current delivery
rules; this does not claim a full local `npm run check` execution.

## Shell visual readiness adapter

`e2e/heute-visual-fixture.ts` now waits for the owner-approved shared 35-day
liquidity chart instead of removed `heute-balance-chart`, additionally requiring
its HEUTE label and rendered dated low-point summary. Its newly required
liquidity/expected GET fixtures are computed from the same existing seeded real
SQLite database and fixed 2026-09-17 day as Heute; no copied financial oracle or
production writer is introduced. Both chart reads retain the original technical
font load before response. Lead value, all three KPI headings, wealth heading,
font/animation waits, screenshot assertions and timeouts remain unchanged.

This technical selector/read-fixture adaptation follows #569's accepted card
replacement and the owner's per-file adapter authorization. Workflow
39769372353 reported job success but actually had four shell readiness failures
and 40 passes; no baseline changed. Independent adapter review and rerun of only
the same affected snapshot workflow remain required.

## Remaining chart caller adapters

The owner-approved #569 card is stand-today 35d, while the historical Heute/R07
API period contracts remain unchanged. No financial literal/date/API assertion,
Axe check, timeout, retry or tolerance is changed by these adapters. No duplicate
legacy chart is rendered. Independent full adapter review is required.

| File                             | Change and equivalent retained coverage                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `e2e/heute-cards.spec.ts`        | Visibility selector follows the actual shared liquidity chart; every KPI money/date assertion remains.                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `e2e/account-scope-267.spec.ts`  | Shared chart summary selector and visible scope prose replace old chart-specific ARIA/prose representation; all literal money/API expectations remain.                                                                                                                                                                                                                                                                                                                                                                                      |
| `e2e/booking-acceptance.spec.ts` | Actual-solid/forecast-dashed tooltip invariants run on surviving R07 historical chart. Return to Heute for original Axe, overflow and evidence checks; shared card visibility is additionally required.                                                                                                                                                                                                                                                                                                                                     |
| `e2e/heute.spec.ts`              | Period-specific endpoint/payment tooltip/label and historical join/animation checks run on surviving R07, retaining original literal API/date/low-point and join tolerance checks. Lead brackets stay on Heute. Historical selected-month marker absence stays on R07 and pace; stand-today card explicitly requires HEUTE. Mobile exact height follows actual compact drawing 220px instead of removed historical 232px. Composition checks remain on Heute in both motion modes. NEW acceptance separately proves 35d card/detail parity. |

Compact card scope copy now explicitly states budget credit cards included and
reserve accounts excluded. This matches `liquidityReportView`'s actual
`onBudget && role === 'budget'` account filter; no type exclusion or calculation
was introduced. Existing scoped-finance tests retain their literal amounts.
