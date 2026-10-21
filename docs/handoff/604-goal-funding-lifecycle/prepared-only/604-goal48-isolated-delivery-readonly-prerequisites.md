# #604 goal lifecycle48 — isolated delivery prerequisites

Disposition: deliver the bounded reviewed #604 packet after actual card47 delivery, then keep unchanged #607 migration49 queued behind it. No reason was found to deliver the whole source batch, payroll741, manual receipt links740 or another feature first. This is source/read-only preparation, not acceptance or permission to execute. No source, worktree, Git, tests, migrations or runtime changed.

## Exact source chain and minimal additional correction

1. Original22-path source checkpoint63eb5ff3e549781fbea791e601830dd0dcf4fae5 (parent5960e51cba63d509cdc9f24262103ab16d3dfead), whole sourceHIGH a47fe2fe5932b646c93c4c5ec3040a970b4de2ec49c17b286194b9e5775eb54a; final manifest92bf1874b4b57c93b53911f16848681810a557b62db0ba912658a54c57f42412.
2. Required prospective-anchor checkpoint1858cffc04262063865f7043c2c39b7e02782212 directly on63eb5ff3; seven-file sourceHIGH3f328e5c553ed510a50f1d1b2133218ad5bb42c43fbf573d4104f0e157332ab6, manifest3ba85060b52724270db0f565e6fee8c7efe74bf20e70f36edb183e31e5820586. Use the resulting final contents, not the obsolete pre-anchor snapshot.
3. Carry ONLY the goal-lifecycle.ts nullable-class assertion removal from1d0c7b1af8d67dab7dcb1a8c567c20c3f44a1c48. The actual inherited TS2322 correction removes an assertion that widened string|null to includeundefined; monetary behavior is unchanged. Do not cherry-pick its unrelated740 statement-receipt-links.ts hunks. SourceHIGH7eb9d56f5781b80a328e7f1b996533a25af2b04316d426206a6a96f492e1dedc.

The original source branch is a useful immutable donor; its parent contains unrelated batch work. Extract these reviewed deltas onto the actual then-delivered card47 Main pin, not that parent tree. Re-pin after card delivery rather than claiming today's candidate is live. Current card candidate base3dcce9f2afd40c905db6e22d4977f845edef75a2 was used only for mechanical comparison.

## Exact22-path packet

- Contract/documentation: SPEC.md; docs/ROADMAP.md.
- API: apps/server/src/api/goals.ts; apps/server/src/api/schemas.ts.
- Web: apps/web/src/budget/goals-api.ts; apps/web/src/budget/goals-model.ts; apps/web/src/budget/goals-page.tsx; apps/web/src/budget/goals-panel.tsx; apps/web/src/budget/goals.css; apps/web/src/budget/plan-panel-pages.tsx; apps/web/src/pages/goals-progress-report.tsx.
- Migration/schema: packages/db/drizzle/0048_goal_lifecycle.sql; packages/db/drizzle/meta/0048_snapshot.json; packages/db/drizzle/meta/_journal.json; packages/db/drizzle/rollback/0048_goal_lifecycle.sql; packages/db/src/schema/budget.ts.
- Canonical mapper/read/write: packages/db/src/repos/budget-ledger-input.ts; packages/db/src/repos/goal-lifecycle.ts; packages/db/src/repos/goals.ts; packages/db/src/repos/queries.ts.
- Pure domain: packages/domain/src/goals/lifecycle.ts; packages/domain/src/index.ts.

No new dependency/package/config, general audit engine or financial writer hook is required. The new pure activeGoalAuditEntries export is also the real source dependency later consumed by607. The ledger adapter calls existing canonical budget arithmetic through the extracted unchanged row mapper.

## Migration and extraction boundaries

Actual candidate47 snapshot.id=2773aeae-39e7-49ea-9317-7000e173a4ec exactly matches48.prevId;48.id=87b522c0-6ccd-4dfc-9174-c027ec48cd97. Parsed snapshots contain the same85 tables; only savings_goal changes, adding start_month/manual_completed_on/lifecycle_anchor_json and corresponding constraints. No unrelated table or other snapshot metadata changed. Preserve this predecessor chain and the existing47 corrections; do not resequence gratuitously or copy source-batch journal49.

Text-only three-way reconstruction of the final604 delta (base5960e51c) onto741 candidate3dcce finds conflicts only in ROADMAP and the domain barrel. Resolve ROADMAP as actual delivered prefix plus the final reviewed604 section, not the obsolete pre-anchor section or unrelated batch appendices. Preserve current card barrel exports and add only the one goal lifecycle export. SPEC and API-schema hunks merge textually cleanly, but whole-file copying would bring unrelated741/740/batch context; apply only604's own changes. Schema/budget.ts must come from the reviewed604 donor, not current full batch, which also includes607 expected_payment_pause. Current queries.ts/goals.ts and all seven UI donor paths remain exact1858; current goal-lifecycle.ts differs only by the reviewed type fix.

