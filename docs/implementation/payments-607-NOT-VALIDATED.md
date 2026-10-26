# Payment pause/end lifecycle — source checkpoint, NOT VALIDATED

Historical checkpoint from 2026-10-22. The current owner-authorized continuation,
prepared-test adoption and fresh validation are recorded in
[payment lifecycle evidence](../evidence/payment-lifecycle-607/README.md).
The dependency and restrictions below describe that earlier checkpoint only;
current delivery follows `docs/queue/README.md`.

Refs #607. Owner implementation-only direction (2026-10-22) applies: no new tests,
test edits or test runs, typechecks, builds, browser validation, CI dispatch, PR,
merge or deployment. None were performed. No migration was executed on any database.
This checkpoint is not accepted or live delivery.

## Explicit unintegrated dependency

This isolated branch starts at the exact remote PR #760 source head
`352412911b60c80d2b64182e95f7c3cfc9ee50b9` (goal lifecycle #604), an **OPEN,
UNINTEGRATED dependency**, not main or a claimed live delivery. No local #604 branch
or worktree was edited. Migration `0048_goal_lifecycle` and its snapshot are retained.
The #607 helper reuses #604's existing audit-chain traversal; this dependency must
be retained during integration. #607's declared prerequisite #606 is closed, with
its prior live delivery recorded in the actual issue comment.

## Prepared source preserved

Prepared source head: `42d26f3aff97440ef96194484f931bedde85718e`.
Handoff: `59416cc5`, `docs/handoff/607/source-provenance.json`.
Only owned source hunks were ported, never whole mixed ancestry:

- `4ca52ccf52d9101bcff9ef9b0744b04a4419b48a`: product source/migration49 hunks.
- `327f59a8ffd9018dbfff28ef31f7736fde2eedf7`: matching source formatting hunks.
- `5131ebc9`, `c4f510b9`, `a552bbda`, `42d26f3a`: test-only patches inspected but
  excluded, as required for this implementation phase. Roadmap/evidence not copied.

The coordinator applied the four shared files (expected API, API schemas, budget
schema and migration journal). The formatting pass was limited to #607 sections;
unrelated booking/savings-goal formatting was excluded. Existing wildcard repo and
schema exports already expose the new functions/table; no barrel change was needed.
Source-only patch copies remain under `/workspace/.budget-tools/impl-607-payments/`.
Historical tests/reviews retain only their original scope and revision; no historical
result is attributed to this new checkpoint.

## Implemented acceptance behavior in source

- Pausing records an inclusive range from the action day through the selected day.
  Canonical scheduling filters the final business-day-shifted date while preserving
  rhythm anchors and versioned amounts. Detail, preview, income and rule adapters
  reuse those facts; dates after the interval resume normally.
- Ending names the first excluded day and stores the existing inclusive end as
  one day earlier. Transactional replanning removes only eligible future open,
  unassigned occurrences. Past, assigned and explicitly skipped history is retained.
- Lifetime assignment evidence (including retained audit before/after images)
  refuses deletion after any assignment. Missing/ambiguous history also refuses
  deletion with an actionable message. Review tokens guard explicit actions against
  concurrent changes and public DTOs do not expose audit snapshots/private proof sets.
- Pause/end/delete use the existing atomic audited groups and Undo path. Scoped
  pre/post Undo guards prevent conflicting pause overlap or reactivating an open
  occurrence inside a retained pause/end, while existing link/lock guards remain.
- Migration49 adds only the pause table/index. Snapshot49 follows snapshot48.
  The disposable-copy rollback refuses rows, audit history and subsequent migrations;
  it does not remove retained lifecycle history or rewrite existing financial data.
- Existing payment detail actions provide pause/end date dialogs, confirmation,
  retained-history explanations and guarded delete. Existing money, token styling,
  FormDialog and grouped write/Undo mechanisms are reused.

## Remaining acceptance

Independent exact-head integration/source review; reversible disposable-copy migration
review/execution; literal before/after history/report, resume, lifetime-delete,
rollback/lock/Undo and API evidence; desktop/mobile/WebKit/light/dark/Axe/touch/overflow
checks; ordinary required checks and authorized deployment/live verification.
No issue is closed. The dependency branch is not represented as integrated or live.

## Reviewed-state deletion correction

Independent source review of5678b5fe5fd96edd38004294f62d7ed7cef5b24c found that the optional DELETE review token bypassed concurrency protection for a changed never-assigned payment. The HTTP query now requires the64-character digest and the repository writer always compares it transactionally before the existing lifetime-assignment guard and audited deletion. No production caller other than the HTTP route was found; the UI already supplies the token. No legacy bypass is introduced.

Files: `apps/server/src/api/schemas.ts` (required DELETE token) and `packages/db/src/repos/expected.ts` (required argument and unconditional comparison). The independent review is archived alongside this handoff. Delta review remains pending. Existing test files remain unchanged; direct calls in `packages/db/src/repos/expected.test.ts` at the recorded source lines188,200,850 omit the token and require later contract adaptation before validation. Do not weaken lifetime-assignment or stale-state expectations when adapting them. No tests, typecheck, build, migration, CI, PR, merge or deployment executed. NOT VALIDATED / NOT LIVE.

Independent correction-delta review ofd80c2744 against5678b5fe found the tokenless CAS bypass closed in production source; see `payments-607-delete-fix-source-review.md`. The client helper still allows omission at the TypeScript call boundary, but the HTTP endpoint rejects it and the server writer has no bypass. The existing UI supplies its reviewed token. This is source review only; later direct test callers need the newly required argument.
