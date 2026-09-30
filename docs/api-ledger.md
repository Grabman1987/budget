# Ledger API (P2a)

REST/JSON below `/api`, behind the session guard (CSRF origin check on writes, 64 KB body limit).
`createApp` refuses to mount the ledger without auth (type error and a throw at start).
Amounts are integer cents, days are `YYYY-MM-DD`. Source: `apps/server/src/api/`, repositories in
`packages/db/src/repos/`. Every write answers with a `groupId`; `POST /api/undo` reverts that whole
user action, and undoing the undo's group is a redo.

Errors are `{ error, message }` with `error` one of: `invalid` (400, with `issues`), `not_found`
(404), `invariant` (422, e.g. split sum, transfer legs), `constraint` (422), `conflict` (409),
`account_closed` (409), `account_not_empty` (409), `reconciled_locked` (409, with `bookingIds`; on an
account edit also `reconciliationIds`),
`undo_refused` (409).

| Endpoint | Purpose |
| --- | --- |
| `GET /accounts?asOf=` | Accounts with `balanceCents` (as of the day, default today Vienna), `holdingsCents` (market value of securities held, 0 without), `clearedCents` (confirmed + reconciled), `unclearedCents` (pending), `scheduledCents` (dated later), counts, `lastReconciledOn` |
| `POST /accounts`, `PATCH /accounts/:id` | Create / edit: type, role, on-budget, currency, opening balance and date, terms (credit limit, overdraft, rate in bp, term end, fee). Role and budget membership default from the type; loans, depots, crypto, P2P and receivables can never be budget accounts. Once a Kontostand prüfen is stored, changing opening balance or date is `reconciled_locked` unless `unlockReconciled: true` |
| `POST /accounts/sort` `{ ids }` | Order of the account list, in one transaction (an unknown id changes nothing) |
| `POST /accounts/:id/close` `{ force? }`, `/reopen` | Close needs balance 0 and nothing pending or scheduled unless `force`; a closed account takes no bookings |
| `GET /accounts/:id/series?from&to` | End-of-day balance for every day (at most 401 days) |
| `GET /bookings?…` | Filters `accountId, from, to, categoryId ('none' = uncategorised), payeeId, status, flag ('none'), q` (memo, split memo, payee, category, account; case-insensitive incl. umlauts), `ids`; sort `date, amount, payee, account` with `direction`; `limit` (≤ 200) and `cursor` (keyset, stable while data changes). Answers `items, nextCursor, total, sumCents`; each item has splits with category names, payee, the other account of a transfer and, when filtered to one account, `balanceAfterCents` |
| `POST /bookings` | `type: 'booking'` (splits, or `categoryId` for one; foreign currency fields; status `pending` or `confirmed`) or `type: 'transfer'` (two legs, category only between budget and tracking account) |
| `PATCH /bookings/:id`, `DELETE /bookings/:id` | Edit / soft-delete (both legs of a transfer go together). Reconciled bookings: only `flag` and `memo` are free; everything else needs `unlockReconciled: true` (`?unlock=1` on delete). A booking moves only to an account in its own currency (`invariant` otherwise) |
| `POST /bookings/bulk` | `update` (`set: { categoryId, flag, status }`) or `delete` for many ids in one group. A booking that cannot take the change is skipped and listed in `skipped` as `{ id, reason, message }` with `reason` one of `split`, `transfer`, `transfer_pair` (both legs selected), `reconciled_locked`, `not_found`, `invalid`. `transferPairs` counts transfers with both legs in the selection; a delete takes such a pair once and reports both legs as `changed` |
| `GET/POST /payees`, `PATCH /payees/:id`, `POST /payees/merge` | List with booking counts, day of the last booking and `defaultCategoryId`, create (names unique ignoring case, optional `defaultCategoryId`), `PATCH` renames and/or sets or clears `defaultCategoryId` (capture pre-fills it; one undo), merge (moves bookings and assignment rules, one undo). Reconciled bookings stay with their payee unless `unlockReconciled: true`; the answer has `moved`, `skipped` and `keptSourceIds` (sources that still hold skipped bookings are not deleted). System payees are fixed |
| `GET /lookups` | Categories, groups, projects, income types, contacts, institutions for pick lists |
| `POST /accounts/:id/reconciliation/preview` | Kontostand prüfen: `{ date, statementBalanceCents }` (date at most today, Europe/Vienna; later is `invariant`) gives booked balance (pending not counted), difference, `duplicates` ("doppelt", the same day, payee and amount twice; `explainsDifference` when removing it closes the gap), `pendingMatches` (pending bookings the bank already booked, "fehlt"), `missing` (`expense`/`income` of that amount) |
| `POST /accounts/:id/reconciliation` | Confirm: optionally `removeBookingIds` (duplicates), `confirmBookingIds` (pending → confirmed), `adjust` (book the remaining difference as Ausgleich with the payee "Korrektur Kontoprüfung"); stamps every confirmed booking up to the day `reconciled`, stores the snapshot. A remaining difference without `adjust` is a 409 and nothing is written. One undo |
| `GET /accounts/:id/reconciliations` | Stored checks, newest first |
| `POST /undo` `{ groupId }` | Revert a whole action |

