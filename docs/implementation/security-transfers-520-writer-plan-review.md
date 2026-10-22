# #520 minimal writer plan — independent design/source review

Reviewed `/workspace/.budget-tools/cloud-control/520-transfer-writer-plan.md` against SPEC-009, the accepted transfer policy in `docs/product/reference-adoption.md`, and source head `a7f67630cfa925ceb3d6d6ab8080a559ac2d43e8` in `/workspace/impl-520-security-transfers`. Consulted the account schema, trade writers, audit/undo, history reader, portfolio cost/valuation/flow consumers and pure scope helper. Applied the local `budget-security-review` profile. Plan/source review only: no code/schema edits, executable checks, tests, build or DB/provider operations.

## Recommendation

Proceed with bounded source implementation incorporating the clarifications below. One audited pair relation is sufficient. No mutable lot ledger, history certificate, external authorization record, separate preview table or extra idempotency table is necessary. Replay-derived FIFO ancestry and average graphs remain the basis evidence; persistent pair membership and immutable ordering make the derivation reproducible. Existing authorization to prepare source does not require another owner approval or a test run now. It does not establish runtime acceptance or authorize activating apply.

The plan correctly preserves zero cash/fee/tax, the approved source-cent residual rule, exact 1:1 units, explicit membership, full suffix replay, original acquisition evidence, grouped rollback/undo and same-key retry after undo. Unique leg membership across tombstones is useful integrity, not excessive storage. Creation-order allocation must include tombstones and check safe-integer bounds. Migration 0053 remains unreserved.

## Concrete implementation gaps

### 1. Make budget eligibility explicit

“Eligible investment account” must include `onBudget === false` for both endpoints, not only `role === 'investment'`. `schema/accounts.ts` explicitly says role does not determine budget membership; its CHECK excludes only tracking-only account types. An otherwise valid checking/other-asset account can have investment role and be on-budget. The current history reader and `trades.ts::investmentAccount` check role/currency only.

For the initial no-envelope-action scope, reject on-budget endpoints instead of inventing a category or cash movement. Define one eligibility predicate for live account/security, supported currency, account date eligibility and the established closed-account write rules. Apply it to preview/writer and relevant account changes/undo. Historical reads should not discard old valid pairs merely because an account is now closed. This is a routine narrowing to the approved scope; no new financial decision is needed. Budget-boundary transfers would be separate scope.

### 2. Define exact read consumers and separate projection from mutation eligibility

The plan correctly identifies the canonical cost issue, but “relevant projections” needs a concrete integration list:

- `portfolio-summary.ts::positionCost` and `realizedByPosition`, including sold positions and snapshot redundancy, must use pair-aware dated replay for affected components. Zero-value incoming deliveries must not become zero-basis purchases; later sales consume transferred basis.
- `portfolio.ts::holdingValuationRead` and `valuationSeries`/domain `series.ts` cost fallback currently derive account-local basis independently. Wire their pair-aware basis input too. Preserve the distinction between selected analytical cost method and the currently moving-average valuation fallback; do not silently change valuation policy by feeding every consumer the selected-method number. The same pair facts support either existing method without additional persistence.
- `portfolio.ts::portfolioFlows` has separate securities and depot branches; both currently use stored delivery amounts. Replace paired legs with one scope classification per pair before daily/sign aggregation, using `previewSecurityTransferScope` or a shared equivalent. Both endpoints included means no gross deposit or withdrawal, not merely two opposing amounts that net to zero. One endpoint included means signed transfer-date value. This must reach contribution facts, TTWROR gross flows and XIRR across account/depot/security selections. Keep unpaired legacy deliveries distinct.
- Transfer-date valuation is a read input, not acquisition basis or a trade amount. Reuse existing dated stored-price/FX and quality policy; do not fetch quotes during a write, manufacture a value/rate, or populate zero-cash legs with market value. Missing required valuation makes the affected scoped return/contribution unavailable. SPEC-009 forbids quote dependency for basis transfer: missing valuation alone must not invalidate an otherwise proven basis handoff.

Separate read projection from mutation eligibility. `readRecordedSecurityHistory` currently returns `locked` when a reconciliation is at/after the requested date. Reusing that entire entrypoint as the canonical historical reader would hide valid historical figures merely because later history is reconciled. Load/replay facts for reading without a write-lock veto; expose/check those locks for mutations. Reuse one calculation rather than two finance implementations.

### 3. Close before/after component and tombstone boundaries

