# Portfolio follow-on source checkpoint — #546 / #547 / #548

**NOT VALIDATED / NOT LIVE.** No local Node/npm, tests, build, browser, install,
lint or formatter was executed. The initial source-only checkpoint subsequently
received independent HIGH review and one disposable focused Cloud proof, which
was RED. Its actual results and the unvalidated repairs are recorded below.
The feature branch has not been pushed and no feature PR, merge or publication
was requested. A successful partial check is not package acceptance.

Isolated checkout: `C:/Users/fabia/wt/portfolio-followon-547-548`, branch
`codex/portfolio-followon-547-548`, immutable base
`98f650cf6e2ae811a4e7686f0095f2e08626ffe5`. B/PR788 and A/#596 are owned by the
coordinator and were not edited. The report, return/benchmark calculations,
register routing, savings execution proposals and financial writers are excluded.
The coordinator verified #544 live at `5fb4d84f36aa9a8da82fbf525c22d0ea97006a63`
through canonical release `40476633728`; this separately cleared #546's dependency.
It does not validate any follow-on source in this checkout.

## Recovery and scope

Read-only recovery source: `slot-a-portfolio` at `a14567cb` and its bounded
`ce1e67b1`/`093228b8` feature work. No mixed commit or parent stack was
cherry-picked. Before copying the five #547/#548 component/model files, each
current base blob was compared with the old feature base `4ea2f4ad`; all matched.
The date read/API/controller and small corrected EUR-axis helper were integrated
selectively. Current #544 router/page/register and contextual return code remain.
Historical source-only reviews are not acceptance evidence for this adaptation.

- #546 replaces only the already-routed Kennzahlen placeholder with the existing
  `portfolioPerformanceQuery(period)` and existing report formatters, glossary,
  source disclosure and quality cues. TTWROR period/annual and XIRR share the
  exact report response; benchmark series/period/base/gaps come unchanged from
  that response. The only displayed comparison arithmetic is the existing
  portfolio-minus-benchmark difference in percentage points. There is no
  Modified Dietz display, new benchmark default, engine, setting or write.
  TTWROR and XIRR are beside one another; risk figures retain the report's
  0.5% volatility availability guard and existing glossary explanations.
  The collapsed cash-flow table explicitly displays daily actual after-tax
  deposits/withdrawals, distinct from TTWROR and XIRR return-flow bases.
  This selectively reuses only the old `portfolio-metrics.tsx`; no old router,
  report or broad stylesheet was copied. The small new stylesheet uses existing
  color/type/spacing/line tokens and wraps the shared period control on phones.

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
  rows. Both themes/Axe/phone44px/nooverflow and desktop savings≤1800px, with viewport
  PNGs. Default CI issue-spec selection includes all three required profiles.

## Existing-test adaptations requiring independent review

| File | Reason and retained coverage |
| --- | --- |
| `apps/web/src/wealth/price-history.test.tsx` | Provides the real shared controller and an independent empty history DTO, deterministic DOM width/ResizeObserver for the responsive chart, and explicitly selects native Kurs. All original inclusive range point counts, exact4.123456 USD/date, empty and503/retry assertions remain. |
| `e2e/report-polish.spec.ts` | Explicit native Kurs selection plus renamed shared range group; original range point counts,44px, exact native price/date/pointer/keyboard and report checks remain. |
| `e2e/portfolio-positions.spec.ts` | The existing synthetic missing-basis fixture now also supplies the same unknown basis through the dated history response. Original root and instrument missing-FX/basis, value, empty/error/retry and privacy checks remain; no oracle changed. |

## Added #546 proof cases

- `apps/server/src/api/portfolio-metrics-546.test.ts` exercises the unmodified
  canonical report GET. Independent year-long fixture: opening10000 cents,
  final-day buy10000 cents, closing22000 cents. TTWROR is10%, annualised10%;
  final-day contribution nets against the end value for20% actual/365 XIRR.
  The test spells out those literal results without invoking a production
  calculator to manufacture expected values. A fully quoted synthetic benchmark
  shares Dec31 endpoints and starts at100/ends105. Removing the final weekday
  quote leaves its final point and return unavailable, not interpolated; clearing
  the saved selection leaves it empty. Trade and audit snapshots stay unchanged.
- `e2e/issue-546-portfolio-metrics.spec.ts` uses the same independent synthetic
  cents, confirms all three report metrics and the same-period report link,
  literal5% benchmark and5Pp difference, actual100 EUR daily flow and its
  different basis label, keyboard glossary, both themes/Axe/44px/no page overflow
  and viewport images. Missing benchmark close and empty selection remain
  visibly distinct. The issue-spec file is eligible for all three required CI
  profiles. These are new tests; no existing #546 test oracle was modified.

