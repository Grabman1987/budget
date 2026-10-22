# #611/#612 independent source review

Commit reviewed: `45b756eaf31763ad2566c63e1ec7c4e3680507b3` versus `6420676d257698767931dd151863765cec914acf`, `/workspace/impl-debt-611-612`. Source only; no tests, checks, builds, browser, CI or runtime validation.

## Finding

**P2 — Paired loan history can be labelled in the wrong native currency.** `apps/web/src/wealth/debt-live-scenario.tsx:68-83` accepts the two independent GET results when account ID and current numeric balance agree, but never compares the series response's `currency` with `plan.value.currency`. The series endpoint includes its actual account currency (`apps/server/src/api/accounts.ts:534-545,575-587`), while `fetchSeries`'s declared response omits that field (`apps/web/src/ledger/api.ts:48-53`). A loan with a nonzero opening balance and no bookings can have its currency changed (`apps/server/src/api/accounts.ts:400-411`). If the plan GET reads EUR and the series GET reads USD during that change, with the same cent balance, the guard passes. `DebtChart` then formats USD history as EUR via `basis.currency` (`apps/web/src/wealth/debts-chart.tsx:65-69`) and connects it to the EUR model. The two-GET non-atomicity is documented, but this detectable unit mismatch should fail closed. Minimal fix: include `currency` in the `fetchSeries` response type and require `series.value.currency === plan.value.currency` in `usableSeries`; retain the existing mismatch notice/retry path.

## Scoped review

The seven changed paths otherwise use the shared `simulateLoan` rows and yearly aggregates for model curve, payoff, interest and tables; date-specific one-off inputs are required, rates map from stored effective months, and local inputs do not write. The capture/rebase path retains drafts across pair refetch, and the saved-plan writer invalidates the new pair key on write/Undo/redo. Completed month-ends, current anchor, chart inspection table and native formatting were inspected as source. The undated V16 example is an acknowledged acceptance gap, so no alternate formula or month was inferred. This is not validation of calculations, UI behavior or privacy in a running app.
