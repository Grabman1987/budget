# Market data (P5.1)

Prices and ECB rates come through adapters in `packages/market` (injected `fetch`, no database).
The jobs are in `apps/server/src/market` and are plain exported functions, so the P4 worker can call
them: `refreshPrices(db, sources, { today })`, `refreshFx(db, sources, { today })`,
`refreshMarket(db, sources, today, { trigger })` (both, rates first, and one line in the run log).

## Sources

Owner decisions (02.10.2026): Ariva is the primary source (European exchange prices in EUR), Yahoo
only the last resort; crypto comes from the sources Portfolio Performance (PP) uses for it.

| Source | Used for | Identifier on the security | Notes |
| --- | --- | --- | --- |
| Ariva historic-quotes page (`arivaSource`) | **Primary**: ETFs, funds, stocks, certificates | `quote_url` (host `ariva.de`), optional `quote_exchange` | Public HTML table, no login, no key. See "Ariva, verified" below. On by default, `BUDGET_ARIVA=0` switches it off |
| cryptocalc price table (`cryptocalcSource`) | Crypto in EUR (PP feed `GENERIC_HTML_TABLE`) | `quote_url` (host `cryptocalc.cc`) | `https://cryptocalc.cc/bitpanda-kurse/?currency=BTC&fiat=EUR&range=all`: table `Datum / Erster / Hoch / Tief / Schluss`, German decimals, daily candle = UTC day. `range` is chosen per request (`month`, `three_months`, `year`, `all`) |
| CoinGecko (`coingeckoSource`) | Crypto in EUR (PP feed `COINGECKO`) | `coingecko_id` (PP property `COINGECKOCOINID`, e.g. `bitcoin`) | Keyless public API `market_chart?interval=daily`. A point stamped 00:00 UTC is the close of the day before and is stored under that day |
| Yahoo chart (`yahooChartSource`) | Last resort | `symbol` | The endpoint yfinance reads, no key. Unadjusted close unless `security.quote_adjusted`. A bar of a session that is still open is dropped. A quote currency other than `security.currency` is refused (`currency_mismatch`) |
| ECB SDMX CSV (`ecbSource`) | `fx_rate`, `EXR/D.{CUR}.EUR.SP00.A` | currencies in use | No key. ECB: units of currency per EUR; stored: EUR per unit, `10^12 / x` on integers, rounded half up once. The portal is slow for long ranges, so the job fetches in three-year chunks and keeps each |
| Fixture sources | Seed, dev server, tests, e2e | | Deterministic and synthetic, never the network |

Chain order (`MarketSources`): `quotes` (Ariva), `moreQuotes` (cryptocalc, CoinGecko),
`fallbackQuotes` (Yahoo). A source with `supports(ref) === false` (the security lacks its
identifier) is skipped without counting as a failure; the next one is tried when one fails or
answers with nothing. A tracked security that no source supports opens a `stale_value` inbox item
with class `not_configured`.

`BUDGET_MARKET_SOURCES=fixture|live`: default `live` when `NODE_ENV=production`, else `fixture`.
Fixture mode on a running server continues the stored series with a seeded random walk.

### Fields on `security` (contract for the PP migration, branch `feat/pp-migration`)

| Field | Content | Filled from PP |
| --- | --- | --- |
| `quote_url` | The quote page exactly as PP stores it, https only | PP `feedURL` when `feed = GENERIC_HTML_TABLE` and the host is `ariva.de` or `cryptocalc.cc` (the whole URL, query included: Ariva's `boerse_id`, cryptocalc's `currency`/`fiat`) |
| `quote_exchange` | Ariva `boerse_id`; wins over a `boerse_id` inside `quote_url` | Optional; the `boerse_id` of the PP URL is read from `quote_url` anyway |
| `coingecko_id` | CoinGecko coin id | PP property `COINGECKOCOINID` when `feed = COINGECKO` |
| `symbol` | Yahoo symbol | PP `tickerSymbol` when `feed = YAHOO` |
| `fallback_quote_id` | Legacy Ariva numeric id. **Unused**: the Ariva source needs no numeric id (see below). Kept so old data stays valid | - |
| `prices_enabled` | Switch for the refresh (default on) | The migration sets it when any identifier above exists |

Only these URL shapes are fetched (checked by `parseArivaUrl` / `parseCryptocalcUrl`, tested): https,
host `ariva.de` / `www.ariva.de` or `cryptocalc.cc`, plain path, no credentials. A stored URL can never
make the server fetch from another host.

### Ariva, verified (live, 02.10.2026)

- PP stores `https://www.ariva.de/<slug>/kurse/historische-kurse?boerse_id=<n>` (older links) or
  `https://www.ariva.de/etf/<slug>/kurse/historische-kurse`. Ariva has moved its pages
  (`<slug>-fonds` and `/fonds/` 301 to `/etf/...`); `fetch` follows the redirect, so the stored link
  keeps working. Derivative and certificate links look like `/<type>/<WKN>/kurse/historische-kurse`.
