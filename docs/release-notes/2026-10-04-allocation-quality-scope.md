# Allocation quality and scope — PR3

Allocation decision support now uses explicit account/instrument metadata, including signed investment cash. Unclassified exposure and estimated/stale values make all rebalancing proposals provisional; missing price/FX suppresses them. Savings optimisation retains existing rates on provisional data or out-of-scope plans. Every proposal exposes confidence.

The UI distinguishes Umschichtungsabstand at unchanged total from Neues Kapital bis Soll for a single-class contribution. Report 4.2 carries current/month-end quality and preserves dated exposure/target resolution. No order, settings page, dynamic tier or mobile-panel change is included.

Migration 0032 preserves original source columns and financial values; it freezes initial membership from structured types and settlement links. The API metadata writes are audited and undoable. Scope/cash-class metadata is not historically versioned. See [full contract, tests and owner steps](../allocation-quality-scope.md).