`reconciled` cannot be set through `PATCH` or bulk edits, only by Kontostand prüfen. The
prototype's bulk "Als geprüft markieren" therefore becomes "Als bestätigt markieren".

## Categories and budget (P2c)

Errors add `category_rule` (422, German `message`: class vs kind, card envelope, stage, icon, merge).
Moving splits between categories (merge, split-off) is allowed on reconciled bookings: the
category is not part of what Kontostand prüfen checked.

| Endpoint | Purpose |
| --- | --- |
| `GET /categories` | `groups`, `categories` (hidden ones too, with `splitCount`), `targets` (all live versions) |
| `POST /categories`, `PATCH /categories/:id` | Name, `icon` (one emoji, shown monochrome), group, class, kind, stage 1–9, card account (card payment only; a card payment keeps its kind and card, 422 `category_rule`), `hidden`; optional `target: { validFrom, target }` in the same undo group |
| `PUT /categories/:id/target` | `{ validFrom: 'YYYY-MM', target: { kind: monthly / by_date / keep_balance, amountCents, everyMonths, targetDate, dueDay } \| null }`; `null` removes all versions |
| `POST /categories/sort` | `{ groups: [{ id, categoryIds }] }` in list order; a category listed under another group moves there |
| `POST /categories/merge` | `{ sourceIds, targetId }`: splits, assigned months (summed), opening envelope, payee defaults, expected payments, savings goals, planned events and assignment rules move to the target; the sources are soft-deleted. Card payment envelopes cannot be merged; an income category takes only income categories (422 `category_rule`). One undo |
| `GET /categories/:id/split-off?q&from&to&payeeId&accountId` | Splits of live bookings in the category matching the filter (≤ 500) |
| `POST /categories/:id/split-off` | `{ splitIds, targetId }` or `{ splitIds, newCategory }` (its `target` is stored in the same undo group): move the chosen splits of live bookings; budget months stay |
| `POST /categories/groups`, `PATCH`/`DELETE /categories/groups/:id` | Create, rename, remove an empty group |
| `GET /budget/:month?cardRule=` | Month summary from `budgetMonths` (default `'ynab'`): `carryInCents + incomeCents − uncoveredCents − assignedCents − heldCents = toBeAssignedCents`; per envelope carry, assigned, activity, available, overspent split into `cashOverspentCents` / `creditOverspentCents`, `fundedCardCents`, target with `goalCents`/`needCents`/`dueMonth`; totals per group; card debt growth per card; plus `groups` and `categories` |
| `PUT /budget/:month/assigned` | `{ items: [{ categoryId, assignedCents }] }` in one undo group (e.g. "Ziele füllen") |
| `POST /budget/:month/move` | `{ fromId, toId, amountCents > 0 }`; `null` is "Zu verteilen" |
| `POST /budget/:month/cover` | `{ categoryId, fromId, allowNegative? }`: covers the overspending from another envelope (at most its available) or from "Zu verteilen" (`null`, at most what it holds; the full amount only with `allowNegative: true`, which takes it below 0); answers `coveredCents`. Nothing to cover from is 422 `category_rule` |

