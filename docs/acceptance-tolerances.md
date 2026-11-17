# Acceptance tolerances, parallel-run protocol and delivery report

Part of epic #1225 (cockpit). This page fixes, before any comparison is run, how close "equal" has to be, how the parallel run is conducted and how a delivery is reported. All amounts are integer cents. Examples use synthetic data only.

## 1. Tolerance table

| Comparison | Tolerance | Reason |
| --- | --- | --- |
| Booking to booking (app vs. source record) | 0 cent | A booking is a fact; any difference is a data error, not rounding. |
| Account balance to bank statement | 0 cent | Balances are sums of integer cents; a remainder means a missing or wrong booking. |
| Statement total to its lines | 0 cent | A statement is only trusted when its lines add up exactly to its stated total. |
| Net worth across pages | 0 cent | Every page reads the same ledger; a difference means two code paths disagree. |
| Category available, activity and to-be-assigned vs. the old tool's export | 0 cent per category and month | The envelope model is exact. A deliberate difference is an explicit shift with a recorded cause, never a plug booking. |
| Foreign-currency line: booked EUR amount | 0 cent | The booked EUR amount is what the bank charged. |
| Foreign-currency line: derived rate check | ±1 cent on the recomputed EUR amount | The rate is derived and displayed rounded; only the rounding of the derived value may differ. |
| Payslip components | 0 cent; ±1 cent only where the document itself rounds, and then flagged | The document is the source; a silent tolerance would hide extraction errors. |
| Units (shares, coins) | Exact; fractional units to 1e-8 | Quantities are stored exactly; 1e-8 is the finest unit the sources provide. |
| Position valuation | ±1 cent per position per day, same price table | Same units times the same price differ only by rounding of the product. |
| TTWROR vs. the portfolio tool | ±1 bp with the same method, period and prices | Same inputs and method must give the same result up to rounding. |
| IRR vs. the portfolio tool | ±5 bp | Iterative solvers stop at different precision. |
| Different flow-timing convention | No tolerance: show both results and name the method | A convention gap is not an error to hide in a tolerance. |
| Loan instalment | ±1 cent per instalment and ±5 cent per year cumulative | Lenders round each instalment; the yearly cap stops drift. |
| Loan payoff date | Exact month | The payoff month follows from the schedule; being off by one month means a wrong schedule. |
| Forecast low-point date | Range of ±3 days | Payment dates shift with weekends and bank processing. |
| Forecast squeeze recall | 100 % on the reference history; false-alarm rate reported | A missed squeeze is the costly error; false alarms are measured, not hidden. |
| Document field extraction | Exact | A field is either read correctly or flagged for review. |
| Auto-accept of documents | Only when all sum checks pass and there are 0 critical-field errors on at least 30 held-out documents per layout | Fewer samples cannot support an automatic decision. |
| Re-import | Identical canonical dump hash | A re-import must be a no-op; any hash change is a duplicate or loss. |
| Restore | Row counts and canonical hash equal, integrity check passes | A backup is only proven by a restore that reproduces the data. |

## 2. Parallel-run protocol

The parallel run decides whether the old tools can be replaced (Gate 4).

1. **Scope.** At least one full month close, plus every statement cycle that falls in the run: card statement, quarterly and annual items.
2. **Expected values first.** The expected values (balances, category figures, statement totals, month result) are taken from the old tool or the source document and fixed in writing before the app computes them. Figures are never adjusted after seeing the app's result.
3. **Month-end sheet.** For each closed month the owner signs a month-end sheet listing every compared figure, its expected value, the app value and the difference.
4. **Differences.** Every difference is recorded with one cause category:
   - data gap (a booking, document or price is missing),
   - wrong assumption (a rule or setting does not match reality),
   - changed behaviour (the app intentionally behaves differently from the old tool),
   - tool convention (both are right under different conventions; name them).
5. **No forced agreement.** No adjustment, plug or correction booking is made to force agreement. A difference is fixed at its cause or stays recorded.
6. **Result.** The run passes when every difference is recorded with a cause, none is unexplained, and the owner has signed the month-end sheet.

## 3. Delivery report template

Every delivery (pull request or release note for acceptance) uses these four parts:

1. **What works now.** Behaviour that can be used today, in plain words.
2. **What proves it.** Tests, comparisons or owner checks, with the tolerance row from section 1 that applies.
3. **What stays uncertain.** Known gaps, assumptions and anything not yet compared.
4. **What still blocks the replacement.** What must still be true before the old tool can be switched off.
