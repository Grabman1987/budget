# Reports and search: inflation labels, distinct report names, everyday search terms (#303-#308)

Inflation now explains consumption effects and CPI category proxies beside its headline. Both basket views distinguish stored and booking-derived prices, category proxies and trailing average expenditure, show coverage, and identify observation, rolling-mean and contribution periods. Existing calculations and reconciled hundredth-Pp contributions are retained; no rounding defect was reproduced.

The forecast comparison is consistently named Prognosegenauigkeit, while the budget-structure report remains Budgettreue. Existing URLs and deep links are preserved. Bounded everyday search terms lead to existing planning, liquidity, savings, debt and cost functions. Content matches and global actions have separate groups and counts, with fully named commands retaining Enter priority and the existing month-close entry. The necessary shared-shell change is limited to the existing search palette. PR #249 and #252 were reviewed.

Refs #303

Refs #304

Refs #305

Refs #306

Refs #307

Refs #308

Validation: `@budget/web` typecheck, changed-file ESLint/Prettier, 83 affected unit tests, E2E build and the new desktop package spec passed (5/5 including setup, light/dark Axe, displayed contribution sums, 44 px choices and no page overflow). Initial synthetic regressions failed before implementation. Host fork-start timeouts were resolved by rerunning only the two affected files with one thread worker; the desktop screenshot timeout passed with a longer CLI deadline. Mobile was attempted twice but remains unverified locally because bootstrap failed before browser assertions, first on an occupied sample port and then `uv_os_get_passwd: ENOMEM`. The full local check and full E2E suite were intentionally omitted under the concurrent-worktree delivery instruction. CI is the final gate.

[Synthetic desktop review images and actual verification results](https://github.com/Grabman1987/budget/blob/codex/pkg-e-reports-search-1009/docs/evidence/reports-search-1009/README.md) are committed under `docs/evidence/reports-search-1009/`. No visual baselines were regenerated. Affected Linux baselines:

- `e2e/shell.spec.ts-snapshots/shell-reports-light-desktop-linux.png`
- `e2e/shell.spec.ts-snapshots/shell-reports-light-mobile-linux.png`

Owner steps: review the wording and search destinations, inspect CI baseline changes, and confirm mobile acceptance. Refresh the protected worktree's standard index with `git reset --mixed HEAD` after delivery. No provider keys, consents or application configuration changes are required. Do not merge until the required CI and review gates pass.

🤖 Generated with [Claude Code](https://claude.com/claude-code).
