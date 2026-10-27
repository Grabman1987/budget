# Report view consolidation 622/623 — private source checkpoint

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
