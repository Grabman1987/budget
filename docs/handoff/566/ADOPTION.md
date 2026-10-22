# #566 partial adoption — bank status row

Branch `codex/sprint-566-review-tasks` is based on live main `1c19a465649490417f174787a9806b3347b7b7a6`; prerequisite #561 is closed. This change adds one read-only status row to Konten › Prüfen. It reuses `GET /api/bank-sync`, shows the latest successful retrieval time among active connections, and links an unconnected state to Einstellungen › Datenquellen. It does not change the #561 segment counts, task rows, bank sync, or financial behavior.

`apps/web/src/inbox/account-bank-review-724.test.tsx` now supplies the additional synthetic `/api/bank-sync` read for the existing page-level test and covers the setup link and active connection time. Existing account-scoped inbox behavior assertions remain. This UI test adaptation is technical and does not alter financial, security, locking, audit, Undo, timeout, tolerance, or coverage expectations.

`git diff --check` passed. Tests, types, build, browser evidence, and independent review are pending; no tests were run by the implementation agent.

The later task-grouping packet adopts the owner-authorized count contract: due account checks belong inside Aufgaben; global Prüfen equals Umsätze plus Aufgaben; counts represent raw tasks, not source rows. See [current contract/evidence](../../evidence/inbox-task-sources-566/README.md). Its existing page-level adapter navigates actual Umsätze→Aufgaben→account-source actions instead of expecting the removed external reminder block. Candidate amount, no-write checks, bank-status assertions and all financial/security/Undo/timeouts remain intact. The packet also adds fatal-refetch suppression/retry and next-page error regressions; execution and independent delta clearance are pending.