The test-only checkpoint precedes the #546 component changes. No runtime RED
or GREEN is claimed. A meaningful future RED is the original Kennzahlen
placeholder failing the new metric/flow/benchmark assertions, not a harness,
missing import or fixture failure. Full static checks and formatter remain for
the coordinator-authorized remote proof; no local Node tool was run.

## Incremental parent #525 acceptance coverage after full source review

Independent HIGH whole-diff review of `98f650cf..4a6e347a` found source clear for
focused proof, with two P2 coverage gaps: privacy on new surfaces and opened
compact-state geometry. The following additive changes address the missing
proof; they do not establish a passing runtime result or alter production code.

| Test file | Addition and retained coverage |
| --- | --- |
| `e2e/issue-546-portfolio-metrics.spec.ts` | In each theme, use the existing privacy button (mobile profile menu where applicable), require masked TTWROR period/annual, XIRR, available risk values, benchmark return/difference and opened actual-flow amounts; dates remain visible, flow summary still closes/reopens, then restore original literal10%/10%/20%,5Pp and100EUR assertions. Axe also runs while private. Attach desktop1440×900 geometry and require≤1800px with the original flow table open. A separate representative fixture adds12 monthly100EUR buys, producing13 distinct flow dates; all13 rows must remain present when measuring the open table. The original independent100+100→220 case is unchanged. |
| `e2e/issue-547-548-portfolio-details.spec.ts` | In both themes and both Wert/Kurs modes, open the actual accessible data table, confirm the independent24.69EUR/12.345EUR public values, then require every table value, monetary axis and inspected tooltip value masked, with dates retained and table controls usable. Restore captured public values/axes and close the table. Savings privacy covers next/paid, assigned and missing-month planned amounts, assigned units, expanded manual-purchase units/amount/fees/tax and both version rates, then restores original literals. Existing finance/proposal/immutable-row and editing, themes/Axe/touch/overflow assertions remain. Desktop geometry is attached and bounded≤1800 for all13 instrument trades (chart table closed after privacy inspection) and savings purchases+versions both expanded. Collapsed and expanded savings retain the authoritative desktop1440×900≤1800 bound; phone privacy/Axe/touch/overflow coverage remains. |

These issue-spec files remain selected by the configured desktop1440,
Chromium390 and WebKit iPhone profiles; no timeout/retry/skip/project or original
oracle changed. New screenshots are viewport-only output artifacts, not committed
baselines. Actual heights and first-attempt assertions must be inspected in the
upcoming authorized focused VM before deciding whether a minimal layout change
is needed. No pre-emptive layout change, hidden rows or financial write was made.

## Exact-d3 focused proof and first-attempt diagnosis

Remote run `40481047615`, job `122111152151`, artifact `12722654267` tested
immutable feature `d3bde7bcaa3df73d3cd7b99abb63a279ad872fb5` through disposable
proof commit `5745106b4fea0c7a6791aa2419cb8af5b8a8a149`. The actual feature
checkout was restored clean immediately after dispatch. Canonical Playwright
config, one worker, retries0, snapshotsnone were used; no baseline was updated.

Actual results: ESLint and both builds passed;15 Vitest files/85 tests passed;
formatter and full typecheck failed; final browser84 passed/9 failed. Old history
route RED genuinely returned404 versus200. Old metrics placeholder/old savings
detail RED failed for missing new displays. No runtime finance formula failure
was found. Passing tests do not validate the failing/new-unreached scenarios.

The raw formatter patch was preserved outside Playwright cleanup and verified
at SHA256 `874e297ca5ee8fa0ec6711bc13f8bcbc4106cb686ec08a98686fcf4409fa1e93`.
Its exact9-file allowlist contains only intended TS/TSX source/tests, no images
or evidence. `git apply --check` passed; the pinned patch was applied separately
as `e9e5cfd8`. No formatter ran on the owner's machine.

