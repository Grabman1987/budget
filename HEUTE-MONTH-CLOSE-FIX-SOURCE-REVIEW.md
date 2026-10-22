# Narrow source-only review: Heute / month-close P2 correction

Worktree `/workspace/impl-heute-month-close`, head `bf92474d06bdb500770ecd30fe3fb17355b5d79a` against reviewed head `d27f9a2ff042d3c565009040c701ce37141efe98` (package base `6420676d257698767931dd151863765cec914acf`). Scope: the two writer corrections in `packages/db/src/repos/month-close-reconciliation.ts` and `apps/server/src/api/month-close.ts`. Read-only source inspection; no tests, checks, build, browser, CI or repository edits.

No remaining finding for the two reviewed P2 cases. The batch preview now derives the bank effective day from the observed date or valid Vienna fetch day, and excludes a contradictory bank balance effective after the prior personal check through `asOf` (`month-close-reconciliation.ts:132-149`). The same preview is recomputed inside the batch transaction and the bank rows remain in its revision proof, so the September 15/29/30 example can no longer enter the confirmed cohort. The close route now rejects `close:true` without `sourceRevision` at body validation and compares a supplied revision unconditionally before the existing idempotent return (`month-close.ts:73-92`); progress and decision patches retain their optional revision input.

The separate `/heute/finanzcheck` router integration dependency from the original report is outside this correction. Source inspection does not validate runtime behavior, rollback, Undo, browser privacy or acceptance. The handoff remains NOT VALIDATED; #719 STOP is unchanged.

The requested `/workspace/.budget-tools/cloud-control/` path was unavailable at writing: its symlink target `/tmp/budget-cloud-control-preserved` disappeared during executor recovery, so this report is temporarily saved directly under `/workspace/.budget-tools/`.
