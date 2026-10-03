# Report and KPI correctness

Synthetic audit regressions, 2026-10-03. No private source data was read or copied.

## Shared household totals

`repos/report-ledger.ts` classifies live booking splits once for annual/overview reports,
monthly report tables and cashflow household totals. Domain `overviewMonthlyFigures`,
`monthHouseholdIncome`, `monthConsumption` and `savingsRateOf` fold these facts.
Plan > Jahr shows those same household totals for complete months, separately from
stored envelope funding, activity and December balances. Budget allocation keeps its
intentional budget-month semantics; household reports use the cash booking date.

- Only live on-budget accounts, live bookings on/after account opening, and live categories/groups.
- Opening account balances, opening-balance bookings and system balance corrections are not income or consumption.
- Internal transfers are neutral. Transfers to outside accounts count only their explicitly
  attributed spending category; unclassified transfers and transfer income never count as earnings.
- Household income excludes capital earnings, reimbursements and contact repayments.
- Consumption is Bedarf plus Wunsch, net of categorized refunds. A reimbursement with no
  explicit spending category uses the payee's default spending category in its cash month;
  otherwise it remains a labelled reimbursement, never household income.
- Zukunft is separate. Monthly tables retain their separately documented internal reserve
  set-asides; they are not consumption. Cashflow capital earnings also include investment
  accounts as a memo series, not household income.
- Legacy periods and annual views use complete months. An explicit calendar range can include
  the current month through today; compare identical cutoffs, not a live partial month with
  a completed-month annual report.

## Costs and percentages

A negative loan balance or booking does not identify interest. Credit costs require split
attribution to the existing `Bank und Gebühren` fee group, a spending kind, and no parent/split transfer or system payee. Principal,
disbursements and unclassified debt movements are excluded. Existing unclassified interest
must be explicitly categorized by the owner; no migration or automatic reclassification occurs.
Costs use split amounts, including signed refunds; on-budget loans are counted once.

Plan deviation always retains signed absolute cents (Ist minus Plan). Zero/negative net plans
and windows containing negative assignments (withdrawals, including carried migration data)
have no percentage or percentage-band verdict. This also avoids nearly cancelled assignments
creating an enormous percentage from a tiny positive denominator. Rows sort by absolute
cent deviation, with stable name ties.

## Pace and finance check

Pace counts fixed/periodic/debt spending once. Dated expected payments take precedence,
including partial payment remainders; without a fixed schedule, assigned money or a monthly
target supplies the planned fixed payment and due day. Periodic reserve contributions are not
invented bills. Only variable spending is extrapolated. Forecast numbers/curves are hidden
before seven elapsed month days or without a positive plan; a completed month shows actuals.
The confidence threshold is a conservative display rule, not a statistical prediction interval.

R08 remains the SPEC definition: monthly minimum credit rates / monthly household net income,
not outstanding debt / income. Outstanding loan/debt/uncovered-card balances trigger the
missing-payment guard. Known minimum schedules are authoritative; without one, classified
historical minimum repayments to debt accounts supply the last complete month's rate.
Extra repayments are excluded. Missing payment information yields an unavailable quote,
not a fulfilled zero percent. No debt with no rates remains a valid zero.

R07 and the current Heute balance chart use `budgetLiquidityForecast` with the stored R07
horizon (default 90 days), identical source amounts and the same low-point result. Historical
Heute selections remain historical charts. The unbuffered liquidity report uses the same
underlying daily model; buffered/scenario results remain explicitly separate.

R01 compares the rolling class shares as before, but divides the rolling monetary gap by
its actual number of known months before proposing a monthly funding change.

## Verification

Literal synthetic domain/API cases cover loan movement exclusion, split costs, range validation,
nonpositive/cancelled assignments, fixed and partially paid bills, first-week confidence,
missing debt rates, shared low points, monthly R01 units and cent-exact year reconciliation
including refund undo. Browser regressions cover calendar-range projects, the settings table,
absolute deviation, early forecasts and mobile capture-button clearance in light/dark mode.
The prototype activity invariant now filters budget accounts: explicitly categorized interest
on an off-budget loan must not be added to envelope activity. The audit timestamp fixture
starts from a fixed old timestamp, avoiding SQLite/JavaScript millisecond rounding races
while still requiring an actual timestamp increase. Production audit behavior is unchanged.
Final command results and delivery references are recorded with the task delivery.
