# Ledger implementation checkpoint — NOT VALIDATED

Owner implementation-only direction: no tests written or changed, no test runs,
typechecks, builds, browser checks, CI dispatch, PR, merge or deployment.
This is source progress, not acceptance or live completion. Existing financial
writers, locking, audit, Undo, tests, workflows and protected evidence remain.

- **#594:** one live filter dialog on both layouts, removable chips, existing URL
  validation (including an invalid-date guard), full-history filter count and
  exact native-currency totals with explicit unavailable values, canonical Saldo
  only for one account, collapsed-by-default existing Kommend, filtered CSV in ⋯.
  Includes #553/#554 category-group drilldown with group∩category contribution
  filtering; replacing the category clears the inherited group. Unbooked schedules
  never masquerade as report-classified actual contributions.
  `/api/bookings/csv` uses the same query predicates, ordering, captured history
  cutoff and split projection as the list. All pages come from one private SQLite
  backup. BOM/semicolon/CRLF/quoted text/formula protection and native integer units
  match the full export. No download headers precede the completed private file.
  Limits: 100,000 bookings, 64 MiB UTF-8 and 30 seconds preparation; bound/abort
  failure returns no partial download. Existing full ZIP/step-up path is untouched.
  The CSV is stored booking history through the shown day; Kommend projections
  are not exported. A fresh snapshot is not a CAS against an earlier screen read.
- **#596:** adopted owned source hunks from `1295652f` / `d2300f08`; native selected
  totals across loaded pages, category/status/flag/project, protected named skips,
  fixed phone bar and explicit selection mode. Only acknowledged changed IDs are
  patched/removed; failed/skipped IDs remain selected. Real writes use one Undo.
- **#597:** adopted owned source from later checkpoint `aaeaf014`, reconciling its
  protected single-delete close/focus guard through Root. Fixed authoritative
  delete previews, named skips, native totals and in-transaction revision CAS.
  Ordinary single deletion is immediate with “Gelöscht.” and existing Rückgängig;
  protected single deletion preserves the ordinary writer's existing permissions.
- **#515, bounded source:** <=100 distinct explicit IDs, one date/note/payee field,
  field-specific read-only preflight, exact eligible/skipped records and before/
  after values, opaque source+value revision and atomic canonical updates. Any
  stale record or unexpected write rejection rolls back the entire eligible batch.
  Retry of a changed snapshot is rejected without duplicate writes; no-op batches
  offer no fabricated Undo. Broader imported/FX/source-sensitive editing remains
  outside this narrow source slice; see the protection table below.

## #515 field protection table

| Record | Date | Note | Payee | Existing contract preserved |
| --- | --- | --- | --- | --- |
| Unlinked manual native booking | eligible | eligible | eligible if confirmed and fully classified | Ordinary `updateBooking`, exact field patch |
| Pending or unclassified manual booking | eligible | eligible | source_effect | Prevent inbox assignment learning as a collateral write |
| Bank/import/other source, system payee or original-FX metadata | source_effect | source_effect | source_effect | Prevent raw-source/mapping/FX normalisation writes |
| Reconciled | blocked | blocked | blocked | No bulk unlock, including ordinarily free note metadata |
| Transfer/contact/expected/trade/payroll/statement/document/bank link | blocked | blocked | blocked | No counterpart or financial-owner changes |
| Missing/deleted booking or account | blocked | blocked | blocked | Explicit named unavailable record |
| Deleted/missing/system proposed payee | n/a | n/a | invalid request | Existing live payee only; no implicit creation |

All field previews invoke the ordinary read-only statement/trade/contact guards.
A valid preview authorises only its fresh eligible set, not an unlock. The revision
includes complete booking/split/account/source identities plus the audit head;
unrelated audited changes can conservatively require a fresh preview.

## Deferred validation and technical adapters

- Existing `e2e/ledger-filters.spec.ts` phone draft/Apply and desktop inline-control
  selectors need later technical adapters to the common immediate filter dialog;
  preserve all old financial, geometry, privacy and accessibility expectations.
- Existing server bulk-delete cases in `api.test.ts` and `invest.test.ts` need to
  obtain/pass the preview revision. Transfer bulk-delete expectations must reflect
  named protected skips; preserve the single-transfer delete + grouped-Undo proof.
- Existing capture/remove mocks need authoritative preflight reads and preview
  revision transport. Existing bulk mocks need native selection facts; keep all
  protected money/lock/audit/Undo/rollback expectations intact.
- Meaningful later coverage: mixed signs/currencies and unsafe totals; filters after
  reload; canonical one-account balances; >200-row CSV exact IDs/splits/order,
  formula text and abort/admission cleanup; stale delete/update previews, protected
  skips, second-write rollback, exact grouped Undo and no-op/retry behavior.
- Desktop1440, Chromium390, WebKit iPhone, light/dark, keyboard, Axe, 44px targets,
  overflow, required type/lint/test/CI and independent final-diff review remain open.

Root owns shared schemas, repository barrel and capture-shell guard edits. Scoped
styles are in `ledger-batch.css`; the #586 frozen `ledger.css` capture hunks are
untouched. Workflow source inspection found push CI only on `main`; the other
relevant workflows run on pull requests/manual dispatch. No PR is created.
