# Independent source review: reports #553/#554/#619–623/#628

- Reviewed worktree: `/workspace/impl-reports-619-623`, branch `codex/impl-619-623-reports`, clean source HEAD `4f50e612fed8d812ae054470a3e31ab9553e2732` against documented base `6420676d257698767931dd151863765cec914acf`. The two owned commits are `09eb20f3` (reports consolidation) and `4f50e612` (spending answer/groups). Read both NOT-VALIDATED handoffs.
- Scope: read-only review of the 56-path source delta with focused tracing of report dispatch/legacy URLs and view state, project-scoped income/overview/cashflow APIs and shared ledger classification, signed spending groups and exact-day comparison, booking drilldowns, saved Explorer entry fencing, amount privacy and report CSV paths. No tests, checks, build, browser, CI, or source changes.

## Findings

No concrete invariant failure found in this scoped source review. In particular, the project filter reaches each of the three readers and returns an explicit project descriptor; unknown/deleted IDs fail closed in `reportProjectScope`. Scoped income suppresses unattributed expectations and scoped table output strips global assignment/wealth/target fields. The spending groups derive from the complete signed consumption breakdown and check their sum against the displayed total; the preceding comparison distinguishes unavailable coverage from a covered zero. The income/expense CSV serializes the same selected rows and months as the grid. Legacy mapping retains raw query parameters and fragments, and saved Explorer entry selects by current server-read ID before enabling its financial query.

Source inspection alone does not establish cent equality under real datasets, booking drilldown parity, print/mobile geometry, live privacy behavior, export downloads, or cross-browser saved-view behavior. The handoffs already mark those validations outstanding; this review makes no runtime or delivery claim.
