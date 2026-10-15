# SPEC-003 — Guarded bulk edits in Konten

Status: proposed additive specification, baseline `01a10de8` (2026-10-15). WP-007. Existing `SPEC.md` and owner directives prevail.

## 1. Goal / user problem

Users sometimes need to correct the date, memo or payee on several bookings. The register supports individual capture/edit flows, but these bulk fields are missing. Repeating edits one at a time is slow and can leave inconsistent records. Bulk change must remain auditable, respect reconciliation locks and make partial eligibility explicit.

## 2. Sources / reference behavior

References: TK-BulkEditDate/BulkEditMemo/BulkManagePayees and YNAB-059/060/094 in [the matrix](../feature-matrix/features.csv). Register ergonomics do not authorize changing financial lifecycle rules.

Reuse `apps/web/src/ledger/booking-table.tsx`, `apps/web/src/ledger/booking-model.ts`, `apps/server/src/api/bookings.ts`, `apps/server/src/api/schemas.ts`, `packages/db/src/repos/bookings.ts`, reconciliation locks and existing audit/undo. SPEC #499 establishes that new cash capture is immediately confirmed and cannot be toggled pending; bank capture defaults pending and is manually confirmed. SPEC #463 defines booking lines and exact-cent split totals. The register preserves status, matched-source metadata and split structure.

## 3. Intended Budget behavior

In Konten, select multiple bookings and apply one common date, memo or payee value to all eligible records. Before writing, show a preflight with selected, eligible and blocked counts and exact reasons, including reconciled/locked rows and records changed since selection. Apply revalidates the selection and versions, then updates the chosen field in one atomic audited group. Notes remain plain text; no Markdown or rich text. Existing cash/bank status defaults and transitions remain exactly as #499 directs.

## 4. Scope / exclusions

In scope: bulk date, memo and payee only; explicit selection; preflight; per-record eligibility; one audit group and undo; concurrency and retry protections. Excluded: amount/category/account/status/split changes, bulk deletion, schedule changes, automatic matching, imported source metadata edits, file import, Markdown, arbitrary filters as write targets, and bypassing reconciliation locks. No migration is expected; if audit cannot represent grouped field changes, stop for review before proposing one.

## 5. Flows / error / empty

From Konten, select rows, choose `Mehrere bearbeiten`, choose `Buchungsdatum`, `Notiz` or `Empfänger`, enter a value, then review `Änderungen prüfen`. Preflight lists eligible and excluded rows with reasons; the user confirms `Änderungen übernehmen`. Empty selection disables the action. If none are eligible, show the blocked list and no apply button. Any row changed or newly locked after preview rejects the whole apply and requires a fresh preflight; never silently skip. If payee is archived/incompatible or date invalid, show a field error before apply.

## 6. Business rules / formulas

Only the chosen field changes. Date is a valid local ISO day (`YYYY-MM-DD`) and does not alter bank-import date, expected-payment due date, recurrence date, statement date or reconciliation history. Memo is plain text normalized under existing length/control-character limits; no Markdown, HTML rendering or link execution. Payee must reference a valid permitted existing payee; no implicit creation. Amount, cents, currency, account, status, category/income type, splits, source IDs, match state, attachments and created-at remain unchanged. Reconciled/locked bookings cannot be bulk-edited. A selected pending bank booking remains pending; a cash booking remains confirmed per #499. One operation either writes the previewed eligible set or none. Undo restores only changed fields and follows existing audit conflict rules.

Preflight must invoke the existing field-specific contact, trade-settlement, payroll/source and month-lock write guards, not just inspect status. Initial bulk date scope excludes linked transfer legs because their single-edit path moves the counterpart date too; no unselected counterpart is changed implicitly. Any field that would cause protected linked effects is blocked with a reason. Existing category/status/delete bulk actions remain available separately. Changing an ordinary booking date naturally changes date-scoped reports; this does not rewrite source dates or historical schedule versions.

## 7. Examples / edge cases

For `{B1,B2,B3}` where B1/B2 are unlocked and B3 is reconciled, preflight reports two eligible and one blocked; confirmation applies to only the previewed eligible rows and B3 stays unchanged. If B2 becomes locked after preview, the apply changes neither B1 nor B2. Memo `<b>Miete</b>` remains literal text and is escaped in UI/CSV contexts. Setting the same payee is a no-op with no audit mutation. `2026-02-30` is rejected before preview. A pending imported bank booking keeps status and source identifiers when memo changes; bulk actions cannot turn new cash capture pending.

