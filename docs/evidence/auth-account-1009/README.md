# Login and account page — #311 / #312 / #313

The package builds on PR #405's liquidity controls in `account-page.tsx`; those controls and the shared forecast remain unchanged.

## Proven gaps

- #311: cancellation/error mapping and busy reset already existed. A 60-second local watchdog now bounds the browser ceremony, requests native cancellation through the installed SimpleWebAuthn abort service, and discards late credentials before server verification. The pending state explains the wait; retry and the existing recovery action remain next to the error.
- #312: the sidebar consumes the existing `/api/auth/status` query and `viaRecovery` field: Passkey / Wiederherstellungscode / unknown. It no longer asserts which physical device supplied the passkey. No metadata endpoint or permission was added. A shared auth label hook also replaces the fixed settings profile title-block label.
- #313: the account header distinguishes the stored owner check, technical retrieval timestamp (Vienna time) and bank observation date. Missing dates are unknown; a live account without a bank mapping is not configured. Closed accounts, whose API omits bank metadata, show unknown. No connection or sync is triggered. A minimal optional account field override in `PageFrame`/`AreaHead` removes the unrelated current-day clock and fixed sync placeholder from single-account pages.

## Task-scoped auth review

Reviewed the changed client ceremony, login state and sidebar against server `auth/routes.ts`, `auth/store.ts` and `auth/auth.test.ts`.

- Only a timely assertion reaches `loginVerify`. Late resolution after timeout cannot authenticate. Success/failure clears the watchdog; successful verification does not retain the ceremony timer.
- Server WebAuthn verification, challenge purpose/expiry/replay protection, user verification, cookie flags, session lookup/revocation, origin guards and rate limits are unchanged.
- `requirePasskeySession` still refuses recovery sessions. `requireStepUp` still needs a passkey session and freshness. Recovery cannot unlock full export, even after a later step-up. Existing synthetic API tests use real cryptographic verification and cover these boundaries.
- Display reads the current server session method, not local storage or the device list. No tokens, session identifiers, full IPs, secrets or private data are exposed.
- No migration, new dependency, real provider call or private financial data.

This is a task-scoped source review and synthetic regression check, not security certification or independent hardware acceptance.

## Verification

TDD: hanging-ceremony, session display, missing account metadata and login pending-state tests were observed failing before implementation. A locale formatting failure led to explicit padded date fields. The first browser run found an ambiguous status selector (global toast plus login message) and a fixture context setup timeout under load; the selector is now scoped to `main`, and the file timeout covers setup. Assertions remain intact; the spec additionally waits for the native request and checks its abort signal.

Final targeted results (all exit 0):

- `npm run typecheck -w @budget/web`.
- ESLint on every changed TypeScript/TSX file; `node packages/ui/scripts/check-css-scale.mjs`.
- Affected Vitest files: `auth/webauthn.test.ts`, `auth/login-page.test.tsx`, `shell/sidebar.test.tsx`, `ledger/account-freshness.test.tsx`, `pages/area-head.test.tsx`, server `auth/auth.test.ts`, with `--maxWorkers=1`: **6 files / 61 tests passed**.
- `npm run build:e2e` once, then one web-only E2E-mode rebuild after the visual review found fixed shared header labels. Server build was not repeated.
- `E2E_PORT=4940 E2E_START_TIMEOUT=300000 npx playwright test e2e/auth-account.spec.ts --workers=1 --project=desktop`: **6 passed** (3 scenarios + 3 setup checks).
- Same command with `--project=mobile`: **6 passed**. Light/dark accessibility, page overflow and login touch targets passed; review captures are at 1440/390 px.

The owner package override replaces the full local check/full E2E suite; CI is the final gate.

## Automated, cloud and physical-device evidence

- Local automation: Windows, Chromium desktop 1440 × 900/mobile 390 × 844, synthetic ledger and mocked hanging native credential request/session method. Software authenticator tests exercise real server verification. These do not establish physical device behavior.
- Cloud browser/deployment: not observed in this task; no deployed revision or cloud login claim.
- Physical device: pending. Owner checks successful passkey login, cancellation, absent/timeout dialog, retry and recovery with Windows Hello/Touch ID/Face ID/a coupled device. Confirm the Recovery label and refusal of full export until a passkey login with fresh confirmation.
- Account acceptance: compare owner check, retrieval timestamp and bank observation date in the running app. No new keys, consent, connection or sync is needed.

## Baselines

No baselines regenerated. The idle login/setup snapshots are unchanged. Desktop shell baselines with the sidebar method are affected: `shell-heute-light-desktop-linux.png`, `shell-reports-light-desktop-linux.png`, `shell-heute-dark-desktop-linux.png` in `e2e/shell.spec.ts-snapshots`. Other snapshots containing the desktop sidebar may also need deliberate Linux CI review. Account header review captures live alongside this file; they are not replacement baselines.


## Git delivery blocker

PR #405 is merged (GitHub observation: 2026-10-09). `git fetch origin` could not write the worktree `FETCH_HEAD`. Both `git add` and `git commit` failed creating `index.lock` with Permission denied. No workaround was used.

The requested `git push -u origin HEAD` succeeded, publishing only the unchanged starting HEAD `d9701fd9` to `codex/pkg-g-auth-account-1009`; it does not contain this package. There are no new task commits. The index remains empty, and the completed changes/evidence remain unstaged in the worktree. A clean working tree cannot be provided without either committing or discarding those changes. The prepared PR body is `PR.md` beside this file. The requested normal `gh pr create` attempt returned HTTP 401 (Requires authentication); no PR was created and no authentication workaround was attempted.

Owner delivery step: commit and push these files from an environment with normal access to this worktree's Git index, then open the normal package PR using `PR.md`. Do not merge before required CI/owner review.
