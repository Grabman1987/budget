# Portfolio Performance XML: format and mapping

The owner's Portfolio Performance (PP) file is the source of the initial trades, holdings and price history (SPEC §10, P5). PP saves a client file as **XML written by XStream** (a plain save, not the compressed or encrypted variants). The file is personal data: it is read locally or on the server, never committed, uploaded to a cloud session, CI or logs. Tests use the synthetic generator `packages/fixtures/src/pp/generate.ts` (`npm run fixtures:pp`), which writes the same structure with invented data. Code: `packages/import-pp`.

The shape below was read from a real version-70 file (element names, attributes, reference style, encodings; no content is reproduced here). Where a construct did not occur in that file (transfers, forex, split events) it is marked *unverified*: it follows PP's own model and is covered by the synthetic generator only.

## File and versions

- Root `<client>` with `<version>` (integer; 70 verified) and `<baseCurrency>`. No XML prolog, UTF-8, two-space indent.
- Order of the top-level children: `securities`, `watchlists`, `accounts`, `portfolios`, `plans`, `taxonomies`, `dashboards`, `properties`, `settings`. The parser reads `securities`, `accounts`, `portfolios` and `taxonomies` and ignores the rest.
- **Version policy:** files with a version below 40 are refused unless the caller passes an explicit `quoteScale` (older files used fewer decimals for quotes; the exact cut-over version is an assumption, not verified). Files newer than the tested version (70) are read and get a `newer-version` problem.
- No DTD: a `<!DOCTYPE>` never occurs and is refused (see Safety).

## Value scales (integers only)

| Value | Stored as | Target |
| --- | --- | --- |
| Amounts (`<amount>`, unit `amount=`, `forex amount=`) | integer cents (x100) | cents, unchanged |
| Shares (`<shares>`) | integer x1e8 | `unitsE8`, unchanged (always positive in PP; the sign comes from the type) |
| Quotes (`<price v>`, `<latest v>`) | integer x1e8 | price micro = `round(v / 100)`, half up, BigInt |
| Weights (taxonomy `<weight>`) | integer, 10 000 = 100 % | basis points, unchanged |
| `<exchangeRate>` | decimal text | micro, half up, parsed from the digits (no floats) |
| Dates | `YYYY-MM-DDTHH:MM[:SS[.fff]]`, local time | first 10 characters, validated as a real calendar day |

A quote of 0 (PP writes it for "no quote") does not become a price (`price > 0` in the schema): it is skipped and counted in one `price-zero` problem per security. A second quote for the same day is skipped (`price-duplicate`).

## References (XStream)

XStream writes the object graph as a tree. The first time an object is met it is written in full, every later use is an empty element with a `reference` attribute. PP uses **relative paths** resolved from the element that carries the attribute:

- `..` is the parent, `name` the first child of that name, `name[n]` the n-th (1-based, counting *all* same-named siblings including reference elements).
- `security reference="../../../../../securities/security[3]"` (five `..` from `client/accounts/account/transactions/account-transaction/security` reach `client`).
- Because accounts come first, a portfolio is written **inside the first cross entry that uses it**, and the top-level `<portfolios>` only holds references into those places; a transaction of the portfolio is sometimes written inside the cross entry of an account transaction and referenced from the portfolio's list (and vice versa). The parser therefore starts from the top-level lists, resolves every element it finds, and never depends on where an object was written in full.
- Absolute paths (`/client/...`) and id references (`id="7"` / `reference="7"`) are also resolved, though the observed file uses neither. Reference chains are followed up to 16 hops; an unresolved reference becomes a `reference-unresolved` problem with the path of the referencing element.

## Securities

`<security>`: `uuid`, `onlineId`, `name`, `currencyCode`, `isin`, `tickerSymbol`, `wkn`, `feed` (`PP`, `MANUAL`, `YAHOO`, `GENERIC_HTML_TABLE`, ...), `feedURL`, `<prices><price t="YYYY-MM-DD" v="..."/>...</prices>`, `<latest t v>` (with `high`, `low`, `volume` children), `attributes`, `events`, `properties/property`, `isRetired`, `updatedAt`. `events` is empty in the observed file; a stock split is an event `STOCK_SPLIT` with `details` like `2:1` *(unverified)* and is reported as a `security-event` problem, not converted. The feed and feed URL are kept in the model (the coordinator prefills price identifiers from them locally; they are never committed).

## Accounts and portfolios

