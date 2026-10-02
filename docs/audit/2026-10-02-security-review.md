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
| S02 Medium, fixed | `apps/server/src/auth/config.ts:52` | Production HTTP origin silently selected a non-Secure cookie, allowing an insecure deployment configuration. | Require HTTPS in production; reject credentials, paths, queries/fragments and invalid protocols. Local HTTP development retained and tested. |
| S03 Medium, fixed latent integration hazard | `apps/server/src/app.ts:84` | Factory accepted a debug database without authentication. Current production entry point supplies auth: no demonstrated production bypass. | Reject startup without auth; synthetic tests cover guard and signed-out 401. |
| S06 Medium, open/excluded | `apps/server/src/api/index.ts:96`; `apps/server/src/imports/routes.ts:70` | Import HTTP surface remains mounted after app importing was removed in favor of operator tooling. An authenticated session retains access to this sensitive upload/mapping surface. Commit/revert require step-up; no unauthenticated bypass claimed. | Import owner should remove public mount or explicitly disable it in production while retaining operator CLI. No excluded code edits. |
| S07 Medium, open | `apps/server/src/api/export.ts:652` | Each fresh-session export creates an independent snapshot/archive without in-flight admission limit. Concurrent downloads can exhaust temporary disk/CPU. Not an unauthenticated attack. | Bound concurrent exports, return 429 for excess requests, test slow clients/cancellation/cleanup before changing stream lifecycle. |
| S08 Medium, open | `apps/server/src/backup/s3.ts:112`; `apps/server/src/backup/s3.ts:119`; `apps/server/src/backup/backup.ts:173` | S3 fetch lacks timeout; error body is fully read before truncation. Slow/oversized upstream failures can stall backups or consume memory. Raw operational exception messages can reach logs/inbox. | Add timeout, streaming byte limit, allowlisted provider codes and sanitized messages; exercise retry/failure handling. No actual credential leak observed. |
| S09 Medium, open/dev dependency | `packages/db/package.json:19` | drizzle-kit chain includes esbuild affected by [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99): malicious websites can read an exposed affected dev server. | Coordinate supported upgrade with migration owner. Do not apply suggested forced major downgrade. Runtime audit has zero vulnerabilities. |
| S04 Low, fixed | `apps/server/src/api/bookings.ts:221` | Bulk skip errors returned arbitrary driver exception text, potentially containing private values/SQL. | Reuse safe `errorAnswer`, preserving intentional domain/skip messages. Synthetic SQLite trigger asserts exact safe text and unchanged booking values. |
| S05 Low, fixed | `apps/server/src/app.ts:88` | Unexpected auth/static exceptions used default Hono raw error logging, potentially containing paths/private values. Previous response was already generic. | Fixed-label log and generic JSON outer handler. Synthetic throwing auth route verifies log/response redaction. |

## Coverage and existing controls

The production source inventory in `apps/server/src` was read. This was boundary
review, not a proof of every domain calculation or every transitive dependency.

| Area / source inventory | Reviewed controls and limits |
| --- | --- |
| `app.ts`, `index.ts`, `dev.ts`, `today.ts`, `debug-summary.ts` | Mounting, body limits, static resolution, health/revision, strict self-only CSP, HSTS, Permissions-Policy and errors. Deployment/edge behavior not tested. |
| All `auth/*` production modules | RP/origin, required user verification, counters, purpose/session-bound one-use challenges, atomic recovery consumption, hashed sessions, expiry/revocation, HttpOnly/SameSite Strict/Secure host cookies, bounded audit retention. |
| CSRF and rate limits | Exact Origin guard for writes; absent Origin requires same-origin fetch metadata. Attempt/setup/general auth limits and IPv6 /64 grouping. Limits reset with process; forwarded-header trust assumes controlled edge. Export resource gap S07. |
| All API modules | Accounts/bookings/budget/contacts/debts/expected/goals/heute/inbox/invest/liquidity/lookups/profile/rules/search/wealth/report tables/months/cashflow/networth history/overview/payee/spending/schema/http/index reviewed. Zod boundaries and parameterized Drizzle calls; no request-controlled SQL concatenation found here. Not a full audit of DB/domain internals. |
| Complete `api/export.ts` | Session/recent step-up, static archive names, formula-safe CSV strings, consistent read-only snapshot, omitted auth tables, private temporary files and abort/final cleanup. No user-selected archive path observed. |
| `backup/backup.ts`, `s3.ts`, `retention.ts` | Snapshot/storage/retention/error paths. S08 remains; no live object-store operations. |
| Excluded code, read-only | Imports routes/staging/tasks/commit/jobs/import-worker/migrate-cli and server market API/refresh/sources/timer/index. No importer, market-fetch, account-reference/platform, migration or deployment modifications. No live upstream requests. |
| Dependency lockfile | Full and runtime-only npm audit. Four moderate affected entries are one advisory chain, not four independent runtime issues. Registry audit is not exhaustive detection. |

## Verification

- `npm ci`: passed.
- `npx vitest run apps/server/src/app.test.ts apps/server/src/auth/crypto.test.ts apps/server/src/api/api.test.ts`: **56 passed**, before final debug-factory guard.
- `npm run build:e2e`: passed before final debug-factory guard.
- `E2E_PORT=4470 npx playwright test e2e/security-boundary.spec.ts --project=desktop --project=mobile --workers=1`: **5 passed** including setup; local passkey session, private no-store responses, cookie loss, 401/login redirect, health. Synthetic fixtures; no visual baselines changed.
- `npm audit --json`: exit 1, **4 moderate dev-chain entries**, zero high/critical.
- `npm audit --omit=dev --json`: passed, **0 vulnerabilities**.
- Initial `npm run check` found a test-fixture Hono environment type mismatch. Fixed with explicit `AuthGate['routes']` contextual typing. Bounded full rerun `npm run check -- -- --maxWorkers=2` passed server/web typechecks and reached DB typecheck, then was interrupted at the sprint cutoff (exit 1). Full lint/Vitest acceptance remains unverified; PR stays draft.

## Owner questions

1. May a fresh recovery-code session authorize export during the existing
   five-minute step-up window, or must every export require a fresh passkey?
   `apps/server/src/auth/routes.ts:168` creates authenticated sessions with
   step-up, including recovery login. Existing policy preserved; no bypass claimed.
2. Confirm importer removal ownership/timing (S06) and prioritize bounded exports,
   backup hardening and migration-tool dependency upgrade (S07–S09).
