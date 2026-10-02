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
`undo_refused` (409), `valuation_unavailable` (503, German reason, `asOf`; missing quotes include
`reason: missing_price`, `missingPriceSecurityIds` and `accountId`). Numeric valuation/history
requires quotes on or before every held day. `/accounts` instead returns nullable
`holdingsCents`, `valueEurCents` and `netWorthEurCents` with global/per-account
`missingPriceSecurityIds` and `missingFxCurrencies`. `/heute` keeps its daily sections and
represents unavailable `financeCheck` / `netWorth` as `{ unavailable: { reason, message, asOf } }`.
A current quote does not repair an earlier history gap.

| Endpoint | Purpose |
| --- | --- |
| `GET /accounts?asOf=` | Accounts with `balanceCents` (as of the day, default today Vienna), `holdingsCents` (market value of securities held, 0 without), `clearedCents` (confirmed + reconciled), `unclearedCents` (pending), `scheduledCents` (dated later), counts, `lastReconciledOn`, `referenceAccountId` (Verrechnungskonto of a depot: its cash account, set by the PP migration; read-only here) |
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
| `POST /categories`, `PATCH /categories/:id` | Name, `icon` (one emoji, shown monochrome), group, class, kind, stage 1–9, card account (card payment only; a card payment keeps its kind and card, 422 `category_rule`), `hidden`, `pinned` (pin to Heute; pinned envelopes keep the pinning order); optional `target: { validFrom, target }` in the same undo group |
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


## Rules (P3.5)

The rule book R01–R16 and the stage checklist (concept §3.5). Rules are data (`rule`: `params_json`, `enabled`); the engine is `evaluateRule` in `@budget/domain`, the inputs come from `ruleInputs` in `@budget/db` (the one place that assembles them). Results (`rule_result`) are derived and rewritten, edits are audited and undoable with `POST /undo { groupId }`.

| Request | What it does |
| --- | --- |
| `GET /rules` | `{ rules, checklist }`: per rule code, name, stage, goal, `enabled`, `params` (stored over the defaults), `defaults` and `latest` (`asOf`, `status` ok/warn/bad, `valueText`, `actionNeeded`, `actionText`, `detail`; `null` when never evaluable); the 14 stage checklist items with `ruleCode` (follows that rule) or `null` and `confirmedAt` |
| `PATCH /rules/:code` | `{ params?, enabled? }`: `params` is a partial object validated strictly per rule (unknown key or out-of-range value 400); answers `{ rule, groupId }` |
| `PATCH /rules/checklist/:code` | `{ confirmed }`: the owner marks a non-computable item (Testament, Versicherungen vollständig …) erledigt or open again; items that follow a rule are 409 `rule_backed`; `{ item, groupId }` |
| `POST /rules/evaluate` | Evaluates the enabled rules for today and the last 12 month ends and stores one result per (rule, day); idempotent; a rule without data stores nothing ("nicht bewertbar"); `{ asOf, days, stored, removed }` |
| `GET /rules/results?from&to` | Matrix of the enabled rules: `days` and per rule `cells { asOf, status, valueText }`; default the 12 month ends up to today |
| `GET /rules/check` | Finanz-Check of today (computed now): `counts { ok, warn, bad, total, notEvaluated }`, the six key rules (R02, R15, R01, R03, R08, R07) by severity, `stage` from net worth, `checklist { done, total, items }` (a confirmed item counts as done, a rule item follows its rule) |

Reference month: rolling figures (R01, R02, R11) use the last full month, the month itself on a month end. R04 uses the change log for the day an envelope was assigned; assignments without a log entry (imported or seeded) count as made on the salary day.

## Heute (P3.9)

