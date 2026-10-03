# Trade capture and savings executions

Portfolio instrument history opens the trade editor for every stored kind. Delete requires an
explicit confirmation and soft-deletes the trade and its linked settlement booking in one audit
group. Undo/redo restores/removes both. Separate deposits and transfers are independent source
bookings and stay untouched. Existing settlement guards prevent direct booking edits/deletion
from breaking a live trade. A broken settlement aborts the whole mutation, including audit writes.

| Kind | Units entered | Account cash | Source amount |
| --- | --- | --- | --- |
| Kauf | positive | minus gross and fee | recorded acquisition amount |
| Verkauf | positive; stored negative | gross minus fee and withheld tax | recorded proceeds |
| Dividende / Ausschüttung, Zinsen | none; stored zero | gross minus fee and withheld tax | recorded gross income |
| Gebühr, Steuer | none; stored zero | minus amount | recorded standalone charge |
| Einlieferung | positive | none | documented delivery value/acquisition basis |
| Auslieferung | positive; stored negative | none | documented delivery value |
| Aktiensplit | signed change, up to eight decimals | none | zero |

All cents use the investment account's native currency, independently of the quote currency.
Income settlements retain `Kapitalerträge`. Withheld taxes are source data; no tax calculation or
second withholding is performed. Deliveries and splits reuse the shared holdings, cost and flow
calculations. A split is a unit delta, not a ratio or replacement total; the owner must verify stored
quotes against the split. Acquisition basis stays unchanged by a split. Missing quote/FX/basis
states retain the existing unavailable semantics; capture does not require a quote. Existing
oversell and holding-snapshot precedence are unchanged.

## Monthly owner confirmation

The existing Portfolio savings schedules define security, investment account, informational source
account, native monthly cents, execution day and inclusive effective versions. Saving or ending a
schedule never creates a trade, booking, transfer or bank order.

`GET /api/savings-plans/execution-proposals` derives due monthly proposals from effective schedules
and the shared execution matcher. Heute links to the same proposals in Posteingang; its count and
the global inbox count refresh with ledger writes and undo. Past due proposals remain available
after the month changes. Future execution days are not actionable. An existing matching live buy
suppresses its proposal. Ambiguous monthly schedule versions, deleted securities and closed/deleted
investment accounts do not offer confirmation. The schedule history remains available for repair.

The owner opens **Ausführung prüfen**, verifies the actual execution date, supplies the actual
units, gross amount and fees from the statement, then chooses **Ausführung bestätigen**. This POST
to `/api/savings-plans/:id/confirm-execution` is behind the existing session/origin guards. Strict
validation rejects unknown fields, negative/unsafe cents and invalid dates. The server rechecks
the schedule's month, planned date/rate/currency, references, matching and due state inside the
same transaction as trade/cash/audit creation. An execution date can differ by up to three days
from the proposal and cannot be in the future. The actual gross and fee can differ from the plan.
Stale or repeated confirmation returns a conflict and leaves the draft available to review.

Drizzle-generated migrations 0028/0029 add nullable `trade.savings_plan_id` and
`trade.savings_month`, then enforce the foreign key and paired buy/month identity. Generation
uses two steps because combining new columns and a SQLite table rebuild makes this Drizzle
version select the new columns before they exist. The upgrade regression preserves existing
trades, import keys, settlement bookings, splits and audit history.
A partial unique index permits one live confirmed execution per security/account/month, across
schedule versions. Source attribution survives edits; security and buy kind remain fixed. The
execution API reports explicit confirmations even when actual cents differ from the matcher.
Deleting or undoing a confirmed trade restores its proposal. A replacement can then be confirmed;
restoring the earlier trade is refused atomically by the monthly uniqueness constraint. No budget
funding is inferred: the owner separately checks/books the actual source-to-depot transfer.

## Verification and owner steps

Synthetic unit/API tests cover all nine kinds, exact cent/unit boundaries, holdings/basis/cash,
native currency, grouped edit/delete/undo/redo, broken-settlement rollback, read-only proposals,
stale/future/duplicate confirmations and monthly uniqueness on restore. Browser tests cover
desktop 1440 and mobile 390, both themes, keyboard confirmation, dirty navigation, retry and
accessibility/overflow; screenshots are evidence, not regenerated baseline replacements.

Owner steps: review the German workflow and split terminology; define actual schedules in the
running app; confirm only executed purchases using statements; reconcile cash transfers, holdings,
basis and withheld taxes privately for Gate 3. This feature needs no new secrets, credentials or
provider consent. Extended instrument/source deletion and rate-optimisation proposal/apply UI
remain separate roadmap work. No merge or deployment is part of this delivery.

Local commands, results, screenshot evidence and environment limits are recorded in
[verification evidence](evidence/trades-execution/README.md). Owner/private acceptance and the
full pinned Linux CI suite remain separate from the local feature checks.
