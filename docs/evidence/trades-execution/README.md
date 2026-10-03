# Trade and savings-execution verification

All fixtures and screenshots use synthetic data. Screenshots record the existing panels at
desktop 1440 × 900 and mobile 390 × 844. They do not replace any visual regression baseline.

| Workflow | Desktop | Mobile |
| --- | --- | --- |
| Dividend/distribution, light | [image](trade-dividend-light-desktop.png) | [image](trade-dividend-light-mobile.png) |
| Dividend/distribution, dark | [image](trade-dividend-dark-desktop.png) | [image](trade-dividend-dark-mobile.png) |
| Savings confirmation, light | [image](savings-execution-light-desktop.png) | [image](savings-execution-light-mobile.png) |
| Savings confirmation, dark | [image](savings-execution-dark-desktop.png) | [image](savings-execution-dark-mobile.png) |
| Deletion confirmation, light | [image](trade-delete-lower-light-desktop.png) | [image](trade-delete-lower-light-mobile.png) |

## Commands and results

- One clean `npm ci` after removing `node_modules`: passed. No parallel installations.
- `npm run build`: passed.
- `npm run check` with `VITEST_MAX_WORKERS=2`: passed; **263 test files, 2,526 tests passed, two encrypted-backup tests skipped because the local age binary is unavailable**. Linux CI requires age and runs them.
- `npm run build:e2e`, then `playwright test e2e/portfolio-trades.spec.ts e2e/trade-confirmation.spec.ts e2e/savings-plans.spec.ts --workers=2 --timeout=180000`: **29 passed**.
- No screenshot baseline was changed. Full pinned Linux CI and private Gate 3 reconciliation remain open.

The browser scenarios verify all nine kinds through existing buy/sell and new-kind captures,
literal holdings/basis/native cash effects, source edits and audited deletion/undo/redo. They also
cover current/future schedule versions, dirty Back and held writes, retry/stale proposals,
owner-entered execution amounts, keyboard confirmation, light/dark Axe checks and overflow.
Deletion assertions await the returned detail panel and persisted API state; a disappearing
history row while the editor is open does not prove that deletion has finished.

## Local environment

The interrupted run left incomplete dependency copies outside `node_modules` under `.cache`.
Those copies were preserved under ignored `node_modules/.cache/interrupted-run` so the repository
lint checks only project sources. No dependency or lint configuration was changed.

The Windows sandbox cannot resolve `os.userInfo()` (`uv_os_get_passwd: ENOMEM`). Drizzle and the
sample-server `tsx` invocation used a local, ignored launcher providing a synthetic temporary
directory identifier. Generated SQL and application code are unmodified by that workaround.
Completed browser runs required stopping their own local test-server processes to finish
Windows cleanup. Normal development and CI commands do not need this sandbox workaround.

The original worktree's Git metadata has an explicit sandbox write denial. Delivery uses a
separate checkout under ignored `node_modules/.cache/trades-delivery`, copies the verified files
and checks their hashes before committing. The original worktree's Git HEAD/index remain at
the starting revision; no permission settings are changed.

The CLI push is unavailable because the sandbox account cannot use the Windows credential
store. The GitHub connector also refused Git-tree creation: it requires approval, while this
session's approval policy is `never`. No branch or PR was published. Three local commits are
retained in the delivery checkout and exported to an ignored Git bundle for an authenticated
owner session. No permission or authentication settings were changed.
