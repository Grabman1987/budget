# Contact identity contract (proposal for #869, gates #870 and #871)

Status: PROPOSAL. No endpoint, migration or data change is part of this document. All names and
amounts are synthetic ("Kontakt A", "Kontakt B"). Amounts are integer cents.

## 1. Current state (grounded in code)

- Table `contact` (`id`, `name`, `note`, timestamps, `deleted_at`):
  `packages/db/src/schema/accounts.ts`. The only metadata is `name` and `note`.
- API: `apps/server/src/api/contacts.ts` exposes list, create (`name`, `note`), `PATCH /:id`
  (name only, `.strict()`), statement, settlement, credit, allocations, adopt, waive, gift,
  write-off. There is no alias, archive, merge or note-edit endpoint.
- Generic repo `packages/db/src/repos/entities.ts` (`createEntity`, `updateEntity`,
  `softDeleteEntity`, `restoreEntity`): every write goes through `insertTracked` /
  `updateTracked` (`packages/db/src/repos/audit.ts`) in one transaction. Nothing is hard-deleted.
- Name rule: `assertContactName` (`repos/contact-invariants.ts`) refuses a second active contact
  with the same exact name (`ConflictError`). Legacy duplicates are tolerated until renamed.
- Audit: `audit_log` rows with `before_json` / `after_json`, `group_id`, `undo_of_id`;
  `history(db, entityType, entityId)`; `undo(db, {auditId|groupId}, ctx, {force})`
  (`audit.ts:630`) reverts a whole group in reverse order, refuses when the row changed after the
  entry (current row differs from the entry's `after`) unless `force`, writes `undo` entries under
  a new group, re-checks ledger invariants.
- Rows that reference a contact by id: `booking_split.contact_id` (Auslage/Ausgleich, bookings
  schema), `payee.contact_id`, `expected.contact_id` (+ `contact_share_bp`), `account.contact_id`
  (receivable account), `payslip.employer_contact_id`, `contact_settlement.contact_id`
  (`schema/contacts.ts`). `contact_allocation` links a settlement to an outlay by **text**
  `outlay_split_id` and `settlement_id`, no contact column. Credit decisions live as
  `app_setting` rows `contacts.credit.*` (`repos/contact-credit.ts`), keyed by booking and
  split ids, not by contact id.
- Balances are derived, never stored: `getContactStatement` / `listContactStatements`
  (`repos/contacts.ts`) via `contactStatement` in `@budget/domain`.
- Locked history: bookings with `status = 'reconciled'` cannot be edited; allocations on them
  need an explicit per-action unlock (`repos/contact-allocation-lock.ts`,
  `contact-reallocation.ts:37`, `ReconciledLockedError`).
- Undo restrictions already in place: contact credit `app_setting` entries only as a whole
  action; single split entries refused (`audit.ts` undo guard).

## 2. Principles

1. **Stable identity**: `contact.id` never changes and is never reused. Every historic reference
   keeps pointing at the id it was written with.
2. **No hard delete.** Archive and merge are soft states with a reversible audit trail.
3. **No silent netting** of different people: merge is only ever an explicit owner action with a
   preview; no automatic duplicate merging, no name-based auto-merge.
4. **Booking facts are immutable here**: metadata operations never write `booking`,
   `booking_split` amounts, dates, status, `contact_allocation.amount_cents` or
   `contact_settlement.credit_cents`.
5. **Everything one transaction, one audit group, one Undo.** Partial results never persist.

## 3. Data model sketch (additive; needs separate migration approval)

No migration file is proposed here. Each step below is one future migration with a
`drizzle/rollback/*.sql` twin (convention: `packages/db/drizzle/rollback/`).

| Step | Issue | Change | Backfill |
| --- | --- | --- | --- |
| M1 | #870 | new `contact_alias` (`id`, `contact_id` FK, `alias`, `alias_norm`, timestamps, `deleted_at`); partial unique index on `alias_norm` where `deleted_at IS NULL` | none (empty table) |
| M2 | #870 | `contact.archived_at TEXT NULL` | none (NULL = active) |
| M3 | #871 | `contact.merged_into_id TEXT NULL REFERENCES contact(id)`, check `merged_into_id <> id` | none (NULL) |

Rollback of each step: drop the new table/column only if it is empty/NULL everywhere, otherwise
refuse (the data would be lost); Undo of the operations (section 5) is the normal path back to
empty. `alias_norm` = lowercase, NFKC-normalised, whitespace-collapsed (same function for
`assertContactName` so a name and an alias cannot collide either).

Rejected alternative for merge: rewriting `booking_split.contact_id` / `payee.contact_id` /
`expected.contact_id` to the survivor. It would edit reconciled bookings, break byte-for-byte
history and make Undo a mass revert. Proposed instead: **pointer merge** (M3). The merged contact
keeps its id and rows; reads resolve `COALESCE(merged_into_id, id)` through one shared resolver
used by `getContactStatement`, `listContactStatements`, lookups and search (no shadow
calculation: one function in `repos/contacts.ts`, all readers call it).

## 4. Synthetic worked example

Kontakt A: Auslage 12 000 (open 4 500 after Ausgleich 7 500 allocated to it), plus a closed
outlay 3 000 fully repaid (3 000 allocated, booking reconciled), plus credit 800 from an
over-payment (`contact_settlement.credit_cents = 800`). Statement: receivable 4 500, credit 800.
Kontakt B: closed history only: Auslage 2 000, Ausgleich 2 000, receivable 0, credit 0.

| Operation | A receivable / credit | B receivable / credit |
| --- | --- | --- |
| add alias "Kontakt A (alt)" to A | 4 500 / 800 | 0 / 0 |
| archive B | 4 500 / 800 | 0 / 0 (hidden from pickers, still in history) |
| archive A | refused (receivable or credit open, see 5.2) | |
| merge B into A (B has 0/0) | 4 500 / 800 (sum 4 500+0, 800+0) | resolves to A; own rows untouched |

Merge with open amounts on both sides, e.g. B 1 500 / 0: survivor A shows 6 000 / 800. Receivable
and credit are **not netted** against each other (A's credit 800 does not reduce 6 000);
netting stays the existing explicit "use credit" allocation.

## 5. Operations

### 5.1 Alias (#870)

- Add / remove alias (soft delete). Case and spacing insensitive, unique among active aliases
  and active contact names; collision returns 409 naming the owner of the existing label.
- Effects: search and pickers match aliases; display name unchanged. No booking is touched.
- Audit: one `insert`/`delete` entry on `contact_alias` per alias. Undo restores exactly the
  prior alias set; refused if the alias row changed since (standard `undo` staleness rule).

### 5.2 Archive / reopen (#870)

- Archive sets `archived_at`; reopen clears it. Both are audited updates on `contact`.
- Allowed only when receivable = 0, credit = 0, no open outlay, no active `expected` row or
  payee default pointing at the contact (those are listed in the refusal). Otherwise 409 with
  the blocking items. Archived contacts: hidden from new-booking pickers and reminders, shown in
  history, statements and reports, and still receive Undo of old actions.
- Reopen is always allowed. Creating a contact with the name of an archived contact is allowed
  only after reopen or explicit choice (open decision 3).
- Undo of archive = reopen to the exact prior `archived_at` (NULL). Undo refused if the contact
  was edited, merged or has gained a blocking item since.

### 5.3 Merge (#871)

- Input: `sourceId` (merged away), `targetId` (survivor), optional alias carry-over, plus the
  preview token from a mandatory `preview` step (counts per table, balances before/after per
  contact in cents, conflicts). Commit without a matching, fresh preview is refused.
- Effects in one transaction: set `source.merged_into_id = target`; set `source.archived_at`;
  add the source name as an alias of the target (so searches and imports still resolve it).
  Nothing else is written. Booking IDs, split amounts, dates, status, allocations and credit
  records stay byte-identical; locked and reconciled history is not touched, hence no unlock
  is needed.
- Refused when: source or target already merged or archived, source = target, either has a
  pending credit decision in progress, source is the owner of a receivable `account` and the
  target already has one (two receivable accounts cannot be silently unified; owner decides),
  payslip employer or expected rows exist on both sides with conflicting shares (listed), or
  the preview is stale (any contact, allocation, split or alias row changed after it).
- Chains: merging into an already merged contact is refused; target must be a root.
  Un-merge happens only through Undo, never as a separate operation.
- Undo: restores `merged_into_id`, `archived_at` and the alias to the exact prior values.
  Refused when, after the merge, anything was booked or allocated through the survivor in a way
  that attributes rows to the merged identity (new splits referencing `source.id` are
  impossible; the pickers hide it) or when an allocation/settlement between the two identities
  was created. Otherwise Undo is unconditional with exact restore.

## 6. Conflict and concurrency rules

- Optimistic check: every metadata write sends the entity `updated_at` (or version) read by
  the form; a mismatch returns 409 `stale` with the current row; no silent overwrite.
- Alias/name collision, archive blockers and merge refusals are 409 with machine-readable
  reasons (German UI text).
- No partial merge: on any failed check the transaction rolls back; audit group is not written.
- Invalid input (empty, over 200 chars, only whitespace, alias equal to own name) is 422.
- Single owner, no auth change: same `ACTOR` and session rules as existing contact routes.

## 7. Audit and Undo semantics (summary)

| Operation | Audit entries (one group) | One Undo restores | Undo refused when |
| --- | --- | --- | --- |
| name/note edit | 1 `update` `contact` | prior name+note | row changed since; name now taken |
| add alias | 1 `insert` `contact_alias` | alias removed | alias changed since |
| remove alias | 1 `delete` | alias back | label now taken |
| archive | 1 `update` | `archived_at` NULL | contact edited/merged since, new blocker |
| reopen | 1 `update` | prior `archived_at` | contact edited since |
| merge | 2 `update` `contact` + 1 `insert` alias | all three, exactly | allocation between identities exists, rows changed since |

Entries are only undone as a whole group (like split/credit entries today); a single merge
entry is refused. `force` is never offered for merge. Undo writes `undo` entries as today.

## 8. Migration and copy-test requirements

Per step (M1–M3): additive only; reversible by the rollback script; applied first to a
copy of a database (synthetic fixture in CI, owner copy outside the repo for the owner preview).
§53-style checks, run before and after each step and after rollback, with equal results:

- row counts of every table; `contact` / `booking_split` / `contact_settlement` /
  `contact_allocation` content hash (excluding the new column);
- per-contact receivable and credit cents from `listContactStatements` (history on);
- sum over all contacts, net worth, account balances, Zu-verteilen totals unchanged.

Migration approval is a separate owner decision (this document does not request it).

## 9. Invariants (testable)

1. Alias add/remove and archive/reopen: per-contact receivable and credit cents unchanged.
2. Merge: survivor = sum of both (receivable and credit separately, not netted); total over all
   contacts unchanged; source resolves to survivor.
3. No `booking`, `booking_split`, `contact_allocation`, `contact_settlement` row is changed
   (hash equal; booking ids/amounts/dates/status literal-equal).
4. `contact.id` set unchanged; no row deleted anywhere.
5. Archive requires 0 receivable, 0 credit; merge preview equals commit result.
6. Undo of any operation restores the previous metadata exactly and the audit group count grows
   by exactly one `undo` group.

## 10. Test plan

- Fixtures: Kontakt A (open 4 500, credit 800, closed reconciled 3 000) and Kontakt B (closed
  2 000/2 000); independent literal expected values, no calling the production calculation for
  oracles.
- Repo tests: alias add/remove/collision; archive allowed/refused with each blocker; merge
  preview, commit, stale preview, chain, receivable-account conflict, rollback leaves nothing;
  Undo exactness and every refusal row of section 7; locked (reconciled) bookings untouched.
- API tests: 200/201, 409 stale and conflicts, 422 invalid, unauthorized (no session), no
  partial write on 409.
- Existing-surface regression: statement, settle, credit, allocate, waive, gift, write-off
  results unchanged; export and search include aliases; `read-performance-956` pinned
  responses unchanged unless the contact list shape intentionally changes.
- Migration tests per step: forward, rollback, copy check of section 8.
- UI (CI e2e, redesign ON, 44 px, light/dark, 320 px): settings contacts form states: empty,
  stale, error, retry, Undo; redesign OFF unchanged.

## 11. Open decisions for the owner (recommended default first)

1. Merge strategy: pointer (`merged_into_id`, history untouched) vs rewriting references.
   Recommend pointer.
2. Archive blockers: block while receivable, credit or expected rows exist. Recommend block;
   no "archive with open amount".
3. Name reuse of an archived or merged contact name: recommend allowed only via reopen, and
   merged names live on as aliases of the survivor (not free for new contacts).
4. Alias scope: global unique among active names and aliases. Recommend global unique.
5. Two receivable accounts on a merge: recommend refuse; owner resolves the account first.
6. Credit and receivable on merge: recommend sum without netting; netting only via the
   existing allocation action.
7. Un-merge: recommend Undo only (with the refusals above), no separate un-merge feature.
8. Migration order and approval: M1 alias, M2 archive, M3 merge, each its own reviewed
   migration with rollback and copy test. Recommend this order; #871 last.
9. Preview freshness for merge: recommend a preview token invalid after any contact-related
   write, shown with before/after cents per contact.
