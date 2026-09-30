# Ledger API (P2a)

REST/JSON below `/api`, behind the session guard (CSRF origin check on writes, 64 KB body limit).
Amounts are integer cents, days are `YYYY-MM-DD`. Source: `apps/server/src/api/`, repositories in
`packages/db/src/repos/`. Every write answers with a `groupId`; `POST /api/undo` reverts that whole
user action, and undoing the undo's group is a redo.

Errors are `{ error, message }` with `error` one of: `invalid` (400, with `issues`), `not_found`
(404), `invariant` (422, e.g. split sum, transfer legs), `constraint` (422), `conflict` (409),
`account_closed` (409), `account_not_empty` (409), `reconciled_locked` (409, with `bookingIds`),
`undo_refused` (409).

| Endpoint | Purpose |
| --- | --- |
| `GET /accounts?asOf=` | Accounts with `balanceCents` (as of the day, default today Vienna), `holdingsCents` (market value of securities held, 0 without), `clearedCents` (confirmed + reconciled), `unclearedCents` (pending), `scheduledCents` (dated later), counts, `lastReconciledOn` |
| `POST /accounts`, `PATCH /accounts/:id` | Create / edit: type, role, on-budget, currency, opening balance and date, terms (credit limit, overdraft, rate in bp, term end, fee). Role and budget membership default from the type; loans, depots, crypto, P2P and receivables can never be budget accounts |
| `POST /accounts/sort` `{ ids }` | Order of the account list |
| `POST /accounts/:id/close` `{ force? }`, `/reopen` | Close needs balance 0 and nothing pending or scheduled unless `force`; a closed account takes no bookings |
| `GET /accounts/:id/series?from&to` | End-of-day balance for every day (at most 401 days) |
| `GET /bookings?…` | Filters `accountId, from, to, categoryId ('none' = uncategorised), payeeId, status, flag ('none'), q` (memo, split memo, payee, category, account; case-insensitive incl. umlauts), `ids`; sort `date, amount, payee, account` with `direction`; `limit` (≤ 200) and `cursor` (keyset, stable while data changes). Answers `items, nextCursor, total, sumCents`; each item has splits with category names, payee, the other account of a transfer and, when filtered to one account, `balanceAfterCents` |
| `POST /bookings` | `type: 'booking'` (splits, or `categoryId` for one; foreign currency fields; status `pending` or `confirmed`) or `type: 'transfer'` (two legs, category only between budget and tracking account) |
| `PATCH /bookings/:id`, `DELETE /bookings/:id` | Edit / soft-delete (both legs of a transfer go together). Reconciled bookings: only `flag` and `memo` are free; everything else needs `unlockReconciled: true` (`?unlock=1` on delete) |
| `POST /bookings/bulk` | `update` (`set: { categoryId, flag, status }`) or `delete` for many ids in one group. A booking that cannot take the change (several splits, transfer leg, locked) is skipped and listed in `skipped` |
| `GET/POST /payees`, `PATCH /payees/:id`, `POST /payees/merge` | List with booking counts, create (names unique ignoring case), rename, merge (moves bookings and assignment rules, one undo). System payees are fixed |
| `GET /lookups` | Categories, groups, projects, income types, contacts, institutions for pick lists |
| `POST /accounts/:id/reconciliation/preview` | Kontostand prüfen: `{ date, statementBalanceCents }` gives booked balance (pending not counted), difference, `duplicates` ("doppelt", the same day, payee and amount twice; `explainsDifference` when removing it closes the gap), `pendingMatches` (pending bookings the bank already booked, "fehlt"), `missing` (`expense`/`income` of that amount) |
| `POST /accounts/:id/reconciliation` | Confirm: optionally `removeBookingIds` (duplicates), `confirmBookingIds` (pending → confirmed), `adjust` (book the remaining difference as Ausgleich with the payee "Korrektur Kontoprüfung"); stamps every confirmed booking up to the day `reconciled`, stores the snapshot. A remaining difference without `adjust` is a 409 and nothing is written. One undo |
| `GET /accounts/:id/reconciliations` | Stored checks, newest first |
| `POST /undo` `{ groupId }` | Revert a whole action |

`reconciled` cannot be set through `PATCH` or bulk edits, only by Kontostand prüfen. The
prototype's bulk "Als geprüft markieren" therefore becomes "Als bestätigt markieren".
