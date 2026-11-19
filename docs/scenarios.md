# Scenario snapshots (F12)

This is a pure domain model, exported from `@budget/domain`. It does not save settings,
create bookings, change the live plan, expose an API or provide a UI.

## Snapshot and assumptions

A version-1 `Scenario` identifies a named comparison, `baselineAsOf`, the entire
`baseline` snapshot, and an ordered list of uniquely identified `assumptions`.
`baselineAsOf` must equal `baseline.asOf`. The snapshot contains EUR integer cents:

- Actual signed EUR balances per explicitly selected account, with dated
  `onBudget`, `role`, `closedAt`, `openingDate` and `currency` facts. The shared
  `isLiquidityAccount` predicate used by Heute derives payment-account alerts;
  callers cannot provide their own eligibility boolean. Non-EUR accounts are
  rejected rather than summing foreign cents as EUR. Credit lines are not added
  to balances. Optional `variableMonthlyCents` per account uses `evenDaily`.
- Resolved, uniquely identified dated inflows/outflows with account, signed cents,
  forecast kind, optional recurring `paymentId`, and explicit `expected` status.
- Loans with the supplied terms, payment account, payment day and existing extras.
- Identified monthly savings transfers with source, destination and due day.
- `through`, the inclusive date to which the supplied schedule is complete.

Day zero starts from the known balance. A sourced, open expected debit can reduce
the projected day-zero balance while retaining its original due day. Bookings
already included in the actual balance must never be supplied again. Inputs have strict runtime validation. Unknown targets,
invalid dates, fractional cents, duplicate identities, reversed intervals, negative
savings rates and insufficient coverage fail explicitly. Coverage is capped at ten
years. Each loan's first modelled payment must follow the snapshot date; its balance
is the supplied opening principal for that first modelled payment month.

## Heute baseline

`scenarioBaseline(db, asOf)` uses `loadFacts`, the same cash valuation as Heute,
and the same `forecastInputs` selection, effective payment versions, income pauses,
planned-event expansion and statement settlement projections. Its schedule covers
the same 365 days. Every captured leg retains the account, signed cents, cash date
and source identity with its original due day. Unmaterialized occurrences use the
payment ID and due day as their identity. Linked future bookings use their booking
date and retain the booking ID. All persisted overdue open debits reduce projected
day zero once, even after their schedule changes. The actual starting balances do
not include those unpaid debits or overdraft headroom.

The snapshot rejects an unassigned cash leg, a missing forecast FX rate, a linked
booking whose amount disagrees with the stored expectation, and an aggregate
variable spending estimate with multiple eligible accounts. With one eligible
account the full aggregate variable estimate applies there. Expected positive
scheduled and planned legs are separate from linked actual cash and the two sides
of a represented settlement. An internal settlement is household-neutral when
both accounts are in the forecast scope.

Linked internal transfers retain both proven account legs, grouped by their stored
transfer identity. They never enter the external-obligation deduction. Whole bank
transfers use the same transit-aware valuation as the opening cash: their receipt
value becomes available on the debit date, without inventing a ledger booking.

Loan instalments already modelled as expected payments keep their occurrence
identity. Future-dated ledger bookings retain explicit `booking` provenance and
join the same forecast once, excluding booking IDs already represented by linked
expectations or statement settlements. Internal transfer legs use the same transit
date as opening cash and remain household-neutral. Heute does not independently
expand loan terms or savings schedules. The adapter leaves the standalone
loan and savings assumption targets empty. Explicit terms and coverage would
be needed to enable those assumptions from a DB snapshot.

The live per-account forecast includes standalone future ledger cash; the existing
Frei bis Gehalt obligation list retains its expected/linked/statement selection.
An ambiguous unlinked booking and expectation remain separate forecast evidence
until the owner establishes the link. No amount/date similarity silently merges them.

## Applying assumptions

`applyAssumptions(baseline, assumptions)` preserves the exact baseline reference for
an empty list and never mutates it. Assumptions apply in their listed order:

| Kind | Named target and meaning |
| --- | --- |
| `delayedIncome` | One positive inflow occurrence by ID; move it by whole calendar days, or every integer in inclusive `{ min, max }`. No additional weekend shift. |
| `incomeInterruption` | One recurring `paymentId`; lose `shareBp` of its inflows on inclusive `from`/`to` dates. 10000 means full interruption; shared `incomePauseAmount` and `shareOf` determine applicability and cent rounding. |
| `largerPurchase` | Add one negative cash event on the named account/date. |
| `specialLoanRepayment` | Add one dated extra for the named loan. Reuse `simulateLoan` to cap at the debt and change later payments. The loan supplies the payment account. |
| `changedSavingsRate` | From the named date, change one named cash savings transfer by `deltaMonthlyCents`. Positive moves more from source to destination; negative reduces it. It does not create spending or new money. |

