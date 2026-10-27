# Plan month overview — #591 only

Isolated checkout `C:/Users/fabia/wt/month-overview-591`, branch
`codex/month-overview-591`, based on verified live main
`a820e56bb354e336f4b3c2aa81fcddfd9ed8f689`. D/PR792 and B/#597 are untouched.

## Authority and extraction boundary

Issue591 and parent450 owner comments6176446296/6209536493 govern this package.
The 16 October defaults override the older parent body: Monatsüberblick and
50/30/20 open; income/targets, budget-account money and waterfall closed. Device
choices persist. The full header remains available to expand the side list on
desktop as well as phone.

Referenced source checkpoints d785b65eef4f01d17389c5697af76c903aeb181a and
49402a1af32ec506696abb9e9225fae7b3c50fe4 are absent from the local object store.
Read-only older inspector sources contain the existing446 structure, not those
completed591 changes. This is a narrow implementation on current live source;
no old mixed checkpoint or whole router/page was transplanted.

Root considered a coherent591–593 package, then explicitly retained591 ONLY:
the current canonical quickAssignPlan/mode transport has no reset mode for592's
required fifth action. Implementing that contract cannot be hidden inside a UI
batch. No automatic-assignment rows or selected-category redesign is included.
Parent450 remains open. Existing selected-category controls and money calls
are unchanged, apart from their surrounding no-selection branch extraction.

## Read-only figures and clarified coverage

- The four monthly terms sum ALL already-loaded canonical envelope fields:
  carryCents + assignedCents + activityCents = availableCents. The old displayed
  summary.carryInCents is prior unassigned money (categories.test.ts independently
  proves that), so it cannot serve as the envelope chain's first term. No TBA,
  activity, rollover, card or other canonical calculation is changed.
- Next month reuses its visible batch view when present; otherwise it reads the
  existing budgetQuery(next month), with the existing query key/invalidation and
  endpoint. No new API, DTO, target engine or writer. A mismatched/stale month is
  unavailable rather than silently showing the current month's targets.
- Root resolved the mixed-funding contract from existing targetNeed and
  sinking-fund coverage: per targeted envelope, covered is min(max(assigned,0),
  goal); goals and canonical needs are summed independently. Excess in one
  category never covers another's missing amount. ANY positive need takes
  wording priority; excess is shown only after all target needs are met.
- Literal goals10000+10000/assignments15000+5000 are75% covered with5000 missing.
  Percentage uses exact integer arithmetic and floors, so99999/100000 remains99%
  with0.01 EUR missing. Negative assignment can have need greater than goal;
  covered clamps to0, canonical need remains intact.
- Zero total goals means no percentage or progress denominator. No targets is
  distinct from targets requiring no new assignment after carry/refill; a
  zero-goal/positive-need target explicitly still shows the missing cents.
- Shared amount privacy masks monthly terms, target percentage and difference;
  the target progress value is not exposed while amounts are hidden. All new
  styles use design tokens. The now-default-open50/30/20 comparison link gets
  the existing44px touch token.

## Persistence and navigation

One allowlisted localStorage object stores whole-frame collapse and the five
section booleans per device. Malformed/non-boolean preferences fall back to
defaults. Native details/summary retain keyboard behaviour, and the main collapse
button exposes aria-expanded/controls. Account-money contents retain their
original element and summary, with only remembered open/toggle state added.

The existing Underfinanziert income jump also expands a collapsed whole frame
before opening/focusing the original inspector-income target. Focus waits for
the frame's visibility commit; no timeout, scrolling or financial handler changes.
The selected-category envelope, quick assignment, cover and Undo remain intact.

## Per-test-file rationale

- New plan-overview-591.test.ts: real fresh in-memory ledger with fixed account,
  opening envelope amounts, assignments and split spending yields literal
  1600+4600−2100=4100 cents. Independent under/equal/over/mixed/negative/zero and
  one-cent-short target cases, safe-cent guards and sums. Financial test-first
  checkpoint7ec4f3a7 precedes implementation.
- New plan-overview-state-591.test.tsx: real native disclosures, complete default
  states, remembered collapse and all sections across remount, malformed storage,
  literal monthly and target wording, last-cent and zero-goal privacy states.
- New issue-591-month-overview.spec.ts: actual SAMPLE Plan page, independently
  controlled canonical next-target DTO for the mixed-funding fixture, all three
  configured profiles and both themes. Monthly displayed-term identity,
  75%/50 EUR missing, default desktop side/grid geometry, Axe, no overflow,
  44px controls/links, privacy restoration and viewport screenshots. Reload proves
  device state; a collapsed-frame income jump preserves the original focus target.