| Endpoint | Notes |
| --- | --- |
| `GET /heute?period=month\|payday&month=YYYY-MM` | The whole home screen in one read. `period=month` (default) charts the whole `month` (default the current one), `payday` runs from today to the next salary; another month than today's is always shown as the whole month. Lead, net worth and next steps always refer to today. `stand`: `today`, `month`, `period`, `from`, `to`, `payday { day, source: salary\|month_end, daysToPayday }`, `budgetBalanceCents`. `lead`: `freeUntilPayday` (needCents + wantCents − openCents = freeCents, euro-balanced `chain`, `items { need, want, open }` as drill-down). `balance`: `actual` (daily end balance of the budget accounts up to today), `forecast` (from today to `to`, liquidity forecast of R07), `salary { day, cents }` on the payday, `low { day, index, cents }`. `pace`: `paceModel` (`plan`, `actual`, `previous` by day, `figures`) plus `forecast` (today to month end) and `previousMonth`. `pinned`: available, assigned, budgeted (carry + assigned), spent, `paceMarkCents`, overspent. `upcoming14`: occurrences with `status`, signed EUR `amountCents`, `covered`. `financeCheck`: `counts` and the six `keyRules`. `netWorth`: parts `liquidCents` / `investedCents` / `debtCents` (+ `receivableCents`, role receivable, shown separately), `deltaCents` and `deltaBp` against the previous month end, `series` of 11 month ends and today. `lastBookings`: 5 up to today. `nextSteps`: `{ items, count }`, overspent envelopes and uncategorised bookings until the inbox (P3.10) takes over |

Payday is the next due date of the salary expected payment (income type Gehalt, `date_shift` before: last business day, weekends and Austrian public holidays) that is still `expected`; without one it is the last day of the month. Occurrences come from the payment schedule and their status from the stored occurrences (`POST /expected/refresh`); a past occurrence without a stored row counts as settled, an unmatched `expected` one up to 31 days back still counts as open. Open bills for the lead are expected outflows on budget accounts before the payday that are not Zukunft transfers. Net worth is `netWorthAsOf`; open contact receivables are not added to it (owner decision).

## Market data (P5.1)

Sources are the fixture series outside production and Yahoo/ECB in production
(`BUDGET_MARKET_SOURCES=fixture|live`, see `docs/market-data.md`); prices are micro-units of the
security currency, rates EUR per unit in micro-units.

| Endpoint | Purpose |
| --- | --- |
| `POST /market/refresh` | Runs `refreshFx` and `refreshPrices` for today (Vienna). Answer: `{ prices: { tracked, upToDate, bySource: { ariva, cryptocalc, coingecko, yfinance: { securities, rows } }, protectedManual, failed: [{ securityId, errors }] }, fx: { currencies, upToDate, bySource: { ecb: { currencies, rows } }, failed: [{ currency, errors }] } }`. A second call while one runs is 409 `refresh_running`. Failures open one `stale_value` inbox item per security (or currency) and error class |
| `GET /market/status` | Run log: `{ lastRun, lastSuccess }` (each `null` or `{ trigger, startedAt, finishedAt, asOf, status: ok/partial/failed, priceRows, fxRows, failedCount, errorClasses }`). `lastSuccess.finishedAt` is the "Stand ... Kurse HH:MM" of `GET /wealth/stand` |
| `GET /securities/:id/prices?from&to` | `{ securityId, currency, prices: [{ date, priceMicro, currency, source }] }` ascending; unknown security 404 |
| `PUT /securities/:id/prices/:date` | Manual price: `{ priceMicro }` (integer) or `{ price: "81.25" }` (decimal text, at most 6 decimals), not in the future. Wins over every source; a refresh never replaces it; a change of an existing price is a `price_audit` row |
| `GET /fx?currency&from&to` | `{ currency, rates: [{ date, currency, rateMicro, source }] }` ascending; `currency` is an ISO code in capitals |
## Wealth (P5.4)

Read models of the Vermögen pages. "Now" is `netWorthAsOf` of today (Vienna), the figure of Konten ›
Übersicht; contact receivables are not part of net worth (an Auslage lowers it until repaid).

