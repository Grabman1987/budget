# #520 persistence correction — independent source re-review

Base: `be9d6e9e331da033edf0aa4c4427cc6bcf61c223`.
Reviewed head: `e73ab07c1d58442c6d645a5ef7558169bf4a7e96`.
Worktree: `/workspace/impl-520-transfer-persistence`, confirmed clean and at that head.
Original review: [520-persistence-source-review.md](520-persistence-source-review.md).

Read-only review of the complete correction delta, the added snapshot relative to 0052, changed DTO rendering and relevant unchanged consumers. No tests, executable validations, build, browser, DB/migration/provider operations or product edits.

## Remaining P2 — Historical valuation fails before the scoped missing-FX flow result

The missing-price branch is now scoped correctly. The missing-FX portion of the original second finding remains incomplete: `portfolio-depots.ts:109`, `portfolio-summary.ts:887` and `portfolio-allocation-report.ts:182` invoke `valuationSeries` before their new fallible flow read. `packages/domain/src/invest/series.ts:495–501` selects the same stored foreign-currency quote and calls `fxOn`, which throws when its historical FX rate is absent. The new `portfolioFlowsRead` catch therefore never runs for this path.

Synthetic source reasoning: eligible EUR accounts A/B, known EUR acquisition basis, a valid pair on day D, a USD quote at D, no USD/EUR rate on or before D, and complete quote/FX evidence at today's date. Current holdings and basis are readable. The historical daily valuation nevertheless throws at D and the entire report still becomes a 503; unaffected depot C and today's known facts disappear with it. This also prevents the new `missing_transfer_fx` display from being reached in this ordinary scenario.

The total return genuinely needs the missing historical valuation in this example, so it must be unavailable too; preserving it by inventing a value would be wrong. Minimal correction should distinguish missing historical valuation from missing boundary-flow valuation, retain independently known current facts and unaffected account returns, and mark affected return/index/contribution fields unavailable with an accurate reason. Do not set missing values to zero, change FX/return formulas, fetch rates, or relax strict valuation. The eager report-series read needs a bounded fallible path at the same reporting boundary; adding only another flow catch cannot resolve it.

This is a remaining coverage gap in the prior scoped FX finding, not a claim that this delta introduced the inherited `fxOn` throw or a requirement to redesign every valuation caller. The correction handoff currently says missing dated price/FX gives the affected field an explicit reason; that claim is too broad until this path is handled.

## Original findings addressed in source

1. **Mixed depot flows:** both flow branches now receive `pairedSecurityAccounts` containing the complete set whose holdings enter the mixed total. An internal pair is removed in both branches before gross aggregation; a per-account comparison retains its actual boundary flow. Cash-only generic reference accounts are not implicitly promoted into this full security selection.
2. **Scoped missing quote:** the typed transfer-flow failure is caught per depot/product; current facts remain in DTOs, performance/index become null/empty, and German rendering names the missing transfer quote instead of reporting no history. Total and independent columns remain computable when their valuation evidence exists. Missing boundary FX is caught within the flow helper itself, subject to the preceding unresolved eager-valuation path.
3. **Tombstone CAS:** both adjacent legs and their accounts enter fingerprint facts and deduplicated latest audit revision keys, including the leg outside the live component. Missing adjacent rows reject the read. Tombstones still do not expand the economic component.
4. **0053 snapshot:** its `prevId` points to the inherited 0052 ID. The textual 0052→0053 comparison contains only snapshot ID/parent changes plus `security_transfer_pair` with the matching fields, five indexes, three FKs and checks. All inherited schema content is preserved. SQL triggers and rollback remain unchanged and unexecuted.
5. **Scope limits:** flow lookup uses selected leg IDs, with an immediate empty-scope return. The dated position probe is account-adjacent. Reader discovery expands account-adjacent explicit pairs and bounds the component/evidence rather than unrelated database totals. Existing live/tombstone membership and financial validation remain in place.

## DTO and Whole Picture boundaries

Changed report pages render unavailable reasons without leaking extra monetary values; depot KPI/index handling tolerates absent performance. Allocation's missing-return explanation is a title on the unavailable cell. Portfolio aggregate and product-history handling retain the corresponding independent facts on a typed flow failure.

The documented **Whole Picture flow** invariant is supported by the source: it selects all live investment accounts, valid eligible pairs have both endpoints in that set, equal leg dates put both inside or outside the time interval, and pair classification removes both before quote/FX lookup. Its second `externalAccounts: budgetAccounts` call does not turn an internal pair into a budget contribution. No new Whole Picture flow catch is required for valid pairs under that invariant. This does not prove all historical valuations are available: its existing net-worth/series reads can still require missing FX independently of transfer flows, as distinguished above.

Outcome: **four original findings closed; missing-price part of the fifth closed; one P2 FX/report-path remainder**. No new owner policy decision identified. No writer/Undo/apply activation or runtime correctness claim.