- budget-ui.test.tsx: ONLY two old no-selection summary selectors change from
  Monatsüberblick to Monatsaufstellung. All selection, category editing, Escape,
  focus return, quick assignment, money and income-jump assertions remain.
  Independent HIGH review additionally identified the old captured inspector
  HTMLElement becoming detached when selection changes the inspector root. A
  getter now reacquires the LIVE complementary region for every original within
  assertion/action in that one test, including the unchanged absence-of-assignment
  assertion after amount editing. No expectation, timing or coverage is relaxed.
- issue-571-heute-kennzahlen.spec.ts: ONLY the old overview available-row locator
  changes to the new Monatsaufstellung container/Verfügbar label. The exact
  cross-page Heute/Plan available amount and all TBA/net-worth oracles remain.
- plan-activity-735.test.tsx: the new next-month GET previously fell through the
  old test stub to `{}` with status200. The raw stack at NextMonthCoverage showed
  undefined summary.month and the router error boundary, before the second row
  could be selected. Add an explicit valid November empty-target DTO only; all
  original two-row selection, unrelated group collapse, Back/source month and
  GET-only assertions remain. No selection handler or timing change.
- plan-compact-grid.spec.ts: owner450 comment6209536493 requires BOTH month and
  50/30/20 open. Replace the obsolete count1 with exactly2 AND their exact named
  summaries, preserving every existing unrelated-group, row/cents, geometry,
  keyboard, selection, multiple-month and focus assertion. No blanket count
  relaxation or change to the owner defaults.

## First focused proof and source-grounded corrections

Exact943 focused40512927930/job122219087488 returned format1/lint0/type0/css0/
unit1/build0/overview1/parity0/compatibility1. Old571 cross-page parity passed6/6.
The new browser case reached its final income-jump selector in all3 profiles
after its financial, privacy, both-theme Axe/touch/no-overflow, persistence and
desktop geometry assertions. The selector matched both the header money action
and the filter pill; scope it to the intended plan-topbar action without first,
force or any assertion change. The account fixture lacked required role; add
only role=budget and retain literal1600+4600−2100=4100 unchanged.

The full8-path formatter patch from artifact12738341431 was inspected, its SHA256
ff298fd107da667a45d610cb6287972bf17f9252f50a94db6b7a30fef6c7253d verified and
git-apply checked on clean943 before mechanical application. It changes wrapping,
indentation and parentheses only; no finance literal, handler or oracle changes.
No evidence image or baseline is part of that allowlisted patch.

Raw trace geometry (before the end-of-case selector failure), both themes:
side320×812, main grid788×1998 at1440×900. Top y values were175.6875/light and
88.6875/dark as the page scrolled. Thus the actual side<=grid height assertion
passed; these measurements do not claim the whole side content fits one screen.
Actual desktop-light and WebKit-dark viewport images were inspected. The shared
AllocationBar target tick labels appear crowded at this sample's unusually high
assignment/income ratio; that existing chart was not redesigned in these fixture
and selector corrections and should remain visible to independent visual review.
All original timeouts/retries/skips and financial/focus/Undo oracles remain.

## Evidence limits and next steps

No local Node/npm/build/test/browser/install/lint or formatter was run under the
host RAM restriction. The exact943 focused result and its limitations are above;
the corrected checkpoint is not yet runtime-validated. No public source push/PR
or full CI. Independent capable HIGH delta review precedes one narrow proof of
the affected units, new complete591 browser case and old compact-grid case.
Reuse unchanged static/571 and head-browser passes only by content identity.
Preserve exact cents, privacy, Axe, touch, no-overflow, timeouts, retries and skips.
Retain and inspect any formatter patch outside browser cleanup. The two existing
587 evidence PNGs changed inside the disposable proof; neither is a comparison
baseline or part of this source branch/formatter patch. Publication remains
coordinator-owned.

Refs #591

## Default-open allocation label visual correction

Independent HIGH visual review of the retained desktop-light and WebKit-dark
viewport PNGs found the shared AllocationBar target labels overlapping at the
SAMPLE 901% income scale. Tick separations around9.5px/6.3px cannot fit the
unchanged token-sized50/80/100 labels on a single horizontal row.

The correction is CSS-only and scoped to `.plan .split-band`: reserve three
label rows and stagger the three existing labels vertically with token-sized
line height plus4px separation. Tick left positions, label horizontal anchors,
all three literal targets, shared report CSS/component, chart widths/calculations,
legend, overflow statement and aria text remain unchanged. No fixture/collapse,
font shrink, hidden data, financial writer or persistence change.

Per-file regression rationale: issue-591-month-overview.spec.ts adds literal
50/80/100 target text plus positive-size, horizontal containment and pairwise
nonintersection bounds in EACH existing theme/profile. It attaches actual label
geometry to the proof artifact. This supplements every existing financial,
privacy, Axe,44px, side/grid-height and focus oracle; none is removed or relaxed.
The old single-row source fails this new nonintersection gate in the retained
actual high-ratio state. Exact changed CSS/runtime remains unproven until the
reviewed narrow remote retry; no local Node/browser/build/test/formatter ran.
