# Security review — 2026-10-02

Source baseline: `e2814bc`; isolated branch `codex/security-review-2026-10-02`.
This is a time-bounded source review with synthetic regression tests, not a
production penetration test or a security certification. No production access.

## Findings, ranked by severity

No critical/high vulnerability was confirmed. Open findings remain follow-up work;
this is not an all-clear. Line references refer to this branch.

| ID / severity | Location | Failure scenario | Fix / disposition |
| --- | --- | --- | --- |
| S01 Medium, fixed | `apps/server/src/app.ts:111` | Financial JSON and early API rejections lacked a shared cache prohibition; private responses could remain in browser/intermediary caches. | Set `Cache-Control: no-store` before body limits/auth. Success and 401/403/413/404/500 tested; static caching preserved. |
| S02 Medium, fixed | `apps/server/src/auth/config.ts:52` | Production HTTP origin silently selected a non-Secure cookie, allowing an insecure deployment configuration. | Require HTTPS in production (loopback HTTP allowed for the container smoke test); reject credentials, paths, queries/fragments and invalid protocols. Local HTTP development retained and tested. |
| S03 Medium, fixed latent integration hazard | `apps/server/src/app.ts:84` | Factory accepted a debug database without authentication. Current production entry point supplies auth: no demonstrated production bypass. | Reject startup without auth; synthetic tests cover guard and signed-out 401. |
| S06 Medium, fixed | `apps/server/src/api/index.ts`; `apps/server/src/imports/config.ts`; `apps/server/src/app.ts` | Legacy import HTTP routes remained reachable after app import removal. | Unmounted by default; `BUDGET_IMPORT_HTTP=1` only enables development/tests, never production. Disabled routes use the ordinary 64 KiB body cap. No UI entry points remain. Operator CLIs unchanged; gate and importer regressions covered. |
| S07 Medium, fixed | `apps/server/src/api/export.ts`; `export-admission.ts` | Concurrent exports could exhaust snapshot/archive resources. | One export per single-owner database across sessions/app instances; two across the process. Admission precedes snapshot allocation; excess returns German `429 export_busy`. Slot held through response consumption/cancellation; cleanup precedes reuse. Process-local limits assume one API process per database. Slow-client, cancellation, request-abort and failure tests covered. |
| S08 Medium, fixed | `apps/server/src/backup/s3.ts`; `backup.ts`; `index.ts` | Unbounded waits/error bodies and arbitrary operational errors could reach logs/inbox. | 30 s deadline includes headers and body; streaming limits: errors 4 KiB, list pages 1 MiB. Bodies canceled and requests aborted on completion/failure; redirects refused. Only allowlisted provider codes survive; unknown bodies, paths, keys and arbitrary operational messages are discarded. Timeout/body/garbage/retry and scheduler regressions covered with synthetic data. |
| S09 Medium, open/dev dependency (reviewed 2026-10-03) | `packages/db/package.json`; lockfile | drizzle-kit chain includes esbuild affected by [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99). | Already on latest stable `drizzle-kit@0.31.11`; its deprecated `@esbuild-kit/esm-loader` still brings `esbuild@0.18.20`, despite direct esbuild >=0.25. No supported stable non-downgrade upgrade exists. Leave versions/lockfile unchanged; no forced downgrade, transitive major override or prerelease migration tool. `drizzle-kit generate` verification recorded below. Track [upstream dependency replacement](https://github.com/drizzle-team/drizzle-orm/issues/5304) and [current package manifest](https://github.com/drizzle-team/drizzle-orm/blob/main/drizzle-kit/package.json). |
| S04 Low, fixed | `apps/server/src/api/bookings.ts:221` | Bulk skip errors returned arbitrary driver exception text, potentially containing private values/SQL. | Reuse safe `errorAnswer`, preserving intentional domain/skip messages. Synthetic SQLite trigger asserts exact safe text and unchanged booking values. |
| S05 Low, fixed | `apps/server/src/app.ts:88` | Unexpected auth/static exceptions used default Hono raw error logging, potentially containing paths/private values. Previous response was already generic. | Fixed-label log and generic JSON outer handler. Synthetic throwing auth route verifies log/response redaction. |

## Coverage and existing controls

The production source inventory in `apps/server/src` was read. This was boundary
review, not a proof of every domain calculation or every transitive dependency.

| Area / source inventory | Reviewed controls and limits |
| --- | --- |
| `app.ts`, `index.ts`, `dev.ts`, `today.ts`, `debug-summary.ts` | Mounting, body limits, static resolution, health/revision, strict self-only CSP, HSTS, Permissions-Policy and errors. Deployment/edge behavior not tested. |
| All `auth/*` production modules | RP/origin, required user verification, counters, purpose/session-bound one-use challenges, atomic recovery consumption, hashed sessions, expiry/revocation, HttpOnly/SameSite Strict/Secure host cookies, bounded audit retention. |
| CSRF and rate limits | Exact Origin guard for writes; absent Origin requires same-origin fetch metadata. Attempt/setup/general auth limits and IPv6 /64 grouping. Limits reset with process; forwarded-header trust assumes controlled edge. S07 admission is now bounded per owner/database and process; not a cross-process/distributed limit. |
| All API modules | Accounts/bookings/budget/contacts/debts/expected/goals/heute/inbox/invest/liquidity/lookups/profile/rules/search/wealth/report tables/months/cashflow/networth history/overview/payee/spending/schema/http/index reviewed. Zod boundaries and parameterized Drizzle calls; no request-controlled SQL concatenation found here. Not a full audit of DB/domain internals. |
| Complete `api/export.ts` | Session/recent step-up, static archive names, formula-safe CSV strings, consistent read-only snapshot, omitted auth tables, private temporary files and abort/final cleanup. No user-selected archive path observed. |
| `backup/backup.ts`, `s3.ts`, `retention.ts` | Snapshot/storage/retention/error paths. S08 timeout/body/error guards added; no live object-store operations. |
| Excluded code, read-only | Imports routes/staging/tasks/commit/jobs/import-worker/migrate-cli and server market API/refresh/sources/timer/index. No importer, market-fetch, account-reference/platform, migration or deployment modifications. No live upstream requests. |
| Dependency lockfile | Full and runtime-only npm audit. Four moderate affected entries are one advisory chain, not four independent runtime issues. Registry audit is not exhaustive detection. |

## Original audit verification (2026-10-02)

- `npm ci`: passed.
- `npx vitest run apps/server/src/app.test.ts apps/server/src/auth/crypto.test.ts apps/server/src/api/api.test.ts`: **56 passed**, before final debug-factory guard.
- `npm run build:e2e`: passed before final debug-factory guard.
- `E2E_PORT=4470 npx playwright test e2e/security-boundary.spec.ts --project=desktop --project=mobile --workers=1`: **5 passed** including setup; local passkey session, private no-store responses, cookie loss, 401/login redirect, health. Synthetic fixtures; no visual baselines changed.
- `npm audit --json`: exit 1, **4 moderate dev-chain entries**, zero high/critical.
- `npm audit --omit=dev --json`: passed, **0 vulnerabilities**.
- Initial `npm run check` found a test-fixture Hono environment type mismatch. Fixed with explicit `AuthGate['routes']` contextual typing. Bounded full rerun `npm run check -- -- --maxWorkers=2` passed server/web typechecks and reached DB typecheck, then was interrupted at the sprint cutoff (exit 1). Full lint/Vitest acceptance remains unverified; PR stays draft.

## S06-S09 hardening follow-up (2026-10-03)

The owner authorized production HTTP importer removal and resource hardening.
Operator `/app/migrate-cli.js` and `/app/migrate-pp-cli.js` remain unchanged.
No provider credentials or real provider APIs were used. S09 stays open for a
supported upstream stable release; registry inspection confirmed `latest=0.31.11`.

Verification on the final implementation (Windows, synthetic fixtures only):

- `npm ci`: passed; package manifests and lockfile unchanged.
- Focused Vitest run (app, exports, S3/backup, import HTTP/jobs, operator operations,
  PP migration): **93 passed**. An initial existing age restore test exceeded its
  5 s local deadline; rerun and full suite passed with a 30 s test/hook deadline.
- Full local check components executed separately to bound workers:
  `npm run typecheck`, `npm run lint`, and
  `BUDGET_REQUIRE_AGE=1 npm run test -- --maxWorkers=2 --testTimeout=30000 --hookTimeout=30000`:
  **215 files / 2,083 tests passed**, including the age encryption/restore round trip.
- `npm run build`: passed, including both unchanged operator CLI entry points.
- `npm run db:generate`: 57 tables; **No schema changes, nothing to migrate**.
  `git status`/`git diff` confirm unchanged schema, migration SQL, snapshots/journal,
  package manifests and lockfile; no new migration.
- `npm audit --omit=dev --json`: **0 vulnerabilities**. `npm ci` and `npm ls`
  confirm the unchanged four-moderate dev advisory chain: kit 0.31.11 has direct
  esbuild 0.25.12 and deprecated loader/core-utils with esbuild 0.18.20.
- `git diff --check`: passed. No UI changes/browser baseline updates. Full CI,
  including browser/container/restore jobs, remains required before review acceptance.

Owner steps: deploy only after CI/review acceptance; keep `BUDGET_IMPORT_HTTP`
unset in production (production ignores it regardless). Verify production
configuration and encrypted restore separately; local tests do not establish them.

## Decided and fixed

- S10 Medium, decided/fixed (owner decision 2026-10-02): `requireStepUp` in
  `apps/server/src/auth/routes.ts` previously accepted a recovery-code session
  (`startSession` sets step-up for every login) for the full ZIP export. A recovery
  session may now only register a new passkey and the other actions the SPEC already
  allows; export (and import step-up) answers `403 passkey_required`, which the UI shows
  as a German hint to create a new passkey. Passkey sessions are unchanged. Tested in
  `auth.test.ts` (recovery refused, also after a passkey assertion inside the recovery
  session; passkey session exports; stale step-up still `step_up_required`).
- S02 note: plain HTTP is accepted in production only for loopback hosts
  (`localhost`, `127.0.0.1`, `[::1]`), because the container smoke test in CI runs
  production mode on `http://localhost:3000`. Any other production origin needs HTTPS.
