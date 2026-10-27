# Booking bulk selection (#596)

The selected-row bar reads all selected IDs from the database, independently of
loaded cursor pages, and displays signed integer-cent totals per native currency.
Missing rows and unsafe totals remain explicitly unavailable. Phone selection is
entered through “Auswählen”; ordinary row editors stay read-only while choosing.

Bulk changes reuse `/api/bookings/bulk`, its savepoints, canonical booking writer,
shared audit context and Undo. Reconciled and financially linked rows are reported
with their identity and reason and remain selected. Only acknowledged changed IDs
update the client cache. Failed and no-op changes retain the selection and do not
offer a nonexistent Undo. Plain receipt attachments do not create a financial lock.
The legacy delete confirmation/writer remains under the additional actions menu;
delete previews and date/note/payee batches belong to their separate issues.

The twelve source files were recovered from the preserved #596 patch at archival
commit `d2300f08`, originally reviewed at checkpoint `1295652f`, and adapted to
`ae961077`. No source was taken from the mixed #594/#597/#515 implementation.
Current code still requires independent review and runtime acceptance.

Test changes:

- `apps/server/src/api/booking-bulk-596.test.ts`: new literal native totals,
  deduplication/missing IDs, mixed protected-row skip/audit/exact Undo and all four
  supported fields. The first two tests failed on the unchanged source in remote
  run `40462622095`: missing selected-read endpoint and six changed instead of two.
  Response DTO annotations fix the server's strict JSON typing without changing
  expectations. Forward field assertions and four real bank-source/migrated-key
  cases cover named skips, unchanged protected rows and exact eligible-row Undo.
- `apps/server/src/api/api.test.ts`: existing split-skip and database-rejection expectations accept
  the additional named booking DTO. Its reason, message, changed IDs, money,
  transfer-pair and Undo expectations remain unchanged.
- `e2e/issue-596-bulk-change-bar.spec.ts`: isolated synthetic mixed fixture,
  literal selected total, actual bulk/Undo, named retained skips, both themes,
  desktop/phone/WebKit, Axe, horizontal overflow and phone target/tabbar geometry.

No existing timeouts, retries, skips or protected financial expectations changed.

Existing browser-flow adaptations preserve their original assertions:

- `checkbox-appearance.spec.ts` enters phone selection before locating its checkbox;
  drawn-box, touch geometry, toggle and both-theme Axe checks are unchanged.
- `tap-targets.spec.ts` measures editable status/flag controls before phone
  selection, retains the row ID across its read-only transition, then measures
  and toggles its checkbox before leaving selection for the capture dialog.
  WebKit centers the checkbox clear of the fixed tab bar before both edge hit
  tests; a geometry check confirms the user can scroll the full target into view.
- `ledger.spec.ts` enters phone selection and opens the additional actions menu
  before both delete attempts; category, Undo, cancellation and restore checks stay.
- `bank-followups.spec.ts` enters phone selection and opens additional actions for
  the selected transfer pair. Inbox linking, balances, dates and Undo stay unchanged.
