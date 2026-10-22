# #604 bounded goal funding and lifecycle adoption

Base: live `1c19a465` (migration47). This branch adopts only the owned #604
packet `63eb5ff3e549781fbea791e601830dd0dcf4fae5` followed by
`1858cffc04262063865f7043c2c39b7e02782212`, the `goal-lifecycle.ts` nullable-class
assertion removal from `1d0c7b1af8d67dab7dcb1a8c567c20c3f44a1c48`, and the
independently source-cleared rollback48 later-journal proposal. No mixed parent
ancestry, #607 migration49, new financial writer hook or unrelated #740 code is adopted.

The owner decisions are retained in SPEC: current-month-inclusive Plan funding,
only the missing monthly assignment, selectable new start month, proven reach
followed by first actual expense or explicit manual completion, protected Undo,
and no completion deletion. The separate future-only forecast remains separate.

## Source extraction

| File | Adoption and boundary |
| --- | --- |
| `SPEC.md` | Only #604 owner decision paragraph; retain delivered #741 directives. |
| `apps/server/src/api/goals.ts` | Owned #604 funding/completion routes, explicit viewed month and public goal responses. |
| `apps/server/src/api/schemas.ts` | Only goal start-month and funding review-token schemas; retain other API schemas. |
| `apps/web/src/budget/goals-api.ts` | Owned goal DTO additions and fund/complete requests. |
| `apps/web/src/budget/goals-model.ts` | Owned lifecycle labels and projection helpers. |
| `apps/web/src/budget/goals-page.tsx` | Owned reached/completed grouping. |
| `apps/web/src/budget/goals-panel.tsx` | Owned explicit start field, retained editor draft and removal of obsolete adopt button. |
| `apps/web/src/budget/goals.css` | Only owned retained-group styles using existing tokens. |
| `apps/web/src/budget/plan-panel-pages.tsx` | Owned funding/completion actions and historical goal chart. |
| `apps/web/src/pages/goals-progress-report.tsx` | Owned lifecycle grouping and read model. |
| `docs/ROADMAP.md` | Preserve base bytes and append only final prospective-anchor #604 section. Resolve both patch conflicts without unrelated historical appendices. |
| `packages/db/drizzle/0048_goal_lifecycle.sql` | Final anchor-inclusive owned48 forward migration. |
| `packages/db/drizzle/meta/0048_snapshot.json` | Final owned48 snapshot; structural comparison changes only savings_goal. |
| `packages/db/drizzle/meta/_journal.json` | Append48 only after unchanged delivered47. |
| `packages/db/drizzle/rollback/0048_goal_lifecycle.sql` | Final owned48 rollback plus reviewed two-line early later-journal refusal; caller transaction remains required. |
| `packages/db/src/repos/budget-ledger-input.ts` | Owned extraction of existing unchanged canonical row mapping. |
| `packages/db/src/repos/goal-lifecycle.ts` | Final owned anchor-aware adapter plus scoped nullable-class type fix only. |
| `packages/db/src/repos/goals.ts` | Final owned guarded funding, target association, prospective anchor and manual lifecycle intent. |
| `packages/db/src/repos/queries.ts` | Owned canonical mapper extraction only; existing ledger arithmetic retained. |
| `packages/db/src/schema/budget.ts` | Owned three savings_goal fields/constraints only; no expected-payment schema. |
| `packages/domain/src/goals/lifecycle.ts` | Final owned pure lifecycle and coherent audit-group classification. |
| `packages/domain/src/index.ts` | Append only goal lifecycle exports, retaining current card/receipt exports. |

Snapshot47 `2773aeae-39e7-49ea-9317-7000e173a4ec` equals48.prevId;
48.id is `87b522c0-6ccd-4dfc-9174-c027ec48cd97`. Journal48 timestamp remains
`1792520000000`. No migration was executed during adoption.

## Prepared NEW tests

Each is a new file; no existing test is edited. Original candidate SHA256 values
below bind the reviewed unformatted input. Repository Prettier formatting was
applied after copying, without intentional semantic changes.

| File | Prepared source and independent acceptance scope |
| --- | --- |
| `packages/domain/src/goals/lifecycle-604.test.ts` | `604-new-pure-lifecycle-outside-proposal/candidate`; SHA256 `85f588b9137658ef9ee0398c119af9c40b58a9db33f1a7ad95c6b96dd6fc272a`; pure classified reach/expense/manual lifecycle and coherent surviving audit groups. |
| `packages/db/src/goal-lifecycle-migration-604.test.ts` | `604-migration48-one-new-test-outside-v2`; SHA256 `983681d51c5b65484158e263d47dcd12a414ca72ecc3bcc596e18f5aec61b649`; disposable populated47 copy, actual card47 history, forward preservation, unused rollback/re-upgrade, retained/audited intent and later-journal refusal. |
| `packages/db/src/repos/goal-lifecycle-plan-rate-604.test.ts` | Final `604-new-canonical-plan-db-writer-outside-proposal/candidate`; SHA256 `c7cd4ed850a8271686244154adc246564049c3ca6e3d89efa518d207bbdbb1a0`; actual Plan40000/remaining25000, retained future forecast52500, literal TBA/balances, stale token/no-op/TBA refusal, actual assignment/transfer/expense classification and whole Undo/redo. Uses reviewed connection-local synthetic SQLite clock and positive retained expense tombstone assertion. |

