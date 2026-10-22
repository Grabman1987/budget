# #762 rebalance lifecycle — independent source review

Source: `1d9085d78557dff2d2f309d21d3bae481d254a82`.
Base: `bbec02b3177c94dac950d35493ea766f4f23a600`.
Worktree: `/workspace/impl-762-strategy` (HEAD confirmed; working tree clean when read).
Scope: all eight changed source files, their existing allocation/trade/audit/API contracts, and the prior `762-rebalance-lifecycle-plan-review.md`. Root supplied the live issue acceptance wording; I did not refetch the issue. Source-only review: no tests, checks, compiler, build, browser, database, provider or runtime operations; no repository edits.

## Findings

### P1 — New reader/writer/UI consume account/security records that the DTO does not contain

`packages/db/src/repos/strategy-rebalance.ts:126,132` calls `view.metadata.universe.accounts.map` and `.securities.map`. Existing `portfolioStrategyView` (`portfolio-strategy.ts:288`) explicitly returns `input.universe`; `allocationInputsAsOf` (`allocation-inputs.ts:199`) defines that value as `{ accountIds: string[], securityIds: string[] }`. It is not the separate `allocationUniverse` record collection.

Consequently every otherwise eligible first proposal review reaches an undefined `.map` and cannot create the event. The new `RebalanceEvent` also unconditionally calls `data.metadata.universe.accounts.find` at `apps/web/src/wealth/strategy-rebalance.tsx:92`, so any retained or withdrawn event cannot render. Further uses are at line 110. These are direct source/type-contract defects, not execution findings.

Minimal correction: use the existing ID arrays for the frozen proposal membership. Supply explicit minimal account display/currency metadata through a real DTO or lookup, including historical linked accounts, rather than pretending the ID-only universe contains records. Do not broaden the allocation membership to fix display lookup.

### P2 — Proposal confirmation does not compare the proposal actually shown

`strategy-rebalance.ts:152-153,204-215`; corresponding review POST and UI lines 65-69.

The GET candidate and review command carry only event revision and decision audit revision. The writer recomputes the portfolio and silently freezes whatever proposal exists at POST time. A second session can change holdings, cash, a price/FX input or a config field that preserves the binding policy between GET and POST. Neither supplied token changes; the user confirms the displayed old amounts but the stored review contains new amounts. The newly computed `valuationRevision` is stored, never compared with a client-reviewed source revision.

Minimal correction: expose a deterministic proposal/source token in the candidate, send it with confirmation, and compare the transactionally recomputed token before creating the event. Include config, binding and exact relevant canonical source facts/provenance, not only a rounded total or display disclosures. Keep volatile request time out of equality and preserve retained request idempotency separately. This guard belongs to advisory proposal review; it must not become a current-price prerequisite for actual trade capture/linking.

### P2 — Actual trade attestation is not bound to the selected reviewed trade revision

`strategy-rebalance.ts:222-248`; UI `strategy-rebalance.tsx:125-130`; `strategy-api.ts` link command.

Link input supplies trade ID/category and the event revision, but no reviewed trade facts/audit revision. A user selects and acknowledges a 10-unit trade, another session edits that trade to 20 units (or changes fees/tax), and then the first session links it. The event revision is unchanged. The server snapshots the new facts as if they were acknowledged, and the resulting event is clean because those newly captured facts match the live row. An edit/Undo ABA before first linking is likewise undetected. Existing post-link comparison correctly detects later changes but does not close this initial confirmation race. The checkbox also stays checked when the trades query refreshes the same selected ID with changed facts.

Minimal correction: deliver a reviewed actual-trade token from a bounded read, including economic facts and trade audit revision (plus currency/settlement evidence where needed). Send and compare it inside the link transaction. Reset acknowledgement when that token changes. Keep semantic request identity and expected source revision distinct; do not require a quote feed for this check.

### P2 — Explicit re-review after Undo reuses the permanently consumed request ID

`apps/web/src/wealth/strategy-rebalance.tsx:29,65-69`, paired with `strategy-rebalance.ts:178-186`.

After creating a review, use its Undo toast. The event row disappears and the UI offers a new explicit review. `reviewTokens` is keyed only by month and remains mounted; clicking that button submits the original request ID. The retained-audit guard correctly rejects it as already undone. Repeated clicks cannot perform the advertised new review without remounting the page.

Minimal correction: distinguish retry of an unresolved request from a new explicitly reviewed action after confirmed Undo. Retain the former request ID across uncertain failures, but retire it on an observed completed/undone lifecycle transition and allocate a fresh ID for the deliberate new review. Do not weaken the server's no-resurrection guard.

### P2 — Native actual amounts can be relabelled EUR after allocation scope changes

`apps/web/src/wealth/strategy-rebalance.tsx:110-112,125`; `strategy-rebalance.ts:35-40,80-84`.

The retained actual-trade snapshot has no currency; display resolves it through the *current included allocation universe*, then defaults to EUR. Independently of the DTO defect above, a USD investment account can be included when reviewed/linked and later explicitly excluded from allocation. Historical actual links are deliberately retained and remain readable. That account then disappears from the included universe, so native USD gross/fees/tax are labelled EUR without conversion. An unlinked actual trade for the old event has the same problem during confirmation.

Minimal correction: provide the authoritative native account currency independently of current allocation inclusion, ideally retain it as part of the reviewed actual facts/token and show it directly for historical snapshots. Never default an unknown native currency to EUR. This does not call for a current FX quote or conversion of actual source amounts.

## Source-scoped conclusions and limits

- The minimal architecture is appropriate: strict versioned audited app_setting events, separate actual trades, no migration or new trade writer, no automatic execution. New endpoints inherit the existing authenticated API/origin guard. Inputs are strict and bounded at the route boundary; financial values use safe integer schemas. No new raw private logging was found.
- Current event JSON plus audit count covers event ABA. Retained audit request lookup prevents retry from resurrecting an undone action. Global live link ownership detects the A-link/Undo/B-link/redo-A scenario and derives reconciliation status for both events; it does not silently treat either as clean completion. Link/unlink/close writes are transactionally grouped audit mutations. Existing trade/settlement validation is reused.
- Returning an original no-change receipt for a previously accepted request whose effect was later superseded by an explicit unlink/reopen is not by itself a duplicate-write defect: `changedCount: 0` does not replay the action, the UI says the request *was already stored*, and the subsequent read exposes current state. An explicit receipt outcome could improve clarity; it is not required to fix a demonstrated financial invariant here.
- Missing current market evidence is separated from stored actual linkage and completion. Current default unavailable signal provider is intentional and is not a finding. Completion is explicit confirmation, not inferred target proximity or computed tax.
- Amounts/units in the new display use existing `eur`, `sourceMoney` and `privateAmount` functions; the parent subscribes to amount privacy. No separate unmasked amount field was found.
- TradePanel's added refresh helper catches invalidation failure after successful save, so that failure does not enter its unsaved-form error path. The supplied optional callback only selects the returned trade ID and clears acknowledgement; it performs no lifecycle mutation or awaited refresh. Generic trade writer semantics remain unchanged. No runtime claim is made about refresh scheduling or callbacks.

Result: not source-clear; one P1 and four P2 findings above require bounded correction. No additional owner policy decision is needed.
