# Payment pause/end lifecycle continuation (Refs #607)

This continues existing PR #763, rather than replacing its implementation. Current
owner delivery authority is docs/queue/README.md; the older implementation-only
checkpoint restrictions in docs/implementation remain historical. Nothing below
claims their old test results for the current source.

## Source adoption

Original PR head: 8325561b7a1a6e47ef0ef67d27d0959d9f7c5b84. Its dependency #760 is
now published at main 9fda8be659d631cb85a22b1fb7d642f10ab9688a. Merge e8ff0f78
preserves the current SPEC, domain exports, historical-goal correction and regression,
and goal evidence from main; the migration journal retains main through48 plus49.
No goal implementation was replaced by an older copy.

Prepared tests were recovered from handoff/607-20261021 at
59416cc5b0ca62dc13913a63f5c523b27806cc33. Only test hunks from its six ordered source
patches were applied (4ca52ccf,5131ebc9,c4f510b9,327f59a8,a552bbda,42d26f3a). Product
source was already present in #763. The original42d26f3 commit object was unavailable;
the retained patch blobs, not an invented checkout, are the provenance.

## Scoped adaptations

- packages/db/src/repos/expected.test.ts: three existing delete calls now obtain the required current review digest. Existing financial, restore and Undo assertions remain unchanged.
- apps/server/src/api/expected.test.ts: the existing delete/restore scenario obtains the public token after its version Undo, preserving all existing assertions.
- apps/server/src/api/income-pause.test.ts and e2e/income-pause.spec.ts: the existing deleted-source scenario reads the token before deleting its never-assigned synthetic payment. Original source/history/amount checks remain unchanged.
- New packages/db/src/repos/expected-lifecycle-607.test.ts: the historical-assignment deletion case supplies a valid token and checks the actual prior-assignment refusal, preventing a missing-token false positive.
- New apps/server/src/api/expected-lifecycle-607.test.ts: added byte-neutral missing/malformed/stale DELETE-token checks and a current-token success case for the source checkpoint's mandatory-token correction.
- New domain, migration-copy, UI and native browser tests are adopted from the handoff; their literal financial expectations are retained.
- Client deletePayment now requires a token at the TypeScript boundary, matching the existing mandatory server contract. The dialog ignores a null-token callback; no tokenless server fallback is introduced.

Independent full financial/API/migration/source/test review, fresh targeted checks,
affected browser profiles/baselines, required exact-head CI and verified publication
remain pending. Migration49 has not been applied to production. #607 remains open.
