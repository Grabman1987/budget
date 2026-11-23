# Crypto read source (P4/P5)

The source reads holdings and operations into the existing inbox. It never creates
budget bookings, trades, holdings, payments or orders. The owner records reviewed
movements through the existing booking/trade screens and acknowledges the inbox
item. Fiat movements without a trade reference explicitly request transfer matching.

## Provider contract

Checked on 2026-10-02 using public documentation only; no authenticated provider
request was made during development. The
[migration guide](https://docs.public.bitpanda.com/migrating-from-the-legacy-api)
replaces legacy wallets/fiatwallets with
[GET /v1/portfolio](https://docs.public.bitpanda.com/get-portfolio-overview-4375768e0)
and trades/wallet transactions with
[GET /v1/operations](https://docs.public.bitpanda.com/list-operations-4375770e0).
The base is `https://api.public.bitpanda.com`, supplied to the server only as
`CRYPTO_API_BASE_URL` (HTTPS required; the code carries no provider host).
Authentication uses `X-Api-Key`.
[GET /v1/currencies](https://docs.public.bitpanda.com/list-available-currencies-4375771e0)
resolves fiat currency IDs. [GET /v1/assets](https://docs.public.bitpanda.com/list-available-assets-4375772e0) supplies public instrument names for explicit mapping, using bounded ID-filtered batches. Provider-specific names, schemas, paths and credentials
are isolated in the generic adapter `apps/server/src/sources/crypto-api.ts`.
Create a dedicated key in Bitpanda account settings with **Balances**, **Transaction**
and **Trade (Read)** scopes; grant no write scopes. See
[key generation](https://docs.public.bitpanda.com/api-key-generation).

Only GET requests to the one configured HTTPS host are implemented. Redirects are refused; each request
has a 20-second timeout and a 4 MB streamed response limit. Unknown response fields
(including wallet owner) are discarded. Provider errors and response bodies never
reach logs, API errors or audit rows. The API/UI disclose key presence only.

## Owner steps

1. Create a dedicated read-only key using the contract above. Set expiry and rotate
   before expiry; restrict source IPs if appropriate.
2. Set the secret yourself for the deployed Fly app:
   `fly secrets set CRYPTO_API_KEY=<read-only-key> --app <app-name>`, and set the
   non-secret `CRYPTO_API_BASE_URL` from the contract above (e.g. `[env]` in `fly.toml`).
   Replace placeholders privately, avoid shared terminals/shell-history exposure,
   and never paste the key into this repository, chat or a PR.
3. After deployment, open Einstellungen › Datenquellen. Confirm
   “Schlüssel gesetzt: ja”, use “Jetzt abrufen” (a session opened with a passkey is enough; no extra confirmation).
   Continue with “Abruf fortsetzen” until the initial history is complete.
4. Create/select the platform's off-budget investment and cash accounts and
   instruments in the existing screens. Assign each source currency to its
   same-currency cash account and each asset ID to an investment account/instrument.
   No matching by name or symbol occurs. Fetch again to reconcile balances.
5. Review source operations and warnings in Posteingang. Match fiat deposits and
   withdrawals to their bank-side transfers; review existing history before adding
   any missing trade or booking. Marking an item done does not book it.
6. With `BUDGET_MARKET_DAILY=1`, the existing in-process nightly timer also advances
   this source (02:30 Europe/Vienna, catch-up, one page per tick). Without it, use the
   manual action. Remove the Fly secret to disable subsequent source requests.

## Persistence, replay and precision

No new schema/migration or parallel worker is needed. Small generic additions reuse
Drizzle `app_setting` (`source.crypto.state`, `source.crypto.mappings`) and
`inbox_item` kinds `import`, `reconciliation`, `other`. All writes use existing
tracked helpers and savepoint transactions; mapping and acknowledgement support undo.

The first run reads all history from the epoch. A frozen `from/to` window and opaque
cursor advance one page per call. Each page and its cursor commit together.
The successful operations watermark advances after the complete history window,
even when the final balance read fails. That failure retains the previous balances
and raises an inbox item; the next run can fetch new operations. Last success refers
to the operations window, not successful balance reconciliation.
Later runs overlap seven days; operation IDs hash into deterministic inbox IDs,
including resolved items. Changed normalized data reopens the existing item.
Only the last 64 cursors and a total page counter are stored. Recent cursor loops
fail closed; older loops are bounded by a 10,000-page limit. Failures retry after 30 minutes; unfinished pages continue
once per minute. No automatic retry within a provider request.

Normalized records retain operation/transaction/trade/wallet IDs, types, direction,
credit timestamp, native amounts, fees, compensation IDs and post-transaction balance.
Current account/instrument mappings are attached when reading inbox records, never
used as operation dedupe facts. Mapping changes and mapping undo refresh display
without clearing acknowledgement. Invalid operations are individually quarantined
as `other` items containing only an ID and the fixed reason `schema`; valid neighbors
and pagination continue. Failure items contain only a category (`schema`, `http`,
`timeout`, `parse`), never a response body. Original
decimal text is retained for source review; representable fiat values have integer
cents. Holdings compare exact e8 units through the existing snapshot/trade read model,
even without a quote. Unknown mapping, absent source balance, currency mismatch or
excess precision raises an explicit warning, never an invented zero or silent round.
An absent mapped balance is reconciled when the local balance is zero. Acknowledged
differences reopen only when source/local values change. Invalid balance rows and
duplicates are flagged individually; unrelated currency metadata is ignored and
symbols are not restricted to three letters.
Cash compares the app's current native balance, including pending bookings.

## Ledger reconciliation (Abgleich)

Each staged operation on/after the start day (`source.crypto.since`) is compared with the
existing ledger, using the account/instrument mappings. The matcher is pure
(`packages/domain/src/read-source-match.ts`), read-only, and never creates or changes
bookings or trades. Result per operation:

- **erfasst** (resolved, "Bereits in der App erfasst (Kauf 10.03.2026)"): a counterpart exists.
- **fehlt** (open, title "Quellbewegung fehlt in der App"): no counterpart; this is a genuinely
  missing movement for the owner to record.
- **ohne Zuordnung** (open, title "Quellbewegung: Zuordnung fehlt"): a needed asset or currency has
  no mapping yet. Nothing is guessed.
- **unreadable** (open): an amount, precision or aggregate cannot be read safely; the failing
  field is named without its value. This takes priority over provider-id links.
- **informativ** (resolved, "Informativ: …"): positively identified platform-internal moves, or an
  operation that only carries fee/tax legs. No ledger effect.

Provider ids come first (#1205). Source records with the same transaction or trade
reference are matched together, including across pages. Duplicate transaction IDs
contribute their units once. Conflicting copies stay unreadable. Rebuild trade keys
can prove a counterpart by source operation, transaction or trade reference. A
rebuild trade with a reference in the source data being checked is reserved for
that reference.
Savings-plan funding needs its own cash counterpart even when the trade is already
recorded. On the mapped cash account, the booking can be up to ten days from the
reservation and, when linked, the execution. The wider window follows the ordinary
cash window. An unmatched funding leg remains visible alongside any matched trade.
Fee legs in another token, stake/unstake and reward commission stay part of their
operation and never produce a fiat booking or a sale.
`summarizeOperation` (`packages/domain/src/read-source-explain.ts`) states per operation and asset
the gross, fee and net units; EUR values come only from the source. All inputs and sums
must be safe integers; overflow remains unknown, and zero net units are always positive zero.

Ties are never guessed: if several equal ledger rows fit one cash movement at the best distance and
the match is not one-to-one, the movement stays open as "Quellbewegung mehrdeutig (N gleich passende
Gegenbuchungen)". Id links use the exact rebuild key formats only (single operation: that operation;
aggregate: exactly its listed ids). Only the exact generated resolution texts count as automatic,
an owner's own text is never rewritten. A reconcile run that writes nothing returns no audit group.

Tolerances and rules:

| Source | Ledger counterpart |
| --- | --- |
| buy, sell, savings plan, swap legs, dust swap | Trade of the mapped instrument in the mapped account (buy/sell, deliveries accepted), +-2 days. Units within 1e-8, else amount within 1 cent, else amount and units both within 0.5 %. Fee and tax (stated by the source or on the trade) may explain amount differences. Each trade leg of a swap must match. |
| reward, bonus, staking reward, merger | Delivery in/out (or buy/sell) of the mapped instrument by units, +-2 days. A commission in the same asset is subtracted (the ledger records the net units). |
| deposit, withdrawal, cash refund/reward | Booking on the mapped cash account with exact cents (a stated fee may be added or subtracted), +-3 days; positive cash credits may also match an interest/dividend trade of a mapped account. Settlement bookings of trades and transfers between two mapped accounts are internal and never match. |
| stake, unstake | Readable legs with an incoming or outgoing flow are internal even when the other wallet leg is in a separate operation or absent. Unreadable amounts or precision remain unreadable. Other movements in the same operation are still checked. |
| transfer | Internal only with readable incoming and outgoing legs of the same asset/currency and an exact zero sum (no tolerance). A one-sided transfer remains eligible for normal ledger matching. |
| fee/tax-only operations | Informational only when amounts and aggregates are readable. |

A heuristic match claims a ledger row for one logical operation (best match first: tier, then
day distance, then operation order). Two independent identical purchases need two trades.
The matcher evaluates operations together so the verdict does not depend on the fetch order.

"Abgleich neu ausführen" (Einstellungen › Datenquellen, passkey session) re-checks all staged
operations on/after the start day, including those closed by the manual cut-off cleanup
(resolution starting "Vor dem Übernahme-Stichtag" or "Vor dem Startdatum"): matches are resolved,
others reopened. Items the owner resolved by hand ("Vom Nutzer als erledigt markiert") and items
before the start day are never touched. The run is one audit group (undo via the button or
`POST /undo`), idempotent, and also updates previous automatic verdicts in the
groups touched by a newly staged page. The Krypto-Lesequelle section shows a
live preview of the four counts.

After a run the holdings comparison (app units vs. source units per asset) is recomputed from
the last fetched balances inside the same audit group. A difference names its cause: mapping
problem (no mapping or no source balance), missing movement (the open movements of that asset add
up exactly to the difference), partly missing movement, or real difference. Operations that fail
validation are quarantined with the failing field name (never a value).

Owner steps before the first run: fetch once so the source balances are known, map every source
currency to its cash account and every asset to its investment account and instrument
(Einstellungen › Datenquellen), set "Bewegungen ab", then run "Abgleich neu ausführen". Assets
without mapping stay open as "Zuordnung fehlt"; after mapping, run it again.

## Remaining acceptance

For owner-authorized repair of an incomplete migrated depot, use the separate
operator [source-rebuild workflow](ops.md#128-rebuild-a-crypto-depot-from-staged-source-operations).
The read source and inbox matcher continue to perform no automatic ledger writes.

No real key, private data or live authenticated API was used. The owner must verify
the live payload/scopes, account/asset mapping and reconciliation, then observe the
nightly run for 14 days. The provider documentation does not guarantee an update
watermark: corrections dated more than seven days back need a deliberate historical
replay via “Gesamten Verlauf prüfen” or manual reconciliation. Key expiry is not
available from the read endpoints and remains the owner's responsibility. A provider
cursor invalidated externally can be restarted via “Gesamten Verlauf prüfen”;
existing inbox items and ledger data are retained. Do not change this source to a different
provider account without an operator-reviewed reset.

The dedicated P4 worker and one-click posting from source records remain separate work
(reconciliation against existing records is described above). This integration intentionally uses the current
in-process timer and manual owner-confirmed ledger paths.
