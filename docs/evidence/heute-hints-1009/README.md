# Today hints, 2026-10-09

Scope: #269, #270, #274, #275 and #276 on `codex/pkg-a-heute-hints-1009`, based on `b78e249f`. Synthetic data only.

## Proven gaps and changes

- Plan's 50/30/20 band previously issued a full-month verdict from small running actual income. It now states the actual Plan-month denominator, explicitly excludes expected income, withholds a monthly verdict for open/future months and offers the last completed One-Pager. The existing allocation formula, shares and overspending scale are unchanged. The One-Pager already suppresses partial-month shares; no duplicate report implementation was added.
- The existing payday-room card now comes first, followed by month and wealth. Its planning boundary and the expected cash receipt are shown separately, including the no-receipt case. These dates can differ; the synthetic default uses a 15 October planning boundary and a 30 September receipt.
- Today now displays all four rule counts, explains missing inputs and links to the existing concrete missing-input explanations. Unknown or unavailable checks cannot trigger the attention section's all-clear.
- Empty additional steps refer to attention points already shown above.
- PR #226's result-first grouping remains intact. Today links to a stable finding anchor; the rule page focuses and scrolls to its value, threshold/cause and action. Rule settings remain secondary. The only shared change is the optional `AppLink.hash` prop; no backend, persistence, financial formula or dependency change was needed.

## Local verification

The owner's package override replaces the full local check. No full unit/E2E suite or snapshot baseline regeneration was run.

- `npm ci --cache .npm-cache --no-audit --no-fund`: exit 0, 506 packages. The global cache is outside the writable sandbox.
- Web `tsc`: exit 0.
- Focused Vitest: 6 files / 25 tests passed; the subsequent attention regression file passed 3 tests, adding one new case (26 unique tests). The initial RED run reproduced seven failures across five files.
- Changed-file ESLint: exit 0; CSS files are handled by Prettier and the repository CSS scale checker. Both passed. Later test-only changes were checked separately.
- `npm run build:e2e`: exit 0, run once; existing bundle-size and annotation warnings remain.
- Final `E2E_PORT=4884 E2E_START_TIMEOUT=300000 npx playwright test e2e/heute-hints-1009.spec.ts --workers=1 --project=desktop --project=mobile`: exit 0, 7 passed in 1.6 minutes (3 setup cases plus both new behaviors in each viewport). Finding value/cause/action, focus, secondary settings, unknown-input navigation, completed-month navigation, Axe, overflow and 44 px links pass.
- Both existing answer-card behaviors passed on desktop and mobile after the intended order update; the changed empty-Heute case passed on desktop. Across the targeted runs, nine distinct application cases passed. Earlier failing preparation runs and the port conflict are described below; they are not claimed as successful runs.

During browser preparation, stale card indices and two fixture assumptions were corrected without changing application calculations. The desktop test must preserve the already-open “More month” section; the rule-route fixture now pins its synthetic finding explicitly. The mobile Plan read arrived after the default five-second expectation; the focused spec uses the repository's existing 15-second expectation convention. Post-correction restarts hit overlapping ports: the concurrent package D job used base port 4885 while this package needs 4884–4887. Process ancestry confirmed the other worktree; no unrelated process was stopped and no port or reuse flag was changed.

## Visual and owner acceptance

Captures in this directory and `cards/` / `budget/` use synthetic data, desktop 1440 px and mobile 390 px, in both themes. The focused browser checks cover Axe, overflow and 44 px action/comparison links. Review captures alongside the existing Blaupause; these are evidence, not replacement baselines.

Affected frozen baselines (not regenerated):

- `e2e/shell.spec.ts-snapshots/shell-heute-light-desktop-linux.png`
- `e2e/shell.spec.ts-snapshots/shell-heute-dark-desktop-linux.png`
- `e2e/shell.spec.ts-snapshots/shell-heute-light-mobile-linux.png`
- `e2e/shell.spec.ts-snapshots/shell-heute-dark-mobile-linux.png`

Rule-page captures without a finding hash should remain unchanged. Plan and One-Pager behavior checks do not maintain image baselines. CI, reviewed visual-baseline updates, merge/deployment and physical iPhone/owner acceptance remain open. No credentials, provider access or migration steps are required for this package.

## Publication blocker

The final add/commit attempt could not create `.git/worktrees/budget-pkg-a/index.lock` (`Permission denied`). No commit was created. The requested normal push was also attempted and failed with `schannel: AcquireCredentialsHandle failed: SEC_E_NO_CREDENTIALS`. Neither restriction was bypassed. A correct PR cannot be created from this uncommitted work; its English body is saved in `PR.md`.

The index is empty and the implementation/evidence remain in the working tree. A clean working tree and a PR body inside the last commit could not be produced without discarding the work or bypassing the Git-write restriction. The owner needs to commit the changes, push this branch and create the single normal PR from an environment with Git access. Keep the issue references and do not merge as part of that delivery.
