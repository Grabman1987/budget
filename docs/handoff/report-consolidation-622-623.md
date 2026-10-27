# Current integration checkpoint — #622 / #623

Source-only integration onto immutable reviewed public #621 head
`40272523402c976e5bafdf4fed385cc632c13fa7` in the new isolated
`report-consolidation-622-623-integrated` checkout. Original duo and #621
checkouts remain untouched. No public PR, Cloud proof or acceptance is claimed.

Only the reviewed 14-path delta from #621 `01fc37fa` to duo `2401c9d8`
was applied. The complete 58,039-byte owned patch has SHA256
`4e7f2f43e346d38390582f12c90d15b387cfc45067ba88afb9ecc4d2154d9f6f`;
whole `git apply --check` passed before application. No whole old stack or
mixed ancestry was adopted.

## Integration choices and identity evidence

- `report-views.css` is the sole incoming/owned path overlap. Keep the ENTIRE
  current #621 stylesheet prefix byte-for-byte, including its desktop second-row
  Income grid and phone stack/auto-height controls; append only the reviewed duo
  titleblock/phone wealth-switch rules. Current Income controls live below the
  titleblock, so the duo titleblock rules do not move them back into the header.
- `report-search.ts` had no new incoming delta since #621 `01fc37fa`. Its exact
  reviewed duo blob adds recipient and five spending/wealth presentation values
  while preserving project/invalid-project, server saved-view ID and `exakt`.
- `reports-pages.tsx` keeps the current #621 dispatcher and all old report
  branches; only the two owned spending/wealth branch substitutions are applied.
- All 13 non-CSS owned blobs initially match reviewed duo `2401c9d8` exactly.
  This handoff receives only this integration note afterward. Every incoming
  changed path outside the 14 owned paths remains exact public #621 `40272523`.
  The external `blob-comparison.json` records the complete path inventory.
- All API/cache/project fail-closed, DB/domain money/FX/unavailable producers,
  shared report controls slot and Income-specific layout remain current #621.
  Strict integer-cent formatter stays intact; only the previously reviewed
  generated currency-axis label rounding is added. No data/tooltips/CSV/domain
  rounding is introduced.

No test oracle was adapted for integration. New #622 and isolated light/dark
#623 cases, phone text containment/nonoverlap, all literal cents/FX/CSV, legacy
bodies/URLs and prior per-file test reasons remain reviewed duo content. Prior
candidate proofs are relevant only by these blob identities; final integration
review, dependency publication and exact-head required CI remain outstanding.
No local Node/build/test/browser/lint/formatter was run under the resource limit.

---

# Report view consolidation 622/623 â€” private source checkpoint

This isolated packet is based on immutable reviewed candidate 621 source
01fc37faf4da1f78dd44ed2ad4bfe1fc6193497a, not a LIVE dependency claim. Keep 621's
API/cache correction separate from this small presentation packet by default.
Neither this packet nor its archived reviews establish runtime acceptance.
No public PR, Cloud dispatch, old test adaptation or baseline update is included.
Parent owner mapping is #487 comment6212523787; the report-template <=2-screen
criterion is docs/product/page-review-2026-10-16.md:333. Redirects remain #620.

## Verified recovery and scope

Archive 622 ref handoff/622-spending-payee-view-20261021 is
99931e6a711a308fa47540c8c02108b436a9d034. Its 13427-byte owned patch SHA256 is
355f5ef476c56ee0d402f86c17a37db3b7b017abf14e149ec719ed8e8e01408b, from historical
2be8458390912470bd0260580a5b55547cc158e0 over 28c5a2124e99a9ec3bee1a2911a07143a9652492.
Archive 623 ref handoff/623-wealth-report-views-20261021 is
c48d8f1449273571782d5e75e2ead772274dcff7. Its 12450-byte owned patch SHA256 is
256b3f6b14c3e6e1f6ce73292e99c5654daf59c4b94291bb1d31ff9e8883a8f6, from historical
8286d82cc689addd5a71b939ec599e5f89122ae9 stacked on 2be8458390912470bd0260580a5b55547cc158e0.
Every manifest-listed packet entry was checked by exact bytes and SHA256.
The preserved whole-seven reviews (SHA256 93f11c51b8a446837f187058d6172546c46e7fdb9608d58713daf7c91f30a357
and f96b816c18045d245e68aa03f6760b6ed23e1814cbd04a87cc6a94fc7e3d1954) were read as
historical source evidence only. No original/mixed ancestry was replayed.
The current root's source-only authorization supersedes the archived pause.

Adoption was selective, in order 622 then 623:

- Apply only the owned payee control/selection hunks and two new wrappers, and
  the three wealth bodies' optional header-control props. Existing legacy
  direct routes retain their local selection/default periods until 620.
- Merge dispatcher imports/two dispatches manually with current Hub and 621.
- Union darstellung's eight known values and bounded empfaenger with every
  current search field, preserving ansicht server IDs, exakt boolean/string,
  projekt/invalid marker, category/group filters and source-cell fields.