## 8. Model / migrations

No new entity is expected. Reuse booking columns, row-version/`updated_at`, source references, reconciliation state and audit log. Do not store a parallel operation table. Use an ephemeral short-lived preview token binding selected IDs, field/value, per-row versions and eligibility digest. Persist through existing repositories within one audit group. If existing updates touch extra fields, add a field-scoped patch path instead of replacing full booking objects.

## 9. Interfaces / integrations

Proposed `POST /api/bookings/bulk-preview` accepts explicit IDs, one allowed field and proposed value; response includes current/proposed values, eligibility/reasons, version signatures, counts and token. Proposed `POST /api/bookings/bulk-apply` consumes token and idempotency key, rereads rows, rechecks authorization, locks, versions and values, then applies one transaction/group. These are proposals; current single-booking endpoints remain. Reuse schemas from `apps/server/src/api/schemas.ts` and booking persistence. Do not accept arbitrary query expressions or client-calculated eligibility. Use the same lock policy as single edit.

## 10. Navigation / design

Keep the existing Konten register, row selection, table density and account filters. Place `Mehrere bearbeiten` with current selection actions. Use a compact input/confirmation dialog, consistent with SPEC's form-dialog rule. Labels: `Buchungsdatum`, `Notiz`, `Empfänger`, `Änderungen prüfen`, `Übernehmen`, `Abbrechen`. Show eligible/blocked counts before commit and link blocked rows to their existing deep-linkable details. Preserve desktop/phone register layout, keyboard selection and focus return. Memo is plain text with safe truncation; add no formatting controls.

## 11. Privacy / security / performance

Require existing session authentication, same-origin/CSRF protections and server-side authorization. Treat IDs as untrusted and verify budget/account access. Limit a batch (recommend 100), reject duplicates and bound memo length. Preview tokens are short-lived/integrity-protected and personal text is not logged. Apply is transactional, retry-safe, atomic and audited. Never bypass locks. Return only necessary identity/field values. Use a bounded query and batched writes, without per-row history scans. Existing accessibility/privacy behavior applies.

## 12. Dependencies

WP-007 / SPEC-003; CAP-007, with lock semantics from CAP-009 and session authority from CAP-012. Dependencies: register table/selection, booking schemas and repository, audit/undo, lock checks, validation, #499 cash/bank status rules. No external service or package. Import parsers remain upstream of this feature.

## 13. Acceptance criteria

- AC-003-01: Date, memo and payee bulk updates accept only explicit IDs and change exactly the selected field.
- AC-003-02: Reconciled/locked rows are blocked and unchanged; eligibility/version change after preview rejects the whole apply with no writes.
- AC-003-03: Confirmed operation updates the previewed eligible set in one transaction/audit group; one undo restores its fields without reverting unrelated later edits.
- AC-003-04: Status, splits, source/match IDs, account, currency and amount remain unchanged; memo is plain text and payee is validated.
- AC-003-05: Empty/all-blocked selection, invalid values, duplicate IDs and retry have explicit deterministic outcomes and no duplicate mutation.

## 14. Tests / validation

Use API/repository fixtures with two unlocked bookings and one reconciled row; assert counts/reasons, exact changed columns and unchanged columns from a literal before-state. Force a concurrent row-version/lock change after preview; expect conflict and zero writes. Test one audit group, idempotent retry, full undo and undo conflict after a later unrelated edit. Cover valid/invalid date boundaries, plain-text escaping and length/control guards, active/archived payees, duplicates, 100/101 limit, confirmed cash and pending bank. UI checks preflight-before-apply, blocked-row disclosure, keyboard path and desktop/phone layout. Assert persisted/API outcomes rather than only a helper mirroring production.

## 15. Open decisions / recommendations

Recommend date, memo and payee only, with explicit selection and preflight, then all-or-nothing apply over the reviewed eligible set. Stop for owner review if an edit would affect amount, status, split/account, imported identity, expected-payment history or a reconciliation lock, or if a migration becomes necessary. Start with a 100-booking ceiling; raise only with measured evidence.
