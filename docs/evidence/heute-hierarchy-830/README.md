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
| `e2e/heute.spec.ts` | Conditional ON lead/Finanz-Check presence, primary font token and source-section order; numeric, forecast geometry, privacy, errors and existing destination assertions remain. |
| `e2e/issue-571-heute-kennzahlen.spec.ts` | ON middle tile stays budget-scoped; first-screen bounds target primary/next work. Three source-equal supporting KPIs receive direct label/value/info bounds, pairwise nonoverlap and post-scroll fixed-control clearance, in addition to visibility and horizontal bounds. OFF checks remain. |
| `e2e/issue-572-heute-charts.spec.ts` | Desktop ON first-screen bounds follow primary/next work; chart/source cents, endpoint/gap/tooltip geometry and keyboard assertions remain, with support-chart scroll/reflow proof. OFF bounds remain. |
| `e2e/issue-574-heute-section-states.spec.ts` | ON desktop first-screen bounds follow primary/next work. The exact pending-to-settled section geometry equality stays unchanged. The first case maps initial forecast readiness to delivered T2/#911: ON withholds the response-owned chart until aggregate success, then asserts literal canonical low 19101; OFF keeps its independent initial read. Independent budget, errors and refresh checks remain. |
| `e2e/issue-575-heute-phone-viewport.spec.ts` | ON parent selector follows two-column layout; original chart order, first-phone-Pace, folds, bottom controls, target sizes and Axe remain. Desktop first-screen bounds follow primary/next work ON, unchanged OFF. |
| `e2e/ux-distill.spec.ts` | ON DOM and column geometry follow the approved hierarchy, with all retained sections and same bounds. OFF geometry, net-worth identity and device preference/reload checks remain. |
| `e2e/pace-marker.spec.ts` | ON checks the new main/secondary parents; every chart/marker/tooltip money and geometry assertion remains. OFF sibling structure remains. |

## Verification record (in progress)

- New primary cases RED on unchanged main: 2 failed / 11 passed; log
  `/workspace/work/heute-hierarchy-red.log`.
- Initial implementation: all 13 Heute unit files, 99 tests passed. Final candidate
  reruns and browser evidence are recorded below after the shared prerequisite.
- First ON desktop browser run passed delivered refresh/Axe and new hierarchy,
  cents, source order, dates, other-month and disclosure assertions; only final
  320/200% reflow failed. Measured owned intrinsic-width and overlapping compact
  rows are addressed by scoped presentation rules, without clipping or hiding data.
- The exact same type-token probe on unchanged main's matching preserved ON build
  proves inherited shared overflow: 320px client width, 404px scroll width; period
  segment at x29,width305 and text to x346.5. Fixed tabbar labels exceed their 64px
  cells. Root assigned that separate prerequisite to the S3 writer. This H1 change
  does not modify the shared header/tabbar CSS or drop/narrow the full-page check.
- The probe doubles root type tokens programmatically. It exercises real browser
  layout; it is not native browser zoom, OS text settings, native focus switching,
  owner timing or physical-device acceptance. Reflow checks use client/configured
  width because mobile `innerWidth` can itself expand with overflowing content.

No original screenshot baseline has been replaced. Existing screenshot assertions
continue to describe OFF; any later ON baseline adoption uses the documented
scoped `update-snapshots` workflow. Independent final review and exact-head CI are
required before integration. No broad H1 acceptance or publication is claimed.

The inherited #574 initial-source fixture drift is separate from H1 financial
behavior: main's `CompactForecastCard` selects the response-owned 35-day forecast
ON until an aggregate error permits the independent fallback. Its old first case
expected an independent initial chart in both modes. Root authorized a narrow
source-owner adapter preserving OFF and the exact geometry equality; the ON check
now asserts pending/withheld followed by the unchanged literal canonical low.
No amount, date, formula, retry or timeout is changed by that adapter.
