# UX-5a — Debts result first

Scope: Schulden only. The existing debt/strategy reads supply stored rates (including the rate in force at the model start), installments, fees and actual native balances. The pure overview reuses `payoffPlan`; no dependency, migration, provider call, booking or persistent write was added.

The first result shows the last payoff date across all negative accounts, remaining interest and principal repaid/remaining. The date is explicitly the last day of the final model month: no contractual payment day is stored. Interest uses the existing monthly nominal-rate / 12 cent rounding. Each account keeps its own currency; mixed-currency interest and progress totals are withheld. Extra repayment is applied once to the selected account, with immediate native interest savings and updated account/overall dates. Freed installments are not rolled into other debts in this preview; the existing strategy comparison remains available.

Missing rate/installment/fee suppresses the affected projection and complete payoff date. A missing original amount or a balance above the original amount suppresses progress rather than inventing repayment history. Zero fees/rates must be explicit. Unsafe values, insufficient payments and the 1,200-month limit return an unavailable result. Account settings remain the place to persist terms; preview adjustments reset on reload.

Rechenweg starts collapsed and contains assumptions, the debt chain, original manual model/history, dated rate changes, persisted scenarios and strategy comparison. The quick preview assumes the current rate remains constant; future dated changes and saved scenarios are handled by the retained detailed planner.

## Verification and visuals

- Unit coverage: literal monthly interest/final payment, selected extra applied once, cards included, progress, missing terms/original amounts, insufficient payment, unsafe/fractional cents and currency separation.
- `e2e/debts-result.spec.ts`: real isolated synthetic ledger, stored defaults, live result, progress, invalid extra, reload, missing card installment, light/dark Axe and overflow at 1440/390.
- Existing `debts.spec.ts`, `loan-planning.spec.ts` and `loan-sheet.spec.ts` open Rechenweg and retain native payoff, errors, rate/scenario writes and undo assertions. The prototype path guard uses the native path separator on Windows.
- No committed Schulden screenshot baselines exist, and none were generated or replaced. Affected visual evidence: `debts-light`, `debts-dark`, `debts-unknown` and new `debts-result-light`/`debts-result-dark`, each desktop/mobile. Other page baselines are unchanged. Pinned Linux CI and owner review remain required.

Final Windows/Node 24.12 evidence (2026-10-06): all workspace typechecks and ESLint/Prettier passed; production and E2E builds exited 0; the four affected browser specs passed 17 tests (including setup), with desktop/mobile light/dark Axe and overflow checks. Synthetic screenshots: [desktop light](evidence/ux-debts-1005/desktop-light.png), [desktop dark](evidence/ux-debts-1005/desktop-dark.png), [phone light](evidence/ux-debts-1005/mobile-light.png), [phone dark](evidence/ux-debts-1005/mobile-dark.png).

The single `npm run check` invocation exited 1: a late rate-limit regression added during that run saw the previously loaded implementation (343 suites / 3,235 tests passed, one failed). This was a verification-order mistake, not a passing full-check claim. The final rate-limit fix passed the 22 focused debt tests and fresh domain typecheck/lint/format/build checks. A fresh frozen-tree full unit scan with four workers then passed 341 suites / 3,228 tests, with six failures in three unchanged import files and two skipped backup cases. The CLI failures reported Windows `uv_os_get_passwd` ENOMEM inside tsx; import-worker cases also failed/timed out. Through the normal npm runner with one worker, `owner-trades-cli.test.ts`, `source-rebuild-cli.test.ts` and `jobs.test.ts` passed all six tests. `backup.test.ts` passed all seven tests with `BUDGET_REQUIRE_AGE=1`, including the two previously skipped encrypted cases. Every one of the 3,236 unit cases is therefore covered by a passing final scan or targeted repeat; no assertions or repository runner defaults were weakened. CI remains the final gate.

## Owner steps

Review stored loan/card rates, installments and fees in the running app; record original amounts where meaningful before accepting the progress bar. Review the result and Rechenweg on desktop and phone. Arrange any actual extra repayment separately. No keys or consents are needed.
