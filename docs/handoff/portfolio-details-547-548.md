# Instrument and savings detail source checkpoint — #547 / #548

**SOURCE ONLY — NOT VALIDATED / NOT LIVE.** No local Node/npm, tests, build,
browser, install, lint or formatter was executed. No remote job, source push,
PR, merge or publication was requested by this checkpoint. All runtime evidence
below is a plan, not a result. Independent capable full-diff review is next.

Isolated checkout: `C:/Users/fabia/wt/portfolio-followon-547-548`, branch
`codex/portfolio-followon-547-548`, immutable base
`98f650cf6e2ae811a4e7686f0095f2e08626ffe5`. B/PR788 and A/#596 are owned by the
coordinator and were not edited. #546, the report, return/benchmark calculations,
register routing, savings execution proposals and financial writers are excluded.

## Recovery and scope

Read-only recovery source: `slot-a-portfolio` at `a14567cb` and its bounded
`ce1e67b1`/`093228b8` feature work. No mixed commit or parent stack was
cherry-picked. Before copying the five #547/#548 component/model files, each
current base blob was compared with the old feature base `4ea2f4ad`; all matched.
The date read/API/controller and small corrected EUR-axis helper were integrated
selectively. Current #544 router/page/register and contextual return code remain.
Historical source-only reviews are not acceptance evidence for this adaptation.

- #547 adds one transactional GET using the existing `valuationSeries` and
  canonical dated `portfolioPositions`. Inclusive history is bounded to 20,000
  days; validation rejects invalid, reversed and future ranges. Native prices,
  source/FX dates, quote/execution/cost fallback metadata, nulls and the current
  cost-method projection come from existing producers. No second pricing engine.
  Point values and units are guarded against the canonical endpoint; missing or
  unsafe results stay explicit. The same history response supplies the displayed
  endpoint holding/basis and default EUR chart, with native Kurs still available.
- The constant dashed line is explicitly the documented **endpoint** basis,
  not a fabricated historical cost curve. Buy/sell markers use actual trade dates;
  unvalued events are explained as events rather than value points. Hover,
  keyboard and the native chart data table share one point projection. EUR axes
  name their unit and distinguish EUR2500 from EUR3000; native Kurs uses an
  observed-price domain. Axis endpoints include the year.
- Trade history shows twelve newest retained records, with All/Last-twelve.
  Pointer row activation and the keyboard/native action in its existing row
  header call the unchanged editor. Its existing save/lock/dirty/audit/Undo paths
  are not changed. Native price quote-point hooks and exact six-digit formatting
  remain available for old inspection tests.
- #548 projects twelve months using only explicit retained `savingsMonth` plus
  the effective `savingsPlanId`, account and security. Missing links, future open
  slots, no schedule and ambiguous/unsafe links stay distinct. Manual buys remain
  in the existing gross purchase total/history but never become executions.
  Next execution/rate remain above; versions remain below; purchases start closed.
  The compact grid uses four desktop and three narrow-phone columns, token
  spacing/type/lines and no horizontal swipe. Two-screen geometry is unproven.

## New literal tests (prepared, unrun)

Tests were written before the source adaptation in `3137bef5`; additional cases
were added during source review. No RED/GREEN runtime outcome is claimed.

- `apps/server/src/api/instrument-history-547.test.ts`: actual history GET and
  canonical positions parity; 2000 → 2469 → 1500 cents over buy/quote/sell days,
  documented basis 1000 cents, actual event dates and historical end-date
  exclusion. Account/day rounding is literal 1+1=2 cents. Missing quote is null;
  missing FX stays unavailable; selected-day USD conversion is literal2222
  cents; FIFO basis is literal2000 versus4000 value; bad/future/large ranges and
  unauthenticated requests are rejected. Trade rows must remain unchanged.
- `apps/web/src/wealth/savings-month-strip-548.test.ts`: all twelve literal
  months, 7000-cent explicitly linked purchase, missing August and future open
  September, additional2500-cent manual buy included only in9500-cent purchase
  total, effective version/month-end boundary, wrong/deleted/future/other-account
  links, ambiguity and unsafe cents/units.
- `apps/web/src/wealth/instrument-axis-547.test.ts`: distinct2500/5000 and
  one-cent tick labels with explicit EUR/thousand-EUR units.
- `e2e/issue-547-548-portfolio-details.spec.ts`: isolated synthetic ledger,
  1750-cent endpoint/1000-cent basis, actual buy/sell markers, identical hover and
  keyboard inspection at2469 cents, dashed basis, last12/all13 and actual pointer
  row-edit opening, Kurs toggle; explicit May/August purchases versus missing
  July and additional manual June buy;35000-cent gross total, next version-aware
  rate, closed purchases/versions, preserved inbox proposal read and financial
  rows. Both themes/Axe/phone44px/nooverflow and savings≤2 viewports, with viewport
  PNGs. Default CI issue-spec selection includes all three required profiles.

## Existing-test adaptations requiring independent review

| File | Reason and retained coverage |
| --- | --- |
| `apps/web/src/wealth/price-history.test.tsx` | Provides the real shared controller and an independent empty history DTO, deterministic DOM width/ResizeObserver for the responsive chart, and explicitly selects native Kurs. All original inclusive range point counts, exact4.123456 USD/date, empty and503/retry assertions remain. |
| `e2e/report-polish.spec.ts` | Explicit native Kurs selection plus renamed shared range group; original range point counts,44px, exact native price/date/pointer/keyboard and report checks remain. |
| `e2e/portfolio-positions.spec.ts` | The existing synthetic missing-basis fixture now also supplies the same unknown basis through the dated history response. Original root and instrument missing-FX/basis, value, empty/error/retry and privacy checks remain; no oracle changed. |

## Next proof and risk boundaries

1. Independent capable whole-diff review of repository/API/date/FX/account
   rounding/basis and explicit savings identity, including these adapters.
2. Once the coordinator releases the sole focused VM, run remote formatter,
   scoped lint/full type and targeted literal API/model/axis/old quote tests.
   Preserve a raw formatter patch outside Playwright's cleaned output folder.
   Prove the new history GET fails with the old endpoint before restoring the
   exact source. Prove the strip is absent with old savings detail before
   restoring it. A missing export/type error is not meaningful RED proof.
3. Focused three-profile new detail cases plus existing quote/trade/dirty/back,
   native FX and savings/Undo tests. Inspect actual viewport images, all financial
   literal failures, marker/basis/date gaps, page geometry and narrow labels.
   No protected expectation, timeout, skip or retry may be relaxed. Source reuse
   does not establish any of these runtime outcomes.
4. Only then may the coordinator authorize source push/PR/full exact-head CI and
   canonical integration/publication. Rebase/merge the then-current verified main
   only under checkout ownership handoff. #544 being in this base does not imply
   it is live; #546 remains outside this package until separately unblocked.
