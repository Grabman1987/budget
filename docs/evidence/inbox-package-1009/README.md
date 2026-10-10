# Inbox package #277 / #278 / #319 / #320

Synthetic evidence only. Desktop is 1440 x 900; mobile is 390 x 844.

## Delivered behavior

- All/current/historical selection is applied before the existing 100-entry API pagination. Booking/proposal dates, envelope months and stored-warning creation dates determine the month. The full open count and stored resolution state are unchanged by filtering.
- Repeated stored data checks share a source/reference and structured reason/category. Legacy checks share a group only when title and raw detail agree. Counts cover the selected queue, including unloaded pages; each point remains reachable. Grouping is read-only and limited to data checks in the global inbox.
- Desktop/mobile headers link to the inbox page. Legacy panel URLs redirect during router loading. The back link retains the original route/query context.
- Stored data-check details use `/konten/posteingang/:id`, preserving the filter and expanded group on return. Existing source detail, confirmation dialogs, assignment editor, resolve and audit/undo paths are reused. GET never acknowledges a warning.

## Verification

- Domain, server and web package TypeScript checks passed.
- ESLint/Prettier on changed files and `git diff --check` passed.
- Focused Vitest: 11 domain/API/DB tests and one mobile-header test passed. The latter was retried alone after a worker-start timeout under parallel load.
- E2E build passed; the web bundle was rebuilt after UI/legacy-route corrections.
- Desktop/mobile package flows passed: period boundaries, unchanged totals, 101 repeated checks across two pages, direct detail URL, reload, back link/browser back, confirmation, assignment cancellation/focus, resolve/undo/redo, no page overflow and 44px mobile controls. Light/dark Axe scans found no serious or critical violations.
- Final phone-header rerun: 4/4 checks passed (one mobile scenario plus setup). In total, 17 scoped functional scenarios passed across desktop/mobile, with one intended desktop skip. The package run had 19 passes and an obsolete phone-sheet assertion failure; its replacement passed in the focused rerun.
- Full local check/full E2E were intentionally omitted under the owner's three-job override. CI and deployed owner acceptance remain pending.

Initial red tests reproduced the absent period filter and the legacy render-time navigation loop. An outdated phone-sheet assertion was replaced by page/return-context assertions; a test-only Windows encoding typo was corrected. No production assertion was weakened.

## Captures

- [Desktop light](inbox-detail-desktop-light.png), [desktop dark](inbox-detail-desktop-dark.png)
- [Mobile light](inbox-detail-mobile-light.png), [mobile dark](inbox-detail-mobile-dark.png)
- [Desktop grouping](inbox-groups-desktop.png), [mobile grouping](inbox-groups-mobile.png)

No snapshot baseline files are affected or regenerated. These are capture-only evidence.

## Boundaries and owner steps

The API still constructs the existing whole-queue read model before filtering/slicing; this is not a database performance change. No migration, dependency, provider request or automatic booking was introduced. Month-close keeps its existing selected-item list. Other inbox kinds retain their existing workflows.

Wait for CI, then review the deployed filter/group/detail flows. No new credentials or consent setup is required. The PR must not be merged automatically.