| Endpoint | Purpose |
| --- | --- |
| `GET /wealth/networth?period=` | `period` is `1M`, `3M`, `YTD` (default), `1J`, `3J` or `Alles`; anything else is 400. Answer: `{ period, from, to, stand, chain, daily, bars, composition }`. `from` is the close of the window's start day (31.12. for YTD, same day of the earlier month for 1M/3M/1J/3J, the first account's opening day for `Alles`). `chain` is `{ startCents, ownCents, marketCents, nowCents, deltaCents }` with start + own + market = now exactly (own = change minus the market move of the positions, SPEC section 6). `daily` is `[{ date, netWorthCents }]`, the first point is the start value. `bars` is `{ unit: 'week' \| 'month', buckets: [{ from, to, ownCents, marketCents }] }`: blocks of 7 days up to 3M, calendar months otherwise (first and last may be partial). `composition` is `{ assets, debts }` of `{ accountId, name, type, valueCents }`, assets descending, debts most negative first, zero accounts left out |
| `GET /wealth/freedom` | Current R16 sources: `asOf`, `refMonth`, net Bedarf/Wunsch consumption per completed budget month (at most twelve), short-history annualisation, resolved live R16 `multiple`, target, investment-role account cash plus holdings, progress and 500 bp real-return default. Unsafe cents/target/progress and unavailable investment valuation stay nullable with source reasons; expenses remain readable without quotes. No inferred saving rate, goal year, historical Soll anchor or preference write. |
| `GET /wealth/stand` | `{ priceDate, priceAt }`: the newest price day and, when a refresh or a manual price recorded it (`price_audit.ts`), the timestamp (ISO UTC); `null` without prices |
## Invest (P5.5)

Securities, trades, asset classes, savings plans and the portfolio read model. Money is integer
cents, prices micro-units, units 1e-8. Every write answers with its `groupId` (undo with
`POST /undo`); one trade is one group (trade and settlement booking together).

