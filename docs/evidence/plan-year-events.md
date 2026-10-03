# Plan year events (Y14) evidence

All figures and names in these captures come from an isolated synthetic ledger.
The browser and server reference day is 2026-10-02. Desktop captures use 1440px;
mobile captures use 390px. Axe checks cover the main view and the open panel in
both themes, together with viewport overflow and focus-return checks.

- Desktop: [light](plan-year-events/desktop-light.png),
  [dark](plan-year-events/desktop-dark.png).
- Mobile: [light](plan-year-events/mobile-light.png),
  [dark](plan-year-events/mobile-dark.png).
- Desktop event panel: [light](plan-year-events/desktop-panel-light.png),
  [dark](plan-year-events/desktop-panel-dark.png).
- Mobile event panel: [light](plan-year-events/mobile-panel-light.png),
  [dark](plan-year-events/mobile-panel-dark.png).

The fixed-clock browser flows create a one-off event, edit it into a monthly
recurrence, compare selected-event scenarios without any API writes, switch it
off, undo/redo, remove/undo and check identical event dates in report 3.1. Separate
form coverage checks dirty close and browser Back, preserved input after a failed
write, and switching a bounded recurrence back to a one-off event.

Domain/API coverage includes literal cent totals, inclusive dates and end dates,
short-month clamping, leap years, quarterly/yearly/specific-month rules, legacy
migration and audit undo/redo, validation, authorization and atomic rollback.
The original envelope-grid regression cases remain independent of event amounts.

Local verification on the reconciled main source: workspace typecheck and lint,
production/E2E builds, and all 2,158 tests in 222 files passed. The full test repeat
used `npm run test -- --maxWorkers=2 --testTimeout=30000 --hookTimeout=30000`
after the Windows runner exceeded the standard export-abort test timeout.
Relevant year/event/liquidity browser cases passed on desktop and mobile; two
browser-page startup timeouts passed on a one-worker repeat with a 90-second
test limit. Runner-only user-info, parallelism and fresh database/port workarounds
stayed in ignored local files; production assertions and CI configuration did not
change.

The scenario overlays future event deltas on stored monthly **Zu verteilen**.
It does not extrapolate salary, allocate envelopes, create bookings or reconcile
events automatically with actual bookings. See [scope](../plan-year-events.md).

Owner design and physical-device acceptance remain open. Automated checks and
these captures do not constitute that acceptance.
