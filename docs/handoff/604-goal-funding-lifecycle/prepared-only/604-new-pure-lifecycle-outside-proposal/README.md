# #604 pure lifecycle acceptance candidate — outside only

One NEW file: `packages/domain/src/goals/lifecycle-604.test.ts`. Ten declared Vitest cases, not executed. Source basis is final prospective-anchor checkpoint1858cffc on63eb5ff3, plus the separately reviewed adapter-only nullable type correction1d0c7b1. The pure module bytes are identical across those final pins. The test imports only the actual pure lifecycle module, not database, clock, runtime or mocks. Existing tests, repository files and branches remain unchanged.

## What this candidate actually covers

- Integer-cent threshold120000, retained reaching, and first later committed classified expense.
- A decline to zero with no classified expenses does not manufacture completion. This does NOT prove DB classification of assignments/transfers.
- Same-group reaching/spending cannot prove order; a subsequent committed group on the same financial day can qualify.
- Earliest eligible expense financial date despite array/entry order; pre-reach/future expense exclusion; start month/as-of bounds.
- Incomplete chronology stays explicitly unavailable. Whole-chain sequence/cents validation prevents returning an earlier apparent completion before a malformed later point.
- Explicit manual completion, future manual date and null removal, preserving unavailable evidence when no automatic history exists.
- Pure Undo→Redo→Undo root parity and conservative invalid ancestry; separately supplied surviving point fixtures demonstrate reached/completed/open outcomes. They do NOT execute financial Undo or reconstruct DB amounts.

## Deliberately separate acceptance still required

The pure lifecycle module has no rate or assignment operation. The actual canonical `ledger/targets.ts::targetNeed` uses inclusive months and feeds `goals.ts::listGoals` funding; `fundGoalRate` recomputes inside a transaction and delegates to `assignMany`. Therefore120000 dueDecember viewedOctober→40000, assigned15000→25000 remaining (and no second full rate) must be tested directly on that actual canonical/DB/API seam; this file neither duplicates its formula nor changes the distinct future-only goal forecast.

DB tests must still prove surviving real-expense vs transfer/assignment classification; same-month order and anchor fresh complete groups; actual whole Undo/Redo and partial/reused/corrupt/pre-anchor/future-entry fail-closed handling; authenticated intent-only anchors and all public DTO stripping; reviewed-token CAS, TBA/atomic rollback/repeated no-op; ownership/start edits/manual-neutral audit; immutable money/history. Pure string inputs assume upstream validated dates and do not certify date validation.

Migration47 delivery precedes extraction of this goal48 packet. Real populated47→48 copy/rollback/re-upgrade, retained/audited anchor refusal and later-journal refusal remain required; no migration was run. UI/native/CI/build/full checks and actual live integration are separate pending gates. This preparation does not adopt any part of the broad source-batch parent.
