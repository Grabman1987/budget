# Crypto read source ? verification evidence

The source is a first integration slice in Einstellungen ? Datenquellen. It uses
the existing page frame, section headings, form controls and inbox. The original
source prototype was reviewed; the current precision-layer design in DESIGN.md
takes precedence over its older screenshot styling.

## Covered behavior

Synthetic API/SQLite tests cover exact cents/e8 precision, current provider schemas,
fixed-host GET-only transport, absent credentials, sanitized provider failures,
pagination/replay and duplicate suppression, acknowledged records, failure recovery,
atomic inbox/cursor rollback, concurrent refreshes/write locks, mapping undo/redo,
native cash and unpriced holdings reconciliation, and unchanged budget/trade rows.
A mixed trade with a cash fee remains investment review, not transfer matching.

API tests exercise session, origin and step-up boundaries. Browser tests exercise
configured/unconfigured state, manual refresh, explicit mapping, readable source
records, links to settings, and retention of the removed import UI boundary.

## Browser evidence

Eleven tests passed at 1440 px and 390 px, including setup and the existing export
regression checks. Both themes were checked with Axe (no serious/critical findings),
horizontal overflow assertions and 44 px select controls.

The default multi-server harness exceeded its unrelated sample-seed startup timeout
on the local Windows machine. The passing focused run used its main empty server,
auth setup, desktop/mobile projects, one worker and a 90-second per-test limit.
No assertion or fixture was weakened. A first desktop run exhausted the 30-second
test budget during loading; the longer run passed. Tests used intercepted synthetic
source responses and no provider credentials.

- [Desktop, light](crypto-read-source/desktop-light.png)
- [Desktop, dark](crypto-read-source/desktop-dark.png)
- [Mobile, light](crypto-read-source/mobile-light.png)
- [Mobile, dark](crypto-read-source/mobile-dark.png)

## Acceptance boundary

These checks do not establish live provider payload/scopes, private financial
reconciliation, owner design acceptance or the 14-day nightly gate.
Owner setup and implementation limits: [crypto read source](../crypto-read-source.md).
