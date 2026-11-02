# H1 #830 hierarchy continuation

Candidate starts at main `012c31d6d5e5d0506866e51204df55fdb00fc10c`, branch
`codex/830-hierarchy-20261102`. Execution: shared Cloud session, gpt-6.1-sol medium;
not a hosted task. This continues delivered #911 rather than replaying prepared
branches. Production release/activation, owner timing and physical-device
acceptance are separate gates.

## Decisions and boundaries

The redesign ON page presents canonical `lead.freeCents` first, beside the existing
ordered Zu tun block on desktop and before it on phone. Supporting budget/net-worth
figures form a plain secondary strip rather than three peer lead cards. Pace and
canonical fixed 35-day account cash forecast retain their independent meanings.
A secondary column contains the supporting figures, existing compact wealth view,
a Finanz-Check summary using existing counts, due payments and recent bookings.

Both Monat and Bis Gehalt retain the current-day envelope lead. The selected-month
budget/Pace and current-day lead/wealth/tasks have explicit scope labels. The lead
is neither forecast cash nor an overdraft amount. Its existing terms, selected-month
Plan-Rest and next expected income remain available through the same chain. No
formula, source date, urgency score, source ordering or financial writer changes.

The due list initially displays its first four chronological rows ON, with an
explicit keyboard-operable expansion retaining every row, date, amount, deep link
and existing strike/Undo writer. OFF displays its original full list. Pinned
categories, recent bookings and the device-specific remembered MoreMonth choice
retain their homes and destinations. No H2/T7/detail-page mount, API, DB, auth,
offline cache, shared UI, routing, configuration or dependency change is included.
The delivered same-context refresh/error/failureCount/placeholder guards remain.

The original desktop Heute reference was inspected locally, including its private
footer. It is excluded and is never copied into this package. The reconciled
`DESIGN.md`, `.impeccable/design.json`, export page mapping and existing components
supply the direction. Missing phone/dark references are conservatively derived.
Only synthetic application captures may be included here.

## Test impact rationale

All amount, source, error, privacy, focus, destination, tolerance and timeout
expectations remain. The ON hierarchy changes which content has first-screen
priority: the old OFF three-KPI viewport/order checks remain, while ON applies the
same viewport/fixed-control bounds to primary answer and next work. Supporting
KPIs retain independent cents and reachability/readability checks.

