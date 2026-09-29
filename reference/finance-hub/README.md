# Reference: calculation modules of the old cockpit

Tested JavaScript modules from the previous app (`finance-hub`), copied as **reference for porting** to `packages/domain` (SPEC §0, concept 11.5). They are not part of the build and are not expected to run here: some imports point to modules that were not copied.

Person and provider names were replaced by generic placeholders (e.g. "Kontakt C", "bankA", "brokerB"). The old code ties logic to specific persons and institutions; the new app must model these as data (contacts, institutions, account roles, expected payments). Do not port name-based heuristics such as account-name regexes in `account-roles.mjs`; replace them with explicit account roles.

| Module | Port to | Notes |
| --- | --- | --- |
| `money-input.mjs`, `format.js`, `text-format.mjs` | `domain/money`, `domain/format` | amount parsing and de-AT formatting; tests in `tests/money-input.test.mjs`, `tests/format.test.mjs` |
| `model.mjs` | `domain/dates`, `domain/schedule` | date helpers, schedule expansion, transaction flattening |
| `liquidity-model.mjs`, `future-expense.mjs`, `financial-assumptions.mjs` | `domain/forecast` | day-by-day liquidity; contact-specific parts become expected payments; combine with the prototype's forecast in `design/prototype/reports-zukunft.js` (events, levers, buffer, sweep) |
| `debt-model.mjs`, `debt-policy.mjs`, `debt-strategy.mjs` | `domain/debt` | payoff schedules, extra repayment, avalanche/snowball |
| `investment-performance.mjs`, `investment-model.mjs`, `security-master.mjs` | `domain/performance`, `domain/securities` | TTWROR, IRR, holdings; cross-check with `design/prototype/reports-portfolio.js` `stats()` |
| `reconciliation-model.mjs`, `account-reconcile.mjs`, `account-health.mjs` | `domain/reconcile` | "Kontostand prüfen" and balance adjustment |
| `import-matching.mjs`, `bank-sync-dedupe.mjs` | `domain/import` | matching and idempotent dedupe of bank sync rows |
| `recurring-review.mjs` | `domain/schedule` | expected-payment checks |
| `payroll-model.mjs` | `domain/payroll` | payslip lines; extend to the Gehaltsreport in `design/prototype/reports-monat.js` |
| `account-roles.mjs` | — | reference only; replace with explicit roles |