- **The CSV download needs an ARIVA account** ("Dann legen Sie sich jetzt ein ARIVA Konto an oder
  melden Sie sich an"). The old CSV URL guessed in P5.1 is gone. The adapter never handles
  credentials; it reads the **public HTML table** of the same page instead, which holds the same
  closes. No numeric security id is needed: the page is addressed by its path.
- Without parameters the page lists the last 30 calendar days of the default exchange. `boerse_id`
  picks the exchange (`45` Xetra, `131` Tradegate, ...). `month=<last day of month>` (`2026-08-31`)
  lists that month. `min_time`/`max_time` are ignored. `currency=automatic` is the exchange currency.
- Table `Datum | Erster | Hoch | Tief | Schluss | (marker) | Stücke | Volumen`, date `dd.mm.yy`,
  cells like `129,135 €` (`$` for a Nasdaq quote, ...). The row of the running session carries a
  `*` in the marker column and is dropped. A currency other than `security.currency` is refused
  (`currency_mismatch`): choose a European exchange in the URL (`boerse_id`) for a US stock held in EUR.
- The adapter asks for the 30-day page when the window starts inside the last 27 days (one request
  per security per night), otherwise for one month page per month (at most 36 months).
- A page without the price table (login, consent, redesign) is `parse`, never "no prices".
- Politeness: at least 1 s between two requests of a source (2.5 s for CoinGecko), one request
  per security per night, the app's own User-Agent. robots.txt does not exclude these pages.
- Fixtures in `packages/market/test-data` are synthetic (no real prices): `ariva-historic.html`,
  `ariva-historic-usd.html`, `ariva-login.html`, `cryptocalc-prices.html`, `coingecko-market-chart.json`.

## Schedule (in-process timer, `BUDGET_MARKET_DAILY=1`)

- **Nightly at 02:30 Vienna** (inside the 01:00-03:00 window; the UTC day of the crypto feeds is over
  in summer and winter time, every exchange has closed). It asks for the **previous day's closes**
  (`today - 1`), never the running day, and the ECB rates in the same run.
- **Catch-up**: whether a run is due comes from the run log, not from memory. No successful run yet,
  or the last success is older than yesterday: run at once (also checked 5 s after the start). Last
  success yesterday: from 02:30 on. Already succeeded today: no. A restart can neither lose nor double
  a night.
- **Backoff**: after a `failed` run wait 30 minutes; at most three failed runs per Vienna day.
- Idempotent: the window starts the day after the newest network price, every write goes through
  `upsertPrice`, a second run writes nothing.
- Fly (`fly.toml [env]`): `BUDGET_MARKET_SOURCES=live`, `BUDGET_MARKET_DAILY=1`, `BUDGET_ARIVA=1`. No
  secrets are needed for any source.
- `POST /api/market/refresh` runs the same jobs by hand (trigger `manual`, up to today).

## Run log and "Stand"

Table `market_run` (migration `0013`): `trigger` (`nightly`/`manual`), `started_at`, `finished_at`,
`as_of`, `status` (`ok`, `partial` = some lookups failed but something was written, `failed` = threw or
lookups failed and nothing was written), `price_rows`, `fx_rows`, `failed_count`, `error_classes`.
Counts and error classes only, never URLs or response bodies.

- `GET /api/market/status` returns `{ lastRun, lastSuccess }`.
- The UI "Stand ... Kurse HH:MM" (`priceStand().priceAt`, `GET /api/wealth/stand`) is the
  `finished_at` of the newest `ok`/`partial` run. Without any run (jobs called directly, prices
  entered by hand) it falls back to the time the newest day's prices were written (`price_audit`).

## Rules of the jobs

- Window: the day after the newest network price (`yfinance`/`ariva`/`cryptocalc`/`coingecko`) up to
  `today` of the call. **First refresh of a security: the last 30 days** (`BACKFILL_DAYS`); older
  history comes from the PP import. A refresh never overwrites imported prices (`import`) on or before the last imported day of a security, and also writes nothing into a gap of that history (`upsertPrice`, the PP history stays as imported); from the day after it on, live prices are written. `manual` is never overwritten.
  ECB: full history from 1999-01-04 on the first run, in three-year chunks.
- Primary first, then the next source on error or empty answer. Every write goes through
  `upsertPrice` (source stored, `manual` never overwritten, changes audited).
- All sources failed: one open `stale_value` inbox item per security (or currency) and error class
  (`detail` = `Fehlerklasse: <class>`). An empty answer counts as a failure only on the first fetch
  or after five weekdays without a quote (weekends and holidays are no news). The item closes when
  data flows again.
- Logs and inbox items carry the error class only, never URLs, headers or response bodies.

## Open for the owner

- Per security that is not in PP with a feed: enter the Ariva page link (`quote_url`, with the
  exchange wanted) in the app. For a US stock held in EUR, pick a European exchange (`boerse_id`).
- Whether PP's cryptocalc table (a hobby site) stays acceptable as the crypto source; CoinGecko works
  keyless as an alternative per coin (`coingecko_id`).