| Failure class | Evidence and narrow repair / remaining question |
| --- | --- |
| Typecheck | New API test accessed unknown JSON; explicitly type its existing positions DTO. React Testing Library rejects Playwright's `exact` option; anchored `/^Kurs$/` preserves the same exact role/name match. Per-file reason: `instrument-history-547.test.ts` typing only and `price-history.test.tsx` API-compatible exact selector only; all financial, point-count, empty and retry assertions remain. |
| #547 keyboard/hover | All3 profiles returned the identical24.69EUR,2 units,10EUR basis,source,date and labels. `innerText` inserted layout line breaks, while `toHaveText` reads DOM textContent with adjacent tokens. Capture nonempty textContent consistently for full keyboard/hover equality; retain all independent literals and source/date/cost assertions. No finance expected value changed. |
| #546 desktop opened flows | Measured2164px>1800 with all13 representative dates. On desktop only, place the existing metric/benchmark facts beside the unchanged open flow table. All rows, disclosures, labels, controls and calculations remain available; no height clipping or row limit. Actual repaired geometry remains unproven. |
| #548 desktop expanded | Measured1964px>1800 with purchases+versions open. The inspected desktop viewport showed two stacked summary figures with unused width and a4-column/3-row month grid. Desktop-only2-column summary and6-column/2-row strip preserve every month, amount and status while using the available width. Phone layout is unchanged. Actual repaired geometry remains unproven. |
| #548 phone height | Closed-page2132px at390×844 and2184px at390×664 failed my invented2×phone-viewport assertion. Authoritative parent#525 explicitly specifies≤2 screens at1440×900 and separately iPhone no horizontal scroll. Coordinator confirmed this interpretation. Scope the new height assertion to desktop1440×900≤1800 for both closed and expanded states; retain every phone literal, visibility, privacy, Axe,44px and no-overflow check. This technical test adaptation requires HIGH incremental review. |
| Old mobile positions | Entire test reached30s after reload/Back; snapshot is the correct positions URL but performance/instrument reads are still loading. No source error or wrong route is shown. This remains unresolved; no test/time-limit change. |
| Old mobile trades | Entire test reached30s at its final account-link click after the preceding cash/holdings/source/Undo assertions. Snapshot already contains the exact target account link with correct720EUR holding. This differs from the positions loading frame; no unsupported shared cause or flake claim. Test/time-limit remain unchanged. |

The first artifact did not retain trace.zip/network timing. A3-year history may
render thousands of hidden chart-table cells and adds a read on ledger
invalidation, but that is only a source candidate for the two old mobile budgets.
Do not pre-emptively change shared chart rendering, financial queries or timeouts.
The next single bounded focused proof must retain trace:on (retries0) and timing
for those exact two unchanged mobile cases, plus static/type, relevant units and
failed/newly reached3-profile privacy/geometry cases. Reuse the84 prior passing
cases where their source/assertions are unchanged; full PR CI later covers union.
No second VM or feature push is authorized by this repair checkpoint.

## Exact-d5 narrow proof and final test-scope correction

Run `40485150056`, job `122124966637`, artifact `12725057231` tested exact
feature `d5bee3f69f1e2609a0d8418e941a2dd9730dc399` through disposable proof
`9b86f7d2fc28dac92cf249bd2e6ade28cc9a4b03`. Actual scoped ESLint, full type,
15 unit files/85 tests and build passed. Desktop metrics5 passed (3 setups,
2 scenarios), register4 passed (3 setups,1 scenario), details8 passed/1 failed
(3 setups,6 scenarios), and unchanged mobile5 passed (3 setups,2 scenarios),
all first attempt, workers1/retries0/snapshotsnone. Prior84 passing scenarios
were not blindly repeated.

The only browser failure was my added instrument-detail height assertion:
2630px>1800 with all13 trades expanded, after light-theme Wert/Kurs privacy
and table assertions. Re-read authoritative #547: instrument detail is explicitly
outside the five registers, and its own AC specifies price/date/basis/markers,
hover/keyboard, themes/Axe/touch/overflow but no two-screen bound. Parent#525
binds the five portfolio registers to1440×900≤2 screens. Coordinator confirmed
this scope. Remove only the overstrict instrument `compactDesktop` call in
`e2e/issue-547-548-portfolio-details.spec.ts`. Retain all13-row/last12 editing,
literal cents/date/cost/source/parity, both modes and themes/privacy/table/Axe,
phone44px/no-overflow, and every genuine #544/#546/#548 geometry assertion.
No product compression, row hiding, timeout or financial expectation changes.
The historical instrument-height coverage descriptions above document the prior
test, not a remaining acceptance obligation.

Both real desktop repairs passed: the13-flow metrics state retained every row
within1800px; savings trace JSON records closed1276px and purchases+versions
expanded1740px at1440px width, in both themes. Mobile/WebKit #547/#548 privacy
passed. The instrument desktop dark-theme privacy section was not reached after
the overstrict light-theme height failure, so one minimal desktop #547 case
remains appropriate after independent incremental review.

The exact one-file formatter patch has SHA256
`7d9c5cb477b7e4181c42fd3cd68dcaa386f8b55686bab9a9dd2826ef980f38d4`.
Allowlist: only `apps/web/src/wealth/portfolio-metrics.tsx`,4 insertions/3
deletions of JSX line wrapping/spacing; no value, logic, CSS, image or baseline
change. Hash/contents and `git apply --check` were verified before applying it.
No local formatter or other Node tool ran.

