# Plan year events (Y14)

`Plan › Jahr` keeps the twelve existing envelope-month reads authoritative for
assigned/activity flows and December available stock. Its separate dashed event
calendar reads `GET /api/liquidity/events`; both views retain category identity.
The existing event POST/PATCH/DELETE API provides audited, atomic writes and group
undo/redo. Calendar reads require a session and mutations retain the origin guard.

Migration `0019_planned_event_recurrence` adds recurrence, selected calendar months
and an inclusive optional end date to `planned_event`. Existing events default to
once, no selected months and no end date. Legacy event audit snapshots receive
the same additive defaults so their original actions remain undoable. The number must be reconciled with the
latest main before pushing. The current base includes migrations 0017 and 0018.

The pure `plannedEventOccurrences` expansion feeds the year calendar and the
existing forecast inputs (report 3.1, Today and R07). Monthly, quarterly and yearly
rules retain the original day and anchor month; short months clamp without
drifting. Selected months repeat each year after the start date. Expansion never
creates bookings, expected payments or occurrences in storage. EUR budget accounts
and the aggregate budget are supported; invalid account references remain visible
and are excluded from scenario/forecast arithmetic.

The local scenario selection is a set of events with a mit/ohne switch. Monthly
free money means stored `toBeAssignedCents` plus the cumulative signed event delta
from dates strictly after the server's reference day within the selected year.
December is a stock, not twelve monthly balances added. Existing salary/contract
payments are not extrapolated into the annual budget baseline; report 3.1 remains
the cash-balance forecast. Disabled events never count. Past plans remain visible
in the calendar, but there is no automatic event/booking reconciliation: owners
must switch off or adjust a plan that duplicates an existing future booking.

Synthetic coverage: recurrence cent/date boundaries and literal scenario totals;
API validation, auth gates, rollback, shared forecast dates and undo/redo; isolated
fixed-clock desktop/mobile browser flows, failed saves, dirty close/browser Back,
read-only scenario switches, light/dark Axe and screenshot evidence. Owner visual
and physical device acceptance remain separate from automated checks.

Screenshot and browser coverage: [Y14 evidence](evidence/plan-year-events.md).