- Retain 621's existing CSS and add only the archived scoped header wrapping
  and phone/coarse control touch floor. Do not replace the shared stylesheet.
- Merge spending's optional control/period callback into the CURRENT source,
  retaining its later restored canonical verdict, grouped financial body and
  exact-window Explorer handoff. Skip obsolete ROADMAP claims of no tests.

The five monetary/detail tails were compared to this packet's immutable base
(normalized line endings) and are unchanged: payee ReportBody, grouped spending
from CategoryRow onward, AssetsDebts Body/Breakdown, WealthHistory Body, and
WholePicture Body/CSV/chart. No API, query identity, DTO, domain/DB calculation,
writer, schema, FX policy, lock, audit, grouped Undo or saved-view CAS changes.
The three original 621 reader options/fail-closed guards remain intact.

## Acceptance and meaningful new tests

- apps/web/src/reports/report-consolidation-622-623.test.tsx uses the real view
  wrappers and URL validator, with original bodies isolated. It checks one
  selected body, controlled recipient state and atomic explicit-period reset,
  unchanged filters/server-ID/exact/project union, malformed IDs, no mount URL
  rewrite, and the CURRENT reader's literal Alles/YTD/1J fallback only on a
  real wealth-view switch. Explicit August and selected month remain exact.
- e2e/issue-622-623-report-views.spec.ts uses isolated real ledgers and original
  readers. Payee literals are independently 10001 expense minus 501 refund =
  9500, plus 20000 = 29500 cents, with two recipient-A detail bookings and an
  unchanged legacy direct report. It checks canonical grouped/payee figures,
  keyboard selection, period/recipient/filter preservation, refresh/Back,
  deliberate period selection clearing, privacy and current Fazit visibility.
- The same E2E file separately checks fixed August wealth: 100000 EUR cash minus
  20000 debt plus 10000 cost fallback plus 9000 converted USD = 99000 cents;
  assets are 119000 and debts -20000. Three original API results and legacy
  history/whole-picture routes must match the new original-body views. All
  three show the existing estimate mark; CSV retains exact estimated cents,
  period/month survives view changes/reload/Back/Forward, and deleting FX rates
  produces each original unavailable state without a fabricated zero.
- Both complete cases use canonical desktop/mobile/WebKit configuration, both
  themes, full-page Axe, no horizontal page overflow, >=44px view controls on
  phone, the parent owner's <=1800px desktop report bound with these loaded fixtures,
  and bounded viewport screenshots. No timeout/retry/skip is added.
  No old financial, source, privacy, write or Undo oracle is weakened.

## Existing consumer preflight and remaining gates

Read the old payee-analysis-report, assets-debts-report, wealth-history-report,
whole-picture, verdicts, report-polish and issue-554 browser consumers. Their
financial/body selectors and direct routes remain; additional header fields do
not change their asserted table/chart counts. Payee direct entry remains local
state and exact old heading. No deterministic old-test adapter was identified.
Relevant old fixed-period/source/pagination/privacy/valuation tests must join
bounded runtime proof after independent full-diff HIGH review. This inventory
is source evidence, not a claim that old tests passed.

No local Node/npm/build/test/browser/install/lint/formatter was run. All new
source/tests await formatter/type/lint/units and candidate browser proof.
Independent HIGH review, predecessor LIVE gates, safe final integration and
required exact-head full CI/production verification remain. Keep 620 redirects,
all-16-report completion and parent-epic closure outside this packet.


## First candidate proof and measured chart repair

Exact 6f82288f proof 40588470272 was honestly RED: ESLint/CSS/build passed;
10 unit files passed all 47 cases; old compatibility passed 28 including three
setups, and the preserved spending verdict phase passed five including three
setups. New 622 passed all three canonical profiles; new 623 failed in all three
before reaching its view/theme loop. Baseline/tracked mutation guard passed.
Types failed only on three unsupported Testing Library exact options in the new
unit. Remove those options only; literal string names remain exact by default,
and every original URL/body/assertion remains.

The missing WholePicture cell was a REAL inherited render error, not a selector
problem. Retained error-context DOM showed the router error boundary. Its trace
console records RangeError: Cents must be a safe integer, got 99000.5. The single
99000-cent month yields a one-cent D3 drawing domain with a fractional half-cent
axis tick. Passing that generated tick into the strict EUR formatter crashes
the original legacy report as well as the new view. APIs already returned the
literal 99000/119000/-20000 totals; do not change fixtures or money assertions.

WholeChart now rounds ONLY generated upper-axis label inputs to integer cents
before the existing whole-EUR renderer. The strict formatter guard, domain,
line points, tooltip values, source facts, table/CSV, FX and quality remain.
Exporting the existing presentation component permits the actual drawing to be
rendered in the existing whole-picture-report.test.tsx. Its two additive literal
regressions cover a flat single 99000-cent month and a narrow 99000/99001-cent
series, exact one-point line geometry, unchanged input integers and exact
estimated 990,00/990,01 EUR keyboard tooltip values. Original verdict tests are
unchanged; only the measurement hook is mocked to supply a real chart width.

