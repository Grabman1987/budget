# T5: freedom annual-expense reconciliation (N8)

Refs #821. This is a source/reference diagnosis, not a financial formula change or private-data acceptance. Parent contract: [approved plan](01-umsetzungsplan.md), T1/T5 and F09. Prepared against T1 `0acbcd284f9ab0fd74fef707e4be4be965762f7d`, stacked on T0 #875 / T1 #876. The inspected production sources remain identical to baseline `50c0016560ee634c6ee8ede8180169bc60cb29a6`.

## Finding

No formula correction is justified by the current evidence. Freedom uses trailing monthly net consumption, not the current month's spending multiplied by twelve. A difference between those two scopes alone does not demonstrate a defect. Retain the existing calculation and classification; expose the period/source details when R3b migrates the complete freedom view.

This does not validate a private account balance, imported category assignment, personal annual expense figure or the financial assumptions behind an individual goal. No real ledger, export or financial name is included or changed.

## Canonical source chain

1. [freedomView](../../packages/db/src/repos/freedom.ts) reads the existing budget envelopes and [referenceMonth](../../packages/db/src/repos/rule-inputs.ts). The reference is the last full month; on a month's last day it includes that month. Thus 2026-10-31, 2026-11-01 and 2026-11-13 all reference October. The existing sample day 2026-09-17 references August.
2. [freedomExpenseMonths](../../packages/db/src/repos/freedom-inputs.ts) considers at most twelve months ending at that reference and only months actually present in the shared budget facts. It sums the signed activity of categories classified `need` or `want`, with the sign inverted to consumption. Refunds therefore reduce consumption. It does not substitute a missing month with a fictional transaction history.
3. [freedomAnnualSpendCents](../../packages/domain/src/wealth/freedom.ts) uses the sum for twelve months. With fewer available months it annualises their mean with the existing integer half-up arithmetic. Unsafe integer totals remain unavailable through the existing readers.
4. R16's [freedomRuleInput](../../packages/db/src/repos/rule-inputs.ts) uses the same `freedomExpenses` helper and reference-month policy. The view and rule are tested against the same independent literal annual amount; there is no new page-local calculation.

## Transfers, principal and investments

The [budget split effect](../../packages/domain/src/ledger/budget.ts) is the classification boundary. An internal transfer between on-budget accounts is neutral and creates no envelope consumption. A categorised leg crossing the budget boundary uses its existing category activity; the freedom reader then includes `need`/`want` and excludes `future`.

Consequently, Zukunft investment contributions do not become consumption merely because cash leaves an account. Do not infer a new universal principal-payment exclusion: principal, interest and fees follow the actual existing split/category classification. A change to that classification or a protected financial rule would require source evidence, an independent literal regression and its specific owner approval. This diagnosis makes none.

The F09 fixture already contains monthly Zukunft outflows of 99999 cents and offsetting Wunsch spend/refund pairs. They do not inflate the literal net Bedarf/Wunsch annual result. Existing budget tests retain their explicit neutral-transfer expectations; their source and dependencies are unchanged.

## Independent reference results

| Case                  | Synthetic input and period                                                                                          | Literal expected result                                                                            | Evidence                            |
| --------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Full year with refund | 2025-10 through 2026-09: eleven months at 10000 cents, September at 8000 after a 2000-cent refund; as-of 2026-10-01 | 118000 cents annual; view and R16 agree                                                            | New F09 real-SQLite reference in T1 |
| Short history         | Eight available 10000-cent months, 2025-10 through 2026-05; as-of 2026-05-31; later seeded history excluded         | 120000 cents annual, exactly eight source months                                                   | New F09 real-SQLite reference in T1 |
| Reference boundaries  | Existing last-day/short/empty-history cases                                                                         | Existing literal month and annual values retained; no fabricated progress without history          | Unchanged freedom reader tests      |
| Unavailable sources   | Existing unsafe expense, missing-price/FX and investment-scope cases                                                | Existing null/unsafe/progress states retained; no replacement with an approximate or invented zero | Unchanged source-reader tests       |

[freedom.test.ts](../../packages/db/src/repos/freedom.test.ts) contains the two new cases and the existing boundary/unsafe/quote/Undo cases. It passed all 11 tests on the final T1 content (4.19 s), after the independently reviewed nullable-safe exact assertion. The final income file also passed all 7 tests. The six-file canonical reference suite previously passed all 54 tests; unchanged reference sources preserve that evidence.

A temporary test-only negative control changed the imported annual metric by +1 cent: both F09 references failed at 118001/120001. The original test bytes were restored and SHA-256 verified before final verification; production sources were untouched. No financial oracle, tolerance, timeout or skip was weakened.

## Evidence limits and remaining acceptance

- These are source and synthetic test results, not owner preview, physical-device evidence, full exact-head CI or production verification. Current candidate CI is tracked in the PRs and [Project 1](https://github.com/users/Grabman1987/projects/1).
- Existing empty-history behavior remains annual zero with no source months and unavailable progress; unsafe inputs and missing investment valuation retain their separate meanings. This document does not silently change those contracts.
- R3b still owes the actual rendered period, source months/categories, assumptions and complete tables. A Should-level presentation improvement is not implemented by this evidence note.
- T5 remains open for its explicit acceptance and authorised publication criteria. No correction ticket or new formula is created without a demonstrated defect. Production merges, releases, activation and real-data changes require separate owner OK.
