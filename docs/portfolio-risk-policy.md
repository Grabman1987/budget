# Portfolio risk policy — owner directive PR2 (2026-10-04)

Scope: §§17–20, R01–R06 and PR2 in §46. No settings-page implementation, quality/universe changes, panel repair, migration or deployment.

## Pre-change matrix

Fetched `origin/main` at `a429b48a8bc28c13b3e38babc144c2a923524452`; it is already an ancestor, so no integration is required. Initial PR1 base: `8197bd3dd630498f4a2377b8815bb7a4a9820749`; incorporated PR1's subsequent browser-test fixes at `e34129e605f1f5215a7ea84fbdd970092a6f7bfd`. Branch: `codex/risk-policy-pr2`.

| Finding | Status at PR1 base | Evidence | Action |
| --- | --- | --- | --- |
| Asset-class placeholder | Still present | Path absent from `BUILT_PATHS` in `router.tsx` | PR4 |
| Historical class assignment | Fixed by PR1 | `exposuresAsOf`, A01/A02/A08 in `asset-exposure.test.ts`, dated report snapshots | Preserve and rerun |
| Leverage in risk | Missing | `WealthPosition` lacked leverage; R14/R15 summed market value by kind | Shared classification and gross projection |
| Shared risk settings | Divergent | `riskOf` used defaults; rule evaluation read stored parameters | One runtime policy resolver |
| Invisible iPhone panel | Owner-reported; not reverified here | Shared `PanelHost` / native dialog unchanged | PR5; no repair claimed |

## Policy source and date contract

`resolvePortfolioRiskPolicy(db, asOf)` supplies R13/R14/R15 from live stored `rule.params_json` and effective-dated class targets. Domain schemas are the only default threshold source. Missing rows/keys use defaults; stored zero is preserved. Invalid stored parameters fail instead of silently substituting another financial policy. Disabled rules retain stored limits; `enabled` controls finance-check participation.

Targets and exposures resolve inclusively at the valuation/report date. Rule parameters and security leverage are **not versioned in the existing schema**: historical reads use current stored configuration. `asOf` does not promise a historical parameter/leverage snapshot. Adding those histories is outside PR2; historical class assignments remain protected by PR1.

Consumers: rule inputs/evaluation (stored month-end results, Heute/finance check and rule status reports), Portfolio allocation/summary, rebalancing, report 4.2 with month-end R13 bands, and savings recommendations. The Regelwerk R13–R15 previews use current inputs at the requested date, so leverage edits do not require a night run before agreeing with Portfolio. Superseded built-in R13/R15 copy is corrected on read; custom owner copy and stored rows remain untouched. Savings proposals stop additions to R14-breached instruments or crypto/P2P platforms as well as R15 products. Existing total-conserving redistribution and `no_eligible_plan` fallback remain; no trades or bank instructions execute.

R13 wording: **“Standardband: der kleinere Wert aus ±5 Prozentpunkten und ±25 % des Sollgewichts.”** Stored individual class bands take precedence. Global `maxBandBp`, `relativeBandPct` and severity `badFactorPct` resolve from R13 parameters. Existing class-band `0` still means standard, not an individual zero-width band. Target/null semantics and dynamic investment tiers remain subsequent work.

## Classification and leverage

Pure `classifyRisk` uses kind and leverage, optional `speculativeOverride`, and derivative metadata when supplied. Names and asset-class labels never determine risk.

| Product | Speculative R15 default | Single instrument R14 | Platform R14 |
| --- | --- | --- | --- |
| ETF/fund, 1× | No | No | No |
| Any product, leverage >1× or derivative | Yes | Yes | Crypto/P2P only |
| Stock, 1× | Yes | Yes | No |
| Crypto, 1× | Yes | Yes | Yes |
| P2P, 1× | Yes | No | Yes |
| Bond, 1× | No | Yes | No |
| Other/unclassified, 1× | No | No | No |

An explicit speculative override affects only R15; it cannot exempt leverage from R14. The current security schema stores leverage but has no override or derivative fields. The pure policy accepts optional metadata without inventing stored facts or adding an editor. Missing asset classification never exempts a known leveraged/stock/crypto/P2P product. Unknown classification quality is PR3.

