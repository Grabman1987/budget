# Bank-sync follow-ups: local evidence

Branch: `feat/bank-match-and-link`. Working-tree changes only; no commit, push or PR was created.

## Delivered behavior

- Inbox candidates suggest the nearest eligible manual booking on the same account with the exact amount and currency within five calendar days. Owner-confirmed merge retains the booking identity, memo, payee, splits and receipt links; adopts the bank date/reference and confirmed source. Existing manual transfer legs can also be merged without moving the counterpart date.
- Two selected bookings on different own accounts, with opposite nonzero amounts in the same currency within five days, can be linked as one transfer. Original dates and identities remain; categories, income types, payees and project attribution are removed. An inbox candidate can create the missing bank leg and link the existing mirror. Expected-payment links are reopened when their booking becomes a transfer.
- Konten overview and account detail show the stored bank balance, statement day, fetch timestamp and reconciled-through day. The one-click lock rechecks current-day balance equality inside the transaction, rejects pending bookings/open candidates and uses the existing reconciliation engine.
- Mutations share one audit group with their inbox decisions. Undo/redo restores the original allocations and candidate; closed accounts, locked bookings and protected contact/trade relationships are enforced at the server boundary. No provider requests occur during these ledger decisions.
- Additive Drizzle migration `0023_bank_followups` follows `0022_income_next_month_and_pending` on integration/batch-2.

## Verification

- `npm ci`: passed.
- Focused domain, repository, migration, bank workflow and API tests: 50 passed.
- Existing import-worker and S3 tests: 16 passed with the sandbox test environment below.
- `npm run check`: typecheck and lint passed; full unit run covered 225 files / 2,178 tests, with 2,174 passed and four existing tests exceeding the default five-second limit (exit 1).
- `npm test -- --maxWorkers=2 --testTimeout=30000 apps/server/src/auth/auth.test.ts apps/server/src/imports/pp-statement.test.ts apps/server/src/api/portfolio-allocation.test.ts apps/web/src/auth/setup-page.test.tsx`: all four affected files / 63 tests passed. Together with the complete run, every unit test passed; the default combined command did not finish green on this host.
- `npm run build`: passed (production web and server).
- `E2E_PORT=4810 npx playwright test --config=e2e/bank-followups.config.ts`: 6 passed against the production build, desktop 1440 and mobile 390.
- Inbox and account overview: no axe violations or horizontal page overflow in light/dark modes. Merge activation by keyboard and real API mutation/undo paths were exercised.
- Screenshots below were inspected against the existing Konten/prototype grammar and design tokens. These are review evidence, not pixel-baseline acceptance.
- `git diff --check`: passed.

The original shared Playwright run failed during sample-server startup (`tsx` Windows `uv_os_get_passwd` error). The scoped bank config uses existing isolated fixed-clock ledgers, without shared sample startup. The bootstrap token is now in a side-effect-free helper so isolated tests do not reset shared databases.

The first full unit run was interrupted after existing import-worker OS failures and S3 timing failures. The blocked `os.userInfo()` call was reproduced separately. For the complete check, `VITEST_MAX_WORKERS=2` bounded load and `NODE_OPTIONS=--require=<absolute-workspace-path>/test-results/windows-userinfo-shim.cjs` preloaded an ignored local helper. It returns a synthetic OS identity only when the Windows sandbox throws `ERR_SYSTEM_ERROR` for `uv_os_get_passwd`; other errors propagate. The four timed-out files then passed with the same helper and a 30-second test limit; no assertions or test isolation were changed. Production code and dependency files are unchanged by this helper. Repeat the standard `npm run check` in CI or an unrestricted owner shell before integration.

## Visual evidence

| Surface | Desktop | Mobile |
| --- | --- | --- |
| Inbox merge | [light](bank-match-desktop-light.png), [dark](bank-match-desktop-dark.png) | [light](bank-match-mobile-light.png), [dark](bank-match-mobile-dark.png) |
| Account balance/lock | [light](bank-followups-desktop-light.png), [dark](bank-followups-desktop-dark.png) | [light](bank-followups-mobile-light.png), [dark](bank-followups-mobile-dark.png) |

## Remaining owner/orchestrator steps

Review the working tree, obtain a green standard CI check, handle commit/PR and any migration renumbering, then perform private account acceptance after deployment. Live provider setup, ambiguous source-history decisions and assignment-rule work remain separate. Bank mapping retains the existing EUR-only scope; FX-origin bookings and protected native contact/trade paths are not rewritten by these actions.

## Changed files

- `apps/server/src/api/accounts.ts`
- `apps/server/src/api/bank-sync.test.ts`
- `apps/server/src/api/bank-sync.ts`
- `apps/server/src/api/bookings.ts`
- `apps/server/src/api/index.ts`
- `apps/server/src/bank-sync/service.test.ts`
- `apps/server/src/bank-sync/service.ts`
- `apps/web/src/budget/use-category-writes.ts`
- `apps/web/src/inbox/bank-candidate.tsx`
- `apps/web/src/ledger/account-page.tsx`
- `apps/web/src/ledger/bank-balance.tsx`
- `apps/web/src/ledger/bookings-page.tsx`
- `apps/web/src/ledger/ledger.css`
- `apps/web/src/ledger/overview-page.tsx`
- `apps/web/src/ledger/types.ts`
- `apps/web/src/pages/data-sources.css`
- `docs/FEATURES.md`
- `docs/ROADMAP.md`
- `docs/evidence/bank-followups/bank-followups-desktop-dark.png`
- `docs/evidence/bank-followups/bank-followups-desktop-light.png`
- `docs/evidence/bank-followups/bank-followups-mobile-dark.png`
- `docs/evidence/bank-followups/bank-followups-mobile-light.png`
- `docs/evidence/bank-followups/bank-match-desktop-dark.png`
- `docs/evidence/bank-followups/bank-match-desktop-light.png`
- `docs/evidence/bank-followups/bank-match-mobile-dark.png`
- `docs/evidence/bank-followups/bank-match-mobile-light.png`
- `e2e/bank-followups.config.ts`
- `e2e/bank-followups.spec.ts`
- `e2e/bank-sync.spec.ts`
- `e2e/bootstrap.ts`
- `e2e/isolated-ledger.ts`
- `e2e/setup-token.ts`
- `packages/db/drizzle/0023_bank_followups.sql`
- `packages/db/drizzle/meta/0023_snapshot.json`
- `packages/db/drizzle/meta/_journal.json`
- `packages/db/src/bank-followups-migration.test.ts`
- `packages/db/src/repos/bank-followups.test.ts`
- `packages/db/src/repos/bank-followups.ts`
- `packages/db/src/repos/index.ts`
- `packages/db/src/repos/invariants.ts`
- `packages/db/src/schema/bank-sync.ts`
- `packages/domain/src/bank-sync.test.ts`
- `packages/domain/src/bank-sync.ts`
- `playwright.config.ts`
- `docs/evidence/bank-followups/README.md`