| Endpoint | Purpose |
| --- | --- |
| `GET /securities?deleted=1`, `POST /securities` | Securities by name; create `{ name, kind, symbol?, isin?, currency?, terBp?, assetClassId?, institutionId?, benchmark?, fallbackQuoteId?, quoteExchange?, quoteUrl?, coingeckoId?, pricesEnabled?, quoteAdjusted? }` (ISIN with 12 characters, unique among live securities: 409) |
| `GET/PATCH/DELETE /securities/:id`, `POST /securities/:id/restore` | Read, change, soft delete (409 while the security has trades, holdings or an open savings plan), restore |
| `GET /asset-classes`, `POST /asset-classes`, `PATCH/DELETE /asset-classes/:id` | Classes with their current target (`target`, Soll in bp and band) and `inUse`; delete is 409 while securities belong to it |
| `GET /asset-classes/targets` | Target versions `{ validFrom, targets, sumBp }`, oldest first |
| `PUT /asset-classes/targets` `{ validFrom, targets: [{ assetClassId, targetShareBp, bandBp? }] }` | Set the version that starts on `validFrom` (replaces the rows of that day); the sum must be 10 000 bp (400), a class with an earlier target that is not listed goes to 0 from that day. `DELETE /asset-classes/targets/:validFrom` removes a version |
| `GET /trades?account&security&from&to` | Live trades by date |
| `POST /trades` | `{ securityId, accountId, date, kind, unitsE8 or units, amountCents, feeCents?, taxCents?, importKey?, note? }`. `units` is decimal text with at most 8 decimals; give one of the two. Units per kind: buy and delivery_in > 0, sell and delivery_out < 0, split not 0, dividend, interest, fee, tax = 0 (400 otherwise); tax only on sell, dividend, interest; fee and tax together at most the gross amount. The account must be an investment account. 201 `{ trade, bookingId, duplicate, groupId }`; a repeated `importKey` of the account writes nothing and answers 200 with `duplicate: true` |
| `GET /trades/:id`, `PATCH /trades/:id`, `DELETE /trades/:id` | Change (security, date, kind, units, amounts, note; account and import key stay) or soft delete; the settlement booking follows in the same group |
| `GET /savings-plans?ended=1` | Open plan rows (`validTo` null); with `ended=1` the history rows too |
| `POST /savings-plans` | `{ securityId, accountId, sourceAccountId?, amountCents, dayOfMonth, validFrom? (today), note? }`; one open plan per security and account (409) |
| `PATCH /savings-plans/:id` | `{ amountCents?, dayOfMonth?, sourceAccountId?, note?, from? }`: ends the row the day before `from` (default: next execution day) and starts a new one; a `from` on or before the row's own start corrects it in place |
| `POST /savings-plans/:id/end` `{ to? }`, `DELETE /savings-plans/:id` | End an open plan (inclusive), soft delete a mistaken row |
| `GET /savings-plans/executions?month=` | Planned executions of the month with `status`: `executed` (a buy of the security on the account within 3 days, plan between amount and amount + fee, 1 EUR slack), `missing` (window passed), `upcoming`; `tradeId` when executed |
| `GET /savings-plans/proposal?step=` | P5.3 `savingsPlanProposal` over the open plans (R15 pauses speculative plans, R13 steers to under-weight classes, the total stays); rates in multiples of `step` cents (default 5 000); `{ proposal, basis }` |
| `POST /savings-plans/apply` `{ stepCents? }` | Recomputes the proposal and applies it: changed plans end the day before their next execution and restart at the new rate (rate 0 only ends); one inbox item "Sparplan bei der Bank ändern" (kind `other`, `refType` `savings_plan`) lists the changes. `{ changes, inboxItemId, groupId }`; a second call changes nothing |
| `GET /portfolio?period=&view=&benchmark=&reference=` | `period` is 1M, 3M, YTD, 1J (default), 3J or Alles; `view` is `securities` (default) or `depot`. `{ portfolio }`: `valueCents`, `costCents` (FIFO), `gainCents`, `realizedGainCents`, `performance` (`windowPerformance`: TTWROR, XIRR, Modified Dietz, risk figures, `benchmarkTtwror`; `null` without history), `benchmark`, `costs` (TER plus fees of 12 months, `costRateBp`), `income` (dividends and interest of 12 months), `allocation` (R13), `cluster` (R14), `speculative` (R15), `proposals` (rebalancing rows), `classes` (positions grouped by asset class with Soll), `positions`, `platforms` (shares in bp), `names` |
| `GET /portfolio/allocation` | Current-only `asOf`, nullable `valueCents`, `status` (`known`, `empty`, `unavailable`, `nonpositive`), missing price/FX reasons, live classes with effective Soll/band/date, shared `risk` and names. Risk and proposals are unavailable for missing valuation or nonpositive held totals; historical basis/price gaps do not suppress complete positive current allocation. No performance history is evaluated. |
| `GET /portfolio/positions` | Current `asOf`, persisted `costMethod`, shared EUR value/basis/gain and chain, asset-class groups and instrument positions; each position keeps account ownership/institution, exact `unitsE8`, latest quote `date/currency/priceMicro/source`, and explicit `valueStatus`/`basisStatus`. Unknown price, FX or basis stays `null`; incomplete value makes overall value/shares unavailable. No performance history is recomputed. |

Settlement (`trade.booking_id`): a buy books -(amount + fee) on the investment account, a sale
amount - fee - tax, a dividend or interest the same as income of type Kapitalerträge, a standalone
fee or tax -amount; deliveries and splits have no booking. The savings-plan transfer arrives as
cash and the buy leaves it, so the depot cash stays 0. The benchmark is the price series of the
security given by `benchmark` (default: the largest position) until index series exist. The depot
view counts a plain booking on a reference account (default: the investment accounts) as an external
flow: an inflow is a deposit (Einlage), an outflow a withdrawal (Entnahme); trade settlements (also fees and taxes) and Kapitalerträge are performance.

## YNAB import (P2d)

Import runs of the YNAB export (`docs/migration/ynab-export.md`), below `/api/imports`. Source:
`apps/server/src/imports/`. The two files live only in the database (raw staging rows per run,
text 1:1 after the CESU-8 repair) until the run is deleted; nothing of their rows is logged, errors
name file, line and a code. Body limit 20 MB for the upload, 2 MB for the other import calls.
Calls marked **step-up** answer 403 `step_up_required` without a step-up of the last 5 minutes.

Errors add `parse` (422, `file`, `line`, `code`), `files` (400), `no_staging` (409, the files of
the run were deleted), `run_closed` (409, the run is committed or reverted), `import_problems`
(422, with `problems`), `not_committed` and `newer_run` (409).