Live-pair traversal calculates a current component, but cannot alone find everything an edit or undo must validate. Gather affected account/security seeds from both before and after snapshots, expand pre-mutation components, mutate, then validate the union of those accounts and all resulting post-mutation components. Otherwise deleting/undoing the last connecting pair can detach an account with dependent sales and remove it from post-state-only traversal. A trade changing `securityId` similarly affects two securities.

Keep adjacent tombstoned pair rows/leg identities and latest audit revisions in CAS dependency facts for those seeds, even though they do not enter live replay. This preserves change-then-undo detection and rejects one-leg restoration/reuse. Membership expansion must be bounded and repeated in the same writer transaction; a new adjacent pair must change the token. No database-wide traversal or global certificate is needed.

Apply invariants after the complete audit group, including `force`. Pair-aware guards must cover generic `entities.ts` account/security/holding mutations and audit restoration as well as named trade methods. Financial field changes require replay; unrelated labels need not trigger unnecessary financial work. Retain tombstoned membership so independent editing/undo of a formerly paired leg cannot create redo conflict. Preserve current/historical settlement checks from the reviewed reader.

### 4. Specify same-day placement as an executable contract

Immutable creation order resolves pair-to-pair order, not placement among interacting native events. Preserve current native buy-first/per-account SQLite order. Define exactly which mixed-day cases are accepted and which return `ambiguous_pair_order` before generating sequences; otherwise preview and post-insert reread can choose different placements.

A bounded conservative first implementation may reject same-day native/pair interactions for participating accounts where placement is not established, while accepting multiple native events in their existing order and independent native activity. No invented broker timestamp, general scheduling solver, one-native-event-per-day restriction or new order table is needed. The proposed pair order must equal the transactionally allocated order replay validates and persistence records. This is an implementation/evidence boundary, not an owner choice of financial formula.

### 5. Pin intent hash versus preview fingerprint

Document canonical intent fields/version: security, source/destination, date, integer units, normalized optional reference and materially chosen semantics. Distinguish intent from the full fact fingerprint and transport-only preview metadata. Fingerprint is a stale-state condition; the durable idempotency key identifies the original action. Check key lookup, including deleted rows, first inside the transaction: same intent returns current live/undone state, changed intent conflicts, and undo never frees the key. A retry must not create another pair merely because it carries a newly obtained preview.

Bind preview scope/version to exact proposed fields and the full current suffix, not just the asOf prefix. A deterministic request/fact digest recomputed by the server suffices; no stored preview session is needed. Export the relation through the schema barrel for generic audit discovery/restoration. Existing session/origin/write-hold boundaries remain appropriate; no new role, step-up policy or external approval service follows from this plan.

## Implementable order

1. Freeze bounded eligibility, ordering, intent/fingerprint and before/after affected-scope contracts above; keep source/runtime status explicit.
2. Coordinate the migration slot with root, then add one relation, indexes/checks, schema export and journal/snapshot/rollback on the reconciled migration chain. Do not assume 0053 or apply migrations.
3. Extend the consistent reader to explicit pair components, tombstone/revision CAS dependencies and bounded replay; separate read projection from mutation-lock eligibility.
4. Add shared invariants and the guarded atomic repository writer, then join existing mutation and grouped undo/redo paths. Keep activation unavailable while read adapters are incomplete.
5. Route cost, realized gain, valuation fallback and both flow branches through shared pair-aware projections. Preserve missing/unsupported disclosures and existing formulas; avoid per-page recalculation.
6. Add narrow preview/API/UI source through existing auth/undo paths, without caller-authoritative fragments; independently review the concrete delta. Leave executable acceptance and activation/delivery explicitly unperformed under the current source-only/no-tests instruction.

## Product decisions

No remaining owner financial decision is required for this bounded writer. Unknown-basis acceptance, budget-boundary transfer treatment, conversion/cross-currency principal, new fee capitalization, corporate-action allocation and tax-lot election would require separate scope if requested. Keep them unsupported rather than asking a menu of questions now. Same-day ambiguity, historical locks, CAS coverage, incomplete valuation and migration-slot coordination are implementation/evidence matters with conservative existing answers.

Conclusion: persistence is appropriately minimal. Incorporate these contracts during source preparation; do not introduce a new planning/approval gate. This review does not claim Stage A executable criteria, rollback, report equivalence or apply readiness have been demonstrated.

## Recovery provenance

The complete writer plan was read successfully before the executor recovery and reviewed from that captured text plus the source reads listed above. The original temporary plan file was subsequently lost. This report was written after recovery into the persistent workspace-backed `cloud-control` directory; the reviewer has not reread or claimed to verify a restored plan file. Root and the author must retain/restore the exact reviewed plan text alongside this report for the durable handoff.
