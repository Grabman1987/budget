# Account review — #422

Implemented on `feat/reconcile-all-accounts`, based on `d02d5a92`.

- All eight open booking-based account types offer reconciliation, irrespective of budget membership/currency. Month-close step 2 includes the same types. Closed/future-opened accounts and derived receivables retain their exclusion; manual assets with products retain their existing valuation guard.
- The overview distinguishes stored reconciliation and manual-valuation dates, missing checks, and the inclusive 35-day warning (icon plus warning colour).
- P2P/other-asset account pages reuse the audited native-currency value form, display the last value/date, and offer undo. Invalid/future/pre-opening/locked dates, invalid/negative/empty amounts and product valuation have visible reasons and guarded submission.
- Both month-close forms default to the earlier of month end and today. The reconciliation dialog itself is unchanged.

No migration, new dependency, private data or provider API call was required. The account API adds read metadata only; existing EUR valuation, integer-cent validation, transaction/audit and undo guards remain in place.

## Verification (2026-10-11)

All checks follow the package-specific resource limit; `npm run check` and the full E2E suite were not run. CI remains the final gate.

| Check | Actual result |
| --- | --- |
| `npm.cmd run typecheck -w @budget/web` | Exit 0 |
| `npm.cmd run typecheck -w @budget/server` | Exit 0 |
| ESLint on changed TypeScript/TSX files | Exit 0, no errors |
| Prettier on changed source/CSS/docs | Exit 0 |
| Affected Vitest files | 47 tests passed across 6 files (40 + 7 in the focused retry) |
| `npm.cmd run build:e2e` (once) | Exit 0; Zod/Rollup annotation and existing bundle-size/dynamic-import warnings |
| New E2E spec, desktop 1440 | 4/4 passed, including 3 setup tests |
| New E2E spec, mobile 390 | 4/4 passed, including 3 setup tests |

Focused test files: `ledger/overview-model.test.ts`, `ledger/account-review.test.tsx`, `ledger/manual-value.test.tsx`, `month-close/month-close-page.test.tsx`, server `api/month-close.test.ts` and `api/account-series-value.test.ts`.

The final six-file Vitest run passed 40 tests but could not start two forks workers under memory pressure. Only `account-review.test.tsx` and `manual-value.test.tsx` were retried with `--maxWorkers=1 --pool=threads`: 7/7 passed, without changing assertions. TDD first reproduced the account filter, missing value metadata, future default date and silent negative-value blocker.

The first desktop E2E attempt stopped before the scenario because port 4930 was occupied (`EADDRINUSE`, verified with a bind probe). The supported `E2E_LEDGER_PORT_OFFSET=120` selects the verified free isolated-ledger port 5030. Final browser commands used `E2E_PORT=4910`, `E2E_START_TIMEOUT=300000` and that offset:

```text
npx.cmd playwright test e2e/account-review.spec.ts --workers=1 --project=desktop
npx.cmd playwright test e2e/account-review.spec.ts --workers=1 --project=mobile
```

The browser scenario covers off-budget checking/loan/brokerage buttons, both manual account types, exact-cent saves and undo, 34/35-day freshness boundaries, all accounts in month close, and running-month defaults on 11 October. Light/dark Axe checks pass on the overview, value form and month-close account step. Page overflow checks pass at both widths; mobile reconciliation/save controls meet 44 px.

## Visual evidence

Reviewed the current precision-layer UI; no snapshot baselines were regenerated. No checked-in Konten/manual-value/month-close baseline files exist. Affected surfaces and review images:

| Surface | Desktop | Mobile |
| --- | --- | --- |
| Overview | [light](desktop-overview-light.png), [dark](desktop-overview-dark.png) | [light](mobile-overview-light.png), [dark](mobile-overview-dark.png) |
| Value form | [light](desktop-manual-value-light.png), [dark](desktop-manual-value-dark.png) | [light](mobile-manual-value-light.png), [dark](mobile-manual-value-dark.png) |
| Month close | [light](desktop-month-close-light.png), [dark](desktop-month-close-dark.png) | [light](mobile-month-close-light.png), [dark](mobile-month-close-dark.png) |

Remaining: required CI/integration and owner acceptance of the account-update session and daily overview on desktop/a physical phone. No keys, consents or settings changes are needed. No merge or deployment was performed.
## Delivery blocker

The local Git add/commit attempt failed: `Unable to create C:/Users/fabia/budget/.git/worktrees/budget-r1/index.lock: Permission denied`. No feature commit exists to push or open a PR from. The index remains unstaged, and the implemented changes/evidence remain uncommitted in this worktree. The prepared English PR body is in [PR.md](PR.md). Owner action: restore Git write access, commit the reviewed changes on this branch, then push and create the requested normal PR. No sandbox bypass was attempted.