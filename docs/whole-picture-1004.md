# Whole-picture report — owner feedback 2026-10-04

Report 5.6 (`/reports/gesamtuebersicht`) leads Überblick while published report numbers stay stable. Default: twelve full months; the common calendar selector also allows a running month. Period arrows shift the shown month range.

Sources are report 3.2 (household income, consumption, savings, separate capital income), the existing net-worth daily chain/valuations (start/end), and `windowPerformance` with existing investment valuations, signed investment cash and `portfolioFlows` in depot view. This scope includes investment/depot/crypto/P2P account roles. Investment-to-investment transfers stay inside the boundary. “In Investments eingezahlt” narrows the same boundary reader to transfers from budget accounts. Plain external deposits/deliveries belong to the performance boundary but not to this budget-transfer column. Report 4.3 defaults to securities-only; equal-scope tests compare its existing depot view, without equating security purchases with budget transfers.

Market effect is investment end value minus start value minus external net flows, including booked investment returns/costs. It therefore differs intentionally from the pure price-movement attribution of Vermögen/1.1/5.1. The chain uses the existing net-worth start/end and closes with explicit Sonstiges = net-worth change − savings − investment market effect. Capital income is displayed separately, outside household income/savings, and is not added again: it is already in investment performance or Sonstiges. Recorded principal repayments exclude explicitly booked debt interest/fees using the existing fee predicate; new card purchases and loan disbursements are not repayments.

The CSV uses the identical columns, newest-first rows, total/end-state semantics, verdicts, cent precision and approximation markers as the displayed table. Row links open the related month/report or bookings.

Valuation-note ranges intersect across nested reads. Auxiliary history cannot flag a security sold before the displayed range; zero-unit valuations already require no quote. The shared monthly pace income and one-pager income rows use the classified household ledger, excluding capital income/refunds. The income-scale allocation bar is reused in One-Pager, Budgettreue and Plan.

Owner steps: review desktop/phone and print layout with the running app, especially overspending and a market-loss month. No new credentials, consent, provider calls or deployment are needed for this report. Merge/deployment and private-data reconciliation remain separate.
