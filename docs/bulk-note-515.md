# Bounded register note change (#515)

This slice implements booking memo only, from the existing register selection bar
(#479 / #596). Date and payee remain unsupported bulk API/UI fields. No migration,
capture, Plan, contact writer or financial calculation changes.

## Field-by-record protection table

The pure `bulk-field-protection.ts` module records the conservative bulk policy.
The database reader gathers the following facts; first matching reason wins.
“Skip” applies to memo, date and payee alike; the latter two are policy inventory,
not implemented write permissions.

| Record / persisted evidence | Memo | Date | Payee | Reason |
| --- | --- | --- | --- | --- |
| Reconciled booking status | Skip | Skip | Skip | `reconciled_locked` |
| Booking or split transfer ID | Skip | Skip | Skip | `linked_transfer` |
| Contact split, settlement booking, active allocation to an outlay | Skip | Skip | Skip | `linked_contact` |
| Active expected occurrence | Skip | Skip | Skip | `linked_expected` |
| Trade row (including deleted) or trade audit before/after booking ID | Skip | Skip | Skip | `linked_trade` |
| Active payslip booking | Skip | Skip | Skip | `linked_payroll` |
| Active statement automation booking/original | Skip | Skip | Skip | `linked_document` |
| Represented statement settlement, active bonus or bonus original evidence | Skip | Skip | Skip | `linked_statement` |
| Bank source ID, bank-sync candidate/import key, or bank-source booking | Skip | Skip | Skip | `linked_bank` |
| Unsafe integer-cent amount | Skip | Skip | Skip | `invalid` |
| Missing/deleted booking or account | Skip | Skip | Skip | `not_found` |
| Ordinary booking, including category splits or plain receipt attachment | Eligible | Deferred | Deferred | None |

This is deliberately stricter than individual editing: `updateBooking` allows
some reconciled/linked metadata edits, but bulk exposes no unlock. Existing bulk
fields retain their previous policy. The new fields also exclude legacy bank-source
rows without a source ID, since the canonical writer can preserve raw bank text on
their first edit; this slice must change only memo and normal update metadata.

## Preview, write and undo

`POST /api/bookings/note-preview` accepts explicit IDs (at most 500) and a plain
nullable memo (at most 500 characters, matching the existing memo limit). Empty UI
input explicitly removes the note; split notes remain unchanged. Preview reports
changed, protected/missing and already-unchanged records separately and writes nothing.

Apply uses `/api/bookings/bulk` with only `set.memo` and its required preview
revision. A hash binds the sorted, deduplicated IDs, value, row/split snapshots,
ownership facts and latest audit entry. Revalidation and all writes share one
transaction. Even unrelated audited writes conservatively require another preview;
Undo/redo cannot revive a consumed preview. Newly protected or changed records
reject the whole apply. Only the preview's acknowledged exclusions are skipped.
Any eligible writer failure rolls back all eligible notes and audit entries.

The existing canonical writer, shared audit group and Undo remain authoritative.
The client updates only acknowledged changed IDs, keeps skipped rows selected and
offers one Undo only after actual changes. No-op batches create no audit entries.

## Test scope and remaining work

- New domain test: every field/protection and overlapping-reason precedence.
- New API test: mixed protected provenance, exact note-only changes, grouped audit
  and Undo, stale edit/lock/ABA, replay/value/selection binding, second-write rollback,
  clearing/no-op and input bounds. Existing bulk/delete regressions are retained.
- New isolated redesign browser spec: preview counts/reasons, input invalidation,
  actual apply and one exact Undo, light/dark accessibility and responsive evidence.

Date/payee behavior and wider #515 acceptance remain open. This is a draft delivery,
not a production release; exact revision and executed checks belong in the PR.