Both unchanged old mobile cases passed with trace:on and action timing: positions
trace~21.2s and trades~23.3s including fixtures/hooks. Correct routes, quote edits,
cash/holding/source/Undo and final account-link oracles passed. No optimization,
timeout change or new source cause is established; the earlier30s failures are
not retrospectively declared harmless. Retain exact trace evidence and normal
full CI compatibility gates. Raw narrow logs/traces are preserved outside C at
the source author's `portfolio-followon-d5-proof` temporary directory.

No feature push/PR/rebase or new VM was started for this correction. Independent
HIGH review of the exact tiny delta precedes the minimal final proof, then safe
integration with current verified main and full exact-head CI remain necessary.

## Binding owner page-height clarification and compact default Instrument

The subsequent HIGH review found the more specific binding owner evidence in
`docs/product/page-review-2026-10-16.md:280–288` and owner #525 comment
`6212274696`: Positionen/Instrument/Sparpläne **pages** must fit within two screens
with test data. This supersedes the narrow reading above based on #547's own
issue and the five-register AC alone. Removing all instrument height coverage
was too broad. Instrument height remains a required acceptance gate.

The owner also explicitly requires the routine list to show the last12 with
“Alle anzeigen”. The normal compact state is therefore12 visible trades, default
Wert mode, chart data table closed; it is distinct from deliberately expanded
all13 and the opened accessible data table used in privacy checks. No trade rows
are collapsed below the required12 or hidden to satisfy height.

`e2e/issue-547-548-portfolio-details.spec.ts` now measures this real default state
at1440×900≤1800 in **both themes before clicking Alle anzeigen**, after verifying
12 rows, the loaded synthetic account and closed chart table. Viewport PNGs and
geometry attachments are produced. Then the original all13, actual pointer and
keyboard editor opening, literal value/date/basis/source, mode switching,
hover/keyboard parity, privacy/table, Axe,44px and no-overflow checks continue
unchanged. No timeout/retry/skip or financial expectation changes.

The measured expanded13 state was2630px. The previous source stacked4 metadata
rows, two action buttons, quote, chart, dated holdings and trade history in a
single desktop column. Removing one short row cannot account for its830px excess.
The minimal real desktop adjustment adds presentation-only wrappers in
`portfolio-panel.tsx`: metadata uses4 columns, actions share one row, and the
unchanged valuation/chart/dated-holdings content sits beside the unchanged trade
history and quote action. Every original node/handler/data expression is retained;
`git diff -w` isolates the wrapper additions. The table keeps its existing labelled
horizontal scroller rather than losing columns. The phone wrappers use
display:contents, preserving the prior single-column visual/DOM reading order,
spacing, controls and modal forms. Only desktop≥981px uses the new grid; all
spacing/type/line/color choices are existing tokens. Actual final default height
and responsive screenshots remain unproven until the next scoped Cloud proof.

Test-first checkpoint `db84df21` restored the default-state gate before source
layout changes. No additional intentional-RED VM is needed solely to restate the
source-proven geometry risk; the coordinator authorized the minimal source fix.
Independent HIGH exact final delta review is required before one focused
Instrument proof (both themes/default height plus retained full desktop case,
responsive coverage as the final source delta warrants). No full CI, feature
push/PR or current-main integration is authorized by this checkpoint.

## Next proof and risk boundaries

1. Independent capable whole-diff review of repository/API/date/FX/account
   rounding/basis and explicit savings identity, including these adapters.
2. Once the coordinator releases the sole focused VM, run remote formatter,
   scoped lint/full type and targeted literal API/model/axis/old quote tests.
   Preserve a raw formatter patch outside Playwright's cleaned output folder.
   Prove the new history GET fails with the old endpoint before restoring the
   exact source. Prove #546's original metrics placeholder lacks the new
   literal displays. Prove the strip is absent with old savings detail before
   restoring it. A missing export/type error is not meaningful RED proof.
3. Focused three-profile new detail cases plus existing quote/trade/dirty/back,
   native FX and savings/Undo tests. Inspect actual viewport images, all financial
   literal failures, marker/basis/date gaps, page geometry and narrow labels.
   No protected expectation, timeout, skip or retry may be relaxed. Source reuse
   does not establish any of these runtime outcomes.
4. Only then may the coordinator authorize source push/PR/full exact-head CI and
   canonical integration/publication. Rebase/merge the then-current verified main
   only under checkout ownership handoff. #544's separately verified live
   publication cleared #546; #546–548 remain unvalidated and unpublished here.