- `<account>`: `uuid`, `name`, `currencyCode`, `note`, `isRetired`, `transactions` of `<account-transaction>`, `attributes`, `updatedAt`. This is a **cash account**.
- `<portfolio>`: `uuid`, `name`, `isRetired`, `referenceAccount` (reference to the settlement account), `transactions` of `<portfolio-transaction>`, `attributes`, `updatedAt`. This is the **depot**.

## Transactions

Child order (both kinds): `uuid`, `date`, `currencyCode`, `amount`, `security` (reference), `crossEntry`, `shares`, `note`, `source`, `units`, `updatedAt`, `type`. `amount` is the net cash amount; `units` carry `FEE` and `TAX` (and, for foreign currency, `GROSS_VALUE`) as `<unit type><amount currency amount/></unit>`.

**Account transaction types:** `DEPOSIT`, `REMOVAL`, `INTEREST`, `INTEREST_CHARGE`, `DIVIDENDS`, `FEES`, `FEES_REFUND`, `TAXES`, `TAX_REFUND`, `BUY`, `SELL`, `TRANSFER_IN`, `TRANSFER_OUT`. A `BUY`/`SELL` here is the cash leg of a securities trade; `DIVIDENDS`, `INTEREST`, `FEES`, `TAXES` may carry a `security`.

**Portfolio transaction types:** `BUY`, `SELL`, `DELIVERY_INBOUND`, `DELIVERY_OUTBOUND`, `TRANSFER_IN`, `TRANSFER_OUT`. Deliveries have no cross entry and no cash leg (opening positions arrive as deliveries in).

**Gross value.** `BUY` / `DELIVERY_INBOUND`: `gross = amount - fees - taxes`. `SELL` / `DELIVERY_OUTBOUND` / `DIVIDENDS`: `gross = amount + fees + taxes`. A `GROSS_VALUE` unit must agree with this; a difference is a `gross-mismatch` problem. Foreign currency *(unverified)*: `GROSS_VALUE` carries `<amount>` (transaction currency), `<forex currency amount/>` and `<exchangeRate>` with `amount = forex x rate`, i.e. EUR per 1 unit of the foreign currency, the same direction as `fx_rate`.

## Cross entries

