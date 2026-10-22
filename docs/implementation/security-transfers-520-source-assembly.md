# #520 source assembly — NOT VALIDATED

This branch starts at `ff620377e9f6905a3fa48f2464e1339269d4ea35`, the source stack through migration 0052. It includes these exact source deltas, applied as Git patches rather than a branch merge:

- #607 correction commit `d80c2744c50fd42a59d241a3bd5329e1530a1ea0` (its parent to commit).
- Reviewed portfolio delta `6420676d257698767931dd151863765cec914acf..17ecb6e320b169c7cfab402dcff042e67398ef84`.
- Own #520 preview and provenance delta `ce1e67b17a930d3441e827359f1adf5efcb38303..2de7fa9611e7a37683edabdaf8ba075c7c26b944`.

The portfolio patch overlapped the newer 0051/0052 exports in `packages/db/src/repos/index.ts`; the assembly retains all existing exports and adds `instrument-history`. The #520 patch then adds its transfer preview export. Both additions in `apps/server/src/api/invest.ts` are retained. No test source was modified in this assembly.

This is source assembly only. No tests, type checks, build, browser run, migration execution, CI, PR, merge or deployment was performed. The existing #520 preview branch remains separate. The persistent transfer relation and cross-account projections are subsequent work on this branch; apply, writer, Undo and runtime acceptance remain unavailable.