New migration48 rollback currently has NO later-journal refusal, just like47 before the genuine741 negative exposed it. Require a synthetic later-journal rollback-refusal case before declaring it safe. It must leave tables/schema/journal/FKs unchanged; do not delete or invert that oracle. A resulting meaningful failure would justify a separately reviewed narrow early guard, not a fixture workaround. Existing retained/live/deleted/undone start/manual/anchor intent refusal also remains required. Migration publication is not yet verified.

## Owner decision and honest acceptance gaps

Owner answers are retained at604-owner-questions-pending.json (statusanswered), and prospective-anchor authorization at604-prospective-anchor-root-authorization.json. Preserve: current-month-inclusive existing Plan rate; add only remaining monthly need; new start month selectable, old starts unchanged until explicit edit; automatic completion only after proven reaching then an actual expense, or explicit manual completion; assignment reduction is not an expense; no deletion or money write on completion; real Undo restores.

Existing604 source checkpoints contain ZERO NEW tests. SourceHIGH never certified runtime, copying, UI/native, CI or delivery. Minimum new acceptance evidence must cover these concrete behaviors rather than source-only publication:

- Literal120000 target dueDecember viewedOctober gives40000 current Plan rate; assigned15000 adds exactly25000 through existing guarded assignment, repeated action no-ops with no fake Undo. Insufficient TBA rejects atomically; stale captured source/rate token including changed intent is rejected without writes. Preserve distinct existing future-only forecast.
- Goal save synchronizes only its owned category target; explicit start/unchanged start and name/note-only edits behave correctly. Another active goal or manually owned/ambiguous target conflicts; a genuinely completed predecessor can transfer target ownership without deleting history.
- Seeded/imported basis gains prospective proof only through authenticated real intent write. Exact fresh complete anchor group, public DTO stripping, no GET/backfill anchor, stable no-op intent and read-only GET must be tested. Funding then surviving actual expense completes; assignment-only reduction and transfers do not. Expense/reach whole Undo/redo recomputes; partial/reused groups, pre-anchor financial Undo, future-entered negatives or invalid chronology remain explicitly unavailable rather than invented history. Account-goal attribution remains conservative/manual.
- Manual completion is one neutral audited operation with real Undo/redo and retains goal/bookings; completed rows remain accessible. UI real create/edit/fund/manual completion, immutable draft on refetch, existing start, review conflicts, grouping, both themes/touch/focus/accessibility/privacy and actual persistent Undo need evidence.
- Real closed populated47 file copy→48 must preserve every legacy row/audit/FK, including47 automation and machine-null-reference settlement history and any legacy/deleted goals. Source stays unchanged. Unused rollback/re-upgrade, retained intent/audits including Undo, later-journal refusal and old financial Undo after upgrade require actual checks. Restore/backup behavior must not be inferred from schema parity.

These are missing coverage categories, not invented test counts or permission to author/run now. B741 delivery and the actual host grant remain prerequisites.

## Existing financial-test policy risks

Keep all existing tests initially unchanged and collect real failures before proposing adapters. There is a known concrete semantic collision to anticipate: e2e/goals.spec.ts expects the removed “Als Ziel der Kategorie übernehmen” buttons and a separate adopt action; the owner now approved atomic target synchronization and removal of those actions. Its literal saved amounts, old forecast, category target58000 and real Undo oracles must not be silently dropped to accommodate selectors.

Likewise packages/db/src/repos/goals.test.ts and apps/server/src/api/goals.test.ts explicitly assert adopt→Undo removes the target. With target creation already performed by new goal save, that legacy scenario may require a source-valid setup that proves the intended existing public action separately. Treat any actual failure as financial semantics/fixture evidence; do not simply weaken the expected target/Undo result. Existing model/API forecast literals and account balances are still intended to remain valid. New web DTO fields are optional, so no blanket mandatory-field old-fixture edits are justified. Any necessary OLD financial-test change needs the repository's specific owner approval for its exact reviewed patch; no prior unrelated receipt/payment approval transfers to604. Native screenshot/selector adapters also require their normal reviewed evidence, not unexamined baseline replacement.

After this bounded packet is correctly extracted and independently reviewed/validated/delivered,607 can keep49's real predecessor48 and the same activeGoalAuditEntries implementation. Until then neither604 nor607 acceptance is complete.