`leverage_factor` is in tenths: 10 = 1×, 20 = 2×, 30 = 3×. Market value stays the source for R13, regions, net worth and performance. Gross/economic exposure is absolute market value × leverage / 10, rounded with integer arithmetic once per account/security holding. Market and gross amounts are separately split through PR1's largest-remainder weights, including unknown weight, then grouped by security/platform. Splits never multiply exposure twice or lose a cent.

R14/R15 `valueCents` retains market-value meaning; additive `grossExposureCents` supplies the risk numerator. `shareBp` = gross exposure / portfolio market value and may exceed 100%. Excess/proposal cents are gross exposure above the configured cap, **not** a market-value sell order. UI copy says “Bruttoexposure”. Synthetic EUR 10,000 in a 3× ETF = EUR 30,000 gross; allocation/net worth still contain EUR 10,000.

## Regression and delivery evidence

R01/R02 cover 1×/2×/3× ETF, stock, crypto, P2P, other/unclassified and override/derivative classification. R03 checks literal 3× gross exposure. R04 checks an audited R15 edit across rule/live/summary/rebalancing/report/savings/finance check, undo/redo and stored evaluation. R05 checks an R14 platform edit across risk consumers. R06 checks same-date report/live and month-end custom/global R13 bands.

Existing 1× monetary expectations remain. Intentional updates: additive gross fields; deterministic position-slice ids shared by rule inputs and Portfolio; R13 suppresses speculative overweight only while R15 is breached, matching rebalancing; gross-excess UI wording. The fixture R15 action assertion now includes leveraged ETF instead of declaring every ETF eligible; its 14.2% share/status assertion is unchanged. PR1 history/cent/region tests are unchanged.

Final local verification on Windows:

- `npm ci`: passed; lockfile unchanged.
- `npm run check` with `VITEST_MAX_WORKERS=1` and `BUDGET_REQUIRE_AGE=1`: typecheck, lint/format and all 286 files / 2,716 tests passed, including encrypted-backup tests. Log: `data/task-delivery/pr2-check-green.log`.
- `npm run build` and `npm run build:e2e`: passed. Logs: `data/task-delivery/pr2-production-build.log`, `pr2-e2e-build-final.log`.
- `npx playwright test e2e/portfolio-allocation.spec.ts e2e/portfolio-allocation-report.spec.ts e2e/portfolio-positions.spec.ts e2e/rules.spec.ts --workers=1`, with `E2E_PORT=4710`: 31 passed / 4 intentional viewport/write-once skips. Desktop 1440/mobile 390, light/dark, serious/critical axe checks, containment, target edits, undo/redo and Regelwerk flows passed. Log: `data/task-delivery/pr2-e2e-final.log`.
- An earlier overlapping run had timeouts and lost its sample-server connection. The sequential run on separate ports passed without weakening assertions or adding skips. Linux screenshot comparisons are skipped by the existing Windows-platform guard; these are not claimed as passed.

Synthetic review captures: [desktop](screenshots/risk-policy/portfolio-desktop-light.png), [mobile](screenshots/risk-policy/portfolio-mobile-light.png). Compared with the existing Portfolio design; only the policy/gross-exposure copy changes in this task.

The shared worktree Git index became unwritable (`index.lock: Permission denied`). Later commits use `data/task-delivery/repository/.git` with this workspace as work tree; delivery bundle: `data/task-delivery/codex/risk-policy-pr2.bundle`. The shared worktree's HEAD can therefore lag the delivered branch; the bundle/remote branch contains the final commits. No source-file workaround or security setting change was needed.

The branch was pushed successfully. Draft PR creation was rejected by the GitHub connector: it requires tool approval, but this session's approval policy is `never`. No PR was created and no approval control was bypassed. Prepared description: `data/task-delivery/PR2.md`; [open the comparison against PR1](https://github.com/Grabman1987/budget/compare/codex/asset-exposure-pr1...codex/risk-policy-pr2?expand=1). The feature-branch push does not trigger this repository's PR/main-only CI, so Linux visual, Docker and Litestream-restore checks remain pending PR creation.

Remaining: Linux CI/Docker/restore evidence, owner review of configured limits, PR3 quality/scope, PR4 settings, PR5 real-iPhone acceptance. No private-data/provider access or production write.