`<crossEntry class="...">` pairs two transactions; both sides carry it (one as a reference to the other's).

| Class | Children | Pairs |
| --- | --- | --- |
| `buysell` | `portfolio`, `portfolioTransaction`, `account`, `accountTransaction` | portfolio `BUY`/`SELL` with the account `BUY`/`SELL` |
| `account-transfer` *(unverified)* | `accountFrom`, `transactionFrom`, `accountTo`, `transactionTo` | account `TRANSFER_OUT` with `TRANSFER_IN` |
| `portfolio-transfer` *(unverified)* | `portfolioFrom`, `transactionFrom`, `portfolioTo`, `transactionTo` | portfolio `TRANSFER_OUT` with `TRANSFER_IN` |

The model stores the peer's uuid and checks that the pairing is reciprocal (`missing-peer`, `peer-mismatch`). A hand-edited file can hold a cross entry whose partner is another kind of transaction or does not point back: it is imported as it is, reported as `peer-mismatch`, and its cash booking is then not linked to a trade.

## Taxonomies

`<taxonomy>`: `id`, `name`, `root` (a classification). `<classification>`: `id`, `name`, `color`, `parent` (reference), `children`, `assignments`, `weight`, `rank`. `<assignment>`: `investmentVehicle class="security|account"` (reference), `weight` (basis points of the classification, 10 000 = all), `rank`. The model flattens a taxonomy depth-first (root first) with `parentId`. Mapping taxonomies to asset classes is decided in P5.11 (not part of the parser's plan).

## Model, problems and safety

- `parsePp(bytes, { maxBytes, quoteScale })` decodes (strict UTF-8, BOM dropped, size limit 64 MiB), parses, builds. It throws `XmlError` (code and line, never content) for broken XML, a DOCTYPE, an unknown entity, too deep nesting or an oversized file, and `PpFormatError` if the root is not `<client>` or the version is unusable.
- Everything else is a **problem** `{ code, path, message, count }`: element names and paths such as `client/accounts/account[2]/transactions/account-transaction[7]`, never values from the file. A broken entity (bad amount, bad date, unknown type, reference that does not resolve) is skipped and the rest is still read. Unknown child elements are tolerated and merged into one `unknown-element` problem per parent and name with a count.
- **XXE safety is by construction:** the reader has no DTD support, so external entities, parameter entities and entity-expansion attacks cannot exist. Only `&amp; &lt; &gt; &quot; &apos;` and numeric references are decoded; any other entity is refused.

## Mapping to the target (`mapToTarget`)

The owner-made mapping document (JSON, outside the repo) keys everything by PP uuid:

```json
{
  "portfolios": { "<portfolio uuid>": { "accountId": "<investment account>" }, "<other>": "ignore" },
  "accounts": { "<cash account uuid>": { "accountId": "<tracking account>" }, "<other>": "ignore" },
  "securityKinds": { "<security uuid>": "etf" },
  "defaultSecurityKind": "other"
}
```

| PP | Target |
| --- | --- |
| Security | `security` row (name, kind from the mapping, `symbol` = ticker, isin, currency) |
| Quote | `price` row, `source = 'import'`, micro as above |
| Portfolio + reference account | investment account (`investmentAccounts`, keeps the reference account uuid; the Gate 3 depot view includes it) |
| Portfolio `BUY` / `SELL` / `DELIVERY_INBOUND` / `DELIVERY_OUTBOUND` | trade `buy` / `sell` / `delivery_in` / `delivery_out`; units signed per `trade_units_chk`; `amount` = gross, `fee`, `tax` from units |
| Portfolio `TRANSFER_OUT` / `TRANSFER_IN` | `delivery_out` / `delivery_in` with note `transfer` (value carried at the PP amount) |
| Account `DIVIDENDS`, `INTEREST`, `FEES`, `TAXES` with a security | trade `dividend`, `interest`, `fee`, `tax` (units 0) on the portfolio that uses the account as reference account; none or several candidates is a problem |
| Every account transaction on a tracking account | booking with signed amount (`DEPOSIT`, `INTEREST`, `DIVIDENDS`, `FEES_REFUND`, `TAX_REFUND`, `SELL`, `TRANSFER_IN` positive; the others negative); a `BUY`/`SELL` leg links its trade by key, a transfer leg names its counterpart |
| Account or portfolio with `"ignore"` | listed in `ignored`; one not in the mapping is ignored with an `unmapped-*` problem |

Keys are `pp:<uuid>` (trade `importKey`, booking key), so a second import of the same file is idempotent.

## Commit (P5.11, operator task)

The plan above is written by `migrate-pp-cli.js` (`docs/ops.md` §13). The private mapping document (`pp.mapping.json`, zod schema `ppMigrationSchema`) names the app account per PP portfolio and cash account, and per security the kind, asset class, quote ids and `skip`. Decisions:

- **Cash flows and opening balances stay with YNAB** (owner decision 02.10.2026: YNAB is more current than PP). PP deposits, removals and transfers are only compared in the report (`cashFlows: ynab`, `openingBalance: keep`); `cashFlows: book` and `openingBalance: pp|<cents>` exist for accounts YNAB cannot serve.
- PP supplies securities, prices (whole history, source `import`), trades and deliveries. A trade's cash is its own settlement booking; the PP cash leg of a buy or sell and of a dividend, interest, fee or tax of a security is not booked again. Interest, fees, taxes and refunds without a trade are booked as Kapitalerträge (performance, not flows).
- **Fitting to the ledger's trade rules** (`normalizeTrade`): tax of a purchase goes into the fee (cash stays exact), fee and tax of a delivery into its amount (the cost carried in), interest is gross of fee and tax; a sale whose fee and tax exceed its gross amount is an error.
- **YNAB value estimates**: the YNAB balance adjustments (source `migration`) of an account that has a depot are deleted in the run's audit group (`retireYnabValue`, undoable); an account without a depot (P2P platform) keeps them.
- Securities match by id from the mapping, then ISIN, then name, else they are created; a skipped security with trades blocks the commit. Created securities get `pricesEnabled` only with a quote id; a Yahoo feed names the symbol, a PP-feed ticker with an exchange suffix is taken as probable, Ariva links give the exchange (`boerse_id`) and a slug but never the numeric id the adapter needs.
- Prices: a manual price wins, an identical imported one stays, anything else is replaced; the run records every change (`import_price_change`). Refreshes never write on or before the last imported day of a security.
- A later run of the same or a newer file adds what is new and reports what is unchanged, **changed** (same key, other figures: left alone) and **missing** (written earlier, not in the file: left alone). Revert undoes the newest committed run as a whole and retires its keys.
- Not mapped: security events (splits), foreign-currency units (the migration is EUR-only), taxonomies beyond the asset-class name.

The Gate 3 report (`report`) lists per depot and security units, value and cost on chosen days (PP recomputed from the file against the app), the cash flows per year, and TTWROR and XIRR per period over identical windows (PP replayed with the same domain functions; PP's own figures can be passed with `--reference`). Deliveries and portfolio transfers count as capital flows in both, as in PP. Securities without any quote on a held day count as 0 on both sides and are listed.