The durable remote format patch is 11 intended source/test/CSS paths, SHA256
267ef9493c4992bd904d6644c1c2278b277520504e506a72f8f1afeb59a81157.
It passed apply-check on clean 6f but no longer applies as a whole after the
functional unit corrections. It has NOT been partially or blindly applied.
The next necessary reviewed candidate proof must capture a fresh final whole
format patch if needed. No local formatter, Node, build or test was run.
This correction awaits capable independent HIGH review and scoped runtime proof;
no public PR or acceptance is claimed. The above body-identity comparison now
has this explicitly bounded presentation-only WholeChart exception.


## Rendered phone selector correction

Proof 40591087605 verified exactly three actual feature selections by --list
(desktop/mobile/WebKit), then passed all three complete 623 cases first attempt
plus three setups. This covered both themes, exact original money/FX/estimate/
CSV/unavailable and existing accessibility/44px/no-page-overflow assertions.
Lint/types/CSS/build and tracked-file guard passed. A second mechanical Prettier
wrap remained in WholeChart; its exact one-file patch SHA256 is
33a4349e3c47d7a951d2e6aad2eae5669b40d23f2bc0849f38d36a3204998514.

Nevertheless actual WebKit dark viewport review showed a REAL visual defect:
three long wealth-view labels overlapped and wrapped outside the fixed-height
buttons. The shared Segmented primitive is inline-grid with column auto-flow,
so the archived flex-wrap rule did nothing. Text wrapping plus min-height44 did
not allow the label area to grow. This is not a waived or accepted layout.

Only the wealth wrapper now adds report-wealth-switch. At phone widths its
selector uses one grid column/row flow and auto-height buttons with the same
44px floor. Desktop and all other selectors (Plan, Hub, 621 and spending) are
unchanged. No option, selected state, navigation/keyboard handler, data or money
semantics change. The existing 623 E2E now also measures each visible button's
real DOM text Range in every phone view/theme. It asserts all three literal
labels, each text rectangle inside its own button, and pairwise text rectangle
non-overlap; geometry JSON is attached. The original money/privacy/Axe/44px/
no-overflow and desktop1800 assertions remain. No baseline is regenerated.

The one-file formatter wrap above is applied only by its exact pinned raw patch
and apply-check, after the CSS/test edits. This source delta awaits capable HIGH
review and one necessary visual/runtime proof; prior financial proof is reusable
only for unchanged financial blobs. No local formatter/test/browser was run.


## Full per-theme case isolation and durable evidence

Visual proof 40592142821 passed desktop/mobile; WebKit reached the final dark
WholePicture privacy restore after all six phone geometry sets passed, then
exhausted the unchanged overall 30-second case budget. Trace Before Hooks began
at 43967ms and After Hooks at 74363ms; final dark privacy began at 74137ms.
Masking and its assertion succeeded, restoration succeeded (unmasked literal
990,00 remained in the failure DOM), and the final close started at 75332ms,
after the overall deadline, with only 381ms before context teardown. An earlier
ordinary no-op balance-tab click spent 3.26 seconds waiting for stable frames;
six full Axe scans took about 6.9 seconds. This is evidence of a case containing
two complete theme journeys exceeding its budget, not proof of a privacy bug or
an excuse to extend/waive timeouts. WebKit late CSV/FX checks were not reached.

Only the NEW 623 case is now generated separately for light and dark. Each gets
its own isolated synthetic ledger and the original 30-second budget. Each keeps
ALL original literal APIs, legacy report parity, all three views, period/month,
phone rendered-text geometry, Axe, privacy mask/restore, CSV, Back/Forward,
reload and missing-FX assertions. Missing-FX pages explicitly keep that case's
theme. No money fixture, check, step, timeout, retry, skip or forceclick changes.
The next proof must --list exactly six feature cases, two themes in each of the
three required profiles, before executing the same unique unanchored selection.

Geometry is also written to info.outputPath as actual JSON files before being
attached by path. Playwright info.attach(body) alone did not persist passed-case
mobile JSON in the uploaded artifact; the failed WebKit trace did retain all
six original attachment bytes, extracted outside the checkout. Future artifacts
must include **/*.json. Existing corrected WebKit/mobile dark viewport bytes
remain retained externally; no new capture or baseline update occurred locally.

The exact 3448-byte one-file formatting patch SHA256
bdc92d73941f1a1ae8a0dd0d21297e11d605cff2fb3b45e0a33d290251cbb003
passed apply-check AFTER the theme split and was applied whole, without changing
its native geometry oracles. This test/docs-only delta awaits independent HIGH
review and the necessary complete six-case proof. Source CSS/axis/financial
blobs remain exactly f10. No local Node/build/test/browser/formatter was run.
