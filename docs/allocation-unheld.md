# Target classes without holdings

Follow-up to the portfolio composition contract, owner request 2026-10-05.

Report 4.2 includes every class with a positive dated target even without positive held chart value. Zero-valued composition rows retain their Soll, signed-universe Ist and deviation; the legend uses an empty swatch and shows the target beside zero value. Sunburst sectors remain limited to positive held classified value. Assigned securities without current units appear below their class with name, ISIN, instrument link and “noch nicht gekauft”. Missing ISINs are explicit.

Report and Portfolio reuse one dated exposure projection for assigned securities, restricted to active securities included in the allocation universe. Future assignments and excluded instruments do not appear. Current holdings, including positions with missing price/FX, remain held; missing valuations never turn into unheld buy candidates. The existing rebalancing engine still determines underweight classes, amounts and confidence. Its Portfolio text lists assigned unheld securities without choosing one automatically or creating an order. Security kind `other` receives a small correction hint in allocation, including for held securities. Classes and targets are never inferred from kinds or names.

No schema, dependency, target policy, valuation or money-calculation change is required. `allocation-inputs.ts` supplies the minimal shared assignment projection to both allocation read models.

## Validation

The synthetic read-model test failed first because assigned unheld securities were absent. It now checks a target-only class, current versus future assignments, allocation inclusion, unchanged held products/shares and exact classified/group cent totals. Browser cases check target/zero/deviation rows, instrument links/ISIN, empty swatches, no zero-valued sunburst sectors, an entirely unheld report, kind hints and names in existing rebalancing suggestions. Light/dark screenshots, Axe and viewport containment cover desktop 1440 and mobile 390. No screenshot baseline is regenerated.

[Synthetic review captures](evidence/allocation-unheld-1005/README.md). The affected specs passed 21/21 cases; after the final layout adjustment the new cases passed again (7/7 including setup). One existing sample API test exceeded its 5-second timeout under concurrent browser load; the same file passed all 10 tests when run alone with `--testTimeout=30000`, with every assertion unchanged.

The Windows test environment returns `uv_os_get_passwd ENOMEM` even for a standalone `os.userInfo()` call. Browser/check commands use an ignored local preload that supplies synthetic OS user information only for that exact error, as in the predecessor PR. The full check limits Vitest to two workers via `VITEST_MAX_WORKERS=2`; application code and test assertions remain unchanged by these runtime settings.

Final verification: all workspace typechecks, ESLint and Prettier passed. The single `npm run check` execution passed 340 test files and 3,198 tests, then reported one native Windows worker exit (`3221225477`) in the unchanged `apps/server/src/payslips/intake.test.ts` (no assertion failure). Only that file was rerun with one worker and `--testTimeout=30000`: all 14 tests passed. Every unit file is therefore covered by passing results across the full run and its isolated retry; the original full command exited 1 and is not represented as an uninterrupted green run. `npm run build` passed for web and server. CI remains the final gate.

## Owner steps

After deployment, review dated assignments and Soll weights in Einstellungen › Anlageklassen; correct securities currently typed “Sonstiges” in the existing instrument editor. Review any investment suggestion and execute any chosen trade manually. No keys, consents or provider configuration are needed for this change. CI, merge, deployment and private visual/data acceptance remain separate gates.

The shared Windows worktree Git metadata was read-only in the execution environment. Commits use ignored `data/delivery.git`, branch `codex/alloc-unheld-1005`, based on merged `origin/main`. To synchronize the normal checkout metadata after delivery, without replacing working files:

```sh
git fetch origin codex/alloc-unheld-1005
git switch -c codex/alloc-unheld-1005
git reset --mixed origin/codex/alloc-unheld-1005
```

Run these only after preserving any subsequent local changes. If the branch already exists, switch to it without `-c`.
