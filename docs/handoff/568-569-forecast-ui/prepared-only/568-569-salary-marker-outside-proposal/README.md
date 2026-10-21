# #568/#569 salary provenance candidate — UNEXECUTED, NOT ADOPTED

Source-only follow-up against pinned `5a6f6bcdafe9daa110bf0e5402a62c42c2f96bdf`.
Only the two source paths in `source.diff` change. The original eight-source feature remains the prerequisite;
this packet neither replaces its router nor includes the controlled-Werkzeuge prerequisite or other packets.
One NEW pure test is supplied; existing NEW UI/native and domain/API test files remain untouched.

## Concrete defect and bounded fix

The actual synthetic UI/native fixture starts 2026-09-17 at 100000 cents, debits 30000 on Sep27,
and receives a configured salary of 9000 on Oct07. Forecast low stays 70000/Sep27 and balance becomes
79000/Oct07. `movementMonths` hides that salary below 25000 and folds 9000 into October rest.
The old `salaryDay` therefore loses a known salary marker. The fixture is deliberately not inflated.

Add required `LiquidityReport.scheduledInflows` with `{day,cents,ref}` for positive, referenced income/fixed
items read from the already-produced `withEvents.days` within the selected horizon. That day sequence is
chronological, day0 contains no applied items, and day35 is inclusive. Events and sweeps are excluded even
if a malformed input carries a ref; zero, negative and unreferenced items are excluded.
`salaryDay` chooses the first of those real occurrences whose payment ID is configured as salary.
No name matching, balance-difference inference, alternate query, extra forecast run, threshold change,
new salary configuration, or planned-event substitution is introduced.

The pinned `forecastInputs` already uses `scheduled(..., {applyIncomePauses:true})`; `scheduled` already
resolves effective versions/date shifts and excludes skipped/missed occurrences. Pauses contribute zero.
This packet consumes that effective stream and does not alter those semantics. Restoring/skipping/Undo
continues through existing query invalidation and occurrence logic. `liquidityReportView` returns the whole
domain report directly; the API already serializes it. No DB/API/schema/formula changes are needed.
All run calls, points, lows, buffer/plain calculations, levers, movement rows and rest arithmetic are unchanged.

## ONE NEW test, no execution

`liquidity-salary-provenance-568-569.test.ts` has one `it` and calls the real pure domain report and selector.
It specifically asserts the literal 9000-cent receipt/ref and Oct07 marker despite absence from movements,
unchanged 70000 low/79000 receipt balance/9000 rest, empty/unknown salary IDs, zeroed and absent receipts,
event/unreferenced/negative exclusion, day0/day36 exclusion and inclusive day35.
It accepts already-resolved zero/omission; persistence/version/skip/Undo acceptance remains in the existing
NEW real API/UI/native packet, not duplicated or claimed here. No tests, builds, types, lint or runtime run.

## Explicit adoption risks and existing-test adapter

Required report shape adds an API field: deploy backend/frontend together and inspect any handcrafted mocks
or schema/snapshot consumers during the future adopted lane. No legacy `movements` fallback is supplied:
that would preserve the threshold-dependent source of the defect rather than require actual provenance.

Pinned OLD `apps/web/src/reports/liquidity-lowpoint.test.ts` has a salary-only fixture (around line84)
cast via `as unknown as LiquidityReport` with only `startDay` and `movements`. Its three salaryDay assertions
will dereference absent `scheduledInflows`. The required future adapter is a fixture-only relocation of its
existing three chronological rows to `scheduledInflows`, keeping day/cents/ref and ALL expected results
unchanged; movement-only fields `planned` may be omitted there. No arithmetic, expectation or tolerance
change is justified. This packet does not edit it or prepare an OLD applied candidate. Root owns the
existing-test authorization/review process. This is an additional OLD-fixture adapter beyond the prior
Werkzeuge relocations, so the combined future source is explicitly not ready/green until addressed.

The two source copies, originals, NEW test, forward/inverse diffs and this rationale are SHA256-bound by
`manifest.json` and sealed read-only with `SHA256SUMS`. SHA computation/source inspection is artifact
preparation only, not a compilation/test result. All repository source/branches/tests remain untouched.
