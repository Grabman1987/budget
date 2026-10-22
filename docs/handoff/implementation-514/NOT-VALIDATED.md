# #514 source checkpoint — NOT VALIDATED

Implementation-only checkpoint dated 2026-10-22. Issue #514 remains open and unaccepted. No tests, test edits, typechecks, lint, formatter, build, browser, migration execution, CI dispatch, PR, merge or deployment were performed for this package. No dependencies were installed or copied. Financial correctness, runtime behavior, audit replay and migration compatibility have not been demonstrated.

## Source and dependencies

Read the actual #514 issue/comment, SPEC-002, reference-adoption decisions, repository instructions and existing target/assignment paths before implementation. No prepared weekly/snooze implementation was found; existing weekly expected-payment schedules represent a different intent. Historical evidence is context, not evidence for this revision.

This branch depends on the unintegrated #604 goal-lifecycle and #607 expected-payment lifecycle source chain: `5678b5fe5fd96edd38004294f62d7ed7cef5b24c`, including migrations 0048 and 0049. It carries only the completed Plan #591–593 source delta from `b5b971902416bd933e1185b261d247a6b766305e` versus `6420676d257698767931dd151863765cec914acf` in separate commit `0b9f423e`. The original Plan and #609 branches are preserved. This is not a standalone patch to main; integrate dependencies deliberately. No merge was performed.

Migration 0050 is reserved exclusively for #514. Its manually authored snapshot points to the exact 0049 snapshot ID. Existing null weekly-day rows need no backfill and retain legacy target intent. Forward SQL, rollback, metadata and database checks remain unexecuted. Future migrations must inherit this checkpoint or explicitly reconcile the 0048 → 0049 → 0050 chain.

## Implemented source

- Optional ISO weekday (Monday 1 through Sunday 7) on existing effective target versions, constrained to monthly/every-one/no-other-due-date cadence. Calendar occurrence counting feeds the existing pure `targetNeed`; per-occurrence cents are multiplied by the actual four/five dates. Carry does not reduce the weekly set-aside goal. The editor requires an explicit weekday, exposes effective month and displays installment count/month total through the shared calculation. Legacy monthly/by-date/keep-balance branches remain.
- Audited, soft-deleted unique category/month snoozes supply target intent through the shared category-tree and rule-input adapters. Snooze gives zero target need for that month without writing target versions, assignments, bookings, carry or balances. Confirmation, pause/resume labels and grouped Undo use existing components/writers.
- Bounded selected funding preview/apply routes and inspector dialog show assigned/need/proposal/delta, exclusions and shortfalls. Funding delegates ordering/caps to existing nine-stage `waterfallOrder`/`waterfallFill`; exact current-month zero reset delegates feasibility to existing release-first `quickAssignPlan`. A reset unable to reach all reviewed zeros is blocked. Empty selection is disabled, and selected scope/month changes discard the UI preview.
- Server-generated single-use two-minute preview tickets bind exact IDs/month/mode, canonical current projection, database change stamp, date and policy version. Apply recomputes in a transaction before calling unchanged `assignMany`; no client amounts are accepted. Expired/missing/stale tickets fail and require another preview. Any database write invalidates the stamp, including changes later undone; this conservatively rejects unrelated writes too. Tickets are process-local and bounded to 100; restart/another instance requires a fresh preview. Existing authentication, same-origin/import guards, available-funds writer and grouped audit/Undo remain the admission path.

No new financial policy or assignment lock model was invented. Existing assignment guards remain authoritative. Target-version backdating retains the existing explicit effective-month semantics; no partial-month prorating or implicit rewrite was introduced.

## Exact package paths

UI:
- `apps/web/src/budget/api.ts`
- `apps/web/src/budget/category-panel.tsx`
- `apps/web/src/budget/labels.ts`
- `apps/web/src/budget/plan-inspector.tsx`
- `apps/web/src/budget/plan-model.ts`
- `apps/web/src/budget/plan.css`
- `apps/web/src/budget/selected-funding.tsx`
- `apps/web/src/budget/target-snooze.tsx`

Domain/repositories:
- `packages/domain/src/ledger/targets.ts`
- `packages/domain/src/ledger/index.ts` (coordinated shared export)
- `packages/db/src/repos/categories.ts`
- `packages/db/src/repos/rule-inputs.ts`
- `packages/db/src/repos/target-intent.ts`
- `packages/db/src/repos/selected-funding.ts`
- `packages/db/src/repos/index.ts` (coordinated shared exports)

Schema/API/migration (shared source applied with coordinating agent):
- `apps/server/src/api/budget.ts`
- `apps/server/src/api/schemas.ts`
- `packages/db/src/schema/budget.ts`
- `packages/db/drizzle/0050_weekly_targets_snooze.sql`
- `packages/db/drizzle/rollback/0050_weekly_targets_snooze.sql`
- `packages/db/drizzle/meta/0050_snapshot.json`
- `packages/db/drizzle/meta/_journal.json`
- This handoff: `docs/handoff/implementation-514/NOT-VALIDATED.md`

The preceding Plan carry commit additionally changes its eight source paths; these are source reconciliations, not new #514 features. Inherited #604/#607 tests/evidence were not modified or rerun.

## Remaining acceptance gates

All AC-002-01–06 have corresponding source paths, but none is claimed accepted. The independently specified April 2026 four-Friday / May 2026 five-Friday examples at 2,000 cents (8,000 / 10,000), and existing 3,000-cent assignments (5,000 / 7,000 remaining), were read as requirements, not executed as checks. Still required after owner authorization: independent source review; literal boundary/legacy cases; snooze month isolation; funds/stages/exclusions and assignment-lock admission; stale/ABA/concurrent apply; exact-zero shortage handling; one audit group with full Undo/redo and cent conservation; forward/rollback/export/restore/schema drift; keyboard/phone/privacy presentation; project required checks and serial integration. #513/#482 and private/reference product gates are not closed by this checkpoint.

Before branch push, workflow sources were read: CI push is main-only; recovery/register workflows are PR-only; snapshot workflow is manual; deploy requires main CI/manual admission. No open PR exists for `codex/impl-514-targets`. Normal feature-branch push does not authorize creating a PR or starting CI.

## Successful-write refresh correction

Independent source review of e7566feb0835c697531556651d213e5ef669cad4 found that a successful funding apply could lose its receipt/Undo and be reported as failed after generic refresh rejection. The shared helper preimage was byte-identical to the #562/#563 pre-fix source5477fdb5, so only its already independently reviewed helper correction from6948135af40809e82a2f1d24055380fe57e3c28b was carried. No funding writer, calculation, migration or preview token was changed. The helper returns confirmed success and retains the Undo action while reporting refresh failure separately; actual write failures remain failures. See SOURCE-REVIEW.md. The [narrow correction source review](FIX-SOURCE-REVIEW.md) compared `ce7c59df2ad5c962b80cd2236cc7ffb502c21113` with `e7566feb0835c697531556651d213e5ef669cad4` and found this P2 resolved with no new finding in that delta. This is source-clear only; runtime Undo and database atomicity remain unvalidated.

Later source assembly must combine this identical shared helper fix with #727 optional history callbacks; do not overwrite either. The #607 parent DELETE-token correction d80c2744 remains a required separate dependency delta before integration; no claim that it is in this branch. No tests/test changes/checks/builds/CI/PR/merge/deployment performed. NOT VALIDATED / NOT LIVE.
