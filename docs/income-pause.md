# Income pause contract (#285)

## Accepted first slice

An income pause is a forecast adjustment for exactly one existing, active recurring income source whose original/native currency is EUR before any FX conversion. It is identified by its stable expected-payment ID. It applies only to future cash projections. It does not rewrite the expected-payment schedule or booking-matching behavior, booked income, actual cash history, account balance, or envelope balance.

The pause has a required inclusive start and end date. Compute each occurrence using the schedule's existing rhythm, effective amount version, and date-shift rules first. If that resulting occurrence date falls inside the pause interval, its projected cash contribution is zero. Do not prorate by calendar days. After the interval, the source schedule contributes its normal effective amount version on its next occurrence. Dates and occurrence generation continue to follow the existing schedule rules.

The first slice accepts only zero during the pause. Nonzero partial amounts, multiple selected income sources, and additive income deltas are deferred. An overlap with another pause interval for the same source is rejected; the application must not silently choose a precedence. Use the schedule ID throughout calculations and persistence, never a name or occurrence date as identity.

The pause is a distinct forecast adjustment, with its source ID and inclusive interval, not a `planned_event`. Persisting, editing, or removing it belongs to #287 as one audited, undoable mutation group. The shared future-cash forecast consumes the adjustment once so Heute, R07 and report 3.1 agree. The forecast salary cash marker (`balance.salary`) must use those same effective future occurrences and omit a suppressed receipt. The separate rule-based planning boundary (`stand.payday`), its label, and the existing period/payday horizon stay unchanged; that boundary does not assert an actual salary receipt. Existing `planned_event` remains an additive dated cash flow with its current nonzero-amount and undo rules.

The #287 UI must identify an applied pause as a forecast adjustment with its source and interval, including when no additive planned events exist. An unchanged normal expected-payment schedule or income plan may therefore differ from projected cash during the pause; the adjacent explanation must make that scope clear. Do not label the paused projection as an unchanged baseline merely because the planned-event count is zero. The adjustment must not create a zero-value booking or an extra matching proposal; the original schedule's matching behavior remains unchanged.

## Synthetic examples

1. **Pause replaces the scheduled receipt with zero.** One monthly EUR inflow is 300,000 cents on the 15th. With pause interval `2027-06-01` through `2027-08-31`, the June 15, July 15 and August 15 projected contributions are each 0 cents. The next occurrence, September 15, uses the schedule's normal effective amount version; with no intervening version change, that is 300,000 cents. There is no second salary line to add or subtract.
2. **An additive event means something different.** If the 300,000-cent July 15 schedule remains active and a separate 50,000-cent additive event is added on that date, projected cash is 350,000 cents. That does not pause or replace the scheduled receipt. This contrast is explanatory only; additive income deltas are not part of the first slice.

Occurrence boundaries use the computed shifted date. For a monthly schedule due on day 1 with the existing `before` shift, the Sunday 2026-11-01 occurrence shifts to Friday 2026-10-30. A pause ending inclusively on 2026-10-30 includes that occurrence and sets its projected contribution to zero; a pause beginning on 2026-10-31 does not include it. The later calculation task must retain the current weekend and holiday shift behavior.

## Delivery boundary

- **#285 — this contract:** records the owner's zero-during-pause decision and separates replacement from an additive planned event.
- **#286 — pure calculation:** applies one pause to the shared occurrence/cash-flow stream and proves the boundaries with literal-cent tests. It does not persist a pause or change the current horizon policy.
- **#287 — persistence and UI:** stores the schedule ID and inclusive interval, rejects same-source overlaps, applies audit/undo, and adapts the shared forecast and salary marker. It does not change the original schedule or existing additive `planned_event` behavior.

The owner decision resolves the first-slice product question: one EUR schedule and zero projected income during an inclusive interval. Nonzero partial payments, multiple schedules, and income deltas remain explicitly deferred rather than implied by that decision.
