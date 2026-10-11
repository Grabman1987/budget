## Summary

Refs #426

- Increase heatmap intensity to 80% in light/print and 50% in dark mode, retaining pastel direction colours and row normalization. Align the generator and DESIGN.md.
- Show existing credit lines in report 2.6: account, limit, exact annual rate, usage and estimated monthly interest. Reuse the shared integer-cent function and native-currency formatter. Unknown rates remain unavailable; estimates do not alter booked totals.
- Add stored product price history with 1M/6M/1J/Max ranges, exact micro-unit prices/currency and shared hover, keyboard and touch inspection, including products without current holdings.
- Show checking/card interest fields in both account creation and editing through one shared visibility predicate.

No dependencies, migrations, provider calls or booking changes. Shared changes are limited to heatmap tokens/their generator and account interest-field visibility.

## Validation

Passed: E2E build (once), Web/UI TypeScript, ESLint on changed source/test files, the CSS scale check, and 27 focused Vitest tests (13 tokens, 8 account settings, 3 credit lines, 3 price history). The strengthened price-history fixture was rerun successfully and distinguishes 1J from Max. Full local check/full E2E suite excluded per owner instructions; CI is the final gate.

Local desktop/mobile browser verification remains open. The normal server startup and a temporary focused configuration with only the required sample server failed before assertions: the seed runner (`tsx`) reported `uv_os_get_passwd` / `ENOMEM`. The temporary configuration is excluded from the change. No browser captures or mobile/visual acceptance are claimed from these failed startup attempts.

Synthetic regressions cover saturation/contrast, native-currency estimates, unknown/zero rates, account-rate validation, price ranges/precision and empty/error states. The added browser spec checks desktop/mobile, both themes, 390 px overflow, 44 px controls and heatmap text contrast >= 4.5:1; it still needs a successful run.

## Visual baselines

No baselines regenerated locally. These bodies use evidence screenshots, without committed snapshot baselines; shell/component baselines do not contain them.

Affected captures: annual heatmap (`report-tables.spec.ts`), spending heatmap (`spending-analysis-report.spec.ts`), monthly returns (`portfolio-performance-comparisons.spec.ts`), bank costs (`bank-costs-report.spec.ts`), `portfolio-detail-{light,dark}-{desktop,mobile}.png` and keyboard/form captures (`portfolio-positions.spec.ts`), account forms (`accounts-settings.spec.ts`).

Planned captures from `report-polish.spec.ts`: `heatmap-{jahresansicht,ausgaben,prendite}`, `credit-lines`, `rate-{checking,credit_card}`, `price-history`, each light/dark and desktop/mobile. No captures were produced locally because startup failed.

## Owner steps

Delivery is blocked locally: both staging and committing failed because Git could not create `C:/Users/fabia/budget/.git/worktrees/budget-w2/index.lock` (`Permission denied`). The implementation and this PR body remain in the worktree; no commit containing these changes or PR is claimed. Commit and publish from an environment with write access to the worktree's Git metadata.

The requested `git push -u origin HEAD` also failed: Windows Schannel returned `SEC_E_NO_CREDENTIALS` while accessing the GitHub remote. No credential or sandbox workaround was attempted.

Run the added spec in a machine with sufficient available memory, review its captures and wait for CI before merging. No credentials/setup required. Mobile/visual acceptance, merge/deployment and private acceptance remain open.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
