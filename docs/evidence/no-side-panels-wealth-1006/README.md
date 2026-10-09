# Wealth detail pages without content side panels

All captures use the synthetic Playwright ledger. No private finance data is included.

The original `instrument-*.png` and `savings-*.png` captures are Windows Chromium review images from 2026-10-06. The six `current-1009/` images below are current Linux Chromium captures from the successful final #248 preflight on 2026-10-09. They are visual review evidence, not regenerated Linux screenshot baselines. Both sets use a 1440 × 900 desktop viewport or a 390 × 844 mobile viewport.

| Current capture                                                                      | View                          | SHA-256                                                            |
| ------------------------------------------------------------------------------------ | ----------------------------- | ------------------------------------------------------------------ |
| [Instrument detail, desktop light](current-1009/instrument-detail-desktop-light.png) | `wealth-detail-pages.spec.ts` | `35412791631c6827aaa11e4bfd3b5fa20d3f32dff75bf67e0910d07050be648c` |
| [Instrument detail, desktop dark](current-1009/instrument-detail-desktop-dark.png)   | `wealth-detail-pages.spec.ts` | `c438a0831c97f05daaf916de7605b7d72651fadf0502c16037d096921b6495f9` |
| [Instrument detail, mobile light](current-1009/instrument-detail-mobile-light.png)   | `wealth-detail-pages.spec.ts` | `9d3a1cedb5211407b65a8fe0ae3adf66d8eced1a2fa7753b0109ae5e16cdc5f2` |
| [Instrument detail, mobile dark](current-1009/instrument-detail-mobile-dark.png)     | `wealth-detail-pages.spec.ts` | `f705c48b0345fec13eb55e258dc4b511c80490ac9dfcf2a916782664120ad20b` |
| [Savings-plan detail, desktop](current-1009/savings-detail-desktop.png)              | `savings-plans.spec.ts`       | `58480351512cdf212d48e18555130956d54eee56e53756ad8792439d812d24aa` |
| [Savings-plan detail, mobile](current-1009/savings-detail-mobile.png)                | `savings-plans.spec.ts`       | `1a45dc1bfa283b939fb08ac81eaba83d63679138983635dcc249edbc9f70f521` |

## Final #248 Linux preflight

The successful [GitHub Actions run](https://github.com/Grabman1987/budget/actions/runs/37876787380) validated task head `aba6740923969c3a402d2ca4ab958819f320b498`, the merge of the #248 work with the fully checked #243 parent. It completed on Linux on 2026-10-09 in 11m30s. The temporary validation branch changed only the manual workflow; no app source or screenshot baseline was changed. Source comparison against the task head passed before checks began and the final working-tree and staged diffs were empty.

Focused wealth regressions passed all 41 tests in 7 files (8.53s):

- `packages/domain/src/invest/savings-plan.test.ts` — 10 tests
- `apps/web/src/wealth/savings-model.test.ts` — 7 tests
- `apps/server/src/api/savings-schedules.test.ts` — 5 tests
- `apps/server/src/api/savings-confirmation.test.ts` — 6 tests
- `apps/server/src/api/portfolio-positions.test.ts` — 6 tests
- `packages/db/src/repos/portfolio-missing-quotes.test.ts` — 6 tests
- `packages/db/src/repos/portfolio-manual-valuation.test.ts` — 1 test

With `BUDGET_REQUIRE_AGE=1`, `npm run check` passed TypeScript, lint/format, and all 3,519 tests in 382 files. Vitest reported 243.64s; the complete check step took 6m45s. The production build and E2E build passed. Pinned Chromium and WebKit installed successfully.

The six focused browser specs passed 43/43 tests on the configured Desktop and Mobile Chromium projects with one worker in 2.8m: `e2e/wealth-detail-pages.spec.ts`, `e2e/portfolio-instruments.spec.ts`, `e2e/portfolio-positions.spec.ts`, `e2e/missing-quotes.spec.ts`, `e2e/savings-plans.spec.ts`, and `e2e/trade-confirmation.spec.ts`. The new ordinary savings-detail regression covers browser Back/Forward, `zeitraum=3J`, version history, no open dialog, and restoration of a nonzero portfolio-row scroll after both browser and breadcrumb navigation.

The helper uploaded the [Playwright report and test results](https://api.github.com/repos/Grabman1987/budget/actions/artifacts/11593142320/zip). It did not regenerate screenshot baselines. The configured WebKit-iPhone project does not match these six specs, so this run provides no WebKit E2E or physical iPhone Safari evidence.

## Remaining acceptance

Linux screenshot-baseline review and exact-head PR CI remain open. Owner desktop/phone acceptance is a separate product decision and is not inferred from these automated checks. Physical iPhone Safari acceptance and the private financial Gate 4 reconciliation also remain separate; this synthetic browser evidence does not claim either. No live deployment or acceptance is evidenced by this run.
