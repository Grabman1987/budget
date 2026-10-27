# Current-filter booking register (#594)

This read-only package follows the owner's 16 October register decision. Search
and a Filter button share one compact row on desktop and phone. The existing
filter fields now update the URL immediately in both layouts. Closing the dialog
retains changes; removable named chips and Reset change the live filter. No Apply
step remains. Existing route validation also rejects malformed date strings
without throwing.

Count and signed integer-cent totals cover the entire current history filter,
independently of loaded cursor pages. Totals remain separate by native currency;
unsafe totals are unavailable, never rounded into a displayable result. Existing
classified category-spending drilldowns retain their distinct net-spending value.
Existing optimistic row transforms mark every cached copy of the complete-filter
sum pending until the canonical refetch. They retain the original native groups
for rollback and never reconstruct full-filter totals from loaded cursor rows.
Historical Saldo values and the existing today-balance line are shown only for an
explicit single account. The existing Kommend disclosure remains collapsed by
default; opening it retains its projected balance column and honest unavailable
marker. That structural column does not invent a historical multi-account value.

The additional actions menu exports the same filtered history and sort through
the shown Vienna day; unbooked future projections are excluded. The CSV uses the
existing booking-export column convention: one row per split, explicit integer
cents and rate units, UTF-8 BOM, quoted semicolon fields, CRLF and spreadsheet
formula protection. A private SQLite backup fixes the data snapshot while cursor
pages are read. Existing export admission is reused. Preparation is bounded to
100,000 bookings, 64 MiB and 30 seconds; abort or limit failure sends no partial
download, and temporary files/admission are released on completion or cancellation.
The separate full ZIP export and its step-up flow are unchanged.

Source ownership is confined to the A checkout, based on live main
`45b2762521c66fb8d0be6fb346bcb688836f63dc`. The old mixed ledger checkpoint was read
only. Its dedicated filtered-CSV source was adopted selectively; none of its
delete previews, date/note/payee batches or report-group expansion were adopted.
#597 remains a separate delete/Undo package; #515 is outside this scope. No
canonical booking writer, lock, audit or Undo path changes.

Test rationale:

- `booking-filter-594.test.ts`: new literal EUR -1557 and USD -4321 complete-filter
  totals, pagination, unavailable unsafe totals, exact 205-booking CSV membership,
  integer units, quoting, UTF-8, formula text and future exclusion. Written before
  the source additions; runtime evidence is pending remote review/checks.
- `bookings-search.test.ts`: adds malformed-date rejection to the existing URL
  validation assertions; existing valid/invalid expectations stay intact.
- `booking-table-581.test.tsx`: retains every existing unavailable-balance oracle
  unchanged and adds an open-Kommend case proving its projected unavailable marker
  while an unscoped historical row's structural balance cell stays empty.
- `cache.test.ts` and `mutations.test.tsx`: literal deferred edit/delete, success,
  failed-write rollback and older-page regressions keep EUR -1557/USD -4321 groups
  intact while pending, then use canonical EUR -2323 or -323 results. No paginated
  reconstruction or writer/lock/audit/Undo expectation changes.
- `issue-594-ledger-filters.spec.ts`: isolated mixed-sign/currency fixture, literal
  display values and exact IDs after reload/second browser context, keyboard
  filter entry/chip removal, actual CSV, single-account Saldo, both themes, Axe,
  phone targets and horizontal overflow on the three configured profiles.
- `ledger-filters.spec.ts`: technical adaptation to the explicitly approved live
  filter contract; verifies immediate URL updates and retention on Escape in place
  of the superseded draft/Apply flow. Geometry, focus, chips, reset and Axe stay.
  Focus/repeated clicks use the stable Filter prefix while exact 0/3/2 count
  assertions remain separate from the button's changing accessible name.
- `ledger-helpers.ts`: the existing helper closes the now-live filter dialog using
  Fertig; it does not initiate a write or alter any financial expectations.
- `accounts-sidebar-profile.spec.ts`: closes the dialog after inspecting identical
  account option groups so the existing sidebar assertions remain accessible.
- `checkbox-appearance.spec.ts`: after the first real tap introduces the fixed
  selection bar, scrolls the same checkbox into the free region above the bar,
  verifies its entire bounds and actual center hit, then retains the real second
  tap and unchecked oracle. Also asserts no selected-mode horizontal overflow.
  The bookings toolbar wraps so the longer selection label and CSV menu remain
  inside the phone viewport; it introduces no new color or size value.
  In selected mode, both themes additionally verify the actual Auswahl beenden
  button, CSV summary and opened CSV link: full viewport bounds, at least 44px,
  and actual center hits on the control or its descendant. Opening the menu does
  not activate its download. The existing checked/unforced-untap/unchecked sequence
  remains after these geometry checks on Chromium phone and WebKit profiles.

No timeout, retry, skip, baseline or protected money/security/Undo expectation was
relaxed. Independent HIGH source/test review and all runtime/publication evidence
remain pending; this document does not claim live acceptance.