| File | Scoped reason |
| --- | --- |
| `apps/web/src/heute/background-refresh.test.tsx` | Adds two real-API tests for a primary canonical zero lead distinct from 123456 cash cents, both periods, separate cash source and current-day status. Existing 11 refresh/error/retry cases remain. |
| `apps/web/src/heute/upcoming-payments.test.tsx` | Adds explicit compact expansion/collapse with all six original dated source links and signed amounts retained. Existing full-list/writer tests remain. |
| `e2e/issue-830-background-refresh.spec.ts` | Retains delivered refresh/failure case; adds ON hierarchy, literal lead/cash, source order, scope, due expansion, remembered disclosure, keyboard, privacy, fixed controls, full-page Axe and 320/200% type coverage. Actual DOM marker verifies mode. |
| `e2e/heute-visual-fixture.ts` | Actual ON marker selects the new supporting middle-label expectation; original literal lead cents remain. OFF expectation is unchanged. |
| `e2e/heute-cards.spec.ts` | ON canonical payday amount and derivation move to the primary region. Supporting budget amount, original signed money/Plan-Rest/source/link assertions and OFF card checks remain. |
| `e2e/heute-hints-1009.spec.ts` | ON payday date/explanation targets the primary region with explicit long provenance date; new compact Finanz-Check exists ON. Original dates, counts, income amounts and OFF expectations remain. |
| `e2e/heute.spec.ts` | Conditional ON lead/Finanz-Check presence, primary font token and source-section order; two synthetic month fixtures explicitly request month view ON so the delivered matching-context guard accepts them. Six legacy R07 visits assert the inherited ON onepager/month/Finanz-Check destination before deliberately reaching Heute for the original current35-day source comparison. OFF helper is a no-op; original home redirect, periods and all numeric, forecast geometry, privacy/error/destination oracles remain. |
| `e2e/issue-571-heute-kennzahlen.spec.ts` | ON middle tile stays budget-scoped; first-screen bounds target primary/next work. Three source-equal supporting KPIs receive direct label/value/info bounds, pairwise nonoverlap and post-scroll fixed-control clearance, in addition to visibility and horizontal bounds. OFF checks remain. |
| `e2e/issue-572-heute-charts.spec.ts` | Desktop ON first-screen bounds follow primary/next work; chart/source cents, endpoint/gap/tooltip geometry and keyboard assertions remain, with support-chart scroll/reflow proof. OFF bounds remain. |
| `e2e/issue-574-heute-section-states.spec.ts` | ON desktop first-screen bounds follow primary/next work. The exact pending-to-settled section geometry equality stays unchanged. The first case maps initial forecast readiness to delivered T2/#911: ON withholds the response-owned chart until aggregate success, then asserts literal canonical low 19101; OFF keeps its independent initial read. Independent budget, errors and refresh checks remain. |
| `e2e/issue-575-heute-phone-viewport.spec.ts` | ON parent selector follows two-column layout; original chart order, folds, bottom controls, target sizes and Axe remain. At ON configured height below844, the primary answer and first actual ordered next action take first-screen priority; Pace is explicitly reached by scrolling. The844 full-block and OFF first-screen Pace checks remain. The new H1 spec checks every remaining source action after deliberate scrolling against actual fixed controls and hit points. |
| `e2e/ux-distill.spec.ts` | ON DOM and column geometry follow the approved hierarchy, with all retained sections and same bounds. OFF geometry, net-worth identity and device preference/reload checks remain. |
| `e2e/heute-attention-mobile-shell.spec.ts` | ON retains compact Finanz-Check and puts immediate tasks before supporting wealth; its empty synthetic month fixture explicitly requests matching month view. OFF count0, after-wealth order and URL stay unchanged. Four-source counts/text/order, review destinations, no-writes, empty/error and scopes remain. |
| `e2e/missing-quotes.spec.ts` | Actual ON compact-check count1/OFF count0 in the synthetic estimate→quote→Undo flow. Every value, estimate/source/security assertion, writer and Undo oracle remains. This write-bearing ledger proof keeps the batch risk high/full CI required. |
| `e2e/pace-marker.spec.ts` | ON checks new main/secondary parents and the inherited canonical R07 destination before explicit original-context Heute chart proof. Every chart/marker/tooltip money, geometry and keyboard assertion remains. OFF sibling/redirect checks remain. |

## Source and proof record

Production/capture-spec source freezes at `fa7ee69a`; final test-only validation
adapters are `a3fc11d3`. Earlier source freeze was `68f8641c`.
Normal main composition is
`08c725c2896f88188e8f06c95e1fe6d248e12fb5`. All 18 then-frozen H1 blobs stayed identical
through the merge; all 11 reviewed S3 dependency blobs match verified main
`844b734f018d6b2c10a7ace65b39ab6030fc2531`. `capture-record.json` records final
source/build/image hashes and actual DOM mode. Evidence is added separately from
production/test source. Final captures passed 12/12 including 3 setup cases in 1.5m, zero retries, all 3 profiles/both
themes. Raw final originals/builds are preserved at
`/workspace/work/heute-hierarchy-final-originals-2`. Six normal originals are
byte-identical to the already-opened originals; three date-fixed enlarged originals
were opened again. Capture and validation heads are distinct in the manifest;
production/capture-spec blobs match exactly across them.
The final geometry run passed 45/48 in 3.6m: all exact pending/settled and error
cases passed across all 3 profiles. The three new-adapter failures were a selector
that also matched a nested monthly row and chart-centered scrolling that placed
the heading at−61.8125px. Direct-child/count assertions and heading-centered
scrolling with unchanged title bounds plus chart viewport proof correct those
mechanics; the focused native rerun passed 6/6 including 3 setup cases in 45.2s. No production repair or tolerance change follows from them.