Savings transfers reuse monthly event expansion and clamp day 31 at month end,
returning to day 31 after short months. They keep weekends as explicit calendar
cash dates. Changing an envelope assignment alone is not a liquidity change.
Supplied and generated cash legs must have distinct IDs; loan repayment and
savings-change provenance must be unique within its target. Evaluation and
serialization reject collisions rather than count the same identified leg twice.
Assumptions may affect downstream figures on other dates (e.g. loan payoff); they
never change unrelated source records. A delayed occurrence beyond `through` is
rejected: extend the snapshot instead of quietly losing income.

## Evaluation, ranges and differences

`evaluate(inputs, { through, bufferCents })` calls `liquidityForecast` separately
for each account and `lowPoint` for its earliest daily closing low. Household series
are sums of these same account series. Projected day-zero balances are included. Ties keep the
first date. The result gives all payment accounts breaching zero on the first such
date, and separately all breaching the supplied buffer on its first date. The test
is strictly **below**, not less than or equal. Reserve accounts still contribute to
the total but do not produce payment-account alerts. Unsafe cent results fail.

Every outcome includes `withExpectedInflows`, `withoutExpectedInflows`, and the
explicit dated `expectedInflows` list. The second view excludes only positive
cash legs marked expected, retaining expenses, internal transfers and actual
starting balances. No forecast is an available-to-spend or investable-money figure.

An exact-input result is `conditional`, never a statement of certainty about reality.
Ranged delays produce `range`, all discrete `outcomes`, and explicit min/max low
balances with possible low dates/account. Multiple ranges form the Cartesian product
(maximum 4096; larger combinations are rejected). Interior dates are retained, so
month-end and payment interactions are not approximated by endpoints. These are
possible model outcomes, not probabilities or confidence intervals. There is no
invented midpoint, likelihood or extra precision. First breach dates remain in
each outcome because a range may include both a breach and no breach.

`diff(base, scenario, horizon)` requires the identical saved baseline. Each row has
a stable figure key, distinct base and final scenario values, contributing assumption
IDs and deterministic German text (amounts with cents, account and date). Figures
include daily account balances, account and household low points, breach dates and
expected inflows. Ordered marginal attribution names an assumption only if applying
it changed that figure. Interactions depend on the explicit assumption order; this
is explanatory attribution, not independent causal inference. Changes that cancel
completely do not produce a final difference. Possible outcomes remain arrays,
including for ranged differences; singleton values do not assert real-world precision.

## What remains unknown

Loan interest and fees use the existing **monthly** model: interest first, then
regular payment and extra. The special cash leg uses the supplied actual date,
while future regular amounts follow that monthly calculation. This does not claim
daily accrual or bank settlement precision. Extras cap at the remaining debt after
the regular installment; excess requested amounts are not debited. No extra is
paid after payoff. Contractual permission, penalties, daily interest, settlement
cutoffs, tax effects and effects on benefits stay **unknown unless supplied**.
The present loan schema supports only the existing rate/installment/monthly-fee
terms; unsupported contractual effects cannot be inferred from it.

The snapshot is an assertion of what the caller knew on its date, not evidence of
historical knowledge by itself. Missing obligations, unsupplied variable spending,
inaccurate expected income and stale balances remain limitations. Daily closing
series cannot prove that intraday payment order will not cause a shortfall. Future
salary growth, tax refunds, discretionary account transfers and savings yields are
not extrapolated. This slice has no live data reconciliation or back-test.

## Serialization and proof

`serializeScenario` validates and writes canonical JSON (sorted object keys;
array/assumption order retained). `deserializeScenario` validates version, dates,
identities and targets. The domain has no clock, random IDs, network or I/O.
`fixtures/replay.json` stores a synthetic scenario containing all five assumptions,
a delay range, a loan and a savings plan, the explicit horizon/buffer, and an expected
SHA-256 hash of canonical `{ evaluation, differences }`. The unit test reloads this
stored object, round-trips it and checks identical output and the pinned hash using
Node crypto in the test only. Production callers may hash `canonicalJson(result)`
with their platform's SHA-256. The hash checks reproducibility, not financial truth
or authenticity; algorithm changes need a reviewed fixture/version decision.

`scenario.test.ts` uses literal cents and dates for each assumption, account-level
shortfalls despite a positive household total, leap/month-end/weekend dates,
expected-income exclusion, buffers, variable spending, ranges, explanations and replay.
It is new coverage for this model; no existing financial oracle is changed.

## Slice 2 prerequisites

Persistence/UI need an audited, undoable versioned save with conflict detection,
stable IDs and explicit horizon/buffer selection. Establish what was known on the snapshot
date before permitting historical capture. Persist the baseline and assumptions
together to avoid reading today's terms on replay. Keep horizon/buffer and model version with any saved evaluation.

The UI must distinguish baseline date, assumptions, both expected-income views,
every account's low/date, first breaches, model ranges and unknown contract/tax
effects. It needs readable source labels for stable IDs, validation handling and an
explicit rebase action when live facts change. Contract effects outside this model
remain a reliance blocker until represented and verified. Slice 2 also needs
save/reload, audit/undo and UI presentation tests. Synthetic DB tests cover Heute
parity, account lows, day-zero debits, future-linked bookings, internal settlement
legs and expected-income exclusion. No persistence, migration, API, UI or production
replacement acceptance is claimed by this domain slice.
