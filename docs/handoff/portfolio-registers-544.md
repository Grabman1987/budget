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
| `e2e/mobile-chart-containers.spec.ts` | Both the generic page/theme/overflow matrix and the allocation bar geometry case now open Allokation; their original readiness, Axe, overflow, geometry and timeout assertions remain. |
| `e2e/issue-511-valuation-quality.spec.ts` | Today quote-review action now expects Positionen; its real quote save, quote-review counts, literal values, audit-group Undo and privacy/disclosure assertions remain. |
| `apps/web/src/heute/valuation-attention-511.test.tsx` | Two existing literal href expectations now require Positionen for the unchanged quote-review action. |
| `apps/web/src/rules/rules-page.test.tsx` | Adds rendered per-rule correction links with seven literal contextual destinations. Fixture-only bad statuses expose those actions without changing evaluations or existing oracles. |

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

## First focused proof and bounded corrections

Disposable workflow `a589939b` (parent exact source `bfdf74a8`) ran
`40463839267`. Scoped ESLint, full typecheck and build passed; six unit files / 47
tests passed. In that same VM, the additional API regression was first run with
only `invest.ts` temporarily replaced from base `ae961`: it failed exactly because
the old endpoint returned 17 September instead of the requested 15 September.
The workflow then restored the exact source file and all seven positions API
tests passed as part of the 47-test green unit run. This intentional RED is not a
failure of the implemented date read.

Browser discovery: 36 tests, 27 first-attempt pass, nine fail, no retry or baseline
update. Three closed-month failures were only test-side Intl nonbreaking-space
grouping versus the product's explicit dot grouping. The corrected test uses
literal 8686069 cents and `86.860,69 €`, retaining date and sum parity. Two
integrated savings cases attempted the trade opener while still on Allokation;
the existing register switch now precedes that opener. Four existing desktop
geometry checks measured the chart bottom at 1033.625, beyond the unchanged
900px limit. The correction removes the duplicated navigation-level section gap
and places the same lead value and scope/gain beside each other on desktop;
the chain, quality cue and chart remain visible. Existing geometry, quality,
44px, focus and dialog oracles are unchanged.

The independent source review also found old task entry links. Today quote
review now opens Positionen; rule corrections open Allokation (R13/R15/R21),
Positionen (R14/R22), or Sparpläne (R17/R20). Existing product-ID links retain the
valid legacy redirect. No rule evaluation or financial semantics changed.

Baseline audit: all `expectScreenshot`/`toHaveScreenshot` consumers are in auth,
components, expected, goals, networth, rules and shell specs. None pins a
portfolio screenshot. Rules/Heute changes alter hrefs only, retaining their
visible baseline content; no baseline regeneration is justified. Existing
portfolio browser evidence uses direct screenshots (including tracked evidence
JPEGs from wealth-ux-v1), not snapshot oracles. Such VM-only outputs must not be
carried into the feature diff. The first VM's formatter patch/logs were inside
Playwright's cleaned output directory and were lost before artifact upload; no
patch was applied. The next proof preserves them outside that directory.

## Second focused proof and final narrow correction

Disposable `b1e5fed3`, exact source parent `9b28fcdb`, ran `40465507619`:
46/46 browser tests passed on their first attempt, covering the selected desktop,
390 Chromium and WebKit flows, both themes, original compact chart/quality-cue
checks, task dialog/focus and unchanged Heute/report/rules screenshot comparisons.
Scoped ESLint/build passed and eight unit files / 63 tests passed after restoring
the source callers. Two deliberate old-caller RED tests failed for the old hrefs,
then passed with the exact source. Full typecheck failed only because the new
literal route matrix lacked tuple typing (`label` inferred possibly undefined).
Adding `as const` retains every literal href and assertion.

The durable raw formatting patch has SHA256
`9c515065055beb51e1b7163bfbe74fabdb1845977d8c1d755f52a3fc9a0f3c0c`.
Its seven allowlisted TS/TSX files contain only formatting; `git apply --check`
passed and the complete exact patch was applied. No VM-produced JPEG, baseline,
workflow or helper was carried into source. Author inspected original desktop
overview/light, mobile positions/light and WebKit allocation/dark viewport PNGs:
labels are legible, the desktop chart fits, and phone register labels fit without
swiping. Fixed phone FAB/navigation crossing the scrolled capture is not evidence
that underlying amounts are always unobstructed; existing scroll/touch checks remain.

Independent review found a separate 601–767px overlap: the shell changes its gap
at767, while the new negative-margin override previously changed only at600.
The correction aligns the margin rule with767 and keeps the three-column layout
switch at600. A new 640px browser case checks actual nonintersecting area/portfolio
nav boxes, 44px link height, horizontal containment and a viewport image. It must
fail with the former stylesheet and pass after restoring the corrected source.
The existing required desktop/390 cases and all financial oracles remain unchanged.

## First full CI findings

PR #788 exact-head CI `40467313888` exposed two missed route assertions:
the pending-save allocation editor correctly returned to `/allokation`, and
Today's quote-review action correctly opened `/positionen`. Their expected URLs
now match those contextual destinations; every later save, dirty/template,
literal target share, audit-group Undo/redo, quote count/value and retry assertion
remains unchanged. Retry duplicate fixture names were secondary to the first
allocation-route failure, not a financial defect.
The phone container matrix also still expected allocation bars on Übersicht;
its existing allocation row now uses `/allokation`, preserving its loaded-bar,
both-theme Axe and no-page-overflow checks.

The allocation-only page also lost the monolithic page's visible estimate hint.
Its own current `quality.valuationQuality` still reported `estimated`, but the
only explicit wording was inside closed calculation details. The generic
provisional status did not explicitly identify that estimate. A visible read-only
line from that existing allocation DTO restores SPEC-008/#512 qualification;
the securities-scope hint is not reused for a different allocation universe.
The existing two visible-estimate assertions and cost-fallback/retry scenario
remain unchanged, and calculation details remain collapsed by default. No source
valuation, cost-basis, quality resolution or financial writer changed. New focused
proof and independent complete delta review are required before updating the PR.
