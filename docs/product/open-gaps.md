# Open implementation backlog — wealth and Figma gaps

Owner request: 2026-10-15. All packages below are **open**. Capturing requirements
does not implement a feature, validate private data or accept a financial gate.
Source baseline: application main `01a10de8`; repository planning branch reviewed
at `3f3096c6`. Figma V01/V02/V09 were visually inspected in this review; protected
live-app visibility was not tested. Treat frame references as bounded evidence.

## Status and order

| ID | Priority / type | Deliverable | Dependencies / proof |
| --- | --- | --- | --- |
| GAP08 | P0 / shared contract | Explicit scope, measure and Figma authority matrix | First for GAP01–03; AC31 |
| GAP04 | P1 / diagnosis | Verify missing/invisible net-worth chart without duplicating existing code | Can run independently; AC29 |
| GAP01 | P1 / feature + design | Compact benchmark comparison in Vermögen | GAP08 and reviewed main-chart reference; AC26 |
| GAP02 | P1 / feature + design | Actual portfolio value history in EUR | GAP08; AC27 |
| GAP03 | P1 / feature + data + design | Asset composition and development in EUR/percent under explicit scopes | GAP08 and source coverage; AC28 |
| GAP05 | P1 / navigation reconciliation | Agreed labels and route mapping across Figma/docs/app | GAP08; AC30 |
| GAP06 | Deferred to PUB1 (#490, owner 2026-10-16) / first-use design + implementation | O01–O08 plus errors/resume/existing-data path | DEC01–04, ONB02–06; AC24/25/31 |
| GAP07 | P1 / semantic coverage | Per-frame user outcome → code → acceptance evidence matrix | Start with wealth, then remaining areas; AC31 |

The roadmap and TASKS list link to these same IDs. They are not duplicate work
queues. A follow-up implementation PR must name the package, requirement and AC
IDs and record its bounded completion evidence.

## GAP08 — common scope and design authority

- [ ] Record each graph's scope: total net worth, selected portfolio securities,
  or explicitly included investment cash/accounts. Preserve the existing portfolio
  securities view until another inclusion policy is agreed; never silently change
  what its lead value or return means.
- [ ] Distinguish measures: actual value in cents/EUR, normalized flow-adjusted
  return/index, actual contribution/withdrawal and allocation percentage. Every
  label, legend, tooltip and table identifies the measure and effective dates.
- [ ] Make total-net-worth and investment-universe boundaries explicit. A market
  benchmark compares the supported investment return; do not plot total household
  net worth including debts and contributions against an unlabeled market index.
- [ ] Reuse existing dated valuation/exposure/FX resolvers and the shared return
  calculation. Record provider/quote convention and current versus dated metadata
  limits; add no page-specific financial formula.
- [ ] Name the authoritative Figma node/version for each changed view and the
  owner directive it implements. Historical frames stay labeled as historical;
  file/page order or a larger screen count does not establish authority.

Done when the agreed matrix is linked from SPEC, screen contracts and the affected
implementation tasks. Concrete owner product choices remain review points under
CLAUDE.md; financial formulas and private acceptance cannot be guessed.

## GAP01 — benchmark comparison inside Vermögen

Evidence: [V09 Portfolio-Kennzahlen](https://www.figma.com/design/Nv9oaV96Npql6onEofCFEi?node-id=206-6344)
already has comparison return, benchmark selection and difference. [V02 Portfolio](https://www.figma.com/design/Nv9oaV96Npql6onEofCFEi?node-id=172-2107)
has only the own index line. The current [overview](../../apps/web/src/wealth/portfolio-overview.tsx)
renders one portfolio series; [Reports](../../apps/web/src/pages/portfolio-performance-report.tsx)
already owns detailed performance comparisons.

- [ ] Show a compact comparison in Vermögen › Portfolio: selected existing
  benchmarks, own/benchmark lines, return for the same effective period, and
  difference in percentage points. Detailed analysis stays linked to Reports.
- [ ] Reuse the existing allowlisted persisted benchmark settings and their
  validation/audit/undo. Empty selection means no comparison, not an invented
  default or fallback to a holding. Preserve selections across navigation.
- [ ] Normalize comparable return lines to the same start basis/date. Identify
  the existing price-return benchmark convention and do not infer distributions.
- [ ] If daily benchmark points are not currently supplied, extend the shared
  benchmark series contract with exact boundary/date/FX semantics first. Do not
  interpolate a monthly series into apparent daily benchmark observations.
- [ ] A benchmark gap interrupts its line and withholds affected comparison
  figures; retain independently valid own portfolio values. Explain the gap and
  quote convention. Do not apply holding-value fallback to invent a benchmark start.
- [ ] Update V02 and relevant phone variants; reconcile V09's selector/summary with
  actual routes. Cover keyboard, privacy, light/dark and accessible table fallback.

Done: AC26, existing benchmark/performance regressions and desktop/phone evidence
pass. A report link alone does not complete this package. Contract: [performance](../performance-report.md).

## GAP02 — actual portfolio value graph in EUR

The V02 and current portfolio graphs show index basis 100. This does not answer
how much the portfolio was actually worth on each date. V01's total-net-worth
graph is a different scope and must not be copied as portfolio data.

- [ ] Expose an explicitly labeled actual portfolio-value history in EUR for the
  selected period and GAP08 scope, directly in the portfolio area.
- [ ] Keep value and return as distinguishable views/series with explicit units.
  Never overlay EUR and an index on one unexplained axis. Both remain available.
- [ ] Match chart endpoint, lead amount, drill-down and underlying table for the
  same scope/date. If the existing lead is current-only, label it separately from
  a historical selection rather than implying those values are equal.
- [ ] Reuse daily valuation data; explain actual contributions/withdrawals versus
  market movement under the existing decomposition. A deposit can raise value
  without raising investment return.
- [ ] Specify empty, single-point, flat/negative, missing-FX, carried-quote and
  incomplete-history states. Missing information is not a zero observation.
- [ ] Add reviewed Figma EUR-history variants, period controls, tooltip/table
  source detail, privacy and responsive/accessibility behavior.

Done: AC27 and shared valuation/return regressions pass with matching scope/date.
An index graph or a current-value card alone does not complete this package.

## GAP03 — asset composition and its development

V01 shows a current composition; V02/V10 show positions. The app also has current
composition/positions and a [report allocation history](../../apps/web/src/pages/portfolio-allocation-report.tsx).
That report's percentage chart excludes cash, negative and unclassified positions
from its stacked denominator. It is not an all-assets EUR-development graph.
The existing [net-worth history API](../../apps/server/src/api/networth-history.ts)
and [read model](../../packages/db/src/repos/networth-history.ts) already supply
account-type structure at start, weekly/monthly boundaries and end. Reuse those
values where the agreed scope matches; this is not a claim that all underlying
history data or report charts are absent.

- [ ] Provide current amounts/shares and time development together in Vermögen,
  with documented grouping by wealth/account group and, for the investment scope,
  asset class/instrument. Do not conflate account type, platform and asset class.
- [ ] Cover applicable cash/reserve, security, crypto, P2P/manual and other stored
  asset groups. Debts/negative values and unknown classification remain explicit;
  no source is omitted simply because it cannot enter a positive stacked chart.
- [ ] Use one time axis and allow meaningful group selection/comparison. A
  stacked EUR asset chart must not stack debts as positive assets; signed debt
  components require a separate or signed representation with a shared zero.
- [ ] State source sampling intervals. Weekly/monthly structure points must not
  be presented as observed daily group valuations through invented interpolation;
  add a shared daily read only when actually needed and supported.
- [ ] Define the percentage denominator. Retain existing positive-classified
  investment percentages where used; distinguish them from whole-wealth shares.
  Do not divide by near-zero signed net worth and display misleading allocation.
- [ ] For every comparable date, group values plus explicit separate/unknown
  components reconcile to the same shared aggregate. Use dated exposure versions,
  deterministic cent rounding and existing valuation/FX/manual-value precedence.
- [ ] Drill from a group to relevant accounts/instruments and valuation/source
  details. Internal movement between groups changes composition, not household
  income or total wealth by itself.
- [ ] Show incomplete coverage/gaps and carried values accurately. Never invent
  pre-tracking holdings, prices, classification or historical balances.
- [ ] Add Figma composition/development variants and accessible value tables for
  desktop/phone, empty/negative/partial states and privacy mode.

Done: AC28 plus reconciliation, dated-classification, FX and mobile/accessibility
evidence. A static pie/table or percentage-only report history is insufficient.

## GAP04 — net-worth graph visibility and data diagnosis

[V01 Nettovermögen](https://www.figma.com/design/Nv9oaV96Npql6onEofCFEi?node-id=172-1943)
and [NetWorthPage](../../apps/web/src/wealth/networth-page.tsx) already contain the
EUR graph. [NetWorthChart](../../apps/web/src/wealth/networth-chart.tsx) draws it
only when the measured width is positive and more than one daily point exists.

- [ ] Reproduce the reported absence with a synthetic source and exact route,
  period, viewport, data coverage and revision. Review protected live visibility
  only through an authorized session; do not register a new owner or reset data.
- [ ] Inspect the existing `/api/wealth/networth` response, returned daily data,
  error/loading state, container width and resize behavior on desktop and phone.
  Its current client/mount are `wealth/api.ts` and `api/index.ts`; preserve the
  documented period and valuation contracts when reproducing a failure.
- [ ] Give zero/one-point, unavailable data and failed measurement useful explicit
  UI states rather than an unexplained blank chart. Preserve valid available data.
- [ ] Fix only a reproduced defect, if any. If the existing graph works, record
  that evidence and the route/discoverability issue; do not build a duplicate.

Done: AC29 and bounded reproduction/result evidence. This is an investigation,
not a confirmed absent implementation or a replacement for GAP02.

## GAP05 — navigation, terms and destinations

- [ ] Reconcile Figma Plan's Monat/Einnahmen/Jahr/Zahlungen/Ziele with the current
  app's Monat/Jahr/Wiederkehrende Zahlungen/Sparziele/Liquiditätsprognose. Record
  each label, destination, retained URL/query state and primary purpose.
- [ ] Reconcile Figma settings task groups with existing settings groups/pages,
  and financial terms such as Geplant/Noch zu verplanen versus Zugewiesen/Zu
  verteilen. Choose one meaning/label per quantity under PRODUCT's glossary.
- [ ] Keep existing deep links/bookmarks working; register changes need explicit
  redirects where necessary. A renamed control must not silently change its action.
- [ ] Update Figma, canonical navigation table, docs and app together under a
  reviewed target. Preserve current inspector/search exceptions and phone parity.

Done: AC30, keyboard/back/URL tests and matching route/design evidence.

## GAP06 — first-use design and implementation (deferred to PUB1, #490, owner 2026-10-16)

- [ ] Resolve/review DEC01–04 and link the chosen finish/resume rules.
- [ ] Create O01–O08 desktop/phone frames with empty, intentional zero, existing
  data, optional-later, stale/conflict, offline, interrupted and repair states.
- [ ] Implement ONB04–06 using existing editors and the agreed progress contract;
  no duplicate openings, automatic templates, public signup or app import wizard.
- [ ] Prove AC24/25 and the relevant auth/zero/duplicate cases before delivery.

Detailed fields, microcopy, states and candidate API are already in [onboarding](onboarding.md).
This package links ONB02–06 instead of declaring a second independent assistant.

## GAP07 — semantic Figma-to-implementation acceptance

- [ ] Start with V01/V02/V09 and related report views. For each user question,
  record requirement, exact Figma node/version, route/component/API, unit, scope,
  date/denominator, states, next action and independent expected result.
- [ ] Classify each row: absent, partial, implemented-unverified, verified for a
  bounded scope, or explicitly deferred. Attach evidence revision and reason.
- [ ] Keep design-to-code and code-to-design directions: detect designed but
  unreachable controls as well as implemented functions without a reviewed design.
- [ ] Continue through Plan/navigation/settings and onboarding, then the remaining
  product areas. Different counts of Figma screens, reports and rules are not
  missing-feature counts; map meaning rather than matching R-numbers.
- [ ] Document limitations of `verify-product-docs.ts`: it validates inventories,
  IDs and local links, not graph content, semantic completeness, usability or gates.

Done: AC31 plus a reviewed per-frame matrix and linked follow-up tasks for every
open row. Do not mark this complete from the automated inventory check alone.

## Cross-cutting implementation evidence

Reuse shared calculations and caches; avoid per-group/per-day request loops.
No new graph writes ledger records or sends bank orders. Preserve audit/undo for
changed settings, amount privacy, keyboard/screen-reader table access, 44 px
targets, reduced motion, light/dark and 1440/390 layouts. Record synthetic expected
values, source/PR/head, test/browser results and remaining owner/device evidence.
Follow-up schema/API additions require their own reviewed contract and checks;
this backlog introduces no implemented endpoint, stored field or financial result.