## Expected payments (P3.2)

Erwartete Zahlungen: recurring or one-off inflows and outflows with versioned amounts. Amounts in a
version are positive cents (the payment's `kind` gives the sign); occurrences and read models are
**signed** (outflow negative) and in the currency of the version (`currency`). Every write answers
with its `groupId` (undo with `POST /undo`); automatic runs (`/refresh`) use the actor `system`.

Schedule fields: `rhythm` (monthly, quarterly, semiannual, yearly), `dueDay` 1–31 (31 or a day past
the month end means the last day), `dueMonth` (yearly: the month; quarterly and semiannual: first
month of the cycle), `dateShift` (`none`, `before`, `after`: move a due date that is a weekend or an
Austrian public holiday to the previous or next business day; "letzter Werktag" is `dueDay: 31` with
`before`), `startDate`/`endDate`, `amountToleranceCents` and `dateWindowDays` (matching), and
`contactShareBp` (the contact's part of each amount, rounded half away from zero per occurrence).

| Endpoint | Purpose |
| --- | --- |
| `GET /expected?deleted=1` | Payments with `version` (in force today, else the next), signed `amountCents`, `nextDueDate`, `monthlyEquivalentCents`, `yearlyEquivalentCents`; deleted ones only with `deleted=1` |
| `POST /expected` | Payment fields plus the first version (`amountCents`, `amountMaxCents?`, `currency?`, `validFrom?`, default the start date or the first of this month); 201 `{ payment, version, groupId }`; plans the occurrences |
| `PATCH /expected/:id` | Any payment field (not amounts); re-plans future open occurrences |
| `DELETE /expected/:id`, `POST /expected/:id/restore` | Soft delete (future open occurrences go with it, history stays) and restore |
| `GET /expected/:id/versions`, `POST /expected/:id/versions` | Versions oldest first; a price change is a new version `{ validFrom, amountCents, amountMaxCents?, currency?, note? }`; an existing day is 409, old versions are never edited; future `expected` occurrences get the new amount in the same undo group |
| `GET /expected/occurrences?from&to&kind=` | Occurrences due in the range (live payments): status (`expected`, `received`, `deviating`, `missed`), signed amount, `contactShareCents`, account, payee, contact, category with class or income type, `bookingId`, `bookedAmountCents`, and for `deviating` a `suggestion { paymentId, fromMonth, amountCents }` (the price change the booking implies; P3.10 turns it into an inbox item) |
| `POST /expected/occurrences/:id/link` `{ bookingId }` | Link a booking by hand (any date); status `received` inside range plus tolerance, else `deviating`; a booking belongs to at most one occurrence (409) |
| `POST /expected/occurrences/:id/unlink` | Remove the link; the occurrence becomes `missed` and stays out of automatic matching |
| `POST /expected/occurrences/:id/missed` | Mark an unlinked occurrence "ausgefallen" (409 when linked) |
| `GET /expected/income?month=` | `monthIncome`: `expectedCents` and `receivedCents` per income type and per expected inflow (a missed one counts as expected, not as received) |
| `POST /expected/refresh` | `refreshOccurrences` then `matchOccurrences` for today; `{ refresh: { created, updated, removed }, match: { received, deviating, missed } }`. Idempotent; the P4 worker calls it |

Occurrences are planned from the first day of last month to the end of the month twelve months
ahead. Matching: a booking fits when it is on the payment's account, has the same sign and its
payee (or the payee's contact), a split category or a split income type is the payment's; nearest
day first (within the window), then nearest amount. Fits inside range plus tolerance are assigned
before deviating ones. A card booking in another currency is compared by its original amount when
that has the version's currency. Open occurrences whose window has passed become `missed`.

