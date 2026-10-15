# SPEC-001 — Ledger, envelope, card and reconciliation assurance

Capabilities CAP-001/002/005/006/009. Packages WP-001 and WP-005. Retention and acceptance work, not a new accounting engine.

## 1. Goal and user problem

Make cash, assigned money, card debt and checked balances independently explainable. An apparently correct total can conceal duplicated transfers, differently timed income or an unfunded card purchase.

## 2. Sources and reference behavior

YNAB-001–019/039–051/080, ACT-002–019/030–035/042–049 and CASE-001–007 in [comparison cases](../../research/rea/comparison-cases.md). Exact sources are in [the matrix](../feature-matrix/features.csv). Budget evidence: `packages/domain/src/ledger/{budget,envelope,balances}.ts`, `packages/db/src/repos/{bookings,reconciliation,budget}.ts` and their existing tests. Actual ordinary-card accounting is not Budget's default reserve model.

## 3. Intended Budget behavior

Retain the current shared functions and owner-approved `ynab` card default. Inventory each accepted invariant with one literal synthetic cross-layer case and one result explanation. Preserve the optional legacy `concept` comparison policy as explicitly named compatibility behavior. Research does not activate it. Reuse current debt projections; terms missing means no payoff promise.

## 4. Scope and exclusions

Cover assignments, positive/negative carry, cash versus credit deficit, card reserve/refund/payment, same-currency transfers/splits, repayment and statement check/lock. No algorithm replacement, new debt engine, automatic correction, private comparison or general reset. Cross-currency posting and paired security transfers have separate gates.

## 5. Flows, errors and empty states

Owner follows a Plan figure to its existing envelope history or a Konten balance to its register/check. Differences show underlying eligible records and policy; corrections use existing guarded forms. Empty history is explained. Invalid cents, missing counterpart, locked month or reconciled write fails without partial changes. The check uses actual statement date no later than today; pending rows remain distinct.

## 6. Rules and formulas

Availability `carry + assigned + signed activity`; positive prior carry survives, negative carry only when enabled. A non-carried deficit enters the existing budget-level cash/card policy once. Under default card policy only funded spend creates reserve; credit overspend grows debt and does not also reduce next month's unassigned cash. Preserve current month-level funded attribution and same-day card ordering, not an invented chronological algorithm. Same-currency transfer legs sum to zero; assignments conserve the funding pool. Reconciliation difference is `statement − (opening + confirmed/reconciled bookings through date)`. A zero difference allows locking; any explicit adjustment is a separate auditable booking. Budget activity's status policy must not be replaced with reconciliation's narrower cleared-only filter.

## 7. Examples and edges

CASE-001 yields 114.99 available; CASE-003 reserve reaches 120.00 after funded spend and payment is not another expense; CASE-004 conserves 10.00; CASE-005 is total-scope neutral. Add cash/card mixed overspending, positive card balance, refund after debt growth, two cards, carried negative category, hidden category, source account before opening, same-day entries and a closed month. Debt zero interest and incomplete/negative-amortization terms are distinct states.

## 8. Model and migrations

No new tables. Reuse booking/splits/transfer, category/month, reconciliation snapshot and grouped audit. Store no duplicated totals. Existing data and legacy income-month flags remain untouched; new manual captures follow booking-month policy. A failing assurance case becomes its own authorized fix, not a migration hidden inside this specification.

## 9. Interfaces and integrations

Reuse `apps/server/src/api/{budget,bookings,accounts,debts}.ts` and current repository transactions. Compare domain → repository → API result using the same synthetic seed and independently written expected constants. No source credential or migration job is needed. Query parameters identify any comparison policy.

## 10. Navigation and design

Plan inspector/history, Konten register and Kontostand prüfen, Vermögen › Schulden. Reuse existing deep links, exact de-AT amounts, explanatory empty/error states and amount privacy. Historical negatives stay quiet; current unresolved deficits retain warnings. No new dashboard or generic detail panel.

## 11. Privacy, security and performance

Synthetic fixtures only; no private export or account names. Explanations remain authenticated and no-store. Every write retains lock checks, atomicity and one grouped undo. Tests include rollback on a failed second transfer leg. Bound explanation queries with existing cursor limits; no full-ledger browser recomputation.

## 12. Dependencies

Current shared domain and migration baseline. SPEC-007 identifies analytical scope; SPEC-008 identifies valuation quality. Existing private gates remain separate. WP-001 provides constants reused by WP-002–005 without a new fixture generator.

## 13. Acceptance criteria

- **AC-001-01:** CASE-001–005 have literal expected cents across domain/repository/API; transfer, card reserve and deficit effects are each counted once.
- **AC-001-02:** Split/transfer failure and explicit adjustment/lock/undo preserve sums and restore all related records as one group.
- **AC-001-03:** Reconciliation excludes pending rows, rejects future date and locked changes, and explains an unresolved difference without posting automatically.
- **AC-001-04:** Debt dates/results are unavailable with incomplete terms; public synthetic validation and private owner acceptance are reported separately.

## 14. Tests and validation

Extend only missing meaningful cases in existing `ledger/*.test.ts`, repository reconciliation/booking tests and API suites. Expected constants come from the case table, not calls to the implementation under test. One synthetic desktop/phone walkthrough checks drill-down, privacy, error and grouped undo. Required full checks/browser evidence apply when implementation is authorized; none is claimed run by this research.

## 15. Open decisions and recommendations

Retain existing policy; no research decision is needed to run synthetic assurance. If a case conflicts with a dated owner directive, record the discrepancy and stop that fix for an explicit product decision. Do not infer permission to rewrite private history or close the parallel month-end gate.
