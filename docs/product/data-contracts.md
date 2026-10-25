# Data dictionary and business invariants

Logical product vocabulary. The [schema and relationship diagram](../data-model.md)
and feature API contracts own physical columns. No new schema is introduced here.

| Object | Required meaning / principal fields | Owner, relationships and lifecycle |
| --- | --- | --- |
| Account | Name, type, native currency, opening date/balance, budget membership, applicable terms | Institution optional; contains bookings; depot may link settlement account; active/closed retained |
| Booking | Account, booking date, signed native amount, status, payee/memo, source identity | Owns splits; belongs to a grouped audited action; reconciliation/trade dependencies protect writes |
| Split | Category/income type/contact attribution and exact signed amount | Sum equals booking amount; contact shares cannot manufacture extra cash |
| Transfer | Connection between two ledger legs | Zero net movement for a same-currency internal transfer; not household income or expense |
| Category/group | Name, budget class, ordering/visibility, type and targets | Envelopes reference category per month; merge/split retains specified history semantics |
| Envelope month | Carry, assigned, activity and available | Derived budget meaning; assignment is not an external cash movement |
| Category target / savings goal | Amount/rhythm/due/version and category or account backing | Goal is an intention; backing identifies actual funds; no duplicate cash asset |
| Recurring schedule/version | Direction, account/category, rhythm/date shifting, effective dates, native amounts | Produces expected occurrences; matching connects actual records |
| Contact | Retained identity and ledger-based outlays, receipts and credit | No authentication role; derived balances excluded from net worth |
| Payee | Reusable counterparty metadata | Not automatically a contact; learned assignment remains its own suggestion rule |
| Instrument/trade/holding | Instrument identity, currency, units, gross execution, fees/taxes and dated ownership | Trade links settlement; source basis and analytical cost method remain distinct |
| Quote / FX | Date, price/rate, currency and source | As-of policy/fallback is explicit; no missing rate silently treated as 1 |
| Manual valuation | Native amount and explicit eligible account/date | Existing quote/product/manual-value precedence applies; audit/check dependencies retained |
| Asset exposure/target | Dated classification weights, completeness and managed targets/bands | Full 10000 bp differs from incomplete or unmanaged; group has no positions of its own |
| Rule / result | Code, enabled state, stored parameters, evaluated date, status and action | Registry defines supported codes; missing inputs remain not evaluable |
| Inbox item | Source identity, type, decision state and linked work | Queue is not another ledger; source action resolves financial work |
| Receipt / payslip | Content identity, metadata, linked records; parsed/reviewed payroll lines | Files live in protected storage; attach/confirm has grouped audit rules |
| Project / planned event | Project attribution or dated forecast change | Project groups real income/costs; event forecasts do not themselves book cash |
| Connection / source state | Provider-neutral identifier, consent/status, latest success and coverage | Secrets belong to runtime configuration; never checklist progress or repository data |
| Audit group | Before/after changes for one supported user action | Undo/redo follows dependencies; logging is not financial acceptance |
| Onboarding progress | Proposed version, choices, review acknowledgements and concurrency revision | Persist no duplicate balances/categories or credentials; readiness derived from live data |

## Units, time and missing values

- Money: signed integer cents, validated safe arithmetic; format de-AT only at
  the edge. Shares/rates use bp, prices/FX micro-units and quantities e8 according
  to the existing schema. Use exact intermediates and largest-remainder splits.
- Financial dates use explicit ISO days/months. User-facing “today”, month and
  bank-day boundaries follow Europe/Vienna and existing calendar helpers. Stored
  technical timestamps remain UTC; source fetch time is not booking date.
- A native amount and converted EUR amount are different facts. Preserve currency
  labels, rate date and missing-FX reason. First private migration is EUR-only;
  later currency support never authorizes silently summing unlike amounts.
- Null/unavailable, zero and omitted/unmanaged are distinct. A zero-value account
  may be intentional; an absent price/loan rate/history is not evidence of zero.
- A latest value needs an as-of date and coverage. A successful fetch with no new
  rows differs from a fetch failure and from incomplete historical source data.

## Global invariants and reconciliation boundaries

1. All gross lines sum to the booking amount; transfers conserve their documented
   cash movement; display rounding never changes stored money.
2. Audit/undo, source identities, tombstones and reconciliation guards survive
   editing, re-import/retry, device reload and server restart as specified.
3. Expected income, unexecuted trades, targets and scenarios do not become actual
   cash. Saving a configuration never sends a bank order.
4. Account cash, budget availability, contact credit and investment value cannot
   be added indiscriminately. Net worth uses the agreed shared valuation universe.
5. Complete historical returns need the documented flows, basis, quotes/FX and
   period conventions; an imported snapshot alone cannot supply missing history.
6. A close/checklist flag never substitutes for ledger equality. Manual-start
   dates must be explicit; the private migration start is not a global default.
7. Exports, operational backups and unsent device-local work have different
   completeness/security boundaries; document each before claiming recoverability.