The rollback proposal candidate SHA256 before formatting is
`6d2b4cbc3d525afeff41781738c28dbde0dd06e9e4d9559791fd9638a90ca17a`.
Source reviews retained in the handoff capsule include whole22, seven-file
prospective anchor, isolated nullable correction, pure lifecycle, migration v2,
rollback later-journal guard and final canonical Plan DB writer reviews. These
historical reviews do not certify this adoption or runtime results.

## Validation and remaining gates

Adopter ran only scoped formatting, structural JSON comparisons and cheap Git
checks; no install, typecheck, test, browser, build or migration. Root owns the
shared heavy validation lane and integration. A fresh independent HIGH full-diff
review of this branch, exact runtime/CI and browser acceptance remain required.

Existing tests initially stay unchanged. In particular existing adopt→Undo
financial scenarios expect target removal, whereas owner-approved goal saving
now synchronizes the category target atomically. Actual failures must be assessed
against the retained financial contracts; do not silently weaken target/Undo
oracles. Technical selectors/fixtures may be adapted only with per-file rationale
and independent review. No protected assertion, lock, audit, tolerance or timeout
change is included here.

Further API auth/public DTO, UI/native start/fund/manual/grouping/history flows,
seeded/imported prospective evidence and adversarial chronology acceptance are
not inferred from the three prepared suites or source clearance. Account-goal
and unsupported historical evidence remain conservative/manual as documented.

## Compatibility follow-up after root's actual run

Root ran six existing files on `97313b4a`: 40 passed and six failed. This follow-up
keeps every financial amount, action, assertion strength, timeout and Undo oracle.

| Existing file | Technical adaptation and preserved contract |
| --- | --- |
| `packages/db/src/repos/goals.test.ts` | Only the standalone legacy adopt→Undo case now seeds a retained pre-sync goal using audited `createEntity(savingsGoal)`, without a category target/start/anchor. New `createGoal` intentionally creates the target already. All existing by-date300000/validFrom and Undo-removes-target assertions remain byte-for-byte unchanged. |
| `apps/server/src/api/goals.test.ts` | Same true legacy fixture adjustment for the standalone public adopt route; real HTTP adopt/Undo actions and all target300000/removal expectations remain unchanged. Other new-goal HTTP tests retain the actual new writer. |
| `apps/web/src/budget/goals-model.test.ts` | Follow owner-required reached-first group order and locate the open totals by key. Preserve all open totals and6-euro future-rate amount; qualify displayed text as “je zukünftigem Monat” to match the retained separate future-only forecast. |

The two existing `goals-progress-query.test.ts` failures exposed a source
regression rather than a permitted financial-oracle adaptation: selected detail
month and current report month were previously explicitly separate. No owner
request changes the “bis heute” report convention. The query now again requests
`/api/goals/report` without the selected detail month, retaining `/api/goals?month=`
for the selected figures. Both existing query tests and their month/value/URL
assertions remain unchanged. Explicit report-month support remains available at
the API for intentional consumers and the new history test.

## Additional bounded acceptance candidates

No prepared API/UI/native acceptance files were present in the handoff capsule;
only the three adopted pure/DB/migration suites existed. Added:

| NEW file | Scope and fixture requirements |
| --- | --- |
| `apps/server/src/api/goal-lifecycle-604.test.ts` | Two HTTP cases on a disposable DB: public DTO anchor stripping, literal40000/25000 rate/fill, real public funding/manual Undo, retained rows/no bookings; explicit May start returns six literal month-end values1000..6000. Uses existing API unit-test AuthGate stub, so this is not authentication evidence. Requires normal API Vitest setup only. |
| `e2e/issue-604-goal-lifecycle.spec.ts` | Four real isolated-ledger flow candidates across1440/390 and both themes; current test engine follows selected Playwright project, including canonical WebKit. Actual create selectsNovember, edit retains then changesOctober, missing25000 funding and UI Undo, manual completion/Undo, chart retained/reload, synthetic DB readback/no bookings/FKs,44px/hit checks and main Axe. Requires existing isolated-ledger setup and fresh root-owned E2E build. No new auth/session mechanism, timers, tolerance or screenshots baseline changed. |

The native candidate does not claim six-month native history, automatic expense
completion, physical-device behavior or privacy-toggle acceptance. Six-point
history is checked over HTTP; actual expense completion is covered by the
existing new repository suite. All additions and adapters require independent
review and root-owned execution; the adopter ran no heavy checks.
