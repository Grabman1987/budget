Refs #422

Every open booking-based account now offers balance reconciliation, including off-budget checking/cash/savings, liabilities and brokerage/crypto cash. Month-close step 2 uses the same account types while preserving manual P2P/other-asset valuation and the existing product-valuation guard.

The account overview shows the stored owner-check or valuation date, an explicit missing state, and a warning from 35 days. P2P/other-asset account pages reuse the existing audited manual-value form with native-currency cents, last value/date, undo, and visible save-blocking reasons. Both month-close forms start at the earlier of month end and today. The reconciliation dialog is unchanged.

Validation and screenshots: [delivery evidence](docs/evidence/reconcile-all-accounts/README.md). Checks follow the package-specific resource limit; CI is the final gate. No migration, dependency or provider call is needed.

Visual baseline impact: Konten overview, manual-value dialog and month-close account step change. No checked-in snapshot baselines exist for these surfaces; no baselines were regenerated locally. Desktop 1440 and mobile 390 review images are recorded in the evidence directory.

Owner steps: after required CI/integration, review the account update session and daily overview on desktop and a physical phone. No keys, consents or settings changes are required. Merge and deployment remain separate.

🤖 Generated with [Claude Code](https://claude.com/claude-code)