The final configured-case listing reconciles with the union of nine focused runs:
136 unique passes and two inherited opposite-profile skips, no missing/extra
cases. This is not one uninterrupted exact-head suite; the manifest records the
capture/final test heads and every raw log. Verified cases were reused when their
production/test behavior was unchanged; the date-only CSS correction also proved
all six normal screenshot bytes identical. Exact-head CI remains required.

| Configured profile | Passed | Inherited skips |
| --- | ---: | ---: |
| Desktop1440 | 53 | 1 |
| Chromium390 | 53 | 1 |
| Actual WebKit390 | 27 | 0 |
| Setup dependencies | 3 | 0 |

Raw final listing/reconciliation are
`/workspace/work/heute-hierarchy-final-{expected,coverage}.json`. The last
correction run (`final-ux.log`) passed 11/11 including 3 setup cases in 34.2s; the targeted
positive-debt/Pace run passed 7/7 in 31.7s and source/composition run 7/7 in 39.8s.
TSC, scoped ESLint/Prettier, CSS scale and diff checks pass; no timeout, tolerance,
retry, financial/security assertion or screenshot baseline was relaxed.

| Cause / RED | Bounded correction and retained proof |
| --- | --- |
| New primary tests on unchanged main:2 failed/11 passed. | Direct canonical lead rendered independently in both periods; all 13 Heute unit files/100 tests pass at the unchanged final TSX source (12.80s); subsequent source change is scoped date-column CSS only. |
| Pending/settled desktop work-grid shifted142.718px; an initial slot correction left6.938px because actual attention was354.938px versus348px. Phone source date added22.844px and pending net lacked the44px info header, adding22.75px on settlement. | Source-date/header slots use actual line-height/touch tokens; bounded source reservations use type-relative sizes. Exact pending/settled section equality remains, without adding fake dates/controls. Monthly Verdict moves into Pace ON and Herleitung sits by primary amount so first-screen content remains useful. |
| Original320/200 probe on unchanged matching main:320px client/404px scroll, title segment right334px/text346.5px and tab labels beyond cells. | Separate reviewed S3 prerequisite repairs shared title/tabbar. H1 retains full-page client-width/Axe assertions and does not edit shared CSS. |
| Fine-pointer Zu verteilen link measured42.09375×44px, transform:none, computed min-width: 0. | Remove owned overriding min-width only from interactive placement; noninteractive wrappers remain shrinkable. All HTML control targets retain the same43.9px minimum oracle. |
| Initial12-test browser green still had visually blocked originals: source/payee concatenation; FAB over source actions;320 enlarged description column collapsed beside intrinsic action widths; wrapped labels escaped fixed button heights. | Separate account-source line; wrapping phone rows with full-width enlarged descriptions/actions; natural-height owned buttons with44px minimum; bounded attention-link wrapping. Added actual text-Range containment, row/action nonoverlap, full-control fixed-overlay exclusion and5 interior hit tests after deliberate scrolling. Rounded corners use their computed radius for interior inset points. No clipping, hidden content, reduced text or action counts. |
| Enlarged due date occupied60px in a44px track; date right76/source left68 overlapped8px. | Intrinsic minmax(44px,max-content) reserves60px enlarged, preserves normal44px, yields8px measured gap acrossall 4 rows. Final browser spec asserts actual date Range right≤source-link left. |
| New whole-page check then caught retained-work links to361px Chromium /362.77px WebKit and Konditionen to325.56px. | Narrow attention links receive max-inline-size100% and normal wrapping. Focused final readability diagnostic passed5/5 including 3 setup cases,48.3s, zero retries, Chromium390×844 and real WebKit390×664. Final full-theme proof follows the committed source. |

Two additional legacy-adapter failures stopped the affected run after 2 failures:
a synthetic server-default month response was supplied to UI-default payday and
correctly withheld by the unchanged matching-period guard; a derivation locator
matched both amount accessible name and explicit button. ON explicit matching
month URL and exact button name retain the intended assertions. A source audit
found the same two context fixtures in `heute.spec.ts`, and the final
`ux-distill` warning fixture exposed the same mismatch, corrected identically.
No production guard, amount or timeout changed to satisfy these fixtures.

