# Routine contracts

The eight routines already exist in concept chapter 4 and PRODUCT. The following
table turns them into reviewable acceptance contracts. The sequence and failure
requirements are proposed elaborations; existing feature contracts still govern
financial mutations. A routine description is not proof of a delivered wizard.

| ID / trigger | Preconditions | Main steps | Finish condition | Failure / resume |
| --- | --- | --- | --- | --- |
| PR01 Night/source run | Configured source and authorization; scheduler available | Fetch, validate/deduplicate, retain review proposals, update prices/FX and freshness | Every source has success/as-of or explicit failure; review work remains accessible | Retry/catch-up per adapter; partial success retained; no duplicate or silently posted bank record |
| PR02 Capture | Authenticated owner, valid account and category/contact basis | Amount/payee/account/date, lines/shares, validate, save | Balanced audited booking; cash confirmed, bank follows current pending rules; undo available | Preserve draft; explicit offline queue/error state; locks/conflicts explained |
| PR03 Weekly review | Accessible inbox and account/plan views | Resolve proposals, check unknown categories and due items, inspect pace | Reviewed items resolved or explicitly deferred with reason | Count reflects retained work; failed action remains actionable; no false empty inbox |
| PR04 Payday distribution | Actual available money and reviewed goals | Check actual receipt, inspect waterfall, allocate, review remaining money | Assignments match the chosen plan; forecast income never creates spendable money | Preserve completed assignments; retry remaining operation; negative/unfunded state explicit |
| PR05 Month close | Selected month and ledger coverage known | Review bookings/sources, reconcile accounts, update manual values, cover overspending, settle contacts, plan next month and review | Required steps done or explained; month summary and remaining differences visible | Resume saved work; posting/reconciliation locks honored; no silent “complete” with unresolved differences |
| PR06 Quarterly review | Valuation quality, targets and debt terms known | Review allocation, terms/contracts, source consents; choose actions | Accepted decisions recorded; executions separately confirmed | Missing prices/terms suppress unsupported recommendations; no automatic bank orders |
| PR07 Annual planning | Prior-period coverage and next-year obligations available | Review recurring/annual costs, goals, contracts, annual results and restore readiness | Reviewed future plan plus explicit operational evidence/gaps | Forecast remains separate from booked cash; actual restore tracked separately from a checklist |
| PR08 Life-event scenario | Baseline and dated proposed changes known | Compare baseline/scenario, inspect assumptions, explicitly apply supported changes | Scenario saved or selected dated changes applied within supported scope | No implicit ledger rewrite; undo supported mutations; income-pause scope remains its existing narrow contract |

## Example: first month close

Start with the selected month and a visible coverage summary. Resolve relevant
inbox items, verify account balances and manual valuations, inspect uncovered
categories, review contact settlements, prepare the next month and read the
month summary. Each action must use the existing linked financial operation.

An interruption must reopen the same month and preserve completed saved changes.
A recorded difference needs a next action or explicit deferral. A user pressing
“done” does not establish independent account equality or Gate 4 acceptance.

Bank source policy matters: under SPEC decision 41, fetched BOOK transactions can
post immediately as unchecked pending bookings without automated categories;
PDNG candidates need explicit confirmation. A connection may retain the older
confirmation-first policy. The inbox process must describe the active policy,
not assert that every bank transaction always waits for review before posting.

## Shared process documentation template

For each follow-up work package, specify:

1. Trigger, responsible actor, entry URL and preconditions.
2. Inputs, validation and domain contract.
3. Named states and transitions, including pending, rejected and partial success.
4. Financial writes, grouped audit/undo, idempotency and reconciliation locks.
5. Empty/loading/error/offline behavior and interruption/resume.
6. Finish condition, downstream effects and remaining user work.
7. Screen links for desktop/phone, independent examples and exact evidence revision.

## Data relationships behind the routines

Accounts contain bookings; bookings carry category/contact splits; paired transfer
legs connect accounts. Category envelopes and assignments define monthly budget
availability. Recurring schedules propose expected occurrences, which can link to
actual bookings. Instruments/trades/prices define holdings and valuation; they
do not substitute for spendable budget cash. Rules evaluate this shared state;
the inbox holds decisions; the audit log connects grouped mutations and undo.

Use [the data model](../data-model.md) and schema as the detailed reference. This
summary introduces no new entities or calculations.
