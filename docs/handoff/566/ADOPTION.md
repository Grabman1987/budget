# #566 partial adoption — bank status row

Branch `codex/sprint-566-review-tasks` is based on live main `1c19a465649490417f174787a9806b3347b7b7a6`; prerequisite #561 is closed. This change adds one read-only status row to Konten › Prüfen. It reuses `GET /api/bank-sync`, shows the latest successful retrieval time among active connections, and links an unconnected state to Einstellungen › Datenquellen. It does not change the #561 segment counts, task rows, bank sync, or financial behavior.

`apps/web/src/inbox/account-bank-review-724.test.tsx` now supplies the additional synthetic `/api/bank-sync` read for the existing page-level test and covers the setup link and active connection time. Existing account-scoped inbox behavior assertions remain. This UI test adaptation is technical and does not alter financial, security, locking, audit, Undo, timeout, tolerance, or coverage expectations.

`git diff --check` passed. Tests, types, build, browser evidence, and independent review are pending; no tests were run by the implementation agent.

The task-grouping portion remains unimplemented pending a clarified count contract. Current `segments.aufgaben` is an aggregate of non-booking inbox entries plus unlinked receipts. The account reminder projection is separate and outside that count; payslip proposals are a subset of stored revision entries, and no explicit “plan topics” grouping is exposed. Do not present these rows as a partition of the segment count until their overlap and count contract are clarified.