The next two failures exposed inherited T5 route drift: the byte-identical main
`currentForecast` helper expected `/reports/finanzcheck` to redirect home, while
main's `router.tsx:626` redirects ON to onepager with `darstellung=finanzcheck`.
The local ON adapter asserts the independently passed original month and explicit
period at that canonical destination, then navigates Heute using only that original
context. All six existing card/API/forecast/period assertions remain; OFF is a
no-op. No router or report production source changes. The same inherited route adapter applies to the single explicit-month Pace bookmark visit, retaining every original chart and Plan marker assertion. Independent review cleared
each technical adapter before its targeted rerun.
The targeted run then exposed the existing T4 label distinction: the positive
composition position is Anlagen ON, while Investiert names the separately sourced
investment basis. The old composition selector and source-view loop now use
Anlagen ON/Investiert OFF, and the loop uses the actual Schulden (netto) region ON. The positive debt fixture separately uses the existing ON chain Schuldkonten (netto) and detail Guthaben auf Schuldkonten (netto); its 20/120 values and source account remain.
Literal account totals, account links and all geometry/motion assertions remain.



Raw RED logs and rejected originals remain outside Git under
`/workspace/work/heute-hierarchy-prefinal-review` and
`/workspace/work/heute-hierarchy-830-capture`; geometry/readability logs are
`/workspace/work/heute-hierarchy-574-*.log` and
`/workspace/work/heute-hierarchy-readable-diagnostic-*.log`. These earlier
captures/results are not final acceptance evidence. Test-only diagnostics also
exposed a duplicate button locator and rounded-border hit-point placement; both
were corrected to target actual owned content without altering UI or tolerances.

The inherited #574 fixture drift is separate from H1 financial behavior. Main's
`CompactForecastCard` selects the aggregate-owned 35-day forecast ON until an
aggregate error permits the independent fallback. Root authorized these source-
owner adapters; OFF cases and exact pending/settled equality remain unchanged:

- Initial aggregate pending: ON asserts withheld forecast, then canonical literal
  low19101 on release. Independent budget availability remains.
- Independent endpoint held: ON first proves aggregate success ignores the unused
  endpoint (zero requests), then aggregate503/reload activates the real fallback;
  releasing it yields19101 with exact geometry retained.
- Independent endpoint fails: ON first proves aggregate success ignores it, then
  aggregate503/reload activates the actual fallback503. Retry recovers19101 while
  aggregate wealth stays withheld. Budget/savings/no-writes/Axe checks remain.

The actual WebKit run reuses the reviewed copied2370/WPE2.55.0 runtime, its
recorded provenance/direct smoke in `../heute-refresh-830/README.md`, and only a
process-local `PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1`. No browser/dependency
or shared configuration change is introduced.

Normal1440/390 captures retain native device pixels and actual browser profiles.
Only the newly added320/200 full-page captures use `scale:'css'`: native3x WebKit
would exceed32767 physical pixels. Viewport, deviceScaleFactor3, doubled type,
full-page fits and Axe checks remain unchanged. The probe doubles existing root
type tokens programmatically; it does not prove native zoom or OS text settings.
The refresh case overrides `document.visibilityState` and dispatches window
`visibilitychange`, exercising the real installed Query listener; it does not
prove native tab/app focus behavior. Mobile reflow compares client width because
overflow can expand `innerWidth` itself.

No original screenshot baseline is replaced. Synthetic originals are opened for
readability/privacy review; independent review and exact-head CI remain gates.
The configured matrix is explicit: the new #830 and #571/#574/#575 plus configured
attention/header/chart specs run real WebKit; `heute.spec.ts` and
`missing-quotes.spec.ts` run their existing desktop/mobile profiles. No native
claim is made for unconfigured legacy cases. The existing desktop skip for
"mobile attention remains reachable above the floating capture button in both
themes" is inherited from main `844b734f`, `e2e/heute.spec.ts:920/923`
(`info.project.name !== 'mobile'`); its mobile counterpart passed. The mobile
skip for "Today refreshes after capture, undo and redo without reloading" is the
existing desktop-only writer at main `heute.spec.ts:788/789`; its desktop
counterpart passed in 2.8s. No skip was added.

Owner five-second acceptance, physical devices and broader H1 acceptance remain
open. No production release or publication is claimed.
