# Crypto read source — verification evidence

The source is a first integration slice in Einstellungen › Datenquellen. It uses
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

Resumed verification on 2026-10-03, after merging main and retaining both domain
exports: repository-wide lint, workspace typecheck and production web/server build
passed. Focused domain, source/API, SQLite integration, inbox/app and timer tests
cover 57 cases; the added timer regression was also rerun independently. Added
checks verify corrected acknowledged operations reopen the same inbox item without
ledger writes, foreign-currency mapping rejection, streamed response cancellation,
and source continuation after the market run has already completed.

The local test scope follows the owner's request to keep it short. CI runs the
complete unit/browser suite and image checks; those are not claimed locally.

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


## PR review corrections (2026-10-03)

All six findings are covered by focused synthetic regressions: mapping-independent
acknowledgement with current mapping display and undo, independent operations
progress on repeated balance failure, row quarantine with ID/reason only,
allowlisted failure categories, tolerant balance metadata/duplicate rows,
zero-local missing sources, discrepancy recurrence after intervening matches, and
64-cursor history plus a legacy-compatible total page counter. The adapter and
secret name are generic; no credential fallback is retained.

The focused seven-file suite passed 54 tests. The 18 persistence tests were rerun
successfully after bounding legacy state reads. Workspace typecheck passed; the
server/web typechecks were repeated after the shared page changes. Web/server E2E
build, production web/server build and repository lint passed. The complete unit/browser suite remains CI work, as requested.

Eight source browser cases passed across desktop/mobile, plus two setup cases.
Two initial failures were new assertions using the wrong area title; the shared
frame retains the existing Einstellungen title. Both corrected cases then passed,
along with the existing bank callback/mapping/manual-queue scenario on both
viewports. After sharing the action layout, both source scenarios passed again on both viewports. Both themes passed Axe, overflow checks and 44px control checks. No
visual baseline was changed. Synthetic API interception tests source independence:
a bank failure stays visible while the crypto source completes its own refresh.

The final browser run used the normal compiled server, software passkey setup,
existing assertions, and one worker. Its temporary configuration and output paths
were separated to avoid automatic cleanup of the config or an open SQLite file.

- [Shared page: desktop, light](crypto-read-source/review-desktop-light.png)
- [Shared page: desktop, dark](crypto-read-source/review-desktop-dark.png)
- [Shared page: mobile, light](crypto-read-source/review-mobile-light.png)
- [Shared page: mobile, dark](crypto-read-source/review-mobile-dark.png)

Delivery is blocked by worktree metadata permissions. Initial main merge commit:
`a547635`. A later fetch brought main `17e655b`, including the bank source, but Git
cannot write `ORIG_HEAD.lock` or `index.lock`; the final merge and fix commits have
not happened. The shared page and bank test were prepared from that main version.
The current backend still awaits that merge; no combined backend delivery is
claimed. Preserve both API mounts, both source scheduling paths, the shared
DataSourcesPage and both domain/repository exports when resolving the merge.
Commit the fixes, complete the main merge, rerun affected checks and push without
force from a session with worktree metadata write access. No live credentials or
private financial data were used. Owner/private acceptance remains open.
