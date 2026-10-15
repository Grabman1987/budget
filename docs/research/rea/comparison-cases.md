# Independent synthetic comparison cases

These are hand-derived acceptance inputs, not copied private data, executed upstream tests or proof of current Budget behavior. Use aligned mapping/scope before comparing products. Amounts below are decimal display units; implementation fixtures use integer cents. The [target model](../../product/target-model.md) defines boundaries; [specifications](../../product/specs/README.md) turn the cases into bounded acceptance.

| ID | Input | Literal expectation and reason |
| --- | --- | --- |
| CASE-001 | Category carry 40.00, assigned 100.00, signed activity −25.01 | Available 114.99. No account balance changes when assigning money |
| CASE-002 | Expense category −25.00 at close; next month assignment/activity zero | Rollover enabled: category −25.00, do not also subtract this deficit from unassigned money. Disabled: category starts at zero; apply existing budget-level cash/card deficit policy once. Actual ordinary-account and YNAB card rules require different fixtures |
| CASE-003 | Paid-in-full card starts −100.00 with reserve 100.00; funded purchase 20.00 | Card balance −120.00; spending category available −20.00 delta; payment reserve 120.00. Paying 120.00 is a transfer and consumes reserve; it is not another 120.00 expense. Unfunded purchase is a separate test |
| CASE-004 | 10.00 split equally among ordered A/B/C | 3.34, 3.33, 3.33; total 10.00. Negative reversal has opposite exact amounts; no cent is lost |
| CASE-005 | Budget-account A transfers 200.00 to budget-account B | A −200.00, B +200.00; total cash, income, expense and total-scope contribution deltas zero. An A-only scope has −200.00 external flow |
| CASE-006 | Investment cash 200.00; buy 10 units gross 100.00 plus fee 2.00 | Cash 98.00 and 10 units. If market value is 100.00, total wealth 198.00. No external flow for depot-plus-cash; security-only contribution is 102.00 under current after-fee convention |
| CASE-007 | Dividend gross 10.00, tax 2.00, fee 1.00 | Cash receipt 7.00 once. Total-scope income affects performance, not capital contribution. Security-only scope treats payout as a withdrawal under that scope's cost/tax convention. PP pre-tax-security comparison cannot be asserted equal to Budget after-tax result |
| CASE-008 | Prior value 100.00, inflow 100.00, end value 220.00 | Budget end-flow 20%; PP opening-inflow reference 10%. No-flow 100.00 →110.00 →121.00 links to 21%, not 20% |
| CASE-009 | Investor pays 100.00 on 2025-01-01, receives 110.00 on 2026-01-01; no other flows | Actual/365 XIRR 10%; one-year no-flow Dietz 10%; TWR 10%. A 366-day period with same endpoints annualizes differently. No-root/multiple-root cashflow sequences do not inherit this simple result |
| CASE-010 | Buy 10 units at 10.00 and 10 at 20.00; sell 10 for 250.00; no charges | FIFO remaining basis 200.00, realized gain 150.00; average remaining basis 150.00, realized gain 100.00. Both have 10 units; method cannot be inferred from a shared holdings total |
| CASE-011 | 10 units, basis 102.00; 2-for-1 split | 20 units, basis 102.00, no cash, realized gain zero. Unit price halves for equivalent market value. Fractional results and compensation need a separate corporate-action contract |
| CASE-012 | 10 units bought at USD 10, entry EUR/USD 0.90; current USD 12 and 0.95 | Entry value 90.00 EUR, current 114.00 EUR. Price effect at entry FX 18.00, residual FX effect 6.00, total 24.00. No fee/tax assumption; other decompositions must name their base |
| CASE-013 | USD cash 100.00, no usable dated rate | Native USD 100.00 visible; EUR component/total incomplete. Do not copy PP's empty-series parity fallback |
| CASE-014 | Three calendar months, spend 120.00, 0.00, 120.00 | Calendar mean 80.00; activity-month mean 120.00. Budget's existing quick assignment uses the calendar denominator including zero months. Toolkit custom average differs |
| CASE-015 | Eligible cash 600.00, eligible spend 900.00 over 90 complete calendar days | Historical outflow rate 10.00/day and nominal runway 60 days. No spending → unavailable, not infinity; insufficient history is disclosed. This is not Age of Money or a forecast promise |
| CASE-016 | Period funding pool 50.00; ordered target gaps 30.00 and 40.00 | Existing waterfall assigns 30.00 and 20.00, gap 20.00. Preview/apply must match and total funding never exceeds 50.00. Any selection or ledger change invalidates the preview |

These cases deliberately distinguish units, dates, cost basis and scope. They should be expanded into focused pure-domain, repository/API and synthetic browser tests only when the relevant implementation slice is authorized. Existing source tests were inspected separately; this document does not claim to have run them.
