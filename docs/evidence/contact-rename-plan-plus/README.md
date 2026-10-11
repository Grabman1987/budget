# Contact rename and Plan creation — #427

The contact PATCH validates a trimmed 1–200 character name and rejects unknown fields. It keeps the contact ID, bookings, repayments and balances. Name uniqueness checks run in the mutation transaction and during undo/redo, including forced undo. Only changed contact identities are checked; existing data is not renamed or merged implicitly. Active names use the existing exact-string naming convention.

Plan uses the existing category/group input dialogs and endpoints, including their audit groups, invalidation and undo. Category-group orderings offer a small plus after each group; other single-month orderings use the bottom category action with the existing group selector. New groups switch the single-month table to Groups. Empty groups remain usable in the multiple-month layout too.

No migration, dependency, money calculation or booking automation was added. The shared entity/audit changes are limited to contact name checks. API session/origin guards are inherited from the existing contacts mount; SQL predicates remain parameterized and mutation/audit rollback is exercised with synthetic tests.

## Verification

- TDD red: missing PATCH returned 404, contact pencil was absent, and both single/multiple-month models omitted an empty group.
- Initial focused run: contact API, contact repository, contact overview and existing input-dialog tests passed; the newly added multiple-month regression remained red before its fix.
- Changed TypeScript files: ESLint passed (exit 0).
- Final focused logic/API/repository run: 5 files / 78 tests passed. Two UI files could not start their fork workers under load; their isolated rerun with one thread worker and `--testTimeout=60000` passed (2 files / 3 tests). Total: 81 affected tests passed, with assertions unchanged.
- `npm run typecheck -w @budget/db -w @budget/server -w @budget/web`: all three packages passed (exit 0).
- Changed-file Prettier and the CSS scale check passed (exit 0).
- `npm run build:e2e` passed (exit 0); no second build was run.
- Desktop browser command: startup aborted before scenarios because the existing `tsx` sample seeder calls `os.userInfo()`, which fails with `ERR_SYSTEM_ERROR` / `uv_os_get_passwd` / `ENOMEM` in this Windows runtime. An isolated Node call reproduces the failure independently of Budget. No application or dependency workaround was added.
- Mobile command and its rerun aborted during config loading with `EPERM` while removing the synthetic `test-results/e2e-main.sqlite`. Only the three verified desktop test server processes were stopped; the permission error persisted. No test configuration, dependency or application workaround was added.
- Browser scenarios and screenshots remain unverified locally; CI must run the added spec on both projects.
- Full local check/full E2E suite intentionally omitted under the package-specific parallel-job override. CI remains the final gate.

## Visual and owner acceptance

New controls have at least 44px dimensions, use existing icons/tokens and remain inside their table/scroll container. The new browser spec checks page overflow at 390px, create/rename/undo flows and Plan accessibility in light/dark modes.

No tracked Plan/contact golden images were found and no local baselines were regenerated. Existing screenshot evidence affected: `plan.spec.ts`, `plan-detail-pages.spec.ts`, `contacts.spec.ts`, `contacts-write-off.spec.ts`, `contacts-search-dev.spec.ts`.

Owner: after required CI, review the deployed contact pencil/dialog and Plan plus actions on desktop and a 390px phone. No keys or consents are required. Merge/deploy and real-device acceptance are outside this delivery.

## Git delivery blocker

Staging failed because Git cannot create the worktree's `index.lock` (`Permission denied`). No commit could be created. The requested `git push -u origin HEAD` was attempted once and failed with Schannel `SEC_E_NO_CREDENTIALS`; no alternate transport or credential workaround was attempted. No PR could be delivered. The changes are preserved unstaged on `feat/contact-rename-plan-plus`; the index is unchanged and the working tree contains the implementation. The requested clean working tree cannot be achieved without discarding the work while commits are blocked. Complete commit/push/PR delivery outside this restricted runtime. The prepared English PR body is in [PR.md](PR.md).