| Endpoint | Purpose |
| --- | --- |
| `GET /imports` | Runs, newest first: status (`staged`, `dry_run`, `committed`, `reverted`), file names, mapping version, times, `summary` (counts, number of differences, change counts) |
| `POST /imports/ynab` **step-up** | Multipart with both files (`… - Register.tsv`, `… - Plan.tsv`, matched by suffix). Stages the rows as a new run; answers `run`, `sameExportAs` (runs with the same SHA-256) and `overview` |
| `GET /imports/:id` | `run` and `overview` of the raw layer: `asOf`, `months`, accounts with proposals, categories with `count` and `years` (split sums per year), payees with counts, `problems` |
| `GET /imports/:id/mapping`, `PUT /imports/:id/mapping` | The latest mapping document (the zod `mappingSchema` of `packages/import-ynab`; export as JSON). Without a saved one: the latest of an earlier run (also an undone one), else the proposal (`proposed: true`: identity mapping, hidden categories in their original group, start 2023-10). `PUT` validates (400 with `issues`) and saves a new version (import of a JSON document) |
| `POST /imports/:id/preview` `{ mapping }` | Unsaved draft: `problems`, `structure` (per target category: YNAB sources, splits, sums per year after the rules), `rules` (per rule: affected splits, sum, up to 50 examples) |
| `POST /imports/:id/dry-run` | With the latest mapping: `problems`, `reconciliation` (Gate 2: `differences` by check, account/category and month, `moved` by rules, `creditShift`, `checked` counts), `structure`, target `accounts` with opening balances, `change` (what a commit would write: bookings `added` / `unchanged` / `updated` / `skipped` / `missing`, accounts, categories, payees, assigned months) and `ledger` (the app's budget after the write against the target model). The write runs in a transaction that is rolled back |
| `POST /imports/:id/commit` `{ deleteMissing? }` **step-up** | The same write for real: one transaction, audit group `import:<run id>`, bookings with `source: 'migration'`, the run id and an import key. Refused with `import_problems` while the dry run has errors. `deleteMissing: true` deletes the `missing` bookings of earlier runs (reconciled ones stay) |
| `GET /imports/:id/report` | Gate 2 report page: like the dry run without writing; for a committed run `ledger` compares the app's data with the target model |
| `POST /imports/:id/revert` `{ force? }` **step-up** | Undo of the whole run (only the newest committed run; refused as `undo_refused` when something it wrote was changed later, unless `force`; refused as `in_use`, also with `force`, while bookings or assigned amounts added later use its accounts or categories). The import keys of its bookings are retired, so the same export can be committed again |
| `DELETE /imports/:id` **step-up** | Deletes the staged files and mapping versions; a run that wrote nothing is removed completely (`deleted: 'run'`), a committed or reverted one keeps its row (`'staging'`) |

Re-import of a newer export: a new run (the mapping of the previous run is offered), accounts and
categories of the latest committed run are reused by their mapping ids, bookings with a known key
are left alone (also when the owner deleted them) or get the new status and flag, new keys are
added (a transfer only with both legs), assigned amounts follow the new export (negative
amounts included). Changing the mapping of committed data needs a revert and a new commit.

## Savings goals (P3.4)

Sparziele: a goal links an envelope (category) or an account, a target amount and an optional target
date. Every answer carries the figures of the viewed month (`?month=YYYY-MM`, default the month of
today), computed once by `goalProgress` in `@budget/domain`: `savedCents` is the available money of the
envelope (or the balance of the account) at the end of that month, `remainingCents` what is missing,
`monthsLeft` the months after the viewed one up to the target month (at least 1; `null` without a
date), `neededMonthlyCents` the missing amount per month rounded up to the cent, `averageRateCents`
the average assignment (account: growth) of the viewed and the two months before, `forecastMonth` the
month the goal is full at that rate, `status` `reached` / `on_track` / `behind`. Goals are ordered by
target date, those without a date last.

| Endpoint | Purpose |
| --- | --- |
| `GET /goals?month&deleted=1` | `{ month, goals }` with the figures above |
| `POST /goals?month` | `{ name, targetCents > 0, targetDate?, categoryId \| accountId }` (not both; 422 `category_rule`); answers `{ goal, groupId }` |
| `PATCH /goals/:id?month` | Any of the fields; setting one link clears the other |
| `DELETE /goals/:id`, `POST /goals/:id/restore?month` | Soft delete and restore; `POST /undo` with the `groupId` reverts either |
| `POST /goals/:id/adopt` | `{ validFrom? }` (`YYYY-MM`, default this month): "Als Ziel der Kategorie übernehmen" writes a versioned `by_date` category target (goal amount and date) in the same audit group; needs a category and a date |

## Contact statements and actual settlements

`GET /contacts` shows only nonzero contact balances; `?history=1` includes balanced contacts.
`POST /contacts { name, note? }` creates a retained identity. `GET /contacts/:id?asOf=YYYY-MM-DD`
returns the actual contact-tagged split movements, open outlays and receipt allocations. Positive
balance means the contact owes the owner; negative means credit owed to the contact. Expected
occurrences are never contact balance movements. These statements currently require EUR movements.
Both reads expose `currency: "EUR"`; the list also returns checked-cent `totals` (receivable,
payable and net balance). Each statement movement retains source `currency`, `status`, `accountId`
and cash `amountCents`, with `contactDeltaCents` (opposite cash sign) and shared replay `balanceCents`.
Nondeleted stored splits dated through `asOf` include pending bookings, matching the existing
statement predicate. Mixed-currency reads fail wholly. Report 5.4 is fixed all-time through today;
no period subtotal is substituted for the cumulative debt and no contact total enters net worth.

`POST /contacts/:id/settlements { accountId, date, amountCents, memo?, allocations? }` records an
actual positive EUR cash receipt (open checking, savings or cash account; no future date). With no
allocation supplied, the oldest open outlays are paid first (same-day ties follow insertion order).
Each optional allocation is `{ outlaySplitId, amountCents }`: targets must already be open on the
receipt date, must be unique and must fit the outstanding amounts. Their total must equal the
receipt up to the open balance. Only excess becomes persisted contact credit. Existing credit
covers subsequent actual outlays in chronological order.

Cash booking, advance-category split, allocation rows and credit share one transaction/audit group.
The receipt has no income type. Generic economic edits/deletes of the receipt or allocated outlays
are refused; undo the related settlement first. Whole-group undo/redo restores the saved allocation,
credit and cash together, and dependency checks still apply to forced undo. Memo, flag and normal
clearing status remain editable. Legacy positive contact splits use the same oldest-first statement
calculation without changing their cash bookings.

An outlay of 10,000 cents from 100,000 cents cash leaves 90,000 net worth. A real receipt of 6,000
moves it to 96,000 while 4,000 stays open in the statement. A total receipt of 12,000 instead leaves
102,000 actual cash/net worth and -2,000 contact balance. Derived contact debt/credit never adds a
virtual receivable or liability to net worth; explicit receivable accounts keep ordinary valuation.

## Inbox basics

`GET /inbox` returns `{ asOf, count, entries }`; `GET /inbox/count` returns the same queue's count.
There is one derived `booking` task per live on-budget booking dated no later than today with a
nonzero split lacking both category and income type. Transfers, tracking accounts, future dates
and zero splits are excluded. A task carries the booking ID, actual amount/date/account/payee/memo,
status and number of unclassified splits. Stored unresolved non-`uncategorized` inbox items appear
as `stored` tasks. Legacy stored uncategorized summaries are replaced by actual ledger work.

Categorize or confirm via the existing booking PATCH API; confirmation alone does not remove a
classification task. `POST /inbox/:id/resolve {}` acknowledges an existing stored warning in one
audit group and returns `{ id, groupId }`. It changes no financial amounts and makes no claim
that the warning's source is repaired. Unknown/derived IDs return 404, legacy unclassified
summaries and already resolved warnings return 409, and extra request fields return 400.
Normal whole-group undo/redo applies, including refusal if a later source write changed the row.
The web queue/count use the common ledger query key so categorization, acknowledgement and undo
also invalidate integrated Heute reads. Bank/assignment suggestion decisions remain later scope.
