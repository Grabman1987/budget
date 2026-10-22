# #520 writer/Undo correction — independent source review

Base: `a8cdd41e8d109c93e79de5b1cd1c4cbff89284d4`.
Reviewed source: `7f3f39d8d3d2da78346e938d84e19cdf743b8042`.
Worktree: `/workspace/impl-520-transfer-persistence`; HEAD confirmed and working tree clean during review.
Prior findings: `520-writer-undo-source-review.md` (one P1, three P2).

Read-only exact Git/source delta and relevant existing history, invariant, audit and trade callers. No tests, checks, compilation/build, browser, database/provider operations, source execution or repository edits.

## Findings resolved in this delta

1. **P1 dated Undo/redo and moved-date locks:** `audit.ts` now identifies economic trade changes and derives the earliest applicable before/after trade/holding date for each retained pre/post pair scope. The final post-group invariant call supplies that date. `readRecordedSecurityHistory` expands each endpoint scope through live adjacent pairs and checks the final surviving component reconciliations/closed accounts. The check runs outside the force-specific bypasses. Keeping pre-write pair scopes also preserves both endpoints when Undo removes the pair. Forward `updateTrade` supplies the earlier of old/new dates. This closes the original zero-cash pair Undo and earlier-date removal examples without applying mutation locks to ordinary historical reads.
2. **P2 cost-method Undo:** relevant investment_preference before/after cost_method changes now seed all live paired securities under an explicit bound. Their restored-method replay executes after the complete group; pair restoration in the same group also contributes its own leg seeds. The ordinary forward preference contract is preserved.
3. **P2 exact proposal token:** preview and writer share a versioned hash of the full history token plus security, directed accounts, date, units and normalized reference. The API preview schema accepts the bounded optional reference. Durable intent hashing remains separate and retained same-key receipts are resolved before current-preview comparison. A quantity or reference substitution no longer reuses the viewed proposal token.
4. **P2 note-only pair-lock regression:** forward native edits load/replay paired scopes only for actual economic changes. Undo uses the analogous before/after financial-field comparison. Immutable paired legs still fail the unconditional ownership check. The original zero-cash split-note example no longer receives the new component financial lock.

## Requested note-only settlement nuance

The existing generic native trade updater still calls `updateTradeSettlementBooking` for cash-settled trades, including a note-only patch. That behavior predates the reviewed #520 writer delta; the present correction does not add or remove those existing booking mutation/lock rules. The original finding concerned the newly introduced paired-component lock, demonstrated with a zero-cash split. A new early-return path that changes existing cash-settlement audit/locking behavior is not necessary to close that finding and should not be added as an unreviewed expansion of this correction. This scoped conclusion does not claim that every historical note edit is universally allowed.

No additional actionable source defect was identified in this bounded correction. The prior four findings are source-scoped closed at the exact reviewed head. The writer remains an internal repository action; preview still exposes `applyAvailable: false`, with no active Apply API/UI added by this delta. Runtime atomicity, concurrent writers, SQLite triggers, compiled module cycles and financial/Undo execution remain unvalidated.
