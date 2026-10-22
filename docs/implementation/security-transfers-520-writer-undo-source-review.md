# #520 internal writer and Undo — independent source review

Base: `9f67b84971cc0042d7a5ebb812d8f7ff1e9065f4`.
Reviewed head: `a8cdd41e8d109c93e79de5b1cd1c4cbff89284d4`.
Worktree: `/workspace/impl-520-transfer-persistence`.
Scope: all eight changed files, relevant existing trade/booking/audit handlers, recorded-history fingerprint and the reviewed writer-plan addendum. Read-only source/Git; no tests, checks, compiler/build, browser, database/provider operations or product edits. Internal writer is not an active HTTP Apply action.

## P1 — Undo omits mutation-lock checks; forward date moves inspect only the new date

`audit.ts:1029` calls `assertPairedScopes` without a mutation date. In `security-transfer-invariants.ts:77–82`, that causes the reader's reconciliation/closed-account write blockers to be ignored. Existing Undo lock checks are for valuation rows or certain cash-booking actions; a security pair consists of two zero-cash trades and its relation, so those do not cover it. A valid pair followed by an account reconciliation can therefore be undone or redone despite changing the reconciled securities history. Full replay can still succeed and does not itself enforce a lock. `force` likewise does not supply this missing protection.

A related forward-edit bypass is `trades.ts:337–339`: only the resulting `date` is passed. Moving a native purchase from D1 to D2 removes its old economic effect at D1 as well. Example: A has enough older units; another buy at D1 affects average basis; A→B transfer is later than D1; B is reconciled after the transfer; the buy is moved to D2 after that reconciliation, while remaining units still support replay. A's cash booking is not reconciled. Checking only D2 misses B's earlier lock even though the transferred basis at its reconciled date changes.

Minimal correction: derive material affected dates from both before/after trade/holding snapshots and paired legs, retain pre-write components, and enforce locks on that union at the earliest affected date (or equivalent exact per-component dates). Do this for forward edits and grouped Undo/redo, including force. Reconciliation-removal actions in the same explicitly grouped Undo may be accounted for using final surviving locks, consistent with existing valuation Undo. Do not make every descriptive edit a financial mutation or impose new write locks on ordinary historical reads.

## P2 — Undo of the global cost method skips every paired component

`audit.ts::securitySeedsOfUndo` (`:464–478`) includes trade, holding, account and security only. An `investment_preference` Undo therefore has no seeds and both pre/post scope sets are empty. `setInvestmentCostMethod` validates all live paired securities on a forward change, but generic Undo/redo restores the preference directly and bypasses that validation.

A method can be changed before later method-dependent paired history is recorded. Undoing the old preference action can subsequently select a method under which that history is unsupported, even though the forward setter would reject it. For example, the reviewed pure FIFO reverse-split boundary rejects a zero-sized per-lot result, whereas the average positive pool can remain representable. No new method policy is needed: restoration must enforce the existing replay validity rule too.

Minimal correction: detect relevant `investment_preference` snapshot changes in Undo and seed all affected live paired securities, with the same bounds as the forward setter. Validate the restored method after the whole group, including force and Undo-of-Undo. The author independently identified this omission while holding the reviewed head frozen.

## P2 — Preview token does not bind the proposed quantity

`security-transfer-history.ts` returns `factFingerprint: history.factFingerprint` from preview. That underlying hash includes history and scope/date, but not proposed `unitsE8` or normalized source reference. `security-transfer-writer.ts:76–82` compares only that hash, then independently replays the submitted units (`:99–105`). A preview for one unit therefore supplies an accepted token for a different quantity on the same date/accounts/security whenever the latter remains financially valid. The durable intent hash distinguishes the new request, but does not prove it matches the viewed proposal.

The accepted writer-plan addendum §5 requires the separate preview/fact token to bind exact proposed fields as well as full affected history. Minimal correction: share a versioned canonical proposal-token builder between preview and writer, combining the reader fact hash with normalized proposal fields, especially quantity, and source reference when part of the confirmed proposal. Keep durable intent hashing independent of this token so a same-key retry with a refreshed preview continues to return the original live/undone action. No preview-session table or external approval mechanism is required.

## P2 — Note-only native trade edits acquire unrelated financial locks

`updateTrade` unconditionally loads paired scopes and calls `assertPairedScopes(..., date)` for every patch (`trades.ts:259–266, :337–339`). Thus an ordinary unpaired native split or other trade in a paired component cannot have only its note edited when another component account is now closed or reconciled. A zero-cash split illustrates the new regression without any pre-existing settlement-booking lock: its financial fields stay identical, but the new paired guard rejects its note change.

Minimal correction: gate component financial replay/lock checks on actual changes to economic fields (including security/date/units/money/kind) and deletion/restoration. Retain `assertUnpairedTrade` for actual pair legs, whose immutable ownership is intentional. Metadata edits must not silently weaken any financial guard; they simply do not require the new financial replay, as already stated in the writer-plan addendum.

## Source observations and limits

- The new writer uses one synchronous transaction, checks a retained unique intent key before current facts, rejects changed intent, and returns the original group/live state for a matching retained pair. Creation order includes tombstones and has a safe-integer exhaustion guard.
- New action eligibility checks open/live off-budget EUR investment accounts and opening dates. Native same-day interacting sales/splits reject; pair order follows the persisted ordinal. Hypothetical replay covers the latest suffix; persisted rows are reread before commit.
- Two signed opposite delivery rows contain zero amount/fee/tax, no cash booking, and share one audit group with the immutable relation. No invented acquisition/market price enters the write.
- Paired leg edit/delete/import-key reuse is blocked even after Undo. Pair Undo requires relation plus both legs, single-entry Undo rejects, and pre-write seeds retain detached components for final replay. These are useful protections but do not close the missing lock/method paths above.
- The repository import graph contains cycles through audit/invariants/history/trades/preferences/entities. In the reviewed source, their cross-module calls occur inside functions; no concrete new top-level use-before-initialization was found. This is not a runtime module-loading validation.
- Generic entity hooks preserve before/after holding seeds and account financial eligibility checks. Existing central settlement and ledger invariants still run. No writer barrel export, Apply route or save action was added; preview remains applyAvailable false.

Outcome: **one P1 and three P2 findings; not source-clear at this pinned head**. All identified corrections are implementation of established contracts, with no new owner financial-policy decision. Runtime financial acceptance, concurrency, SQLite/trigger behavior and grouped Undo/redo execution remain unperformed.
