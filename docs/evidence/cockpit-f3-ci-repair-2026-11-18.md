# F3 CI repair evidence

Synthetic data only. Refs #1228 and #1225; repair of PR #1253 after run 44397377673.

## Contract findings

- `heute.test.ts`: the top-level key list omitted the additive `accountLiquidity` field. The existing assertions are retained.
- `liquidity-35d-568-569.test.ts`: the absent-account response already returned `available: false`, `report: null` and the new `accountLiquidity: null`. Its strict expectation now includes that field. A separate card-only regression proves that the new per-account forecast is unavailable without payment accounts while the legacy aggregate report retains its scope.
- R07: the conservative payment-account horizon is different from the legacy household chart. The sample test retains the existing household detail of -10,899 cents on 29 September, and independently pins the account low of -358,260 cents on 10 November. The test comment derives every term. Expected receipts and overdraft do not cover either shortfall.
- The last `ci: run full suite` commit had reverted the prior reviewed fixes and removed their regressions. The shared payment-account predicate, exact BigInt daily products, scenario eligibility, full-horizon source cash limit and capped transfer drafts are restored together with those tests.

## Unresolved #956 contract conflict

The old direct response pins were reproduced against `origin/main` at `4962d9c8` in a separate temporary checkout using the same synthetic fixture and crypto epoch. All 15 direct-response cases passed there. A structural comparison of the three old/new Heute JSON responses found one added top-level field, `accountLiquidity`, and changes confined to the existing `financeCheck` subtree.

The latter changes are substantive: the performance fixture contains negative checking-account paths despite positive household cash. F3 correctly reports these shortfalls through R07, changing its result, the check counts and ordering. Filtering out credit cards removes false card alerts but does not remove these real synthetic checking-account shortfalls.

Therefore the task's additions-only condition cannot currently be proven. The old pins remain unchanged. An explicit owner decision is needed between permitting the demonstrated R07 differences and retaining the old household-only R07 contract. No existing figure is silently normalized or accepted as unchanged.

The worker/cache test independently compares bytes with a direct API response, including concurrent cold reads and invalidation after writes from two connections. Separate tests continue to enforce every original direct-response pin.

## Browser findings and changes

- The new standalone account-warning block pushed the compact Heute overview down. The earliest shortfall now occupies the existing lead footer, with a warning mark and the existing transfer-draft action. An absent warning renders nothing. No geometric assertion was changed.
- The shared-chart inspection failure was caused by persistent forecast warnings using `role="alert"` on Heute, rather than a chart without inspection. These static warnings now use a named region. The report's new account table also uses the existing `ReportTable` wrapper. No chart assertion was changed.
- The report-header failure in CI was a timeout waiting for the post-evaluation check response, not a missing header. The existing shared header is retained; both themes passed repeated local runs without changing the spec.
- Windows screenshot comparisons are skipped by the existing visual helper. The synthetic default fixture has a real payment-account shortfall, so its compact warning legitimately changes Heute. The four `shell-heute-redesign-{light,dark}-{desktop,mobile}-linux.png` baselines need Linux regeneration and inspection. No Windows screenshots are committed. The account-table captures also need Linux visual inspection; they are not golden baselines.

## Verification

Typecheck, changed-file ESLint, changed-file Prettier and OFF/ON builds passed. In the ten focused Vitest files, 196 tests passed; only the three unchanged direct Heute byte pins failed. Worker/direct equality and post-write invalidation passed.

Redesign-ON browser results, with targeted reruns after the warning sizing fixes:

| Spec | Desktop | Mobile |
| --- | --- | --- |
| `issue-571-heute-kennzahlen` | passed | passed |
| `issue-575-heute-phone-viewport` | passed | passed |
| `issue-830-background-refresh` | passed | passed |
| `issue-830-design-match` | passed | passed |
| `issue-1005-mobile-heute` | passed | passed |
| `chart-inspection` | passed | passed |
| `issue-1150-report-header` | passed | passed |
| `shell` screenshot cases at lines 649 and 666 | passed, visual comparison skipped | passed, visual comparison skipped |
| `liquidity-navigation` | passed | passed |

The resource-safe commands use `A2_EXPECT_REDESIGN=1`, `E2E_PORT=4757`, `E2E_START_TIMEOUT=400000` and `--workers=1`, one spec at a time. No assertion or timeout was relaxed. The warning initially exposed a desktop 36px target, then 320px/enlarged-text overflow and a forecast bottom beyond 900px; all were fixed in the component stylesheet and the unchanged specs passed. One earlier parallel validation attempt exhausted local RAM; its unrelated Axe/route timeouts are not accepted as product evidence. The final run uses one heavy job at a time. No full local e2e suite was run.

An independent Codex agent reviewed the complete financial diff and test impact. No migration, ledger writer, persisted financial data, deployment configuration, queue script, dependency, merge or release is part of this repair.
